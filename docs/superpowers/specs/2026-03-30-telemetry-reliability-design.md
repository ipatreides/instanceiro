# Telemetry Reliability: Refactor, Validação e Observabilidade

**Data:** 2026-03-30
**Status:** Draft
**Problema:** Dados de MVP inconsistentes via telemetria — kills incompletos (sem killer/tomb/loots), timing errado, kills fantasma de instâncias. Grupo perdendo MVPs por desconfiança no sistema.

---

## Seção 0 — Bugs Identificados no Código Atual

Análise dos route handlers e RPC revelou 6 problemas concretos que explicam os sintomas reportados:

### Bug 1: Timing frágil no `mvp-killer` (dados incompletos + timing errado)

**Arquivo:** `src/app/api/telemetry/mvp-killer/route.ts` linhas 21-29

**Problema:** Reconstrói `killed_at` usando data de **agora** em BRT + hora:minuto do tomb. Se o jogador lê o tomb no dia seguinte de manhã (ex: kill 23:50, leitura 08:00), o horário 23:50 não está no futuro, então não subtrai um dia — registra o kill **no dia errado** (hoje 23:50 em vez de ontem 23:50). Respawn erra por 24h.

**Fix:** Não reconstruir do zero. Usar o `killed_at` do kill existente na dedup window como referência. Se não há kill existente, validar que a diferença entre agora e o horário inferido seja < respawn_ms do MVP.

### Bug 2: Fallback `[0]` no mvp-killer (kills fantasma)

**Arquivo:** `src/app/api/telemetry/mvp-killer/route.ts` linha 59

**Problema:** Se nenhum MVP encontrado no mapa, manda `p_mvp_ids: [0]`. A RPC não encontra dedup (nenhum kill tem mvp_id=0) e cria um kill com `mvp_id = 0` — kill fantasma sem MVP associado.

**Fix:** Se `matchMvpIds` está vazio, retornar `{ action: 'ignored', reason: 'no MVP on map' }` em vez de chamar a RPC.

### Bug 3: Timestamp do sniffer sem validação (timing errado)

**Arquivo:** `src/app/api/telemetry/mvp-kill/route.ts` linha 49

**Problema:** `new Date(timestamp * 1000)` confia cegamente no relógio do PC do jogador. Sem validação de sanidade.

**Fix:** Rejeitar timestamps no futuro (> now + 60s) ou muito antigos (> 24h no passado). Logar rejeições no event log.

### Bug 4: `mvp-tomb` fora do advisory lock (dados incompletos)

**Arquivo:** `src/app/api/telemetry/mvp-tomb/route.ts` linhas 56-63

**Problema:** Faz `UPDATE` direto na tabela `mvp_kills`, fora do advisory lock da RPC `telemetry_register_kill`. Race condition: se `mvp-kill` e `mvp-tomb` chegam ao mesmo tempo, o tomb pode atualizar um kill diferente do que o `mvp-kill` acabou de criar.

**Fix:** Usar a RPC `telemetry_register_kill` com `p_update_only = true` em vez de UPDATE direto. Ou refatorar o endpoint de tomb para usar o novo endpoint consolidado.

### Bug 5: Fallback `new Date()` no mvp-killer (timing errado)

**Arquivo:** `src/app/api/telemetry/mvp-killer/route.ts` linha 61

**Problema:** Se `kill_hour`/`kill_minute` não vieram, usa **agora** como `p_killed_at`. Mas a morte pode ter sido minutos/horas antes.

**Fix:** Se não tem hora do kill, usar `p_update_only = true` — só atualizar killer name em kill existente, não criar novo.

### Bug 6: Zero observabilidade

**Problema:** Nenhum endpoint registra o que recebeu, o que fez, ou por que ignorou. Impossível diagnosticar problemas sem acessar logs do sniffer (que o usuário não tem).

**Fix:** Tabela `telemetry_event_log` + logging em todos os endpoints (ver Seção 3).

---

## Seção 1 — Refactor do Pipeline

### 1.1 Backend (Next.js) — Shared Telemetry Pipeline

Hoje cada endpoint (`mvp-kill`, `mvp-killer`, `mvp-tomb`, `mvp-spotted`) duplica lógica de: resolução de contexto, lookup de MVP, dedup/merge, tratamento de erro.

**Extrair para `src/lib/telemetry/`:**

- `resolve-context.ts` — já existe como `telemetry.ts`, limpar e mover
- `resolve-mvp.ts` — lookup `monster_id` → `mvp_ids` com whitelist de mapas. **Único lugar** para essa lógica. Se `map_name` não existe na tabela `mvps`, retorna vazio (= instância, ignorar)
- `log-event.ts` — wrapper para inserir no `telemetry_event_log`
- `validate-payload.ts` — validação de schema (campos obrigatórios, tipos, sanidade de timestamp)

**Simplificar route handlers** — cada endpoint vira ~20 linhas: validar payload → resolver contexto → resolver MVP → chamar RPC → logar evento. Lógica de negócio nas funções compartilhadas.

**Novo endpoint consolidado: `/api/telemetry/mvp-event`** — aceita payload completo:

```typescript
{
  monster_id: number       // obrigatório
  map: string              // obrigatório
  timestamp: number        // unix epoch, obrigatório
  tomb_x?: number
  tomb_y?: number
  killer_name?: string
  kill_hour?: number       // hora do tomb (BRT)
  kill_minute?: number     // minuto do tomb (BRT)
  loots?: { item_id: number, amount: number }[]
  party_account_ids?: number[]
}
```

Os endpoints antigos (`mvp-killer`, `mvp-tomb`) continuam como fallback para dados que chegam depois (jogador clica tomb minutos após a morte), mas delegam para a mesma lógica interna.

### 1.2 Sniffer (C++) — Kill Buffer + Envio Consolidado

**Kill buffer:** Quando detecta morte de MVP, abre uma janela de ~5s e acumula dados relacionados (tomb coords, killer name do tomb NPC, loots) no mesmo buffer.

**Envio consolidado:** Ao fechar a janela, manda um POST único para `/api/telemetry/mvp-event` com tudo que coletou.

**Fallback:** Se tomb/killer chegar depois da janela (ex: jogador clicou no tomb 2min depois), manda nos endpoints individuais como hoje.

**Config reload:** Quando heartbeat retorna `config_stale: true`, buscar `/api/telemetry/config` automaticamente.

### 1.3 Whitelist de Mapas

Inverter a lógica de filtro de instância. Em vez de bloquear mapas conhecidos de instância, **só aceitar mapas que existem na tabela `mvps`**. Implementado uma vez em `resolve-mvp.ts`, usado por todos os endpoints.

### 1.4 Fix do Timing no `mvp-killer`

Quando o endpoint recebe só `kill_hour:kill_minute`:
1. Procurar kill existente na dedup window — usar seu `killed_at` como âncora
2. Se não há kill existente, usar data atual em BRT mas validar que o horário não está no futuro
3. Se está no futuro, assumir dia anterior
4. Validar que a diferença entre agora e o horário inferido é < `respawn_ms` do MVP
5. Se não tem hora do kill (`kill_hour`/`kill_minute` ausentes), usar `p_update_only = true`

### 1.5 Validação de Timestamp

Para todos os endpoints que recebem timestamp:
- Rejeitar se > `now + 60s` (relógio adiantado)
- Rejeitar se > 24h no passado (dado stale)
- Logar rejeições no `telemetry_event_log`

---

## Seção 2 — Sistema de Validação de Kills (Double-Check)

### 2.1 Conceito

Todo kill de telemetria nasce com status **"pendente"**. Membros do grupo que estavam no mesmo mapa (via `telemetry_sessions`) podem:
- **Confirmar** — o kill está correto
- **Corrigir** — propor alteração (horário, killer, coords) que substitui os dados originais

Kills manuais (registrados pela UI) são automaticamente **"confirmados"**.

### 2.2 Modelo de Dados

**Novos campos em `mvp_kills`:**

| Campo | Tipo | Default |
|-------|------|---------|
| `validation_status` | `pending` \| `confirmed` \| `corrected` \| `expired_unvalidated` | `pending` para source=telemetry, `confirmed` para source=manual |
| `validated_by` | UUID (FK characters) | null |
| `validated_at` | timestamptz | null |

**Nova tabela `mvp_kill_witnesses`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `kill_id` | uuid | FK mvp_kills |
| `character_id` | uuid | FK characters |
| `user_id` | uuid | FK profiles |
| `map_name` | text | Mapa onde estava no momento |

Preenchida automaticamente no INSERT do kill — snapshot de quem estava no mapa via `telemetry_sessions`.

### 2.3 Quem Pode Validar

1. Witnesses (estavam no mapa) veem botões de confirmar/corrigir
2. Se `mvp_kill_witnesses` está vazio (nenhuma sessão no mapa), **qualquer membro do grupo** pode validar — evita kills presos em limbo

### 2.4 Correção

Quando alguém corrige:
- Campos do kill atualizados diretamente (`killed_at`, `tomb_x`, `tomb_y`, `killer_name`)
- `edited_by` → character que corrigiu
- `validation_status` → `corrected`
- Valor original preservado no `telemetry_event_log` (já registra o payload que chegou)

### 2.5 Timeout de Validação

Kill pendente que ultrapassou o respawn window → status muda automaticamente para `expired_unvalidated`:
- Sai do timer normalmente
- Fica registrado como não validado (útil para stats de confiabilidade futura)
- Implementado via trigger de banco (não depende do cliente estar aberto): trigger periódico ou check na RPC `get_group_active_kills` que marca kills expirados

### 2.6 Notificação de Correção

Quando um kill é corrigido, broadcast via Supabase Realtime:
- O canal `mvp-kills-${groupId}` já escuta UPDATEs
- A UI mostra notificação inline: "Fulano corrigiu o kill do MVP X — novo respawn: HH:MM"
- Evita surpresas quando o timer muda

### 2.7 UX

**No `MvpTimerRow`:**
- Kill pendente: badge **"Pendente"** (amarelo, status `soon`)
- Kill confirmado: sem badge (estado normal/limpo)
- Kill corrigido: badge **"Corrigido"** (verde, status `available`) + tooltip com quem corrigiu

**Se o usuário logado é witness:**
- Botão **"Confirmar"** — um clique, confirma os dados como estão
- Botão **"Corrigir"** — abre `MvpKillModal` preenchido com dados atuais, permite editar

**Impacto nos timers:**
- Kills pendentes **contam** para o timer (mostram respawn), mas com indicador visual de incerteza
- Kills confirmados/corrigidos mostram timer normal
- Isso evita que o grupo ignore um kill real só porque ninguém validou

---

## Seção 3 — Observabilidade e Saúde do Sistema

### 3.1 Tabela `telemetry_event_log`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `timestamp` | timestamptz | Quando o request chegou |
| `endpoint` | text | `mvp-kill`, `mvp-killer`, `mvp-tomb`, `mvp-spotted`, `mvp-event`, `heartbeat` |
| `token_id` | uuid | FK telemetry_tokens |
| `character_id` | uuid | Quem mandou |
| `payload_summary` | jsonb | Resumo do payload (sem dados sensíveis) |
| `result` | text | `created`, `updated`, `ignored`, `error` |
| `reason` | text | Ex: "map not in mvps whitelist", "dedup: kill exists within window" |
| `kill_id` | uuid | FK mvp_kills (se aplicável) |

**Retenção:** 7 dias. Implementar via `pg_cron` ou cleanup no heartbeat.

**Logging em todos os endpoints:** Cada endpoint insere um registro após processar o request (fire-and-forget, não bloqueia a resposta).

### 3.2 UI na Aba Telemetria

**Painel de saúde dos sniffers** — para cada membro do grupo com sessão ativa:
- Nome do personagem, mapa atual, último heartbeat (relativo: "há 30s", "há 5min")
- Indicador de saúde:
  - Verde: heartbeat < 2min
  - Amarelo: 2-5min
  - Vermelho: > 5min ou sem sessão
- Versão do config que o sniffer está usando vs versão atual

**Log de eventos recentes** — lista dos últimos ~50 eventos do grupo:
- Timestamp, endpoint, personagem, resultado, motivo
- Filtro por resultado (`error`/`ignored`) para diagnóstico rápido
- Kill linkado clicável (abre o kill no modal)

### 3.3 Config do Sniffer Sempre Atualizada

- `/api/telemetry/config` já consulta tabela `mvps` para montar `monster_ids` — garantir que reflete estado atual
- Incrementar `config_version` quando tabela `mvps` é modificada (trigger ou timestamp-based)
- No heartbeat, comparar `config_version` do cliente vs atual — se desatualizado, retornar `config_stale: true`
- Sniffer recarrega config ao receber `config_stale: true`
- Logar no event log quando sniffer opera com config desatualizada

### 3.4 Robustez do Heartbeat

O sistema de validação depende de saber quem estava no mapa (via `telemetry_sessions`). Se heartbeats falham silenciosamente, witnesses ficam errados.

- Indicador de saúde da sessão visível na UI (ver painel acima)
- Heartbeat failures logados no event log
- Considerar: se sessão tem heartbeat > 5min, não incluir como witness

---

## Escopo Fora

- Rate limiting nos endpoints de telemetria (futuro)
- Refactor do sniffer C++ além do kill buffer e config reload
- Sistema de votação/consensus (o modelo é correção individual, não votação)
- Histórico completo de edições (event log preserva payload original, suficiente por agora)

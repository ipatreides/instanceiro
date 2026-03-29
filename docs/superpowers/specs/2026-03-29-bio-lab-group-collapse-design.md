# Bio Lab Group Collapse + Broadcast Alerts

## Problema

MVPs com `cooldown_group` (Bio 3 = 6 MVPs, Bio 5 = 13 MVPs) aparecem como entries individuais na lista, poluindo a UI com 19 rows para 2 cooldowns compartilhados. Bio 5 tem broadcasts no mapa que indicam o spawn do MVP mas não são capturados pela telemetria.

## Solução

### 1. Colapsar cooldown_group em row única (Frontend)

MVPs com `cooldown_group` são agrupados em uma única row na lista:

```
Bio Lab 3    ⏱ 1h23min
  lhz_dun03

Bio Lab 5    🟢 Em breve (broadcast)
  lhz_dun05
```

**Implementação:**
- No `mvp-timer-list.tsx`, antes de renderizar, agrupar MVPs por `cooldown_group`
- Cada grupo gera 1 row representativa com nome do grupo como label
- Timer usa o `groupKillMap` que já existe (pega o kill mais recente do grupo)
- MVPs sem `cooldown_group` renderizam normalmente (sem mudança)

**Detalhe ao clicar:**
- Timer do cooldown compartilhado
- Qual MVP morreu por último (nome específico, vindo de `mvp_kills.mvp_id` → `mvps.name`)
- Mapa com heatmap
- Histórico de kills mostrando o nome de cada MVP individual

**Dados necessários no banco:**
- Nova tabela ou campo para mapear `cooldown_group` → display name ("Bio Lab 3", "Bio Lab 5")
- Alternativa mais simples: hardcoded no frontend como mapa `{ bio_lab_3: "Bio Lab 3", bio_lab_5: "Bio Lab 5" }`
- Decisão: usar mapa hardcoded no frontend (YAGNI — só existem 2 grupos)

### 2. Captura de Broadcasts Bio 5 (C++ Sniffer → API → Frontend)

#### 2.1 Sniffer (C++)

No `BroadcastChat::deserialize_internal`, quando o pacote é `LOCAL_BROADCAST`:
- Extrair o código da mensagem (últimos bytes antes do null terminator)
- Verificar se o código está na lista de códigos Bio 5
- Se sim, chamar `TelemetryClient::on_bio5_broadcast(code, map)`

Códigos relevantes (todos terminam em `jm`):

| Código | Tipo | Significado |
|--------|------|-------------|
| `YGjm` | pre_spawn | "Posso sentir um grande poder." |
| `YWjm`-`bWjm` | summon | "{Nome} invocado." (13 variantes) |
| `gGjm`-`mGjm` | mvp_spawn | "{Nome}, finalmente você chegou..." (13 variantes) |
| `mmjm` | mvp_killed_success | "Que combatente formidável..." |
| `mWjm` | mvp_killed_respawn | "Vejo você em breve..." |
| `fmjm` | failed | "Você não é forte o suficiente..." |
| `fWjm` | waiting | "Esperando chegada do MVP." |

Mapa de código → nome do MVP para os broadcasts de spawn:

| Código | MVP |
|--------|-----|
| `gGjm` | Guillotine Cross Eremes |
| `gmjm` | Archbishop Margaretha |
| `hGjm` | Ranger Cecil |
| `hmjm` | Mechanic Howard |
| `iGjm` | Warlock Kathryne |
| `imjm` | Rune Knight Seyren |
| `jGjm` | Royal Guard Randel |
| `jmjm` | Genetic Flamel |
| `kGjm` | Sorcerer Celia |
| `kmjm` | Sura Chen |
| `lGjm` | Shadow Chaser Gertie |
| `lmjm` | Minstrel Alphoccio |
| `mGjm` | Wanderer Trentini |

#### 2.2 Mapping de mapa

O broadcast usa `lhz_dun_n.gat` mas o banco tem `lhz_dun05` como `map_name`. O sniffer recebe o mapa via `Character::get_map()` que pode retornar qualquer um dos dois. O endpoint precisa de um mapping:

```
lhz_dun_n → bio_lab_5
lhz_dun05 → bio_lab_5
```

Implementar como mapa simples no endpoint (2 entries, não justifica tabela).

#### 2.3 API (Next.js)

Novo endpoint: `POST /api/telemetry/mvp-broadcast`

```
Body: { code: string, map: string }
```

Lógica:
- Resolver `cooldown_group` pelo mapa (lhz_dun_n/lhz_dun05 → bio_lab_5)
- Upsert na tabela `mvp_broadcast_events` (por group_id + cooldown_group):
  - `group_id`, `cooldown_group`, `code`, `event_type`, `mvp_name`, `created_at`, `expires_at`
- `expires_at` = NOW() + 5 minutos (cada broadcast recebido reseta o timer)
- Quando um kill é registrado para o grupo (`telemetry_register_kill`), deletar broadcasts ativos

#### 2.4 Tabela `mvp_broadcast_events`

```sql
CREATE TABLE mvp_broadcast_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES mvp_groups(id),
  cooldown_group TEXT NOT NULL,
  code TEXT NOT NULL,
  event_type TEXT NOT NULL, -- pre_spawn, summon, mvp_spawn, mvp_killed, failed, waiting
  mvp_name TEXT,            -- nome do MVP específico (quando disponível)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);
```

#### 2.5 Frontend

- Buscar broadcasts ativos para os `cooldown_group` do user
- Se existe broadcast `mvp_spawn` ou `pre_spawn` ativo para Bio 5:
  - Row mostra status "Em breve" com dot verde pulsante
  - Sobe pro topo da lista (mesmo comportamento de MVP avistado)
- Se broadcast `mvp_spawn` contém nome do MVP:
  - Mostra qual MVP spawnou no detalhe
- Realtime: subscribe na tabela `mvp_broadcast_events` para updates

### 3. Expiração de broadcasts

- Cada broadcast recebido faz upsert com `expires_at = NOW() + 5 min`
- Broadcasts ativos = `expires_at > NOW()`
- Quando um kill é registrado para o cooldown_group, deleta broadcasts ativos
- Msg de morte confirmada (quando identificarmos qual código é): deleta imediatamente
- Se nenhum broadcast novo chega e nenhum kill é registrado, expira sozinho em 5 min

### 4. Approach Experimental

A ordem exata dos broadcasts não é confirmada. Na primeira versão:
- Capturar TODOS os códigos Bio 5 e salvar com `event_type`
- Frontend reage a qualquer broadcast ativo como sinal de atividade
- Refinamento posterior baseado em dados reais coletados

### 5. Escopo da primeira versão

**Incluso:**
- Colapsar `cooldown_group` em row única na lista
- Detalhe mostra qual MVP morreu por último
- Capturar broadcasts Bio 5 no sniffer
- Novo endpoint + tabela para broadcasts
- Status "Em breve" quando broadcast ativo

**Não incluso (futuro):**
- NPC info broadcasts com coordenadas (cGjm-fGjm) — poderiam alimentar sightings
- Broadcasts do Ktullanux (cristal) — mesma mecânica mas códigos diferentes
- UI para configurar quais broadcasts alertar

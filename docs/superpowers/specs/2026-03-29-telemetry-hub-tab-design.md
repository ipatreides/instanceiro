# Aba Telemetria no Group Hub

## Problema

As configurações de telemetria ficam perdidas no fundo do mvp-tab. Usuários novos não entendem o que é o Claudinho nem como configurar. Sessões inativas nunca são limpas.

## Solução

Nova aba "Telemetria" no Group Hub (ao lado de "Grupo" e "Stats"). Visível para todos os membros. Cada membro vê apenas suas próprias sessões/tokens.

## Layout da Aba

### 1. Status da Versão

Aparece quando o usuário tem pelo menos 1 token ativo.

- Busca `/api/telemetry/version` para `latest_version` e `download_url`
- Compara com a versão reportada na sessão ativa do heartbeat
- Atualizado: "Claudinho v1.1.0 ✓" (texto verde)
- Desatualizado: "Versão desatualizada (v1.0.0)" + botão "Baixar v1.1.0" (link direto pro exe)
- Sem sessão ativa mas com token: "Claudinho offline"

Necessário: adicionar campo `client_version` ao heartbeat. O sniffer já envia `config_version` — adicionar `client_version` (string, ex: "1.1.0") no body do heartbeat e salvar na sessão.

### 2. Sessões Ativas

Lista dos tokens do usuário com status:

- **Online**: nome do token, mapa atual, tempo desde `started_at`
- **Offline**: nome do token, "Último uso: [data]"
- Botão "Revogar" com confirmação (displaced pattern do design system)

Auto-revoke: no endpoint de heartbeat, antes de processar, verificar se o token teve `last_used_at` > 1 hora atrás. Se sim, marcar `revoked_at = NOW()` e retornar 401. O sniffer vai parar de enviar.

Alternativa mais simples: cleanup na query do frontend — tokens com `last_used_at` > 1 hora e sem sessão ativa não aparecem na lista. Revogação automática via um cron job simples ou no próprio heartbeat.

Decisão: cleanup no heartbeat. Quando o sniffer envia heartbeat, se o token não foi usado por mais de 1 hora desde o último heartbeat, revogar. Na prática: se o sniffer ficou 1 hora sem mandar heartbeat e tenta reconectar, recebe 401 e precisa parear de novo.

### 3. Dúvidas Frequentes (Accordion, sempre visível)

Accordion colapsável com perguntas:

**"O que é o Claudinho?"**
Programa que roda junto com o Ragnarok e detecta automaticamente quando MVPs morrem, quem matou, e onde a tumba apareceu. As informações aparecem em tempo real no Instanceiro.

**"É seguro?"**
O Claudinho apenas lê os pacotes de rede do jogo. Não modifica nada, não injeta código, não interage com o client. Funciona como um observador passivo.

**"Preciso deixar aberto?"**
Sim, enquanto estiver jogando. Ele roda na bandeja do sistema (ao lado do relógio) e usa poucos recursos.

**"Funciona com mais de um client?"**
Sim, detecta todos os clients do Ragnarok abertos automaticamente.

### 4. Guia de Setup (só aparece se o usuário não tem nenhum token)

Passo a passo em texto:

```
Como configurar o Claudinho:

1. Baixe e instale o Npcap
   [link: npcap.com] — necessário para captura de pacotes

2. Baixe o Claudinho v{latest_version}
   [botão de download com link do exe]

3. Abra o Claudinho
   Ele aparece na bandeja do sistema (ao lado do relógio)

4. Clique em "Parear" no Claudinho e insira o código abaixo
   [componente de pairing code — reutilizar lógica existente do TelemetrySettings]
```

O link de download e a versão vêm do endpoint `/api/telemetry/version`.

## Mudanças

### Frontend

- **Criar** `src/components/mvp/telemetry-tab.tsx` — nova aba com as 4 seções
- **Modificar** `src/components/mvp/mvp-group-hub.tsx` — adicionar aba "Telemetria" no tab switcher
- **Remover** referências ao `TelemetrySettings` antigo do `mvp-tab.tsx`
- **Remover** `src/components/mvp/telemetry-settings.tsx` (funcionalidade migrada)

### Backend

- **Modificar** `src/app/api/telemetry/heartbeat/route.ts` — aceitar `client_version` no body, salvar na sessão, auto-revogar tokens inativos >1h
- **Migration** — adicionar coluna `client_version TEXT` na tabela `telemetry_sessions`

### C++ Sniffer

- **Modificar** heartbeat para enviar `client_version` no body (valor de `CLAUDINHO_VERSION`)

## Fora de escopo

- Notificações push de atualização
- Auto-update automático sem interação do usuário
- Métricas de uso da telemetria

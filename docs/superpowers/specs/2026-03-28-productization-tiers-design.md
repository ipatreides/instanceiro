# Productization: Free & Premium Tiers

## Objetivo

Cobrir custos operacionais (~$40/mês) com um modelo freemium. Base de ~100-200 usuários, meta de ~20 assinantes no tier pago.

---

## 1. Camadas de Acesso

### Sem Conta (Visitante)

- Página `/` é o próprio tracker — ferramenta funcional como landing page
- Instance tracker: lista completa, marca completions, cooldowns calculados localmente
- MVP timer: lista de MVPs, registra kill time, calcula respawn
- Filtros por cooldown type, level, liga tier, mapa
- Seletor de servidor (Freya/Nidhogg) persistido em localStorage
- 100% localStorage, zero chamadas autenticadas ao backend
- Sem conceito de personagem — checklist pessoal único
- Dados estáticos (instâncias, MVPs) via API pública cacheada (ISR/CDN)

### Free (Com Conta)

Tudo do visitante, mais:

- 1 personagem vinculado a 1 conta
- Features sociais de instâncias: parties, friends, schedules
- MVP timer local (igual visitante), mas kills enviados silenciosamente ao banco como `verified = false` (sem party/loot, para stats futuras) via POST a cada kill registrado
- Dados do localStorage permanecem no browser até migração (ver seção 5)
- Trial de 7 dias de premium na primeira tentativa de assinar (não no signup)

### Premium (R$ 9,90/mês ou R$ 99,90/ano)

Tudo do free, mais:

- Personagens ilimitados
- Contas ilimitadas
- Grupos de MVP com amigos (party, loot tracking, alertas)
- Integração Discord (alertas de spawn, notificações)
- Stats e histórico na nuvem
- Sync entre dispositivos
- Sugerir novas features

### Membro Fundador (Grandfathered)

- Usuários com conta criada antes da data de lançamento dos tiers
- `tier = 'legacy_premium'` — acesso idêntico ao premium, sem expiração
- Badge "Membro Fundador" no perfil
- Pode assinar voluntariamente para apoiar o projeto
- Se cancelar assinatura voluntária → volta pra `legacy_premium`, nunca cai pra free

---

## 2. Modelo de Dados

### Tabela `profiles` (alterações)

```sql
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT UNIQUE;
-- tier é derivado, não armazenado diretamente na profiles
-- lido via JWT custom claim para performance
```

### Tabela `subscriptions` (nova)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'gifted', 'gifted_lifetime')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
```

### Tabela `gift_codes` (nova)

```sql
CREATE TABLE gift_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  duration INTERVAL, -- null = vitalício, '30 days' = 1 mês, '365 days' = 1 ano
  redeemed_by UUID REFERENCES profiles(id),
  redeemed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ, -- validade do código em si
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gift_codes_code ON gift_codes(code);
```

### Tabela `app_config` (nova, configurações globais)

```sql
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed: data de lançamento dos tiers (definir no deploy)
INSERT INTO app_config (key, value) VALUES ('tier_launch_date', '2026-XX-XX');
```

### Tabela `stripe_events` (nova, idempotência)

```sql
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY, -- stripe event ID
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tabela `mvp_kills` (alteração)

```sql
ALTER TABLE mvp_kills ADD COLUMN verified BOOLEAN NOT NULL DEFAULT true;
-- Kills de free users: verified = false, group_id = null, sem party/loot
-- Kills de premium groups: verified = true
```

### Cálculo do Tier

O tier é derivado por uma função e armazenado como JWT custom claim:

```sql
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID) RETURNS TEXT AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

  -- Check grandfathered
  IF v_profile.created_at < (SELECT value::TIMESTAMPTZ FROM app_config WHERE key = 'tier_launch_date') THEN
    -- Pode ter assinatura ativa por apoio voluntário, mas tier base é legacy_premium
    SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'gifted', 'gifted_lifetime')
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub.id IS NOT NULL THEN
      RETURN 'premium'; -- apoiador ativo
    END IF;
    RETURN 'legacy_premium';
  END IF;

  -- Check active subscription
  SELECT * INTO v_sub FROM subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'past_due', 'gifted', 'gifted_lifetime')
  ORDER BY
    CASE status
      WHEN 'gifted_lifetime' THEN 0
      WHEN 'active' THEN 1
      WHEN 'trialing' THEN 2
      WHEN 'past_due' THEN 3
      WHEN 'gifted' THEN 4
    END
  LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    -- Check if gifted/trialing has expired
    IF v_sub.status IN ('gifted', 'trialing') AND v_sub.current_period_end < now() THEN
      RETURN 'free';
    END IF;
    RETURN 'premium';
  END IF;

  RETURN 'free';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### JWT Custom Claims

- Trigger em `subscriptions` (INSERT/UPDATE/DELETE) chama `get_user_tier()` e atualiza claim `tier` no JWT via `auth.update_user_metadata()`
- RLS policies leem `auth.jwt()->>'tier'`
- Client faz token refresh após mudança de tier (notificado via Supabase Realtime)

---

## 3. Stripe Integration

### Pricing

| Plano | Preço | Stripe Object |
|---|---|---|
| Mensal | R$ 9,90/mês | Price (`price_monthly`) |
| Anual | R$ 99,90/ano | Price (`price_yearly`) |
| Trial | 7 dias grátis | Trial period no Subscription |

### Fluxo de Assinatura

1. Usuário clica "Assinar Premium" na `/premium`
2. API route cria Stripe Customer (se não existe, salva `stripe_customer_id` na profiles)
3. Redireciona pra Stripe Checkout Session com `trial_period_days: 7` (se nunca teve subscription ativa antes)
4. Stripe Checkout coleta pagamento → redireciona pra `/profile?upgraded=true`
5. Webhook `checkout.session.completed` → cria registro em `subscriptions` → trigger atualiza JWT claim
6. App detecta novo tier via Realtime → UI atualiza

### Gerenciamento

- Link "Gerenciar assinatura" no `/profile` → Stripe Customer Portal
- Portal permite: trocar plano (mensal ↔ anual), atualizar cartão, cancelar
- Todos os webhooks sincronizam mudanças de volta

### Webhooks (`/api/stripe/webhook`)

| Evento | Ação |
|---|---|
| `checkout.session.completed` | Criar subscription, atualizar tier |
| `invoice.paid` | Renovar `current_period_end` |
| `invoice.payment_failed` | Status → `past_due` (mantém acesso premium) |
| `customer.subscription.updated` | Sync mudanças (plano, cancelamento agendado) |
| `customer.subscription.deleted` | Status → `canceled`, tier → `free` ou `legacy_premium` |

### Segurança

- **Toda** request valida `stripe-signature` header — rejeita se inválido
- Idempotência via tabela `stripe_events`: ignora eventos já processados
- Webhook responde 200 imediatamente

---

## 4. Gift Codes

### Tipos

| Tipo | `duration` | Comportamento |
|---|---|---|
| 1 mês | `30 days` | Subscription com `current_period_end = now + 30d`, expira |
| 1 ano | `365 days` | Subscription com `current_period_end = now + 365d`, expira |
| Vitalício | `null` | Subscription `status = 'gifted_lifetime'`, sem expiração |

### Fluxo de Resgate

1. Usuário vai em `/profile` → seção "Código de resgate"
2. Input de 12 caracteres + botão "Resgatar"
3. API route `/api/gift/redeem` valida (existe, não usado, não expirado), chama RPC em transaction
4. Cria subscription com status `gifted` ou `gifted_lifetime`
5. Trigger atualiza JWT claim → tier muda

### Empilhamento

- Se usuário já tem Stripe ativo e resgata gift temporário: tempo adicionado ao final do período atual
- Se resgata gift vitalício: sobrescreve qualquer subscription existente

### Geração

- Códigos gerados via admin panel ou script direto no banco
- Formato: 12 chars alfanumérico uppercase (`gen_random_uuid()` formatado)
- Rate limit no resgate: 5 tentativas por minuto por IP (enforced na API route via middleware)

---

## 5. Página `/` (Tracker Offline)

### Estrutura

A home do site é o próprio tracker — ferramenta funcional como landing page.

### Features

- Instance tracker com checklist + cooldowns locais
- MVP timer com kill tracking local
- Filtros por cooldown type, level, liga tier, mapa
- Seletor de servidor (Freya/Nidhogg)
- 100% localStorage

### localStorage Schema

```json
{
  "instanceiro_tracker": {
    "server": "freya",
    "instances": {
      "<instance_id>": { "completed_at": "2026-03-28T15:00:00Z" }
    },
    "mvp_kills": {
      "<mvp_id>": { "killed_at": "2026-03-28T14:30:00Z" }
    }
  }
}
```

### Dados Estáticos

- Instâncias e MVPs via API pública sem auth (`/api/instances`, `/api/mvps`)
- Cache via ISR/CDN — atualiza sem rebuild

### Migração de Dados Locais

A migração acontece quando o usuário cria seu **primeiro personagem** (não no signup):

1. Usuário cria conta (free ou premium) — dados permanecem no localStorage
2. Ao criar o primeiro personagem no dashboard, sistema detecta `instanceiro_tracker` no localStorage
3. Migração automática e silenciosa: completions e MVP kills (`verified = false`) são vinculados ao personagem criado
4. Limpa localStorage após migração bem-sucedida

Isso garante que os dados só são migrados quando têm um personagem destino.

### Routing

- `/` — tracker offline, visitantes apenas
- Usuário logado acessando `/` → redirect pra `/dashboard`
- `/dashboard` continua como hub principal (personagens, instâncias, MVP, perfil)

### Arquitetura

- Página `/` é isolada — usa localStorage diretamente, sem abstração compartilhada com o dashboard
- Dashboard continua usando hooks existentes (`use-instances`, `use-characters`, etc.)
- Componentes de UI (cards de instância, timer de MVP) podem ser compartilhados, mas data source é separado por página
- Sem hook de abstração dual — complexidade desnecessária já que são páginas distintas com redirect

---

## 6. UI dos Tiers

### Página `/premium`

- Card único com toggle mensal/anual (não 2 cards separados)
- Toggle default: anual (com badge "2 meses grátis")
- Lista de benefícios premium
- CTA "Começar trial de 7 dias" (ou "Assinar" se já usou trial)
- Abaixo: seção de resgate de gift code

### Gates no App

Features premium aparecem na UI mas desabilitadas para free users:

- Badge "Premium" sutil nos elementos bloqueados
- Click leva pra `/premium` com contexto (ex: `?feature=mvp-groups`)
- Não bloqueia navegação — o usuário vê o que existe

Exemplos de gates:
- Botão "Criar Grupo" no MVP → badge premium
- Botão "Adicionar personagem" (já tem 1) → badge premium
- Seção Discord no perfil → cards desabilitados com CTA
- Stats → seção visível mas dados borrados com overlay premium

### Indicador de Tier no Nav

- Premium: ícone dourado sutil no avatar
- Free: link "Upgrade" discreto no nav
- Fundador: badge especial "Membro Fundador"

### Banner do Membro Fundador (no `/profile`)

```
🛡️ Membro Fundador — Acesso Premium Vitalício
Você faz parte dos primeiros usuários do Instanceiro.
```

Sem call to action de pagamento — quem é fundador já tem tudo.

Para fundadores que **já** assinam voluntariamente, mostrar:

```
🛡️ Membro Fundador & Apoiador
Obrigado por apoiar o Instanceiro!
[Gerenciar assinatura]
```

---

## 7. Downgrade Premium → Free

Quando um usuário premium (não-fundador) cancela e a subscription expira:

- **Dados não são deletados** — ficam read-only
- Personagens extras: visíveis mas não editáveis, só o primeiro fica ativo
- MVP groups: saída automática dos grupos (manter read-only geraria inconsistência pra outros membros)
- Completions históricas: mantidas no banco
- MVP kills cloud: mantidos mas não recebe novos
- Stats: inacessíveis até re-assinar

### Exportação para localStorage (uma única vez)

No primeiro acesso após downgrade:

1. Sistema detecta mudança de tier (premium → free)
2. Exporta completions + MVP kills da primeira conta/personagem listado pro localStorage (formato `instanceiro_tracker`)
3. Aviso in-app: "Seus dados foram salvos localmente. Assine novamente para recuperar acesso completo."
4. Flag `downgrade_exported` salvo no localStorage — garante que a exportação acontece apenas uma vez
5. Dados no banco permanecem intactos (read-only) caso re-assine

---

## 8. Degradação Graciosa (`past_due`)

Quando pagamento falha (cartão expirado, saldo insuficiente):

- Stripe retenta automaticamente por alguns dias
- Durante `past_due`: acesso premium mantido normalmente
- Notificação in-app: "Houve um problema com seu pagamento. Atualize seu método de pagamento."
- Link direto pro Stripe Customer Portal pra atualizar cartão
- Só degrada pra free quando Stripe desiste e emite `customer.subscription.deleted`

---

## 9. RLS Policies

Exemplos de policies que checam tier via JWT:

```sql
-- MVP groups: só premium
CREATE POLICY "mvp_groups_premium_only" ON mvp_groups
  FOR ALL USING (
    auth.jwt()->>'tier' IN ('premium', 'legacy_premium')
  );

-- Characters: free = max 1, premium = ilimitado
CREATE POLICY "characters_tier_limit" ON characters
  FOR INSERT WITH CHECK (
    auth.jwt()->>'tier' IN ('premium', 'legacy_premium')
    OR (SELECT count(*) FROM characters WHERE user_id = auth.uid()) < 1 -- allows first character; blocks second+
  );

-- MVP kills: free pode inserir (verified = false)
CREATE POLICY "mvp_kills_free_insert" ON mvp_kills
  FOR INSERT WITH CHECK (
    CASE
      WHEN auth.jwt()->>'tier' IN ('premium', 'legacy_premium') THEN true
      ELSE verified = false AND group_id IS NULL
    END
  );
```

---

## Fora do Escopo (v1)

- Integração com Google Calendar / Outlook
- Admin panel para gestão de gift codes (usar SQL direto)
- Métricas de conversão / analytics
- Plano "Enterprise" ou tier intermediário
- Notificações por email

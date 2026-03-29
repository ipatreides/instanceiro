# Liga dos Desbravadores Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich existing instances with Liga dos Desbravadores tier (A/B/C) and coin data, displayed in cards and modals.

**Architecture:** Add two nullable columns (`liga_tier`, `liga_coins`) to the `instances` table via a new migration. Update TypeScript types and two UI components (InstanceCard, InstanceModal) to display the data. Run the migration against the linked Supabase project.

**Tech Stack:** Supabase (Postgres), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/003_add_liga_fields.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Add Liga dos Desbravadores fields
ALTER TABLE instances ADD COLUMN liga_tier TEXT CHECK (liga_tier IN ('A', 'B', 'C'));
ALTER TABLE instances ADD COLUMN liga_coins INTEGER;

-- Insert new instances not in original seed
INSERT INTO instances (id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group)
VALUES
  (43, 'Batalha dos Orcs', 60, 1, 'daily', NULL, NULL, NULL, 'Orc''s Ring + Encantamentos', NULL),
  (44, 'Vila dos Porings', 30, 1, 'daily', NULL, NULL, NULL, 'Baú Poring + Encantamentos', NULL)
ON CONFLICT (id) DO NOTHING;

-- Tier A (10 instances)
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Batalha dos Orcs';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Torneio de Magia';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Memórias de Sarah';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Palácio das Mágoas';
UPDATE instances SET liga_tier = 'A', liga_coins = 20 WHERE name = 'Salão de Ymir';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Covil de Vermes';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Hospital Abandonado';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Aos Pés do Rei';
UPDATE instances SET liga_tier = 'A', liga_coins = 20 WHERE name = 'Fábrica do Terror';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Sonho Sombrio';

-- Tier B (11 instances)
UPDATE instances SET liga_tier = 'B', liga_coins = 7  WHERE name = 'Sala Final';
UPDATE instances SET liga_tier = 'B', liga_coins = 7  WHERE name = 'Ninho de Nidhogg';
UPDATE instances SET liga_tier = 'B', liga_coins = 20 WHERE name = 'Lago de Bakonawa';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Caverna de Buwaya';
UPDATE instances SET liga_tier = 'B', liga_coins = 20 WHERE name = 'Glastheim Sombria';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Sarah vs Fenrir';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Torre do Demônio';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Ilha Bios';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Templo do Demônio Rei';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Laboratório Werner';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Laboratório de Wolfchev';

-- Tier C (9 instances)
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Vila dos Porings';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Caverna do Polvo';
UPDATE instances SET liga_tier = 'C', liga_coins = 10 WHERE name = 'Edda do Quarto Crescente';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Missão OS';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Maldição de Glastheim';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Base Militar';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Memorial COR';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Fortaleza Voadora';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Caverna de Mors';

-- Expected: 30 instances updated, 2 inserted
```

- [ ] **Step 2: Run migration against linked Supabase**

Run: `cd D:/rag/instance-tracker && npx supabase db push --linked`

If that doesn't work, use: `npx supabase db query --linked "$(cat supabase/migrations/003_add_liga_fields.sql)"`

Expected: no errors

- [ ] **Step 3: Verify data**

Run: `npx supabase db query --linked "SELECT name, liga_tier, liga_coins FROM instances WHERE liga_tier IS NOT NULL ORDER BY liga_tier, name;"`

Expected: 30 rows with correct tier and coin values

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_add_liga_fields.sql
git commit -m "feat: add Liga dos Desbravadores tier and coin data migration"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types.ts:24-35`

- [ ] **Step 1: Add fields to Instance interface**

Add after `mutual_exclusion_group`:

```ts
  liga_tier: 'A' | 'B' | 'C' | null;
  liga_coins: number | null;
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add liga_tier and liga_coins to Instance type"
```

---

### Task 3: InstanceCard Liga badge

**Files:**
- Modify: `src/components/instances/instance-card.tsx:93-99`

- [ ] **Step 1: Add Liga badge in the right side area**

After the `completionCount` span (line 98), add:

```tsx
{instance.liga_tier && (
  <span className="text-xs text-amber-400 font-medium">
    {instance.liga_tier}·{instance.liga_coins}
  </span>
)}
```

- [ ] **Step 2: Verify visually**

Run dev server, check that instances with Liga data show the badge (e.g., "A·5" in amber).
Instances without Liga data should show no change.

- [ ] **Step 3: Commit**

```bash
git add src/components/instances/instance-card.tsx
git commit -m "feat: show Liga tier and coins badge on instance cards"
```

---

### Task 4: InstanceModal Liga badge

**Files:**
- Modify: `src/components/instances/instance-modal.tsx:90-95`

- [ ] **Step 1: Add Liga badge in info section**

After the `mutual_exclusion_group` badge (line 94), add:

```tsx
{instance.liga_tier && (
  <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded">
    Liga {instance.liga_tier} — {instance.liga_coins} moedas
  </span>
)}
```

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit && npm run build`

Expected: no errors

- [ ] **Step 3: Verify visually**

Open a Liga instance modal, confirm badge shows. Open a non-Liga instance, confirm no badge.

- [ ] **Step 4: Commit**

```bash
git add src/components/instances/instance-modal.tsx
git commit -m "feat: show Liga tier and coins in instance modal"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all 19 tests pass

- [ ] **Step 2: Full build**

Run: `npm run build`

Expected: builds without errors

- [ ] **Step 3: Manual check**

Verify in the running app:
- Card badges appear for Liga instances (amber text)
- Modal badges appear with full text
- Non-Liga instances unchanged
- New instances (Batalha dos Orcs, Vila dos Porings) appear in the correct groups

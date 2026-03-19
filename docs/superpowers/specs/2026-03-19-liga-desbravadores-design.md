# Liga dos Desbravadores — Instance Enrichment

## Goal

Enrich existing instances in the tracker with Liga dos Desbravadores tier and coin data, displayed in cards and modals.

## Source

https://browiki.org/wiki/Liga_dos_Desbravadores

## Schema Changes

Add 2 nullable columns to `instances` table:

```sql
ALTER TABLE instances ADD COLUMN liga_tier TEXT CHECK (liga_tier IN ('A', 'B', 'C'));
ALTER TABLE instances ADD COLUMN liga_coins INTEGER;
```

- `liga_tier`: 'A', 'B', 'C', or NULL (not in Liga). Tier D is excluded (item trade-ins, not instance completions).
- `liga_coins`: coins earned per mission completion, or NULL.

## TypeScript Changes

Add to `Instance` interface in `types.ts`:
```ts
liga_tier: 'A' | 'B' | 'C' | null;
liga_coins: number | null;
```

## Data Mapping

For instances appearing in multiple tiers, use Tier B over C (higher difficulty tier).

### Tier A (10 instances)
| Instance | Coins |
|----------|-------|
| Batalha dos Orcs | 5 |
| Torneio de Magia | 5 |
| Memórias de Sarah | 5 |
| Palácio das Mágoas | 5 |
| Salão de Ymir | 20 |
| Covil de Vermes | 10 |
| Hospital Abandonado | 10 |
| Aos Pés do Rei | 10 |
| Fábrica do Terror | 20 |
| Sonho Sombrio | 10 |

### Tier B (11 instances)
| Instance | Coins |
|----------|-------|
| Sala Final | 7 |
| Ninho de Nidhogg | 7 |
| Lago de Bakonawa | 20 |
| Caverna de Buwaya | 5 |
| Glastheim Sombria | 20 |
| Sarah vs Fenrir | 10 |
| Torre do Demônio | 5 |
| Ilha Bios | 10 |
| Templo do Demônio Rei | 10 |
| Laboratório Werner | 5 |
| Laboratório de Wolfchev | 10 |

### Tier C (9 instances, excluding Wolfchev which is in Tier B)
| Instance | Coins |
|----------|-------|
| Vila dos Porings | 5 |
| Caverna do Polvo | 5 |
| Edda do Quarto Crescente | 10 |
| Missão OS | 5 |
| Maldição de Glastheim | 5 |
| Base Militar | 7 |
| Memorial COR | 7 |
| Fortaleza Voadora | 7 |
| Caverna de Mors | 7 |

## New Instances to Add

Two instances in Liga are not in the current seed data. Add them with full data:

### Batalha dos Orcs
- `level_required`: 60
- `party_min`: 1
- `cooldown_type`: 'daily'
- `cooldown_hours`: NULL
- `available_day`: NULL
- `difficulty`: NULL
- `reward`: 'Orc''s Ring + Encantamentos'
- `mutual_exclusion_group`: NULL

### Vila dos Porings
- `level_required`: 30
- `party_min`: 1
- `cooldown_type`: 'daily'
- `cooldown_hours`: NULL
- `available_day`: NULL
- `difficulty`: NULL
- `reward`: 'Baú Poring + Encantamentos'
- `mutual_exclusion_group`: NULL

## UI Changes

### InstanceCard
When `liga_tier` is not null, show a badge after the time/count area:
- Format: tier letter + coin count (e.g., "A · 5")
- Color: amber/gold text, subtle

### InstanceModal
In the info badges row, add a badge when `liga_tier` is not null:
- Text: "Liga A — 5 moedas"
- Style: amber background, matching existing badge pattern

### Supabase Query
The `useInstances` hook fetches with `.select("*")` so new columns are included automatically. No query changes needed.

## Migration

New file: `supabase/migrations/003_add_liga_fields.sql`

1. ALTER TABLE to add columns with CHECK constraint
2. INSERT new instances (Batalha dos Orcs, Vila dos Porings)
3. UPDATE existing instances by name to set liga_tier and liga_coins
4. Final comment documenting expected update count (30 instances total)

# Database Documentation

> **Read when**: writing migrations, services, RLS policies, or any Supabase query.
> **Related**: [API_SPEC.md](./API%20SPEC.md) · [backend/ARCHITECTURE.md](../BE/BE-ARCHITECTURE.md) · [backend/PROJECT-RULES.md](../BE/BE-PROJECT-RULE.md)

## Overview

- **Database**: PostgreSQL 15+ (hosted on Supabase)
- **Client**: `@supabase/supabase-js` (typed with generated `Database` types)
- **Auth**: Supabase Auth (`auth.users`), mirrored into `public.users`
- **Security**: Row Level Security (RLS) enabled on every table
- **Architecture**: Feature-based organization
- **Text Modality**: Plain text only (no LaTeX, no OCR)

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, plural | `decks`, `mindmap_nodes` |
| Columns | snake_case | `created_at`, `correct_stmt` |
| Foreign Keys | `[singular_table]_id` | `deck_id`, `knowledge_item_id` |
| Indexes | `idx_[table]_[column]` | `idx_decks_user_id` |
| RLS Policies | `"[table]: [action] [rule]"` | `"decks: read public or own"` |

---

## Entities by Feature

### Auth & System Feature

**roles** — *Static seed data (1 = admin, 2 = user)*
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PK (static, not generated) |
| name | VARCHAR(20) | NOT NULL, UNIQUE, CHECK IN ('admin', 'user') |

**users** — *Profile mirror of `auth.users`, auto-created on signup*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, FK → auth.users, ON DELETE CASCADE | Same ID as Supabase Auth account |
| role_id | INT | FK → roles, NOT NULL, DEFAULT 2 | New players are `user` |
| email | VARCHAR(255) | NOT NULL | Snapshot from signup |
| full_name | VARCHAR(100) | NULLABLE | Private name (Google sign-in fills it). Never shown to other players |
| display_name | VARCHAR(30) | NULLABLE, CHECK 2–30 chars after trim and no `<` `>` | The public **Garden Name** the player chose (migration `20260928001000`). Shown on tournament boards, in other gardeners' Visited Gardens, on the visitor banner and in the header. NULL = the id-derived pseudonym ("Mossy Owl") everywhere. Players update only their own (column grant + RLS "users: update self"); the app sanitizes first (`auth/lib/displayName.ts`). Others read it only through `get_display_names(ids)` (`SECURITY DEFINER`, display names only, 200 ids max) and the board functions |
| avatar_url | VARCHAR(500) | NULLABLE | Profile picture |
| streak_count | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | Consecutive active days |
| last_active_at | DATE | NULLABLE | Drives streak logic |
| coins | INT | NOT NULL, DEFAULT 300, CHECK ≥ 0 | 🪙 Gold balance. Starts at **300** (3 tree seeds): the default, and set explicitly by `handle_new_user()`. +1 the first time the player masters an item (5/5). **−100 per tree planted** (`plant_deck`), **−min(100 + statements, 150) per tree cloned** (`clone_deck`). Mastery coins are ×1.2 / ×1.5 / ×1.8 with farm buffs (fraction kept in `coin_carry`); **−price per Shop item** (`purchase_and_place_item`), **+Woodshop refund** on a chop (`uproot_deck`). Written only by `award_mastery_coin`, `plant_deck`, `clone_deck`, `purchase_and_place_item`, `uproot_deck` and `dev_grant_coins`; see *Gold coins*, *Seed economy* and *Farm Grid* |
| coin_carry | NUMERIC(6,3) | NOT NULL, DEFAULT 0, 0 ≤ x < 1 | Fraction of a coin carried between buffed mastery payouts (migration `20260930000000`) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### Decks & Mindmap Feature

**decks** — *A Deck is a living Tree*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | Deck owner |
| title | VARCHAR(150) | NOT NULL | "Cell Biology 101" |
| slug | VARCHAR(160) | NOT NULL, UNIQUE, CHECK kebab-case | "cell-biology-101" |
| description | TEXT | NULLABLE | |
| is_public | BOOLEAN | NOT NULL, DEFAULT FALSE | Shared with the community: readable (read-only) by everyone with the link, and listed in the Visited Gardens of players who opened it. Private until the owner shares it (the default was TRUE before migration `20260928000600`; existing trees kept their value) |
| tree_type | VARCHAR(30) | NOT NULL, DEFAULT 'oak', CHECK (`decks_tree_type_check`, migration 13) | Species: oak, pine, birch, cherry, willow, mystic, palm, citrus, maple, cactus (validated by Zod from `shared/lib/treeSkins.ts`). Retired ids render as their successor until migration 13 rewrites them (sakura → cherry, saguaro → cactus, apple → citrus, bamboo → palm); unknown values render as oak |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| is_tournament_open | BOOLEAN | NOT NULL, DEFAULT FALSE | The owner hosts a Mind Tournament on this tree (migration `20260928000900`). Only meaningful while `is_public`: visitors join only public, hosting trees. Owner-only switch (`setTournamentOpen`); closing keeps every result |

**mindmap_nodes** (self-referencing adjacency list) — *Nodes are underground Roots*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | |
| parent_id | UUID | FK → mindmap_nodes, NULLABLE, ON DELETE CASCADE | NULL = top-level root |
| title | VARCHAR(150) | NOT NULL | Concept name |
| sort_order | INT | NOT NULL, DEFAULT 0 | Order among siblings |

⚠️ Parent must be in the **same deck**: enforced by composite FK `(parent_id, deck_id) → (id, deck_id)`. `CHECK (parent_id <> id)` blocks self-parenting.

**tree_visits** — *Visited Gardens: the shared trees a player has opened (migration `20260928000800_tree_visits.sql`)*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | The visitor |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | The tree they opened |
| visited_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Latest visit; a repeat visit refreshes it |
| *(user_id, deck_id)* | — | PK | One row per player per tree |

- **What counts as a visit**: a signed-in player opening `/deck/[slug]` of **another gardener's public** tree. Visiting a whole island (`/?visit=<id>`) records nothing. The page records it from the browser after mount (`TreeVisitTracker`), so link prefetching never counts
- **Writes**: only `public.record_tree_visit(deck_id)` (`SECURITY DEFINER`, caller = `auth.uid()`). It returns `false` without writing for an unknown, private or own tree, otherwise upserts the row with `visited_at = now()` and returns `true`. Players have SELECT only, so a visit to a private or own tree can't be forged through the API
- **Reads**: `getVisitedGardens` joins `tree_visits → decks` (inner join through decks RLS) and filters `is_public` and `user_id ≠ me`, so a tree that went private again drops out of the drawer without deleting the row

### Knowledge & Trap Engine Feature

**knowledge_items** — *Plain-text statements used to generate trap drills*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| node_id | UUID | FK → mindmap_nodes, NOT NULL, ON DELETE CASCADE | |
| prompt | TEXT | NOT NULL, non-empty | Question shown to the player |
| correct_stmt | TEXT | NOT NULL, non-empty, no LaTeX commands | The TRUE statement (plain text) |
| trap_rules | JSONB | NOT NULL, DEFAULT '{}', must be object | Rules for generating FALSE variants |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Example `trap_rules`:
```json
{
  "swaps": [
    { "from": "ATP", "to": "DNA" },
    { "from": "cellular respiration", "to": "photosynthesis" }
  ],
  "negate": true
}
```
Applied to `"Mitochondria produce ATP through cellular respiration."` → traps like `"Mitochondria produce DNA through cellular respiration."`

**Items created in the app** (`createKnowledgeItem`): authors write only the statement. The server stores `trap_rules = {"negate": true}` and `prompt` = the root's title; traps then come from the built-in dictionary (`shared/lib/trapDictionary.ts`). `swaps` stay supported for seeded or imported items.

### Mind Tournament Feature

*Migration `20260928000900_mind_tournament.sql`. Owners host a mastery race on a shared tree; visitors compete with an ISOLATED score that never touches `user_progress`, `practice_days` (streaks) or coins.*

**deck_tournament_participants** — *One contestant on one tree*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | The hosting tree |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | The contestant (never the host) |
| current_points | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 and ≤ max_points | Σ tournament `mastery_level` over the tree's current drillable statements |
| max_points | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | 5 × N, N = drillable statements (the ones the trap engine can ask), refreshed on every answer |
| mastery_percentage | NUMERIC(5,2) | GENERATED ALWAYS AS `round(current_points / nullif(max_points, 0) × 100, 2)` STORED | NULL when the tree has no drillable statement |
| days_count | INT | NOT NULL, DEFAULT 1, CHECK ≥ 1 | Distinct local calendar days with at least one answer on this tree |
| is_graduated | BOOLEAN | NOT NULL, DEFAULT FALSE | Every drillable statement reached 5/5. Set once, never cleared |
| graduated_at | TIMESTAMPTZ | NULLABLE; set exactly when is_graduated (CHECK) | When they graduated (Hall of Fame tie-break) |
| last_practiced_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Latest practice day (the contestant's local date) |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Latest answer (Active board tie-break) |
| *(deck_id, user_id)* | — | UNIQUE `unique_deck_participant` | One run per contestant per tree |

**deck_tournament_item_progress** — *The contestant's tournament mastery per statement*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| participant_id | UUID | FK → deck_tournament_participants, NOT NULL, ON DELETE CASCADE | |
| knowledge_item_id | UUID | FK → knowledge_items, NOT NULL, ON DELETE CASCADE | The statement |
| mastery_level | INT | NOT NULL, DEFAULT 0, CHECK 0–5 | Same ±1 rule as `user_progress` (correct +1 up to 5, wrong −1 down to 0), kept separately |
| *(participant_id, knowledge_item_id)* | — | UNIQUE `unique_participant_statement` | |

**Rules** (the same numbers live in `features/tournament/lib/scoring.ts`; a test checks the SQL still says so):

| Rule | Enforced by |
|------|-------------|
| Mastery % = current_points / (N × 5) × 100; N = drillable statements (a non-drillable one can never be asked, so 100% stays reachable) | Generated column; `record_tournament_answer` gets the tree's drillable ids from the server and sums only those |
| A practice day counts once: a later local day adds 1; more answers that day (or an earlier date) add nothing | `days_count = case when p_day > last_practiced_date then days_count + 1`, `last_practiced_date = greatest(...)`; `p_day` = the contestant's local day (browser timezone, UTC fallback, as for `practice_days`) |
| Graduation at 100% is permanent, and a graduate's run is frozen | `is_graduated` is set when `max_points > 0 and current_points >= max_points`; later answers raise `TOURNAMENT_GRADUATED`; `graduated_at` is CHECK-paired with it |
| Only a signed-in visitor on a public, hosting tree competes; never the host | `shared/lib/visitor.ts` `tournamentAccess` in the app, re-checked in `record_tournament_answer` (`TOURNAMENT_CLOSED`, `TOURNAMENT_HOST`) |
| Points can't be posted: the server grades every answer (trap engine) | Players have **no** INSERT/UPDATE/DELETE on either table; `record_tournament_answer` is EXECUTE-able by `service_role` only (`features/tournament/services/answers.ts`, admin client) |
| Isolation: `user_progress`, `practice_days`, `users.coins` never change | The function writes only the two tournament tables (tests check the SQL, and that the service never touches those tables) |
| Boards never show emails or private names | `get_tournament_active_board` / `get_tournament_hall_of_fame` return `users.display_name` only (they returned `full_name` before migration `20260928001000`); the app falls back to the id-derived pseudonym |

**Boards** (`SECURITY DEFINER`, EXECUTE for anon + authenticated; rows only for a tree the caller can read, i.e. public or their own; still readable after the host closes the tournament):
- `get_tournament_active_board(deck_id)` (🌱 Active Learners): not graduated, `ORDER BY mastery_percentage DESC NULLS LAST, days_count ASC, updated_at ASC LIMIT 50` → `rank, user_id, display_name, current_points, max_points, mastery_percentage, days_count, updated_at`
- `get_tournament_hall_of_fame(deck_id)` (📜 Hall of Fame): graduated, `ORDER BY days_count ASC, graduated_at ASC` (every graduate) → `rank, user_id, display_name, max_points, days_count, graduated_at`

⚠️ Known limits: visitors can read a shared tree's true statements (strict read-only mode, `getDeckReader`), so a contestant can look answers up; and a contestant who answers every statement five times in one sitting graduates in 1 day. The board measures days, not honesty or spacing.

### Farm Grid Feature

*Migration `20260930000000_farm_grid.sql`. Each gardener's farm is a 16 × 16 isometric grid; trees and everything bought in the 🏪 Shop stand on it. Owned by the `garden` feature.*

**garden_placements** — *One item on a farm*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | The farm's owner |
| item_type | TEXT | NOT NULL, CHECK in (tree, fence, stream, farmer_house, woodshop, rockery, animal) | |
| deck_id | UUID | FK → decks, ON DELETE CASCADE; set iff item_type = 'tree' (CHECK); partial UNIQUE | The tree's deck. Chopping (deleting) the deck removes its tile |
| grid_x, grid_y | INT | NOT NULL, 0–15 | Top tile of the footprint |
| width, height | INT | NOT NULL, DEFAULT 1, 1–2; CHECK x + width ≤ 16, y + height ≤ 16 | Footprint (2 × 2 for the Farmer's House and Woodshop) |
| variant | TEXT | NULLABLE, ≤ 20 chars | Animals: 'cow' / 'pig' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, grid_x, grid_y)* | — | UNIQUE `unique_farm_tile` | One item per top tile (overlaps of bigger footprints are refused by the function) |

**Catalogue and rules** (the same numbers live in `features/garden/lib/farmCatalog.ts` / `farmBuffs.ts`; tests check the SQL):

| Item | Size | Price | Effect |
|------|------|-------|--------|
| Tree (own deck) | 1 × 1 | free | Planting from the Shop's Trees tab; one tile per deck |
| Farmer's House | 2 × 2 | 50 🪙 | Trees in its 4 × 4 area (its footprint + 1 tile all round): ×1.5 coins |
| Woodshop | 2 × 2 | 50 🪙 | Chopping a tree refunds `least(floor(statements × 0.25), 50)` 🪙 |
| Stream | 1 × 1 | 5 🪙 | Trees on a side tile (x ± 1 or y ± 1): ×1.2 coins; stacks with the house to ×1.8 |
| Fence | 1 × 1 | 1 🪙 | Auto-connects to side fences (drawing only) |
| Rockery | 1 × 1 | 2 🪙 | Decoration |
| Cow / Pig | 1 × 1 | 5 🪙 | Wander / snuffle around their tile (CSS, off for reduced motion) |

| Rule | Enforced by |
|------|-------------|
| Prices and sizes can't be chosen by the client | `public.purchase_and_place_item(item_type, x, y, deck_id?, variant?)` (`SECURITY DEFINER`, caller = `auth.uid()`) takes them from its own catalogue; there is no price or size parameter |
| No free items | Players have **no** INSERT/UPDATE on `garden_placements` (SELECT and DELETE only); the function is the only writer. It charges `coins >= price` and inserts in one transaction (`INSUFFICIENT_COINS`) |
| No overlaps, nothing off the grid, one tile per deck | Checked in the function under a lock on the owner's `users` row (`TILE_UNAVAILABLE`, `TREE_ALREADY_PLACED`); CHECKs + unique constraints as the last guard |
| Buffs are real payouts | `public.farm_coin_multiplier(user, deck)` (service role) → `award_mastery_coin` pays `floor(1 × multiplier + users.coin_carry)` and keeps the fraction in `users.coin_carry` (0 ≤ x < 1), so ×1.2 isn't lost to rounding. Still once per item ever |
| Chopping never profits | `public.uproot_deck(deck_id)` (owner = `auth.uid()`) deletes the deck and, with a Woodshop placed, refunds at most 50 🪙 (half a seed). Picking a tree up (back to the Shop) is **not** chopping and pays nothing, so place/remove can't be looped for coins |
| Visitors see only what is shared | RLS "read own or public": your farm in full; someone else's items and their **public** trees only. Delete: own rows |

Existing trees were backfilled onto the grid (every other tile from (1, 1), 7 per row, up to 49); newer trees wait in the Shop's Trees tab until planted.

### Progress & Gamification Feature

**user_progress** — *Decoupled progress: one row per player per item*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| knowledge_item_id | UUID | FK → knowledge_items, NOT NULL, ON DELETE CASCADE | |
| mastery_level | INT | NOT NULL, DEFAULT 0, CHECK 0–5 | 0 Seed → 1 Sprout → 2 Seedling → 3 Sapling → 4 Young Tree → 5 Mighty Root (mastered: 5 net correct answers). The scale was 0–3 before migration `20260928000400`. Old values were kept as they were, not rescaled, so a former 3/3 item is now 3/5 |
| mistake_count | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | Times fooled by a trap |
| last_practiced_at | TIMESTAMPTZ | NULLABLE | |
| coin_awarded_at | TIMESTAMPTZ | NULLABLE, not writable by players | When this item's 🪙 was paid to this player; NULL = unpaid. Makes the reward one-time |
| *(user_id, knowledge_item_id)* | — | UNIQUE | One progress row per player per item |

**Gold coins** (migrations `20260928000300_user_coins.sql` + `20260928000400_mastery_scale_5.sql`): 1 🪙 the first time a player's item reaches mastery 5/5, **once per item ever**. A wrong answer drops a 5/5 item to 4/5, and climbing back to 5/5 pays nothing (`coin_awarded_at` stays set). The backfill pays items already at 5/5 when it runs. If `000300` ran before the scale change, it paid items at the old top level 3; those stay paid, so they earn nothing at 5/5. Anti-cheat invariants:

| Invariant | Enforced by |
|-----------|-------------|
| Mastery pays only through `public.award_mastery_coin(user, item)` | `users` UPDATE is granted to players on `full_name`, `avatar_url` only; the function is `SECURITY DEFINER` with EXECUTE for `service_role` only (`progress/services/coins.ts`, admin client). The other writers of `users.coins` are the spending RPCs `plant_deck` / `clone_deck` and the dev-only `dev_grant_coins` (see *Seed economy*) |
| A paid item can't be reset and farmed again | Players have no INSERT/UPDATE privilege on `user_progress.coin_awarded_at` (column grants), and can't rewrite a row's identity: UPDATE is granted on `mastery_level`, `mistake_count`, `last_practiced_at` only |
| No double payment under concurrency | The function claims with one `UPDATE … WHERE mastery_level = 5 AND coin_awarded_at IS NULL` (it was `= 3` before migration `20260928000400`): only one caller gets the row |
| Coins earned from mastery ≤ number of (player, item) pairs ever mastered | The above. The balance itself also holds the 300 🪙 starter purse, minus what was spent on seeds and clones; `coins >= 0` CHECK |

**Seed economy** (migration `20260928000500_seed_economy.sql`; the same numbers live in `shared/lib/economy.ts`, and a test checks they match):

| Rule | Enforced by |
|------|-------------|
| New gardeners start with 300 🪙 | `users.coins DEFAULT 300`, and `handle_new_user()` inserts `coins = 300` for email and OAuth signups. Google metadata is read too: `name` → `full_name`, `picture` → `avatar_url`. Gardeners from before the migration were topped up once to at least 300 (`greatest(coins, 300)`) |
| No gardener is left without a purse | `public.ensure_user_profile()` (`SECURITY DEFINER`, caller = `auth.uid()`) creates the caller's missing `users` row with 300 🪙 and returns the balance; an existing row is never changed. It's called after every login (`/auth/callback`), by `readCoins` when no row exists, and by `plant_deck` before charging. Migration `20260928000600` also backfilled a row for every auth user without one. `users.coins` is `NOT NULL`, so a missing row, not a NULL balance, is the case this covers |
| Planting a tree costs 100 🪙 | `public.plant_deck(title, slug, description, is_public, tree_type)`, `SECURITY DEFINER`, owner = `auth.uid()`. It charges with `UPDATE users SET coins = coins - 100 WHERE id = auth.uid() AND coins >= 100`, then inserts the deck, all in one transaction. Short purse → `INSUFFICIENT_COINS` and nothing is inserted. A duplicate slug (23505) undoes the charge |
| The fee can't be skipped | `INSERT` on `decks` is revoked from `anon` / `authenticated`: `plant_deck` and `clone_deck` are the only ways to create a deck. Owners still update and delete their decks |
| Cloning a shared tree costs min(100 + statements, 150) 🪙 | `public.clone_deck(source_deck_id, slug)`, `SECURITY DEFINER`, cloner = `auth.uid()` (migration `20260928000700`). Only another gardener's **public** tree (`DECK_NOT_FOUND` otherwise, `CANNOT_CLONE_OWN_DECK` for your own). Fee = `least(100 + item count, 150)`, charged like `plant_deck` (`coins >= fee`, else `INSUFFICIENT_COINS`). In the same transaction it inserts a **private** deck owned by the cloner (same title, description, species), copies every `mindmap_nodes` row parents-first (same hierarchy and `sort_order`) and every `knowledge_items` row with its `prompt`, `correct_stmt` and `trap_rules`. `user_progress` is **never** copied: the clone starts at 0/5 with every mastery coin still to earn. A duplicate slug (23505) rolls everything back |
| Balances never go negative | `coins >= fee` in each charge, plus the `coins >= 0` CHECK |
| No free coins in production | `public.dev_grant_coins(user, 1–100)` (Coin Shop "Simulate Top-up (Dev Mode)") is EXECUTE-able by `service_role` only, and the server action refuses it when `NODE_ENV = production`. Real payments (webhooks) replace it later |

⚠️ Players can still write their own `mastery_level` (see *Supabase Notes*), so a player could mark an item 5/5 directly and collect its one coin without drilling. The cap above still holds: one coin per item. Close this with the planned `SECURITY DEFINER` progress RPC before coins buy anything.

**practice_days** — *Streak log: one row per player per local day with at least one saved answer*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| day | DATE | NOT NULL | Player's local calendar day (browser IANA timezone, UTC fallback) |
| time_zone | TEXT | NOT NULL, DEFAULT 'UTC', 1–64 chars | Zone used for `day`; pages that can't ask the browser reuse the latest one |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, day)* | — | PK | First answer of the day inserts, later ones change nothing |

⚠️ `user_progress.last_practiced_at` is overwritten on every answer (one row per item), so past active days cannot be rebuilt from it. Streaks are computed from `practice_days` (`progress/lib/streak.ts`); `users.streak_count` / `last_active_at` mirror the current value.

---

## ERD Diagram

```
roles
  └─1:N─► users ◄─1:1── auth.users   (handle_new_user() trigger)
            │
            ├─1:N─► decks
            │         └─1:N─► mindmap_nodes ◄──┐
            │                   │   └──────────┘ parent_id (self-ref 1:N)
            │                   └─1:N─► knowledge_items
            │                             │
            ├─1:N─► user_progress ◄─N:1───┘
            │       (N:M bridge: one row per user per knowledge_item)
            ├─1:N─► tree_visits ◄─N:1── decks
            │       (N:M bridge: one row per visitor per shared tree)
            └─1:N─► deck_tournament_participants ◄─N:1── decks
                      └─1:N─► deck_tournament_item_progress ◄─N:1── knowledge_items
```

---

## Key Relationships

| Relationship | Type | Notes |
|--------------|------|-------|
| auth.users → users | 1:1 | Auto-created by `handle_new_user()` trigger |
| roles → users | 1:N | Role-based access (ON DELETE RESTRICT) |
| users → decks | 1:N | Ownership drives RLS |
| decks → mindmap_nodes | 1:N | CASCADE |
| mindmap_nodes → mindmap_nodes | 1:N | Self-ref, same-deck only, subtree cascades |
| mindmap_nodes → knowledge_items | 1:N | CASCADE |
| **users ↔ knowledge_items** | N:M via `user_progress` | ⚠️ Decoupled progress: same public deck, separate progress per player |
| users ↔ decks (visits) | N:M via `tree_visits` | Visited Gardens; both sides CASCADE |
| users ↔ decks (tournament) | N:M via `deck_tournament_participants` | One run per contestant per tree; item levels in `deck_tournament_item_progress`; all CASCADE |

---

## Conventions

- **Primary Key**: UUID v4 via `gen_random_uuid()` (exceptions: `roles.id` static INT, `users.id` copied from `auth.users`)
- **Cascades**: `ON DELETE CASCADE` on decks, nodes, items, progress
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (never plain `TIMESTAMP`)
- **Plain Text**: `correct_stmt` rejects backslash commands (`\frac`, `\sqrt`); validate with Zod first for friendly errors
- **JSONB**: `trap_rules` shape validated by Zod in `features/decks/dto` and read by `shared/lib/trapEngine.ts`, not in DB
- **Schema-qualify**: Always write `public.users` vs `auth.users`
- **Derived data**: Tree health is computed from `mastery_level`, never stored

---

## Indexes

```sql
-- Decks & Mindmap
CREATE INDEX idx_decks_user_id ON public.decks(user_id);
CREATE UNIQUE INDEX idx_decks_slug ON public.decks(slug);                 -- doubles as UNIQUE(slug)
CREATE INDEX idx_mindmap_nodes_deck_id ON public.mindmap_nodes(deck_id);
CREATE INDEX idx_mindmap_nodes_parent_id ON public.mindmap_nodes(parent_id);

-- Knowledge & Trap Engine
CREATE INDEX idx_knowledge_items_node_id ON public.knowledge_items(node_id);

-- Visited Gardens (the PK (user_id, deck_id) covers per-player lookups)
CREATE INDEX idx_tree_visits_user_visited_at ON public.tree_visits(user_id, visited_at DESC);
CREATE INDEX idx_tree_visits_deck_id ON public.tree_visits(deck_id);   -- fast cascade deletes

-- Mind Tournament (the UNIQUE constraints cover deck_id / participant_id lookups)
CREATE INDEX idx_tournament_participants_user_id ON public.deck_tournament_participants(user_id);
CREATE INDEX idx_tournament_item_progress_item_id ON public.deck_tournament_item_progress(knowledge_item_id);

-- Progress
CREATE UNIQUE INDEX idx_user_progress_user_item
  ON public.user_progress(user_id, knowledge_item_id);                    -- doubles as UNIQUE + upsert target
CREATE INDEX idx_user_progress_item_id ON public.user_progress(knowledge_item_id);  -- fast cascade deletes
```

---

## Row Level Security (RLS)

RLS is **enabled on all tables**. No policy = no access (except `service_role`).

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| roles | Everyone | ✗ | ✗ | ✗ |
| users | Self (admin: all); others' `display_name` only via `get_display_names()` | ✗ (trigger only) | Self, `full_name` + `avatar_url` + `display_name` only | ✗ |
| decks | `is_public` OR owner | ✗ direct; only via `plant_deck()` (100 🪙) or `clone_deck()` (min(100 + n, 150) 🪙) | Owner | Owner |
| mindmap_nodes | If deck readable | Deck owner | Deck owner | Deck owner |
| knowledge_items | If deck readable | Deck owner | Deck owner | Deck owner |
| user_progress | Owner | Owner + item readable | Owner + item readable | ✗ |
| practice_days | Owner | ✗ (service role only) | ✗ | ✗ |
| tree_visits | Owner | ✗ direct; only via `record_tree_visit()` (public trees of others) | ✗ direct; same function | ✗ (cascades only) |
| garden_placements | Owner; others: items + public trees | ✗ direct; only via `purchase_and_place_item()` | ✗ | Owner |
| deck_tournament_participants | Owner (boards through the two board functions) | ✗ (service role: `record_tournament_answer`) | ✗ (same) | ✗ (cascades only) |
| deck_tournament_item_progress | Owner (through the participant) | ✗ (service role) | ✗ (service role) | ✗ (cascades only) |

```sql
-- Decks: public or own
CREATE POLICY "decks: read public or own" ON public.decks
  FOR SELECT TO anon, authenticated
  USING (is_public OR (SELECT auth.uid()) = user_id);

CREATE POLICY "decks: update own" ON public.decks
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Nodes: inherit from deck (same pattern for INSERT/UPDATE/DELETE with owner check)
CREATE POLICY "nodes: read if deck readable" ON public.mindmap_nodes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = mindmap_nodes.deck_id
      AND (d.is_public OR d.user_id = (SELECT auth.uid()))
  ));

-- Items: inherit via node → deck
CREATE POLICY "items: insert if deck owner" ON public.knowledge_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mindmap_nodes n
    JOIN public.decks d ON d.id = n.deck_id
    WHERE n.id = knowledge_items.node_id
      AND d.user_id = (SELECT auth.uid())
  ));

-- Progress: owner only, and only on items the player can see
CREATE POLICY "progress: insert own" ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.knowledge_items ki
                WHERE ki.id = user_progress.knowledge_item_id)
  );

-- Users: block role_id / streak edits from the client
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;
```

- **Perf**: Use `(SELECT auth.uid())` instead of bare `auth.uid()` so it's evaluated once per query
- **Full policy set**: `supabase/migrations/20260928000000_initial_schema.sql` (all six baseline tables, one policy per action as in the table above, `public.is_admin()` for the admin read on `users`) and `20260928000200_practice_days.sql`

### Answer secrecy (column privileges on `knowledge_items`)

RLS picks **rows**; it cannot hide **columns**. Without extra grants, `GET /rest/v1/knowledge_items?select=correct_stmt` with the public anon key returns every answer.
Migration `supabase/migrations/20260928000100_hide_knowledge_answers.sql` adds column-level privileges:

| Role | SELECT | INSERT / UPDATE |
|------|--------|-----------------|
| anon | `id`, `node_id`, `prompt`, `created_at` | ✗ |
| authenticated | `id`, `node_id`, `prompt`, `created_at` | `node_id`, `prompt`, `correct_stmt`, `trap_rules` (RLS: deck owner) |
| service_role | all | all |

- **Why the service role**: anything a Server Action can do with the player's JWT, the player can do from the browser too. Answers are read only with a key the browser never has
- **Code**: every `correct_stmt` / `trap_rules` read lives in `src/features/decks/services/answers.ts`, via `src/shared/lib/supabase/admin.ts`. The user's RLS client first proves the nodes/items are readable; the admin client then reads answers only for those ids. `decks/__tests__/answerSecrecy.test.ts` fails if any other file selects these columns
- **Writes**: authors still insert/update statements with their own session; Postgres needs SELECT on columns used in `WHERE` / `RETURNING`, so writes can't be used as an oracle and inserts return only `id`
- **Deploy order**: set `SUPABASE_SERVICE_ROLE_KEY` on the server → restart → run the migration. Without the key, `answers.ts` falls back to the user client (works only before the migration; after it, reads fail with `42501` and the server logs the fix)
- **New columns** on `knowledge_items` are not readable by anon/authenticated until granted explicitly (fail closed)
- **Who sees statements**: the deck owner (editor, `getDeckEditor`) and, in strict read-only visitor mode, anyone viewing a **public** tree (`getDeckReader`). `loadDeckReader` checks `is_public` (or ownership) with the player's client before `answers.ts` reads. This is safe because only the owner can be graded on a tree (`FORBIDDEN_VISITOR_PRACTICE` in `getDrillSession` / `checkDrillAnswer` / `submitDrillResult`), so a visitor who knows the statements earns no mastery or coins. `trap_rules` are never returned. Private trees of others stay fully hidden

---

## Migration Rules

- **Location**: `supabase/migrations/`
- **Execution order** (a fresh database runs all of them, in this order):

  | # | File | What it does |
  |---|------|--------------|
  | 1 | `20260928000000_initial_schema.sql` | Baseline: `roles` (+ seed), `users` + `handle_new_user()` trigger, `decks`, `mindmap_nodes`, `knowledge_items`, `user_progress`; FKs and cascades, checks, indexes, RLS + policies, `users` column grants, `is_admin()` |
  | 2 | `20260928000100_hide_knowledge_answers.sql` | Column privileges: `correct_stmt` / `trap_rules` readable only by the service role |
  | 3 | `20260928000200_practice_days.sql` | Streak log table + RLS + backfill from `user_progress` |
  | 4 | `20260928000300_user_coins.sql` | `users.coins`, `user_progress.coin_awarded_at`, `award_mastery_coin()` (service role only), `user_progress` column grants, backfill of already-mastered (5/5) items |
  | 5 | `20260928000400_mastery_scale_5.sql` | `mastery_level` CHECK widened to 0–5 (no rescaling), `award_mastery_coin()` pays at 5/5. Order-independent with file 4 |
  | 6 | `20260928000500_seed_economy.sql` | `users.coins` default 300 + signup trigger + one-time top-up to 300, `plant_deck()` (100 🪙 per tree, the only way to insert decks), `dev_grant_coins()` (service role, test top-ups). Needs file 4 |
  | 7 | `20260928000600_profiles_and_sharing.sql` | Signup trigger reads Google metadata; `ensure_user_profile()` + backfill of missing profile rows (300 🪙); `decks.is_public` default `false`; `plant_deck()` ensures the profile first and plants private by default |
  | 8 | `20260928000700_clone_deck.sql` | `clone_deck()`: charge min(100 + statements, 150) 🪙 and deep-copy another gardener's public tree (roots + statements, no progress) into a private deck of the caller. Needs file 7 |
  | 9 | `20260928000800_tree_visits.sql` | `tree_visits` + RLS (read own) + `record_tree_visit()`, the only writer (another gardener's public tree only). Needs file 7 |
  | 11 | `20260928001000_display_names.sql` | `users.display_name` (public Garden Name, 2–30, CHECK), its column grant, `get_display_names()`, and both tournament board functions re-created to return `display_name` instead of `full_name` |
  | 12 | `20260930000000_farm_grid.sql` | `garden_placements` + RLS, `purchase_and_place_item()` (catalogue prices), `farm_coin_multiplier()` + `users.coin_carry` and a buffed `award_mastery_coin()`, `uproot_deck()` (Woodshop refund, capped at 50), backfill of existing trees onto the grid |
  | 13 | `20261001000000_ten_tree_species.sql` | Retired species rewritten to their successor (unknown → oak), then `decks_tree_type_check` limits `tree_type` to the ten ids |
  | 10 | `20260928000900_mind_tournament.sql` | `decks.is_tournament_open`, `deck_tournament_participants` + `deck_tournament_item_progress` + RLS (read own), `record_tournament_answer()` (service role only), the two board functions |

- **Fresh setup**: with the Supabase CLI, `npx supabase db reset` applies them in filename order. Without it, paste each file into the SQL Editor in the order above (each one is a single transaction). Set `SUPABASE_SERVICE_ROLE_KEY` on the server before step 2 (see *Answer secrecy*)
- ⚠️ **Existing hosted project**: its base schema was built in the dashboard before file 1 existed, and files 2 and 3 are already applied there. Don't run file 1 on it: it is re-runnable (`if not exists`, `drop policy if exists`), but it can't reconcile differences with the dashboard schema, and dashboard policies with other names would stay next to its policies (permissive policies OR together)
- **Deploy order for file 4 on the hosted project**: deploy the app code first, then run the migration. The new code saves answers without coins until the column exists. The old code's `user_progress` upsert would fail after the migration, because players can no longer update `user_id` / `knowledge_item_id`
- **Deploy order for file 5 on the hosted project**: run it **before** deploying the 0–5 app. It's safe with the old app, which never writes above 3. The new app's 4/5 answers fail against the old CHECK; the server log names this migration
- **Deploy order for file 6 on the hosted project**: run it together with the app deploy. The new app plants through `plant_deck`, which doesn't exist before the migration. The old app inserts decks directly, which is refused after it
- **File 7** can run any time after file 6. The app tolerates it missing: the login and balance fallbacks log which migration to run and never block sign-in
- **File 8** can run any time after file 7. Until it runs, the Clone button answers "Could not clone this tree" and the server log names this migration (`PGRST202`); nothing else depends on it
- **File 11** can run any time after file 10. Until it runs, saving a Garden Name answers "Could not save your garden name" (the log names the migration), names fall back to pseudonyms, and the boards still show `full_name`
- **File 13** runs after the ten-species code is deployed (that code renders both old and new ids and only writes new ones; older code would still write 'sakura' / 'bamboo' / 'apple' / 'saguaro' and hit the check).
- **File 12** can run any time after file 11. Until it runs, the farm is empty (the log names the migration), the Shop can't place anything, chopping falls back to the plain delete (no refund) and coins pay ×1
- **File 10** can run any time after file 9. The app tolerates it missing: no boards on the deck page, the host switch answers "Could not open the tournament", and the log names the migration. Practice and drills are unaffected
- **File 9** can run any time after file 7. Until it runs, opening a shared tree logs which migration to run (the page itself never fails) and the Visited Gardens drawer stays empty
- **Format**: `[timestamp]_[description].sql` (e.g., `20260923000200_decks_mindmap.sql`); new migrations sort after `20260930000000`
- **One feature per file** for new changes; the baseline groups auth_system → decks_mindmap → knowledge_trap_engine → progress_gamification → rls_policies in one file
- **Forward-only**: Supabase has no `down()`; fix mistakes with a new migration, never edit an applied one
- **Test locally**: `npx supabase db reset` before pushing
- **Regenerate types** after every migration:

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > src/shared/types/database.types.ts
```

---

## Supabase Notes

```typescript
// src/shared/lib/supabase/browser.ts
import { createClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/shared/types/database.types'

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export type Deck = Tables<'decks'>
export type KnowledgeItem = Tables<'knowledge_items'>
```

```sql
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (new.id, new.email,
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'avatar_url');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Best Practices**:
- Each feature owns queries for its own tables; cross-feature access goes through that feature's exported functions
- Use `createServerClient<Database>` from `@supabase/ssr` in Server Components / Route Handlers
- Never expose the service role key (`NEXT_PUBLIC_*`); it bypasses RLS
- Validate mindmap moves in the app: DB blocks self/cross-deck parents, but not A → B → A cycles
- Slugs are globally unique; append a suffix on collision (`cell-biology-101-2`)
- ⚠️ Owners can update their own `mastery_level` via RLS; move writes to a `SECURITY DEFINER` RPC before adding leaderboards

---

## Progress Use Cases

| Action | Implementation |
|--------|----------------|
| Start drilling an item | Insert the `user_progress` row (user client); later answers update `mastery_level`, `mistake_count`, `last_practiced_at` only. A unique-violation race on the first answer falls back to update |
| First mastery of an item | Answer lands on 5/5 and `coin_awarded_at` is NULL → `award_mastery_coin(user, item)` (admin client) sets it and adds 1 to `users.coins` in one call; returns `{ coins_earned, total_coins }` |
| Correct answer | `mastery_level = LEAST(mastery_level + 1, 5)`, set `last_practiced_at = now()` |
| Fooled by a trap | `mistake_count + 1`, `mastery_level = GREATEST(mastery_level - 1, 0)` (a mastered 5/5 item drops to 4/5 too), set `last_practiced_at = now()` |
| Load deck progress | `getProgressByDecks`: item IDs per deck (via `decks` server API) + `user_progress` rows of the user |
| Tree health | `Σ mastery_level / (5 × item count) × 100`, unpractised items count as 0 (computed, not stored). 100% = every item at 5/5 |
| Practice queue | `getDrillSession` reads the player's levels (`progress/server` `fetchMasteryLevels`): items at 5/5 rest (excluded) unless `includeMastered` (review mode, `?review=1`). Nothing left → `DRILL_ALL_MASTERED` ("fully cultivated") |
| Daily streak | `recordPracticeDay` (admin client): upsert `practice_days (user_id, today)` with `ignoreDuplicates`, recompute current/best from all days, sync `users.streak_count` + `last_active_at`. Current = run ending today or yesterday (alive until a whole day is missed); best = longest run. Migration `20260928000200_practice_days.sql` |
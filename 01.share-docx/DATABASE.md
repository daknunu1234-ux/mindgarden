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
| Tables | snake_case, plural | `decks`, `content_nodes` |
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
| ~~streak_count~~, ~~last_active_at~~ | — | dropped by migration `20261007000000` | Were a copy of the current streak that nothing read. The app no longer writes them; the streak is always computed from `practice_days` |
| coins | INT | NOT NULL, DEFAULT 300, CHECK ≥ 0 | 🪙 Gold balance. Starts at **300** (3 tree seeds): the default, and set explicitly by `handle_new_user()`. +1 the first time the player masters an item (5/5). **−100 per tree planted** (`plant_deck`), **−min(100 + statements, 150) per tree cloned** (`clone_deck`). Mastery coins are ×1.2 / ×1.5 / ×1.8 with farm buffs (fraction kept in `coin_carry`); **−price per Shop item** (`purchase_and_place_item`), **+Woodshop refund** on a chop (`uproot_deck`). Written only by `award_mastery_coin`, `plant_deck`, `clone_deck`, `purchase_and_place_item`, `uproot_deck`, `harvest_tree_fruit` (+2 🪙 fruit), `award_streak_reward` (streak milestones), `answer_daily_rush` / `settle_daily_rush` (Daily Rush: +streak, at most 30) and `dev_grant_coins`; see *Gold coins*, *Seed economy* and *Farm Grid* |
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
| tree_type | VARCHAR(30) | NOT NULL, DEFAULT 'oak', CHECK (`decks_tree_type_check`, migrations 13 and 17) | Species: oak, pine, birch, cherry, willow, mystic, palm, citrus, maple, cactus, and the three surreal ones crystal_flora, cosmic_nebula, chrono_willow (migration 17) (validated by Zod from `shared/lib/treeSkins.ts`). Retired ids render as their successor until migration 13 rewrites them (sakura → cherry, saguaro → cactus, apple → citrus, bamboo → palm); unknown values render as oak |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| is_tournament_open | BOOLEAN | NOT NULL, DEFAULT FALSE | The owner hosts a Mind Tournament on this tree (migration `20260928000900`). Only meaningful while `is_public`: visitors join only public, hosting trees. Owner-only switch (`setTournamentOpen`); closing keeps every result |

**content_nodes** (self-referencing adjacency list, migration `20261013000000`) — *Roots and statements in one hierarchy*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Kept from the old `mindmap_nodes` / `knowledge_items` rows by the migration |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | |
| parent_id | UUID | NULLABLE; FK `(parent_id, deck_id)` → `content_nodes (id, deck_id)` ON DELETE CASCADE; CHECK `<> id` | NULL = a top-level node. Any node can sit under any node (a statement under a statement, a root under a statement) |
| content | TEXT | NOT NULL, non-empty, ≤ 500 | A root's title (the app caps a root at 150) or a statement's text |
| node_type | TEXT | NOT NULL, DEFAULT 'statement', CHECK `root` / `statement` | Practice = every `statement` of a tree. Alt flips it with one UPDATE |
| trap_rules | JSONB | NOT NULL, DEFAULT '{}', must be object | Rules for generating FALSE variants (statements). Readable by the service role only |
| sort_order | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | Order among siblings, roots and statements together (ties: `created_at`, then `id`). A node typed right below another gets the midpoint with the next sibling; appended / moved nodes get max + 1 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(id, deck_id)* | — | UNIQUE `content_nodes_id_deck_key` | Target of the same-tree parent FK |

- ⚠️ **Shape** (trigger `content_nodes_shape`): a top-level node is a root (`TOP_LEVEL_STATEMENT`, also when Alt would turn one into a statement); no node goes under its own branch (`NODE_CYCLE`). Parents are always in the same tree (composite FK). Statements are plain text (`content_nodes_plain_statement`: no backslash commands)
- **The outline** (Tree Workshop, `decks/lib/contentTree.ts` `outlineRows`): each node, then its children by `sort_order`, with depths. The canvas and the root lists show the roots; a statement belongs to its **nearest root** above (its "node" for branch rounds and sibling swaps)
- **Practice**: `SELECT … FROM content_nodes WHERE deck_id = $1 AND node_type = 'statement'` (one table, no join; `decks/services/drillItems.ts`). A statement under a short statement (≤ 80 characters, `decks/lib/statements.ts` `parentContext`) takes it as its last breadcrumb step and subject
- **Tab / Shift+Tab in place**: `public.indent_content_node(node, 'in' | 'out')` → `node_id, parent_id, moved_children` (`SECURITY DEFINER`, caller = `auth.uid()` must own the tree, EXECUTE for `authenticated`, one transaction; the app sends only the node and the direction). In: the last child of the sibling right above (`NO_ROW_ABOVE`). Out: up one level, right below its old parent (midpoint `sort_order`); the siblings below it become its children, after its own (`ALREADY_TOP`; `TOP_LEVEL_STATEMENT` for a statement that would land at the top). The outline order never changes, only parents; nothing is inserted or deleted. `decks/__tests__/indentContentNodeDb.test.ts` checks every row and direction against the page's own prediction (`indentRow`)
- **Alt** (`toggleNodeType`): `UPDATE content_nodes SET node_type = …` on the one row (a top-level root stays a root). Progress on a statement is kept while it is a root (ignored there) and counts again when it is a statement again
- **Legacy tables**: the migration renames `mindmap_nodes` / `knowledge_items` to `legacy_mindmap_nodes` / `legacy_knowledge_items` (no grants, kept for rollback); `20261013000100_drop_legacy_trees.sql` drops them

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

Statements are `content_nodes` rows with `node_type = 'statement'` (above). Until migration `20261013000000` they lived in `knowledge_items` (`node_id`, `parent_item_id` for one level of sub-statements, `prompt`, `correct_stmt`, `trap_rules`, `sort_order`); the drill prompt is now the nearest root's title.

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

**Statements created in the app** (`createContentNode`, `createKnowledgeItem(s)`): authors write only the statement. The server stores `trap_rules = {"negate": true}` (a node turned into a statement by Alt gets the same); traps then come from the built-in dictionary (`shared/lib/trapDictionary.ts`). `swaps` stay supported for seeded or imported items.

### Mind Tournament Feature

*Migration `20260928000900_mind_tournament.sql`. Owners host a mastery race on a shared tree; visitors compete with an ISOLATED score that never touches `user_progress`, `practice_days` (streaks) or coins.*

**deck_tournament_participants** — *One contestant on one tree*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | The hosting tree |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | The contestant (never the host) |
| current_points | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 and ≤ max_points | Σ tournament `mastery_level` over the tree's current drillable statements |
| max_points | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | 5 × N, N = drillable statements (the ones the question engine can ask: every note since the zero-drop engine, bar a degenerate one like a lone "aaa"), refreshed on every answer |
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
| knowledge_item_id | UUID | FK → content_nodes (`deck_tournament_item_progress_content_node_fkey`), NOT NULL, ON DELETE CASCADE | The statement (column name kept from before migration `20261013000000`) |
| mastery_level | INT | NOT NULL, DEFAULT 0, CHECK 0–5 | Same ±1 rule as `user_progress` (correct +1 up to 5, wrong −1 down to 0), kept separately |
| *(participant_id, knowledge_item_id)* | — | UNIQUE `unique_participant_statement` | |

**Rules** (the same numbers live in `features/tournament/lib/scoring.ts`; a test checks the SQL still says so):

| Rule | Enforced by |
|------|-------------|
| Mastery % = current_points / (N × 5) × 100; N = drillable statements (a non-drillable one can never be asked, so 100% stays reachable; in practice every statement counts) | Generated column; `record_tournament_answer` gets the tree's drillable ids from the server and sums only those |
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
| item_type | TEXT | NOT NULL, CHECK in (tree, fence, stream, farmer_house, woodshop, rockery, animal, windmill_small, furniture_factory, seaport, candy_factory, rail_track, freight_train; windmill_large until migration `20261017000000`) (`garden_placements_item_type_check`, migration `20261014000000`) | farmer_house / woodshop: retired (no longer sold; standing ones keep working) |
| deck_id | UUID | FK → decks, ON DELETE CASCADE; set iff item_type = 'tree' (CHECK); partial UNIQUE | The tree's deck. Chopping (deleting) the deck removes its tile |
| grid_x, grid_y | INT | NOT NULL, 0–15 | Top tile of the footprint |
| width, height | INT | NOT NULL, DEFAULT 1, 1–6 (1–2 before migration `20261014000000`); CHECK x + width ≤ 16, y + height ≤ 16 | Footprint: 2 × 2 (small windmill, factory, retired house / woodshop), 6 × 6 (large windmill), 6 × 2 (seaport) |
| variant | TEXT | NULLABLE, ≤ 20 chars | Animals: 'cow' / 'pig' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, grid_x, grid_y)* | — | UNIQUE index `unique_farm_tile` where item_type ≠ freight_train, and `unique_farm_train_tile` among trains (migration `20261015000000`; a UNIQUE constraint before) | One item per top tile; a Freight Train shares its tiles with the track it stands on (overlaps of bigger footprints are refused by the functions) |

**Catalogue and rules** (the same numbers live in `features/garden/lib/farmCatalog.ts` / `farmBuffs.ts`; tests check the SQL):

| Item | Size | Price | Effect |
|------|------|-------|--------|
| Tree (own deck) | 1 × 1 | free | Planting from the Shop's Trees tab; one tile per deck |
| ~~Farmer's House~~ | 2 × 2 | retired | No longer sold (`ITEM_RETIRED`, migration `20261014000000`). Standing ones still give trees in their 4 × 4 area ×1.5 coins |
| ~~Woodshop~~ | 2 × 2 | retired | No longer sold. A standing one still refunds `least(floor(statements × 0.25), 50)` 🪙 on a chop |
| Windmill (`windmill_small`, the only one since migration `20261017000000`) | 2 × 2 | 60 🪙 (30 from `20261015000000`, 60 before) | Power field: footprint + 4 tiles around (10 × 10; was + 1, 4 × 4) |
| ~~Grand Windmill~~ (`windmill_large`, retired by `20261017000000`: standing ones became Windmills) | 2 × 2 (6 × 6 before migration `20261016000000`) | 60 🪙 (was 100) | Power field: footprint + 2 tiles around (6 × 6; was + 3, 12 × 12). Standing ones were shrunk to 2 × 2 on their own top tile |
| Furniture Factory | 2 × 2 | 50 🪙 (was 120) | Needs power. Turns 2 timber into 1 furniture, 1 an hour |
| Candy Factory | 2 × 2 | 50 🪙 | Needs power. Turns 10 fruit into 1 candy box, 1 an hour (store: 20 boxes) |
| Railroad Track | 1 × 1 | 1 🪙 | Joins the tracks on its four sides |
| Freight Train | 1 × 3 | 30 🪙 | Only on three Railroad Track tiles (`NOT_ON_TRACK`); a track under it can't be moved or picked up (`TRACK_IN_USE`, also a delete trigger) |
| Seaport | 6 × 2 | 100 🪙 (was 150) | Needs power; coast only (`grid_y = 0` or `grid_y + 2 = 16`, else `NOT_COASTAL`, also on a move). A cargo ship every 4 hours buys the stock |
| Stream | 1 × 1 | 5 🪙 | Trees on a side tile (x ± 1 or y ± 1): ×1.2 coins; stacks with the house to ×1.8 |
| Fence | 1 × 1 | 1 🪙 | Auto-connects to side fences (drawing only) |
| Rockery | 1 × 1 | 2 🪙 | Decoration |
| Cow / Pig | 1 × 1 | 5 🪙 | Wander / snuffle around their tile (CSS, off for reduced motion) |

| Rule | Enforced by |
|------|-------------|
| Prices and sizes can't be chosen by the client | `public.purchase_and_place_item(item_type, x, y, deck_id?, variant?)` (`SECURITY DEFINER`, caller = `auth.uid()`) takes them from its own catalogue; there is no price or size parameter |
| No free items | Players have **no** INSERT/UPDATE on `garden_placements` (SELECT and DELETE only); the function is the only writer. It charges `coins >= price` and inserts in one transaction (`INSUFFICIENT_COINS`) |
| No overlaps, nothing off the grid, one tile per deck | Checked in the function under a lock on the owner's `users` row (`TILE_UNAVAILABLE`, `TREE_ALREADY_PLACED`); CHECKs + unique constraints as the last guard |
| Special trees pay ×1.5 | `public.species_coin_multiplier(tree_type)` (migration `20261009000000`): 1.5 when `seed_price(tree_type) = 180` (Crystal Flora, Cosmic Nebula, Chrono Willow), else 1. `award_mastery_coin` multiplies it into the payout below, reading the species of the statement's tree when it pays. The same rule lives in `shared/lib/economy.ts` `SPECIAL_COIN_MULTIPLIER` / `masteryCoinPayout` and `shared/lib/treeSkins.ts` `isSpecialTree`; a test checks the SQL |
| Buffs are real payouts | `public.farm_coin_multiplier(user, deck)` (service role) → `award_mastery_coin` pays `floor(1 × multiplier × species multiplier + users.coin_carry)` and keeps the fraction in `users.coin_carry` (0 ≤ x < 1), so ×1.2 isn't lost to rounding. Still once per item ever |
| Chopping never profits | `public.uproot_deck(deck_id)` (owner = `auth.uid()`) deletes the deck and, with a Woodshop placed, refunds at most 50 🪙 (half a seed). The app no longer picks trees up (a planted tree is moved or chopped; `removeFarmPlacement` filters `item_type <> 'tree'`). ⚠️ The table's DELETE policy still lets an owner delete their own tree placement straight through the API: that only puts the tree back in the Shop's Trees tab and pays nothing, so it can't be looped for coins; a migration would be needed to forbid it in the database |
| Visitors see only what is shared | RLS "read own or public": your farm in full; someone else's items and their **public** trees only. Delete: own rows |

Existing trees were backfilled onto the grid (every other tile from (1, 1), 7 per row, up to 49); newer trees wait in the Shop's Trees tab until planted.

**farm_economy** — *The island's stock (migration `20261014000000_power_grid.sql`, owned by `garden`)*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | PK, FK → users, ON DELETE CASCADE | One row per gardener (created on the first settlement) |
| timber, produce, furniture | NUMERIC(10,3) | NOT NULL, DEFAULT 0, ≥ 0 | Stock: caps 60 / 40 / 30 |
| fruit, candy | NUMERIC(10,3) | NOT NULL, DEFAULT 0, ≥ 0 (migration `20261015000000`) | 🍎 from harvests (`harvest_tree_fruit()` adds 2 per ripe tree); 🍬 candy boxes (cap 20) |
| last_candy_payout | INT | NOT NULL, DEFAULT 0, ≥ 0 | What the last train delivery paid |
| last_tick_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Production is counted from here (at most 48 hours at once) |
| last_export_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | The last cargo ship |
| last_payout | INT | NOT NULL, DEFAULT 0, ≥ 0 | What it paid |

**Power and the export loop** (the same numbers live in `features/garden/lib/powerGrid.ts` / `farmEconomy.ts`; tests check the SQL):

| Rule | Enforced by |
|------|-------------|
| A building that needs power (furniture_factory, seaport) works while its footprint touches a power field | `public.farm_building_powered(placement)` (service role) with `public.farm_power_reach(item_type)` (small windmill 1, large 3) |
| Production and payouts are the server's | `public.settle_farm_economy()` (`SECURITY DEFINER`, caller = `auth.uid()`, under a lock on the caller's `users` row): since `last_tick_at` (≤ 48 h) trees make 1 timber / hour each, animals 1 produce / hour each, powered factories 1 furniture / hour each from 2 timber; caps 60 / 40 / 30. With a powered seaport and 4 hours since `last_export_at`, a ship pays `least(floor(furniture × 3 + produce × 0.5 + timber × 0.2), 15)` coins and takes the same share of every good (the rest stays). Returns the stock, the payout and the purse |
| Candy and the freight line (migration `20261015000000`) | `settle_farm_economy()` also runs the powered Candy Factories (`least(factories × hours, fruit / 10, 20 − candy)` boxes, 10 fruit each) and, when `public.farm_candy_linked(user)` (service role: a recursive search over the gardener's track from the tiles beside a powered Candy Factory to the tiles beside a powered Seaport, with a Freight Train on that stretch), exports every whole box for 15 🪙. Its result gains `fruit`, `candy`, `candy_shipped`, `candy_payout` |
| Players can't write their stock | RLS "read own" (SELECT only); no INSERT / UPDATE grant: the function is the only writer |

### Progress & Gamification Feature

**user_progress** — *Decoupled progress: one row per player per item*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| knowledge_item_id | UUID | FK → content_nodes (`user_progress_content_node_fkey`), NOT NULL, ON DELETE CASCADE | A statement node (column name kept from before migration `20261013000000`; inserts require `node_type = 'statement'`) |
| mastery_level | INT | NOT NULL, DEFAULT 0, CHECK 0–5 | 0 Seed → 1 Sprout → 2 Seedling → 3 Sapling → 4 Young Tree → 5 Mighty Root (mastered: 5 net correct answers). The scale was 0–3 before migration `20260928000400`. Old values were kept as they were, not rescaled, so a former 3/3 item is now 3/5 |
| ~~mistake_count~~ | — | dropped by migration `20261007000000` | Was a tally of wrong answers that nothing read. The app no longer writes it |
| last_practiced_at | TIMESTAMPTZ | NULLABLE | |
| coin_awarded_at | TIMESTAMPTZ | NULLABLE, not writable by players | When this item's 🪙 was paid to this player; NULL = unpaid. Makes the reward one-time |
| *(user_id, knowledge_item_id)* | — | UNIQUE | One progress row per player per item |

**Gold coins** (migrations `20260928000300_user_coins.sql` + `20260928000400_mastery_scale_5.sql`): 1 🪙 the first time a player's item reaches mastery 5/5, **once per item ever**. A wrong answer drops a 5/5 item to 4/5, and climbing back to 5/5 pays nothing (`coin_awarded_at` stays set). The backfill pays items already at 5/5 when it runs. If `000300` ran before the scale change, it paid items at the old top level 3; those stay paid, so they earn nothing at 5/5. Anti-cheat invariants:

| Invariant | Enforced by |
|-----------|-------------|
| Mastery pays only through `public.award_mastery_coin(user, item)` | `users` UPDATE is granted to players on `full_name`, `avatar_url` only; the function is `SECURITY DEFINER` with EXECUTE for `service_role` only (`progress/services/coins.ts`, admin client). The other writers of `users.coins` are the spending RPCs `plant_deck` / `clone_deck` and the dev-only `dev_grant_coins` (see *Seed economy*) |
| A paid item can't be reset and farmed again | Players have no INSERT/UPDATE privilege on `user_progress.coin_awarded_at` (column grants), and can't rewrite a row's identity: UPDATE is granted on `mastery_level`, `last_practiced_at` only (and on `mistake_count` until migration `20261007000000` drops that column) |
| No double payment under concurrency | The function claims with one `UPDATE … WHERE mastery_level = 5 AND coin_awarded_at IS NULL` (it was `= 3` before migration `20260928000400`): only one caller gets the row |
| Coins earned from mastery ≤ number of (player, item) pairs ever mastered | The above. The balance itself also holds the 300 🪙 starter purse, minus what was spent on seeds and clones; `coins >= 0` CHECK |

**Seed economy** (migration `20260928000500_seed_economy.sql`; the same numbers live in `shared/lib/economy.ts`, and a test checks they match):

| Rule | Enforced by |
|------|-------------|
| New gardeners start with 300 🪙 | `users.coins DEFAULT 300`, and `handle_new_user()` inserts `coins = 300` for email and OAuth signups. Google metadata is read too: `name` → `full_name`, `picture` → `avatar_url`. Gardeners from before the migration were topped up once to at least 300 (`greatest(coins, 300)`) |
| No gardener is left without a purse | `public.ensure_user_profile()` (`SECURITY DEFINER`, caller = `auth.uid()`) creates the caller's missing `users` row with 300 🪙 and returns the balance; an existing row is never changed. It's called after every login (`/auth/callback`), by `readCoins` when no row exists, and by `plant_deck` before charging. Migration `20260928000600` also backfilled a row for every auth user without one. `users.coins` is `NOT NULL`, so a missing row, not a NULL balance, is the case this covers |
| Planting a tree costs its species' seed price: 100 🪙, or 180 🪙 for a surreal species | `public.seed_price(tree_type)` (migration `20261006000000`): 180 for `crystal_flora`, `cosmic_nebula`, `chrono_willow`, else 100. `public.plant_deck(title, slug, description, is_public, tree_type)`, `SECURITY DEFINER`, owner = `auth.uid()`, charges with `UPDATE users SET coins = coins - v_price WHERE id = auth.uid() AND coins >= v_price` (a flat 100 before that migration), then inserts the deck, all in one transaction. Short purse → `INSUFFICIENT_COINS` and nothing is inserted. A duplicate slug (23505) undoes the charge |
| The fee can't be skipped | `INSERT` on `decks` is revoked from `anon` / `authenticated`: `plant_deck` and `clone_deck` are the only ways to create a deck. Owners still update and delete their decks |
| Changing a planted tree to a pricier species costs the difference | Trigger `decks_charge_species_upgrade` (`BEFORE UPDATE OF tree_type`, function `charge_species_upgrade()`, `SECURITY DEFINER`, migration `20261006000000`): when `seed_price(new) > seed_price(old)` and the change comes from a player (`auth.uid()` set), it charges the owner the difference (`coins >= diff`, else `INSUFFICIENT_COINS` and the UPDATE fails). Cheaper or equal species: free, no refund. Without it the owner's own UPDATE on `decks` would be a free way round the 180 🪙 price |
| Cloning a shared tree costs its species' seed price + min(statements, 50) 🪙 (100–150; surreal 180–230) | `public.clone_deck(source_deck_id, slug)`, `SECURITY DEFINER`, cloner = `auth.uid()` (migration `20260928000700`, re-created by `20261006000000`). Only another gardener's **public** tree (`DECK_NOT_FOUND` otherwise, `CANNOT_CLONE_OWN_DECK` for your own). Fee = `seed_price(tree_type) + least(item count, 50)` (it was `least(100 + item count, 150)`, the same for standard trees), charged like `plant_deck` (`coins >= fee`, else `INSUFFICIENT_COINS`). In the same transaction it inserts a **private** deck owned by the cloner (same title, description, species), copies every `mindmap_nodes` row parents-first (same hierarchy and `sort_order`) and every `knowledge_items` row with its `prompt`, `correct_stmt` and `trap_rules` (since migration `20261010000000` also its `sort_order`, and `parent_item_id` remapped to the copied statement, statements first). `user_progress` is **never** copied: the clone starts at 0/5 with every mastery coin still to earn. A duplicate slug (23505) rolls everything back |
| Balances never go negative | `coins >= fee` in each charge, plus the `coins >= 0` CHECK |
| No free coins in production | `public.dev_grant_coins(user, 1–100)` (Coin Shop "Simulate Top-up (Dev Mode)") is EXECUTE-able by `service_role` only, and the server action refuses it when `NODE_ENV = production`. Real payments (webhooks) replace it later |

⚠️ Players can still write their own `mastery_level` (see *Supabase Notes*), so a player could mark an item 5/5 directly and collect its one coin without drilling. The cap above still holds: one coin per item. Close this with the planned `SECURITY DEFINER` progress RPC before coins buy anything.

**deck_practice_days** — *Tree practice log (migration `20261003000000_tree_fruit.sql`): one row per player per tree per local day with at least one saved (owner) practice answer*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | The practised tree |
| day | DATE | NOT NULL | Player's local calendar day (same zone rules as `practice_days`) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, deck_id, day)* | — | PK | First answer of the day inserts, later ones change nothing |

Written by `recordDrillResult` (service role, `progress/services/fruit.ts`) after every saved owner answer; Mind Tournament answers never count. `user_progress.last_practiced_at` can't prove "yesterday" (overwritten by every answer) and `practice_days` is per player, so this log is what fruit is checked against.

**tree_harvests** — *Fruit ledger (same migration): one row per player per tree per day they harvested*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | |
| day | DATE | NOT NULL | The harvest day (player's local day, computed on the server) |
| coins | INT | NOT NULL, CHECK > 0 | 🪙 paid (FRUIT_COINS = 2) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, deck_id, day)* | — | PK | Makes each tree's fruit claimable once a day |

⚠️ Since migration `20261015000000` a harvest gives **2 fruit** (into `farm_economy.fruit`) instead of 2 coins: `harvest_tree_fruit()` returns `fruit_earned, total_fruit`, and `tree_harvests.coins` records the fruit picked. The rest below is unchanged.

**Tree fruit** (`public.harvest_tree_fruit(user, deck, today)`, `SECURITY DEFINER`, EXECUTE for **service_role only**; the `harvestTreeFruit` action computes `today` from the server clock and the player's timezone, so players can't pick the day): the tree must be the player's, they must have a `deck_practice_days` row for `today - 1`, and today's `tree_harvests` insert must be the first (`ON CONFLICT DO NOTHING` → `FRUIT_NOT_READY`); then `users.coins + 2` in the same transaction under a row lock. Any growth stage bears fruit. **Withering** (grey, still farm trees after 72 h without practice; immune from growth stage 4) is computed in the app from `user_progress.last_practiced_at` (and the deck's `created_at` for never-practised trees): nothing is stored.

**daily_rush_runs** — *Daily Rush (migration `20261008000000_daily_rush.sql`, owned by the `rush` feature): one row per player per local day, today's run*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| day | DATE | NOT NULL | The player's local day when the run started (computed on the server) |
| deck_id | UUID | FK → decks, ON DELETE SET NULL | The one tree played. Chopping it ends the card supply; the day stays used |
| seed | TEXT | NOT NULL | The server rebuilds the run's cards from it; cards are never stored |
| time_zone | TEXT | NOT NULL, DEFAULT 'UTC' | Zone used for `day`; the status check reuses it |
| streak | INT | NOT NULL, DEFAULT 0, CHECK 0–30 | Cards answered in a row, updated in place |
| status | TEXT | 'active' or 'finished' | |
| coins | INT | NOT NULL, DEFAULT 0, CHECK 0–30 | 🪙 paid when the run finished (= streak) |
| question_started_at | TIMESTAMPTZ | NOT NULL | When the current card was dealt: the database times the answer from it |
| started_at, finished_at | TIMESTAMPTZ | | |
| *(user_id, day)* | — | PK | Strictly one run per player per day |

**Daily Rush** (all three functions `SECURITY DEFINER`, EXECUTE for **service_role only**; rules mirrored in `features/rush/lib/rules.ts`, tested):

| Rule | Enforced by |
|------|-------------|
| One run a day, on a tree the player owns | `start_daily_rush(user, deck, day, seed, zone)`: owner check, then insert `ON CONFLICT (user_id, day) DO NOTHING` → `RUSH_ALREADY_PLAYED` |
| The client never decides the verdict or the time | The app server grades the pick and calls `answer_daily_rush(user, day, expected, correct, timed_out, last, limit_ms)`; the function compares `clock_timestamp()` with `question_started_at` itself: late is a timeout whatever was picked |
| Right and in time: next card. Otherwise game over | Under `FOR UPDATE` on the run: streak + 1 and a new `question_started_at`, or `status = 'finished'` |
| Coins = the streak, paid once, atomically | The same call that finishes the run sets `coins = streak` and adds it to `users.coins`. A finished run raises `RUSH_NOT_ACTIVE`; `p_expected` must equal the stored streak (`RUSH_OUT_OF_SYNC`), so a replayed answer can't count twice |
| A run can't pay without end | Each statement is dealt at most once and at most 30 cards (app), and `streak` / `coins` are CHECKed ≤ 30 |
| An abandoned run is paid what it had | `settle_daily_rush(user, stale_ms)` finishes active runs whose card is long overdue |
| Players can't write runs | RLS read own; no INSERT / UPDATE / DELETE grants |

No per-answer rows: the run's streak is updated in place.

**practice_days** — *Streak log: one row per player per local day with at least one saved answer*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| day | DATE | NOT NULL | Player's local calendar day (browser IANA timezone, UTC fallback) |
| time_zone | TEXT | NOT NULL, DEFAULT 'UTC', 1–64 chars | Zone used for `day`; pages that can't ask the browser reuse the latest one |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, day)* | — | PK | First answer of the day inserts, later ones change nothing |

⚠️ `user_progress.last_practiced_at` is overwritten on every answer (one row per item), so past active days cannot be rebuilt from it. Streaks are computed from `practice_days` (`progress/lib/streak.ts`) and stored nowhere else. The only writer is `recordPracticeDay` (service role), called when a practice answer is saved ("watering a tree"): opening the game writes nothing, and a missed day restarts the run at 1.

**streak_rewards** — *Streak bonus ledger (migration `20261004000000_streak_rewards.sql`): one row per player per local day that paid a milestone bonus*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| day | DATE | NOT NULL | The watered day that reached the milestone (player's local day) |
| streak | INT | NOT NULL, CHECK > 0 | The streak length that day (7, 30, 100, 200, …) |
| coins | INT | NOT NULL, CHECK > 0 | 🪙 paid |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| *(user_id, day)* | — | PK | A day pays once, however many trees are watered |

**Streak rewards** (`public.award_streak_reward(user, day)`, `SECURITY DEFINER`, EXECUTE for **service_role only**; called by `progress/services/coins.ts` `claimStreakReward` after a saved answer on a milestone day): under a lock on the player's `users` row it counts the run of consecutive `practice_days` ending on `day` itself (the app's streak is never trusted; 0 if that day wasn't practised), applies the rule, inserts the ledger row (`ON CONFLICT DO NOTHING`) and adds the coins in the same transaction. Returns `streak, coins_earned, total_coins` (`coins_earned = 0` on a non-milestone day or a repeat). The same rule lives in `progress/lib/streak.ts` `streakReward`; a test checks the SQL:

| Streak that day | Bonus |
|-----------------|-------|
| 7 | 7 🪙 |
| 30 | 30 🪙 |
| 100, 200, 300, … (≥ 100 and a multiple of 100) | as many 🪙 as days |
| anything else | 0 |

A streak that breaks and reaches 7 (or 30) again pays again, on its new day. The streak's calendar day comes from the browser's timezone, as for `practice_days`.

---

## ERD Diagram

```
roles
  └─1:N─► users ◄─1:1── auth.users   (handle_new_user() trigger)
            │
            ├─1:N─► decks
            │         └─1:N─► content_nodes ◄──┐   (roots + statements)
            │                   │   └──────────┘ parent_id (self-ref 1:N)
            │                   │
            ├─1:N─► user_progress ◄─N:1───┘   (statements only)
            │       (N:M bridge: one row per user per statement)
            ├─1:N─► tree_visits ◄─N:1── decks
            │       (N:M bridge: one row per visitor per shared tree)
            └─1:N─► deck_tournament_participants ◄─N:1── decks
                      └─1:N─► deck_tournament_item_progress ◄─N:1── content_nodes
```

---

## Key Relationships

| Relationship | Type | Notes |
|--------------|------|-------|
| auth.users → users | 1:1 | Auto-created by `handle_new_user()` trigger |
| roles → users | 1:N | Role-based access (ON DELETE RESTRICT) |
| users → decks | 1:N | Ownership drives RLS |
| decks → content_nodes | 1:N | CASCADE |
| content_nodes → content_nodes | 1:N | Self-ref, same-deck only, branch cascades; top level = roots |
| **users ↔ content_nodes** | N:M via `user_progress` | ⚠️ Decoupled progress: same public deck, separate progress per player; statements only |
| users ↔ decks (visits) | N:M via `tree_visits` | Visited Gardens; both sides CASCADE |
| users ↔ decks (tournament) | N:M via `deck_tournament_participants` | One run per contestant per tree; item levels in `deck_tournament_item_progress`; all CASCADE |

---

## Conventions

- **Primary Key**: UUID v4 via `gen_random_uuid()` (exceptions: `roles.id` static INT, `users.id` copied from `auth.users`)
- **Cascades**: `ON DELETE CASCADE` on decks, nodes, items, progress
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (never plain `TIMESTAMP`)
- **Plain Text**: statement `content` rejects backslash commands (`\frac`, `\sqrt`); validate with Zod first for friendly errors
- **JSONB**: `trap_rules` shape validated by Zod in `features/decks/dto` and read by `shared/lib/trapEngine.ts`, not in DB
- **Schema-qualify**: Always write `public.users` vs `auth.users`
- **Derived data**: Tree health is computed from `mastery_level`, never stored

---

## Indexes

```sql
-- Decks & Mindmap
CREATE INDEX idx_decks_user_id ON public.decks(user_id);
CREATE UNIQUE INDEX idx_decks_slug ON public.decks(slug);                 -- doubles as UNIQUE(slug)
CREATE INDEX idx_content_nodes_deck_id ON public.content_nodes(deck_id);
CREATE INDEX idx_content_nodes_parent_id ON public.content_nodes(parent_id);
CREATE INDEX idx_content_nodes_deck_type ON public.content_nodes(deck_id, node_type);   -- practice: a tree's statements

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
| content_nodes | If deck readable | Deck owner | Deck owner | Deck owner |
| user_progress | Owner | Owner + readable statement node | Owner + item readable | ✗ |
| practice_days | Owner | ✗ (service role only) | ✗ | ✗ |
| tree_visits | Owner | ✗ direct; only via `record_tree_visit()` (public trees of others) | ✗ direct; same function | ✗ (cascades only) |
| garden_placements | Owner; others: items + public trees | ✗ direct; only via `purchase_and_place_item()` | ✗ | Owner |
| farm_economy | Owner | ✗ (only `settle_farm_economy()`) | ✗ (same) | ✗ (cascades only) |
| deck_practice_days | Owner | ✗ (service role: `recordDrillResult`) | ✗ | ✗ (cascades only) |
| tree_harvests | Owner | ✗ (service role: `harvest_tree_fruit()`) | ✗ | ✗ (cascades only) |
| streak_rewards | Owner | ✗ (service role: `award_streak_reward()`) | ✗ | ✗ (cascades only) |
| daily_rush_runs | Owner | ✗ (service role: `start_daily_rush()`) | ✗ (service role: `answer_daily_rush()`, `settle_daily_rush()`) | ✗ (cascades only) |
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

-- Content nodes: inherit from deck (same pattern for INSERT/UPDATE/DELETE with an owner check)
CREATE POLICY "content nodes: read if deck readable" ON public.content_nodes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = content_nodes.deck_id
      AND (d.is_public OR d.user_id = (SELECT auth.uid()))
  ));

-- Progress: owner only, and only on statements the player can see
CREATE POLICY "progress: insert own" ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.content_nodes c
                WHERE c.id = user_progress.knowledge_item_id AND c.node_type = 'statement')
  );

-- Users: block role_id / streak edits from the client
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;
```

- **Perf**: Use `(SELECT auth.uid())` instead of bare `auth.uid()` so it's evaluated once per query
- **Full policy set**: `supabase/migrations/20260928000000_initial_schema.sql` (the baseline tables; one policy per action as in the table above, `public.is_admin()` for the admin read on `users`) `20260928000200_practice_days.sql`, and `20261013000000_content_nodes.sql` (`content_nodes`, the progress policies re-created)

### Answer secrecy (column privileges on `content_nodes`)

RLS picks **rows**; it cannot hide **columns**. Column privileges (migration `20261013000000`, as `20260928000100` did for `knowledge_items`):

| Role | SELECT | INSERT | UPDATE |
|------|--------|--------|--------|
| anon | `id`, `deck_id`, `parent_id`, `content`, `node_type`, `sort_order`, `created_at` | ✗ | ✗ |
| authenticated | same | those + `trap_rules` (RLS: deck owner) | `parent_id`, `content`, `node_type`, `trap_rules`, `sort_order` (RLS: deck owner) |
| service_role | all | all | all |

- ⚠️ **Changed by `20261013000000`**: a statement's text (`content`) is readable by anyone who can read the tree. Before, `correct_stmt` was service-role only. Every reader of a tree already saw every statement (the owner in the editor, visitors of a **public** tree in strict read-only mode), and only the owner can be graded (`FORBIDDEN_VISITOR_PRACTICE`), so knowing the statements earns a visitor no mastery or coins. Tournament contestants can read the statements of the tree they compete on (they could already, through the read-only view)
- **trap_rules stay hidden**: only `decks/services/answers.ts` `readTrapRules` reads them, with `src/shared/lib/supabase/admin.ts`, after the player's RLS client has loaded the nodes. `decks/__tests__/answerSecrecy.test.ts` fails if any other file selects them
- **Without `SUPABASE_SERVICE_ROLE_KEY`** `readTrapRules` falls back to the user client, which is refused (`42501`); the server log names the fix
- **New columns** on `content_nodes` are not readable by anon/authenticated until granted explicitly (fail closed)

---

## Migration Rules

- **Location**: `supabase/migrations/`
- **Execution order** (a fresh database runs all of them, in this order):

  | # | File | What it does |
  |---|------|--------------|
  | 1 | `20260928000000_initial_schema.sql` | Baseline: `roles` (+ seed), `users` + `handle_new_user()` trigger, `decks`, `mindmap_nodes`, `knowledge_items`, `user_progress`; FKs and cascades, checks, indexes, RLS + policies, `users` column grants, `is_admin()` |
  | 2 | `20260928000100_hide_knowledge_answers.sql` | Column privileges: `correct_stmt` / `trap_rules` readable only by the service role (superseded by file 23's grants on `content_nodes`) |
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
  | 15 | `20261003000000_tree_fruit.sql` | `deck_practice_days` + `tree_harvests` (RLS: read own; server writes only), `harvest_tree_fruit()` (service role: 2 🪙 once per tree per day, only after practice the day before) |
  | 28 | `20261017000000_unified_windmill.sql` | One Windmill: `windmill_small` 60 🪙, `farm_power_reach()` 4 (10 × 10 field); standing `windmill_large` rows become `windmill_small`; the type check drops `windmill_large`; `purchase_and_place_item()` re-created (`windmill_large` → ITEM_RETIRED) |
  | 27 | `20261016000000_grand_windmill.sql` | `windmill_large` becomes a 2 × 2 tower with power reach 2 (6 × 6 zone): `farm_power_reach()` and `purchase_and_place_item()` re-created, standing ones shrunk to 2 × 2 |
  | 26 | `20261015000000_rail_logistics.sql` | New prices; `candy_factory`, `rail_track`, `freight_train` (train on tracks: purchase / move rules, `garden_track_in_use` delete trigger, the top-tile unique key as two partial unique indexes); `farm_economy.fruit` / `candy` / `last_candy_payout`; `farm_building_powered()` (+ Candy Factory), `farm_candy_linked()`; `harvest_tree_fruit()` gives fruit; `settle_farm_economy()` with candy and train delivery |
  | 25 | `20261014000000_power_grid.sql` | Footprints up to 6, the four power-grid item types, `farm_power_reach()` / `farm_building_powered()`, `purchase_and_place_item()` (new catalogue, `ITEM_RETIRED`, `NOT_COASTAL`) and `move_garden_placement()` (coast) re-created, `farm_economy` + RLS, `settle_farm_economy()` |
  | 24 | `20261013000100_drop_legacy_trees.sql` | Drops `legacy_mindmap_nodes` / `legacy_knowledge_items`. Destructive and optional |
  | 23 | `20261013000000_content_nodes.sql` | `content_nodes` (roots + statements, ids kept, one sibling order) replaces `mindmap_nodes` + `knowledge_items` (renamed to `legacy_*`); shape trigger, RLS, column grants; progress FKs repointed; `award_mastery_coin()`, `uproot_deck()`, `clone_deck()`, `record_tournament_answer()` re-created on it; new `indent_content_node()` |
  | 22 | `20261010000000_sub_statements.sql` | `knowledge_items.parent_item_id` (sub-statements: composite FK to a statement of the same root, ON UPDATE / DELETE CASCADE, one level by trigger) and `sort_order` (backfilled from `created_at`); their column grants; `clone_deck()` re-created to copy the hierarchy and order |
  | 21 | `20261009000000_special_tree_coin_bonus.sql` | `species_coin_multiplier()` (1.5 for a species priced at 180 🪙, else 1; service role) and `award_mastery_coin()` re-created to pay 1 × farm multiplier × species multiplier, fraction still carried in `users.coin_carry` |
  | 20 | `20261008000000_daily_rush.sql` | `daily_rush_runs` (RLS: read own; server writes only), `start_daily_rush()`, `answer_daily_rush()`, `settle_daily_rush()` (service role: one run a day, database-timed answers, coins = streak paid atomically) |
  | 19 | `20261007000000_drop_unused_progress_columns.sql` | Drops `user_progress.mistake_count`, `users.streak_count`, `users.last_active_at`: written on every answer, read by nothing. Destructive and optional |
  | 18 | `20261006000000_species_seed_prices.sql` | `seed_price()` (surreal species 180 🪙, others 100); `plant_deck()` and `clone_deck()` re-created to charge by species; trigger `decks_charge_species_upgrade` (the price difference when a tree changes to a pricier species) |
  | 17 | `20261005000000_surreal_tree_species.sql` | `decks_tree_type_check` widened from the ten natural ids to thirteen (adds `crystal_flora`, `cosmic_nebula`, `chrono_willow`); no row changes |
  | 16 | `20261004000000_streak_rewards.sql` | `streak_rewards` (RLS: read own; server writes only), `award_streak_reward()` (service role: streak milestone coins at 7, 30 and every 100 days, once per day, streak counted in the database) |
  | 14 | `20261002000000_move_garden_placement.sql` | `move_garden_placement(p_placement_id, p_new_x, p_new_y)`: owner-only move of a farm placement (bounds with its own footprint, overlaps excluding itself, row lock); still no UPDATE grant on `garden_placements` |
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
- **File 23** runs **with** the deploy of the content-node code, after file 22 (and 21): the old code reads `mindmap_nodes` / `knowledge_items`, which it renames, and the new code reads `content_nodes`, which it creates. Not re-runnable (it moves data); the rollback block at its end renames the legacy tables back. It re-creates `award_mastery_coin()`, `uproot_deck()`, `clone_deck()` and `record_tournament_answer()`: never re-run files 12, 18, 21 or 22 after it (they would point those functions at the old tables). Two never-shipped drafts (`20261011000000_convert_statements_roots`, `20261012000000_indent_rows`) were folded into it; it drops their functions if one was applied by hand
- **File 24** only after file 23 has run and the app works on it: it drops the legacy tables (no rollback after that)
- **File 28** (`20261017000000_unified_windmill.sql`) after file 27, WITH the deploy of the matching code (the client no longer knows `windmill_large`). Grand Windmills become Windmills on the same tiles; every windmill field grows to 10 × 10, so nothing loses power. Safe to re-run. Never re-run files 25, 26 or 27 after it
- **File 27** (`20261016000000_grand_windmill.sql`) after file 26, with the deploy of the matching code (the Shop shows the 2 × 2 tower and its 6 × 6 zone). Standing large windmills shrink to 2 × 2 and power a smaller area, so buildings beyond it lose power. Never re-run files 14, 25 or 26 after it (they would bring back the 6 × 6 size or reach 3). Safe to re-run
- **File 26** (`20261015000000_rail_logistics.sql`) runs **with** the deploy, after file 25: the new code reads fruit and the new settle result, and the old code would show "+2 coins" for a harvest that now gives fruit. It drops and re-creates `harvest_tree_fruit()` and `settle_farm_economy()` (new results). Never re-run files 15, 25 or earlier ones that re-create these functions after it. Safe to re-run
- **File 25** (`20261014000000_power_grid.sql`) any time after files 12 and 14 (it re-creates their purchase and move functions), before or with the deploy of the power-grid code: older code never sends the new item types, and the new code's Shop sells them. Until it runs, buying a new building answers "Could not place that on the farm" and the island's economy stays empty (the log names the migration). Never re-run file 12 or 14 after it (they would bring back the old catalogue and the inland seaport move). Safe to re-run
- **File 22** runs any time after file 18, **before or with** the deploy of the sub-statement code: it only adds columns (older code keeps working), while the new code orders statements by `sort_order` and fails to load them without it. It re-creates `clone_deck()`: never re-run file 18 after it (cloned trees would lose their sub-statements' nesting)
- **File 21** runs any time after file 18 (it uses `seed_price()`), with or after the deploy. Until it runs, the app shows "⭐ 1.5x Coins" on special trees but the database still pays ×1; nothing else is affected. It re-creates `award_mastery_coin()`: never re-run file 12 after it without re-running this one (file 12 would restore the farm-only payout)
- **File 20** can run any time after file 18 (it does not need file 19), before or with the deploy. Until it runs, the ⚡ button shows as ready but starting a run answers "Could not start the Daily Rush" (the log names the migration); nothing else is affected
- **File 19** runs only **after** the code that stopped writing those columns is deployed: older code sends `mistake_count` with every answer, so answers would fail to save against the dropped column. It is optional (the unused columns are harmless) and irreversible (the values are lost). Never re-run file 4 after it: its column grant names `mistake_count`
- **File 18** runs after file 17, together with the deploy of the code that shows the species prices. Until it runs, the database still charges 100 🪙 for a surreal seed and nothing for a species change (the app shows 180 / +80 but the purse loses 100 / 0); with it applied under older code, players are charged 180 while that code still shows 100
- **File 17** runs **before or together with** deploying the surreal-species code (the opposite of file 13): it is safe with older code, which only writes the first ten ids, while the new code planting or switching to a surreal species before it runs is refused by the old check ("Could not plant" / the species change rolls back). Never re-run file 13 after it: that would turn surreal trees into oaks and narrow the check again
- **File 16** can run any time after file 15, before or after the deploy. Until it runs, answers and streaks still save; a milestone day just pays no bonus (the log names the migration) and can't be claimed later
- **File 15** can run any time after file 14. Until it runs, saved answers still count (the tree practice day is just logged as missing), no tree shows fruit and harvesting answers "Could not harvest this tree" (the log names the migration). Withering needs no migration
- **File 12** can run any time after file 11. Until it runs, the farm is empty (the log names the migration), the Shop can't place anything, chopping falls back to the plain delete (no refund) and coins pay ×1
- **File 10** can run any time after file 9. The app tolerates it missing: no boards on the deck page, the host switch answers "Could not open the tournament", and the log names the migration. Practice and drills are unaffected
- **File 9** can run any time after file 7. Until it runs, opening a shared tree logs which migration to run (the page itself never fails) and the Visited Gardens drawer stays empty
- **Format**: `[timestamp]_[description].sql` (e.g., `20260923000200_decks_mindmap.sql`); new migrations sort after `20261013000100`
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
export type ContentNode = Tables<'content_nodes'>
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
| Start drilling an item | Insert the `user_progress` row (user client); later answers update `mastery_level` and `last_practiced_at` only, in place. No per-answer row, timing or pick is stored anywhere. A unique-violation race on the first answer falls back to update |
| First mastery of an item | Answer lands on 5/5 and `coin_awarded_at` is NULL → `award_mastery_coin(user, item)` (admin client) sets it and adds 1 to `users.coins` in one call; returns `{ coins_earned, total_coins }` |
| Correct answer | `mastery_level = LEAST(mastery_level + 1, 5)`, set `last_practiced_at = now()` |
| Fooled by a trap | `mastery_level = GREATEST(mastery_level - 1, 0)` (a mastered 5/5 item drops to 4/5 too), set `last_practiced_at = now()` |
| Load deck progress | `getProgressByDecks`: item IDs per deck (via `decks` server API) + `user_progress` rows of the user |
| Tree health | `Σ mastery_level / (5 × item count) × 100`, unpractised items count as 0 (computed, not stored). 100% = every item at 5/5 |
| Practice queue | `getDrillSession` reads the player's levels (`progress/server` `fetchMasteryLevels`): items at 5/5 rest (excluded) unless `includeMastered` (review mode, `?review=1`). Nothing left → `DRILL_ALL_MASTERED` ("fully cultivated") |
| Daily streak | `recordPracticeDay` (admin client): upsert `practice_days (user_id, today)` with `ignoreDuplicates`, recompute current/best from all days (nothing else is written: one row per player per day is the whole practice log). Current = run ending today or yesterday (alive until a whole day is missed); best = longest run. Migration `20260928000200_practice_days.sql` |
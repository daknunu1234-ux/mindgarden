# MindGarden: Project Status

> Snapshot of what is built, how the pieces connect, and what has shipped. Last updated: 2026-09-30.
>
> **Rule: update this file before or alongside every commit.** If a commit adds, removes or changes a
> feature, a migration, a price, a buff or the core loop, the same commit updates the matching section
> here and adds a line to the [commit log](#recent-commits). A commit that leaves this file stale is not done.

Detailed rules live elsewhere: agent rules and definition of done in `01.share-docx/AGENTS.md`, schema in
`01.share-docx/DATABASE.md`, actions in `01.share-docx/API SPEC.md`, per-feature exports in
`src/features/<feature>/context.md`. This file is the overview; when it disagrees with those, they win.

## Overview

Gamified micro-learning. A **Deck** is a living **Tree** on the player's farm, its mindmap nodes are
underground **Roots**, and its knowledge items are plain-text **Statements** drilled against generated
trap choices. Mastery goes 0 → 5 per player per statement.

Stack: Next.js 16.3.6 App Router (React 19.2, TypeScript strict), Tailwind v4 + shadcn/ui, Supabase
(PostgreSQL + Auth + RLS + `SECURITY DEFINER` RPCs), Zod, Vitest.

### Core loop

```
Statements  →  Practice (drill) / Mind Tournament  →  🪙 Coins  →  2.5D Farm Grid
 (author)       (mastery 0–5 per statement)          (+1 per 5/5,    (plant trees, buy structures,
                                                      farm buffs)     decorations, animals)
```

1. **Author** a tree: type statements under roots (never trap rules; traps are generated).
2. **Practise** it: owner-only drill rounds raise mastery; a public tree's owner can host a **Mind
   Tournament** where visitors compete with an isolated score (never touches their coins or progress).
3. **Earn** 🪙: the first time a statement reaches 5/5 it pays 1 coin × the tree's farm buff.
4. **Build** the farm: coins plant new seeds, clone shared trees and buy Shop items whose buffs make
   the next round of practice pay more.

### Currency: Coins only

🪙 **Coins** (`users.coins`) are the single currency. **Gems were removed** from every surface (HUD,
drill overlay, inspector, profile); a test fails if 💎, a gem icon or a gems counter comes back.

| Flow | Amount | Where |
|------|--------|-------|
| Starting purse | 300 | `shared/lib/economy.ts`, migration 6 |
| Plant a seed (new tree) | −100 | `plant_deck()` |
| Clone a shared tree | −min(100 + statements, 150) | `clone_deck()` |
| Statement mastered (first 5/5) | +1 × farm buff, fraction carried | `award_mastery_coin()` |
| Shop item | −1 to −50 (catalogue below) | `purchase_and_place_item()` |
| Chop a tree with a Woodshop | +min(floor(25% × statements), 50) | `uproot_deck()` |

## Knowledge Engine

- **Authoring**: statements are plain text only (no LaTeX / OCR), cleaned (NFC, single spaces) and
  bounded to 5–500 characters. Roots nest into branches.
- **Bulk import**: paste notes into a root (Markdown, Unicode or numbered bullets); each bullet or line
  becomes a statement, with a live preview, de-duplication and a 100-item cap per import.
- **Cascading delete**: deleting a statement, a whole root branch or a tree relies on database
  `ON DELETE CASCADE` (sub-roots, statements, `user_progress`, tournament progress, farm tile), always
  behind a confirmation dialog that says what goes.
- **Edit**: `updateKnowledgeItem` rewrites a statement's text; trap rules and every player's progress
  (personal and tournament) are kept.
- **Hover-to-reveal owner tools**: ✏️ Edit / 🗑️ Delete (and ⚙️ Manage on roots) stay hidden until a card,
  pill or row is hovered or keyboard-focused (`shared/components/game` `HoverActions`), and are always
  visible on touch screens. Visitors and contestants never see them.
- **Scoped question pacing**: one launch modal picks the session size (5 / 10 / 20 questions) and the
  scope (the whole tree or a single root branch, `?nodeId=`). 5/5 statements rest from normal rounds
  unless the player chooses review (`?review=1`).
- **Trap engine** (`shared/lib/trapEngine.ts`): pure and deterministic (seeded), no DB, no network.
- **Visitors**: strict read-only. They read every root and statement of a shared tree, then clone it to
  practise (progress is not copied). The Mind Tournament is the only exception.

## 2.5D Farm Grid System

The home page (`/`) is a Hay Day style farm: `src/features/garden`, table `garden_placements`.

- **Isometric engine**: a 16 × 16 grid (tiles 0–15), tile 112 × 56 px,
  `screenX = (x − y)·W/2`, `screenY = (x + y)·H/2`. Everything is painted back to front by its ground
  point (z-index depth sorting), so a 2 × 2 building correctly hides what stands behind it.
  Pure helpers in `lib/farmGrid.ts` (`tileToScreen`, `screenToTile`, `checkPlacement`, fence auto-tiling).
- **Placement mode**: a green (free) / red (taken or off-grid) ghost follows the pointer; click to place,
  tap twice on touch, Esc or right-click to cancel.
- **Unified 🏪 Shop** (5 tabs, `FarmShopModal`, opened from the dock's hero button):

  | Tab | Items | Price | Size |
  |-----|-------|-------|------|
  | 🌳 Trees | your own trees not on the farm yet ("Plant on Farm"), "+ Plant New Seed" | free to place | 1 × 1 |
  | 🏗️ Structures | Farmer's House, Woodshop | 50 each | 2 × 2 |
  | 🌊 Landscape | Stream | 5 | 1 × 1 |
  | 🪵 Decorations | Fence (auto-joins neighbours), Rockery | 1, 2 | 1 × 1 |
  | 🐮 Animals | Cow, Pig (they wander their tile) | 5 each | 1 × 1 |

- **Server-authoritative purchase**: `placeFarmItem` → `purchase_and_place_item()` RPC. The client sends
  only *what* and *where*; the database holds the catalogue (price + footprint), checks bounds and
  overlaps, locks the player's row, charges the purse and inserts in one transaction
  (`INSUFFICIENT_COINS`, `TILE_UNAVAILABLE`). Players can read and delete (pick up) their own placements
  but never insert or update them directly. `lib/farmCatalog.ts` mirrors the SQL catalogue; a test keeps
  them equal.
- **Economic buffs** (on a tree's mastery payouts; `lib/farmBuffs.ts` mirrors `farm_coin_multiplier()`):
  - Stream on a side tile of the tree (x ± 1 or y ± 1): **×1.2**
  - Tree inside a Farmer's House aura (its 2 × 2 plus 1 tile all round, 4 × 4): **×1.5**
  - Both: **×1.8**
  - Fractions are carried in `users.coin_carry` (0 ≤ carry < 1), so ×1.2 is never lost to rounding.
- **Woodshop refund cap**: with a Woodshop anywhere on the farm, chopping (deleting) a tree refunds
  `min(floor(25% × statements), 50)` 🪙: at most half a seed, so chopping never profits.
- **Picking up** an item gives no refund; a picked-up tree goes back to the Shop's Trees tab unchanged.
- **Visitors** see another farm's items and its public trees only, read-only, with no Shop.

## Visual system: tropical island diorama

A stylized 3D casual-mobile look over the same grid, RPCs and buffs (presentation only: no rule,
price or buff changed). All art is inline SVG / CSS, so there are no image assets to load.

- **Diorama** (`garden/components/FarmDiorama.tsx`, geometry in `lib/diorama.ts`, tested): the grid
  floats as an island on a turquoise ocean. Around it: a glowing lagoon, swell rings rolling out from the
  shore, sun glints and the island's shadow on the water. Under it: a layered cliff (grass lip, terracotta
  topsoil, deep soil, stone with pebbles, hanging vines) and a rocky underside tapering to a keel. On top:
  a wet / dry sand beach with a foam rim, saturated emerald / lime checkered grass with seeded tufts and
  flowers, and swaying palms. Four distant islets bob in the ocean corners; clouds drift in the world and
  sail across the screen at two speeds for parallax.
- **Palette**: emerald / lime grass, turquoise water, citrus sand, terracotta soil and roofs, coral
  flowers; thick dark-brown outlines (`#3b1f0e`), lit left faces and shaded right faces (sun upper left).
- **Chunky toy sprites** (`FarmStructures.tsx`):
  - Farmer's House: a cottage with an oversized terracotta hip roof, a rounded brick chimney puffing
    smoke, and glowing windows and door.
  - Woodshop: a plank shed with an oversized cartoon saw blade and round-ended logs.
  - Stream: turquoise water with a white foam edge and rising bubbles.
  - Fence: thick capped posts with outlined rails that auto-join.
  - Rockery: mossy boulders with tiny flowers.
  - Cow and pig: plump SVG animals that wander and squash as they idle.
  - Trees: stand on a terracotta soil pad, carry a sign with their stage emoji (gold trim at 100%),
    and get bees from stage 3.
- **Placement feedback**: the item floats over a free footprint with a glowing green outline, or throbs
  comic red with "✖ Blocked!". Placing a stream or Farmer's House previews its aura and pulses in the
  "+20% 🪙" / "+50% 🪙" tags it would add. Placed buffs show as floating glossy tags over each tree.
- **HUD**: a top bar with the level crest, the island's Garden Name on a wooden banner with gold trim,
  pills for the active buffs (how many trees each boosts, Woodshop refund on), and the streak and coin
  pods (gold rim). The dock's 🏪 Shop is a hero orb that hops, with a gloss sheen and a red "SHOP" label.
- **Game kit** (`shared/components/game`, every screen): `GameButton` has deeper bottom borders and
  bold white labels with a thick dark outline; dock captions are outlined too.
- **Shop** (`FarmShopModal`): a wooden frame with a coin purse chip and chunky tabs. Items are trading
  cards with a coloured header, a gold coin price badge, the real sprite on a 3D grass pedestal, a perk
  tag, the size, and a green "Buy & Place". Unplanted trees get the same card with a soil pedestal.
- **Motion**: `.mg-cloud`, `.mg-drift`, `.mg-swell`, `.mg-islet`, `.mg-bubble`, `.mg-squash`, `.mg-float`,
  `.mg-throb`, `.mg-hop`, `.mg-sheen`, `.mg-sway` in `globals.css`, transform / opacity only. All of them
  are off for `prefers-reduced-motion`.
- **Responsive**: the camera still drags / pinches / zooms; on phones the island banner and buff pills
  wrap under the level crest and purse, and Shop cards stack in one column.

## Database migrations

`supabase/migrations/`, applied in this order on a fresh database (details and hosted-project order:
`01.share-docx/DATABASE.md` "Migration Rules"):

| # | File | Adds |
|---|------|------|
| 1 | `20260928000000_initial_schema.sql` | Baseline tables, trigger, RLS |
| 2 | `20260928000100_hide_knowledge_answers.sql` | Hides `correct_stmt` / `trap_rules` from players |
| 3 | `20260928000200_practice_days.sql` | Practice days and streaks |
| 4 | `20260928000300_user_coins.sql` | `users.coins`, `award_mastery_coin()` |
| 5 | `20260928000400_mastery_scale_5.sql` | Mastery 0–5 |
| 6 | `20260928000500_seed_economy.sql` | 300 🪙 start, `plant_deck()` |
| 7 | `20260928000600_profiles_and_sharing.sql` | Public profiles, shared trees |
| 8 | `20260928000700_clone_deck.sql` | `clone_deck()` |
| 9 | `20260928000800_tree_visits.sql` | Visited Gardens (`tree_visits`) |
| 10 | `20260928000900_mind_tournament.sql` | Mind Tournament tables |
| 11 | `20260928001000_display_names.sql` | Custom garden display names |
| 12 | `20260930000000_farm_grid.sql` | `garden_placements`, `purchase_and_place_item()`, `farm_coin_multiplier()`, buffed `award_mastery_coin()`, `users.coin_carry`, `uproot_deck()`, backfill of existing trees onto the grid |

Migration 12 must be applied with the farm deploy: without it the farm shows no placed trees and chopping
falls back to a plain delete with no refund. The Supabase CLI project (`supabase/config.toml`) is not set up
yet; migrations are applied in the hosted SQL Editor.

## Recent commits

Newest first. Add one line per commit. A commit can't know its own hash: log it as `(pending)`, and the
next commit replaces that with the real hash.

| Commit | Summary |
|--------|---------|
| (pending) | feat(garden): tropical island diorama, chunky toy sprites, buff tags and game HUD overhaul |
| `ccda259` | docs: formalize PROJECT_STATUS update rule in AGENTS.md and record commit hash |
| `4b1ffea` | feat(garden): isometric farm grid with shop, placements, buffs and woodshop refund; gems removed; this file created |
| `44c14d9` | feat(decks): edit statements and roots with owner-only hover tools |
| `2d77113` | feat(decks): delete statements and whole root branches with confirmation |
| `e21e76c` | feat(decks): bulk import statements from pasted notes and bullets |
| `7270dc5` | feat(i18n): standardize UI copy to English and add custom garden display names |
| `db01dbd` | feat(drill): session launch modal, root scoping, and mindmap drill fixes |
| `9e971d3` | feat(tournament): mind tournament with practice-day leaderboards |
| `84d40d9` | feat(decks): visited gardens drawer backed by tree_visits |
| `e938b61` | docs: align architecture docs with 0-5 mastery scale and seed economy |
| `99b5656` | feat(decks): garden isolation, strict visitor read-only mode, and tree cloning |
| `18197f5` | feat(progress): seed economy, starting coins, and dev coin shop |
| `af7255c` | feat(progress): raise mastery to 5 and rest mastered items with a review mode |

## Health

- `npm test`: 58 files, 519 tests passing. `npx tsc --noEmit` and `npm run lint` clean.
- Every migration parses with PostgreSQL's own parser (SQL and PL/pgSQL bodies).

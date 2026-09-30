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
- **Move mode**: ↔️ Move in a tree's or item's popover (owner only) picks it up: it lifts 12 px, turns
  see-through and casts a soft shadow at its old spot while a ghost follows the pointer, floating glowing
  green over a free footprint or throbbing red with "✖ Blocked!". Neighbouring streams, fences and tree
  beds retile live at both the old and the new spot, and buff tags preview what the move gains. A click
  (touch: tap twice, or "Move here") on a green tile moves it; Esc, right-click or Cancel leaves it where
  it was. Free. Server-authoritative: `moveFarmPlacement` → `move_garden_placement()` (migration 14)
  checks ownership, keeps the footprint (1 × 1 / 2 × 2) inside the 16 × 16 grid, refuses overlaps with
  anything but itself, and locks the gardener's row like purchases. Players still can't UPDATE placements
  directly. Buffs need no recalculation: they are read from the current tiles at every payout.
- **Picking up** an item gives no refund; a picked-up tree goes back to the Shop's Trees tab unchanged.
- **Visitors** see another farm's items and its public trees only, read-only, with no Shop.

## Tree species: 10 × 5 = 50 sprites

`decks.tree_type` is one of ten species (`shared/lib/treeSkins.ts`, validated by Zod, and by a database
check after migration 13), each drawn by its own function in `garden/components/TreeStageSvg.tsx`:

| Species | Look |
|---------|------|
| 🌳 Oak | Bulbous emerald crown in soft layered volumes, branch stubs, acorns when mature |
| 🌲 Pine | Chunky tiered conifer: rounded triangular foliage cakes with scalloped skirts, cones, a star at stage 5 |
| 🍂 Golden Birch | White bark with dark marks, sunny golden-yellow crown |
| 🌸 Cherry Blossom | Puffy cotton-candy pink crown on a forked trunk, blossoms and petal sparkles |
| 🌿 Weeping Willow | Rounded dome with chunky yarn-like tendrils cascading in front and behind |
| 🔮 Mystic Bonsai | Twisted S-curved trunk, glowing violet cloud pads, drifting luminous spores |
| 🌴 Tropical Palm | Thick curved trunk with segment rings, plump drooping fronds, coconuts |
| 🍊 Citrus Grove | Round green crown dotted with oversized glossy oranges (3 / 6 / 9 by stage) |
| 🍁 Autumn Maple | Bold cut-out five-point leaves in coral and crimson |
| 🌵 Desert Cactus | Plump saguaro with rounded arms and pink blooms on the tips |

- **Stages**: 1 Sprout (a plump seedling with the species' seed cap and cotyledons; pine tuft, sprouting
  coconut, round baby cactus), 2 Sapling (thick stem, mini crown), 3 Adolescent (the recognisable
  silhouette; bees start), 4 Mature (full crown with depth layers and species accents), 5 Mastered (the
  mature crown with a gold rim round its whole silhouette, golden aura, sparkles, the finest accents).
- **How they're drawn**: each species is designed once at full size and grown with a per-stage scale;
  young trees get relatively plumper shapes.
- **Lit, never outlined**: trees stand out from the ground through light and colour alone (a test fails
  if an outline colour comes back). Each species has an `occlusion` and a `rim` colour in its skin:
  - a rich, saturated ambient-occlusion shade under and behind every foliage cluster, frond, tier,
    leaf and trunk (deep jungle green under oak, plum under cherry, ochre under birch, crimson under
    maple…), offset down-right like a real shadow instead of a dark ring;
  - a sun-kissed rim light along the upper contours (warm sunlight, soft cyan on pine, pastel on
    cherry / mystic), plus lifted highlights, a sunlit cap, glints and a warm bounce light below;
  - stage 5 wraps the silhouette in a soft translucent golden halo (no hard rim).
- **Depth on the ground**: two soft shadows, blurred CSS radial gradients on the farm (outside the
  swaying tree, so they stay put): a dark contact shadow hugging the trunk and a longer cast shadow
  thrown back and to the right (sun upper left), growing with the stage and size tier. Elsewhere
  (cards, Shop) the SVG draws the same pair as stacked translucent ellipses (`shadow` prop).
- **Alive**: the tree sways about its trunk base (±1.5°) and breathes (scale 0.99 × 1.02) on a 5.2 s
  loop (`.mg-tree-sway`); its crown (`.mg-foliage`) follows 0.45 s later for a bouncy lag. The phase
  comes from the tile, `((x + 7y) mod 5) × 0.4 s` (`treeSwayPhase`, tested: side-by-side trees always
  differ), so the island never sways in unison. Stage 5's aura pulses (`.mg-aura`) and its sparkles
  twinkle out of step (`.mg-sparkle`). All off for reduced motion.
- **Tactile**: hover or keyboard focus springs the tree up to 105%, a tap squashes it (105% wide, 95%
  tall) and it bounces back (spring easing). Sway and squash sit on separate layers so they never
  fight; the stage sign, mastery badge, bubbles and buff tags live in the label layer and the shadows
  on the bed, so none of them jitter; bees and falling leaves ride with the crown.
- **On the farm**: every species grows from the same trunk base on the tile centre, so it stands on the
  full-tile garden bed with its stage sign, bees, popovers and buff tags unchanged.
- **Picking a species**: the planting form and the Tree Workshop's picker show all ten; the Shop's 🌳
  Trees tab has a seed gallery (each species as a young tree) that opens `/deck/new?species=<id>`.
- **Retired species**: sakura → cherry, saguaro → cactus, apple → citrus, bamboo → palm
  (`LEGACY_TREE_TYPES`). Old rows render as their successor; migration 13 rewrites them and adds the check.
- Tests (`garden/__tests__/treeSprites.test.ts`): all 50 render with no bad numbers, all 50 differ, gold
  only at stage 5, mature trees paint more than saplings and sprouts, retired ids draw like their successor,
  and the migration's ids and renames match the catalogue.

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
  - Stream: **auto-tiled** like fences (`streamLinks` / `streamVariant` in `lib/farmGrid.ts`): a lone
    pond, a straight canal (N–S or E–W), a bend, a T-junction or a 4-way cross. Each tile is a rounded pool
    plus an arm to every linked neighbour, meeting it at the same width on the shared edge
    (`lib/streamTiles.ts`, tested), so adjacent streams merge into one waterway: sandy bank, white foam,
    turquoise water and a bright shine, each drawn for the whole network at once so only its outer edge
    has a border. Bubbles and glints on every tile, pebbles by lone ponds. Buffs are unchanged: a tree
    beside any tile of a river gets ×1.2 (tested).
  - Fence: thick capped posts with outlined rails that auto-join.
  - Rockery: mossy boulders with tiny flowers.
  - Cow and pig: plump SVG animals that wander and squash as they idle.
  - Trees: grow from a raised tilled garden bed that fills the whole 1 × 1 tile (no round soil discs),
    with furrows running across it. Neighbouring trees' beds join into one plot: the outline, front faces
    and furrow ends only appear on sides with no tree beside them (`TreePlots`). The tree, its stage-emoji
    sign (gold trim at 100%) and its bees (from stage 3) stay anchored on the tile centre.
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

## Performance: instant edits and a smooth grid

- **0 ms edits (optimistic state, `garden/lib/optimistic.ts`, tested)**: planting a tree, buying an
  item, moving and picking up change the farm the moment the player acts. Each edit is an op (add /
  move / remove) laid over the placements the server last sent; stream / fence / tree-bed tiling, buff
  tags, the buff pills, the Shop's Trees tab and the purse all follow at once. The server action runs in
  the background: an add learns its real id when confirmed (until then it can't be moved or picked up),
  a refusal drops the op, which rolls the farm back, restores the coins and shows a toast.
- **Why it took ~4 s before**: each farm action called `revalidatePath('/')`, which in a Server Action
  re-renders the whole home page (every query) before answering, and the client then ran
  `router.refresh()` for a second full render. Both are gone from the farm flows; the page is dynamic
  (router cache 0 s), so the next visit still loads fresh data.
- **Rendering**: the grid is `React.memo`'d with stable props (memoized ghost, handlers that read the
  latest state through a ref), so camera drags and zooms never re-render it. Its static layers (ocean,
  the island with its 256 tiles, palms, clouds) are memoized components that render once; tree beds and
  the stream network re-render only when their tiles change; each tree and item is a memoized tile with
  primitive props (buff and fence-link keys), so one edit or a moving ghost re-renders only what changed.
- **GPU**: no CSS blur / drop-shadow filters on anything that moves or repeats per tile. Tree contact
  and cast shadows are static multi-stop radial gradients; clouds carry a baked soft shadow in their
  SVG; the placement ghost glows with a radial gradient; the lifted (moving) item has no filter.
  Swaying trees, clouds, the floating ghost and animals get their own compositor layers
  (`will-change: transform`, `translate3d(0, 0, 0)`, only while motion is on).

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
| 13 | `20261001000000_ten_tree_species.sql` | Retired species → successor, `decks_tree_type_check` (the ten ids). Run **after** deploying the code |
| 14 | `20261002000000_move_garden_placement.sql` | `move_garden_placement()`: owner-only move, bounds + overlap checks, row lock |

Migration 12 must be applied with the farm deploy: without it the farm shows no placed trees and chopping
falls back to a plain delete with no refund. The Supabase CLI project (`supabase/config.toml`) is not set up
yet; migrations are applied in the hosted SQL Editor.

## Recent commits

Newest first. Add one line per commit. A commit can't know its own hash: log it as `(pending)`, and the
next commit replaces that with the real hash.

| Commit | Summary |
|--------|---------|
| (pending) | perf(garden): optimistic farm edits, memoized grid and filter-free shadows |
| `38eac10` | feat(garden): move mode for farm trees and items |
| `082d9cc` | feat(garden): outline-free lit trees with soft shadows, idle sway and tap springs |
| `eb89c78` | feat(garden): ten tree species with 50 chunky 3D sprites and a Shop seed gallery |
| `1a167c0` | feat(garden): full-tile tree garden beds and auto-tiled continuous streams |
| `d91e334` | feat(garden): tropical island diorama, chunky toy sprites, buff tags and game HUD overhaul |
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

- `npm test`: 62 files, 557 tests passing. `npx tsc --noEmit` and `npm run lint` clean.
- Every migration parses with PostgreSQL's own parser (SQL and PL/pgSQL bodies).

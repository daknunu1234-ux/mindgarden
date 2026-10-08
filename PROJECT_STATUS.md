# MindGarden: Project Status

> Snapshot of what is built, how the pieces connect, and what has shipped. Last updated: 2026-10-06.
>
> **Rule: update this file before or alongside every commit.** If a commit adds, removes or changes a
> feature, a migration, a price, a buff or the core loop, the same commit updates the matching section
> here and adds a line to the [commit log](#recent-commits). A commit that leaves this file stale is not done.

Detailed rules live elsewhere: agent rules and definition of done in `01.share-docx/AGENTS.md`, schema in
`01.share-docx/DATABASE.md`, actions in `01.share-docx/API SPEC.md`, per-feature exports in
`src/features/<feature>/context.md`. This file is the overview; when it disagrees with those, they win.

## Overview

Gamified micro-learning. A **Deck** is a living **Tree** on the player's farm. Its content is one
hierarchy of **content nodes** (`content_nodes`): `root` nodes are the underground **Roots**, `statement`
nodes are plain-text **Statements** drilled against generated trap choices. Mastery goes 0 → 5 per player per statement.

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
| Plant a seed (new tree) | −100; −180 for a surreal species (Crystal Flora, Cosmic Nebula, Chrono Willow) | `plant_deck()` → `seed_price()` |
| Clone a shared tree | −(the species' seed price + min(statements, 50)): 100–150, or 180–230 for a surreal tree | `clone_deck()` |
| Change a planted tree to a pricier species (Tree Workshop) | −the price difference (standard → surreal: 80); cheaper or equal: free, no refund | trigger `decks_charge_species_upgrade` |
| Statement mastered (first 5/5) | +1 × farm buff × 1.5 on a special tree (a 180 🪙 species), fraction carried | `award_mastery_coin()` → `species_coin_multiplier()` |
| Shop item | −1 to −50 (catalogue below) | `purchase_and_place_item()` |
| Chop a tree with a Woodshop | +min(floor(25% × statements), 50) | `uproot_deck()` |
| Harvest a tree's fruit (practised yesterday) | +2 per tree per day | `harvest_tree_fruit()` |
| Daily Rush (one run a day, one tree) | +1 per card answered in a row, at most 30 | `answer_daily_rush()` |
| Streak milestone (first watering that day) | +7 at 7 days, +30 at 30, +N at every 100 (100, 200, …) | `award_streak_reward()` |

### Special trees pay ×1.5 mastery coins

- **Which trees**: the species whose seed costs 180 🪙 (Crystal Flora, Cosmic Nebula, Chrono Willow):
  `shared/lib/treeSkins.ts` `isSpecialTree` (the rule is the price, not a list) and
  `speciesCoinMultiplier`; `SPECIAL_COIN_MULTIPLIER` = 1.5 in `shared/lib/economy.ts`.
- **What it multiplies**: the one mastery reward there is: the coin a statement pays the first time
  it reaches 5/5. Standard trees pay ×1 as before.
- **Exactly ×1.5, not rounded**: the payout is 1 × farm buff × 1.5 plus the carried fraction
  (`users.coin_carry`), so a special tree pays 1, 2, 1, 2, … coins. Rounding each payout would pay 2
  every time (×2). `masteryCoinPayout` mirrors the database rule; a test keeps them equal.
- **Stacks with farm buffs**: a special tree beside a stream and inside a Farmer's House area pays
  1.5 × 1.8 = ×2.7.
- **Server-enforced** (migration 21): `species_coin_multiplier()` and a re-created
  `award_mastery_coin()`. The species is read when the coin is paid, so a tree changed to a special
  species (80 🪙 in the Workshop) pays ×1.5 from then on.
- **Shown**: a violet "⭐ 1.5x Coins" tag (`shared/components/game` `CoinBonusTag`) on the special
  seed cards (planting form, Shop seed gallery, Workshop picker), in the farm's tree popover (whose
  payout line now reads farm buff × bonus), and "⭐ 1.5x" on the practice round's coin plaque.
- Fruit, streak rewards, the Daily Rush and the Woodshop refund are not multiplied.

### Daily Rush ⚡ (`src/features/rush`)

- **What**: once per calendar day, one sudden-death run on one of your own trees. 8 seconds a card; a
  right answer deals the next card at once; a wrong answer or a timeout ends the run; the run pays
  1 🪙 per card answered in a row.
- **Button**: ⚡ Daily Rush beside 💧 Water Tree in the farm's tree popover, a pulsing amber → rose
  pill. Once today's run is used, every tree shows a grey "See you tomorrow" (no countdown).
- **Play screen** (`/deck/[slug]/rush`): rules and a Start button (the run starts only on that
  press), then cards with a clock bar that shrinks from amber to red, a heartbeat in the last 3
  seconds, keys 1–4 / A–D and instant pointer-down picks, an amber flash when the run ends, and a
  result panel with the streak, the coins bursting into the purse and the card that ended it.
- **Server-enforced** (migration 20): one run per player per day by primary key; the server deals
  and grades every card (the client only sends the pick); the database clock times each answer
  (8 s + 2.5 s network grace); the streak is paid in the same transaction that ends the run.
- **Limits**: a run asks each statement once and at most 30 cards, so it pays at most 30 🪙.
- **Isolated**: a rush changes no mastery, streak, watering or fruit. Only coins.
- **Rule 10 exception**: this is the one mode with a clock and sudden death (recorded in
  `01.share-docx/AGENTS.md`).

### Practice stores progress, not history

- **Payload**: an answer sends only the pick (`itemId`, `seed`, `tag`, plus the timezone for the day).
  The server grades it; unknown fields are dropped by the Zod DTO.
- **Per answer, in place**: the item's `mastery_level` (±1, 0–5) and `last_practiced_at` in its one
  `user_progress` row.
- **Per day**: one `practice_days` row per player (streak, streak rewards) and one
  `deck_practice_days` row per tree (watering, fruit), insert-if-absent however many answers.
- **Never stored**: per-answer rows, answer times, the pick, a mistake tally. An audit found no
  latency or per-answer logging; three values written on every answer but read by nothing were
  removed (`user_progress.mistake_count`, `users.streak_count`, `users.last_active_at`; migration 19
  drops the columns). `progress/__tests__/drillPipeline.test.ts` pins all of this.

### Seed prices and price tags

- **Prices live in the species registry** (`shared/lib/treeSkins.ts` `price`, `seedPrice`; the numbers
  `SEED_PRICE_COINS` = 100 and `SURREAL_SEED_PRICE_COINS` = 180 in `shared/lib/economy.ts`). The
  database charges the same through `seed_price()` (migration 18); a test keeps them equal.
- **Price tags everywhere a seed is picked** (`shared/components/game` `SeedPricePill`, "🪙 180"): in
  the footer of every species card of the planting form and of every packet of the Shop's seed
  gallery: under the name, pinned to the card's bottom edge, never over the tree picture.
  A seed the purse can't pay shows its tag dimmed red with a tooltip ("Not enough coins: you need N
  more 🪙"), and its Shop packet dims.
- **Planting form**: the "Seed Cost" plaque and the Plant button follow the species picked; the button
  is disabled while the purse is short and "Get More Coins" opens the Coin Shop.
- **Tree Workshop**: species that cost more than the tree's current one carry a "+80" badge. Picking
  one asks in place ("Change this tree to … for 80 🪙?") before paying; the server charges the
  difference, the header purse updates, and a short purse rolls the change back with a toast.
- **Server-enforced**: `plant_deck()`, `clone_deck()` and the species-upgrade trigger charge inside
  the database, so neither cloning nor the Workshop is a cheaper way to a surreal tree.

### Daily streak and its rewards

- **Only watering counts**: the streak grows when the player waters a tree, i.e. saves a practice
  answer (right or wrong). Opening the game, the farm or the header never marks a day (the HUD load is
  read-only; a test fails if it writes).
- **Once per day**: the first watering of the player's local day inserts the day
  (`practice_days`, insert-if-absent); watering more trees that day changes nothing.
- **Missed day**: the run ends; the next watering starts again at 1 (the best streak is kept).
- **Milestone coins** (`progress/lib/streak.ts` `streakReward`, mirrored by SQL, tested): 7 days → +7 🪙,
  30 → +30, every 100 (100, 200, 300…) → as many coins as days; every other day +0. Paid on that
  day's watering by `award_streak_reward()` (migration 16, service role), which counts the streak
  itself from `practice_days` and keeps a ledger (`streak_rewards`) so a day pays once. The purse
  updates at once and a toast says "🌱 Tree watered today! N-day streak: +N 🪙". A streak that restarts
  and reaches 7 again pays again.

### New trees: buy, place, name, grow; renaming

- **Buying a tree from the Shop** is one flow on the farm: pick a seed packet → confirm (price, purse
  before → after) → the tree is planted with a suggested name ("Oak Tree", "Oak Tree 2"…) → placement
  mode starts right away, every open tile glowing softly (the hovered one bright green) → click a tile
  (tap twice on touch) → "🌱 Name your tree" with the suggestion selected → the tree's page opens with
  the Tree Workshop in view and a new root line focused. Esc while placing keeps the tree in the Shop's
  Trees tab; "Later" keeps it planted with its suggested name; a refresh at any step loses nothing.
- **Renaming**: ✏️ (or double-click) next to the tree's name in the deck page header, at the top of
  the Tree Workshop and in the farm's tree popover. Enter or clicking away saves, Esc reverts; names
  are cleaned and 1–100 characters (`shared/lib/treeName`). Instant everywhere (optimistic), saved by
  `renameDeck`; the link (slug) never changes.

### A clean island: two icons over a tree

- Over each tree on the island only two icons can show, small (26 px) and side by side, resting on
  the very tip of its crown (each species' real crown height at each growth stage): **💧**
  (needs practice today: one tap opens its drill round) and **🍎** (ripe fruit: one tap harvests). They
  float gently and grow and glow under the pointer, appear only when there is something to do, and stay
  tappable (about 27 px) when the island is zoomed out on a phone. Percentages, stage chips, the ✨ mastered sparkle
  and the +20% / +50% buff tags are gone from the canvas (the name capsule shows the name only; buffs
  and growth are in the tree's popover); placing a stream or Farmer's House still previews, dashed, the
  buff it would add.

### Power grid, Furniture Factory and Seaport

- **Retired**: the Farmer's House and Woodshop are no longer sold; those already on islands keep working.
- **Windmills** power buildings near them: Small (2×2, 60 🪙) a 4×4 area, Large (6×6, 100 🪙) a 12×12
  area; their sails turn. Buildings that need power show a red "⚡ No Power" badge and stop when out of
  reach; fields glow while placing or inspecting.
- **Furniture Factory** (2×2, 120 🪙, needs power) turns timber from the island's trees into furniture.
- **Seaport** (6×2, 150 🪙, needs power, coast only: valid shore glows green, inland red) is a wharf with
  cranes and crates; a cargo ship sails in, docks and sails away. Every 4 hours a ship buys the island's
  furniture, timber and produce for up to 15 🪙. Everything is computed on the server (migration 25).
- Clicking any building opens its inspector: status, power, inputs and outputs.

### 3D low-poly buildings

- Every island building is redrawn as a faceted 3D low-poly miniature (one light from the upper left,
  flat planes, no outlines): stucco and stone windmills with balconies, cone and dome roofs and lattice
  sails; a timber sawmill with a spinning saw and smoking pipes; a pastel candy workshop with a swirl
  chimney and a moving conveyor of candies; a wharf with a yellow jib crane, containers and a docked
  freighter; ballasted tracks with curves; a steam locomotive with gold bands and puffing smoke.
- **Grand Windmill**: the Large Windmill is now a 2×2 stone tower (60 🪙) powering a **6×6** area
  (migration 27; ones already standing shrink to 2×2).

### Vivid casual-game look

- The island's buildings are brighter and punchier: saturated colours, warm sunlit faces, deep indigo
  shadows (never grey), crisp bevel highlights on edges and ridges, and a soft shadow under each
  building's footprint.
- New details: flower planters and lanterns on the Small Windmill; cobblestones, amber windows, brass
  cogs and red-and-white striped sails on the Grand Windmill; a cobalt tin roof and a saw throwing
  sawdust sparks at the Furniture Factory; gumdrops, a lollipop, a candy-cane chimney and magenta candies
  at the Candy Factory; water ripples, diagonal hazard curbs, bright containers and a ship's wake at the
  Seaport; a gloss black locomotive with a glowing lantern and big cartoon smoke, and candy crates with
  ribbons and gold coins.

### Tree cloning rewards

- A shared tree can be cloned only once it has **at least 50 statements**; the clone button shows
  "🌱 52/50 Statements" and is disabled below 50 ("Requires at least 50 statements to clone"); a short
  purse is told how many coins it needs.
- The cloner pays the usual price (seed + min(statements, 50): 150 🪙, 230 🪙 for a surreal species); the
  **creator earns +50 🪙** per clone and gets a notification toast on their next visit ("🎉 A player
  cloned your tree …! You earned +50 🪙"). Clones are logged (`plant_clones`, migration 30). Several
  clones in a row are fine; your own trees can't be cloned.

### Continuous placement

- Roads, Water (streams) and Fences are laid like paint: after a tile goes down the tool stays in hand,
  so the next click lays the next tile. The bar says "Placing Road • Click to place • Press ESC when
  done" and counts the tiles. Esc, **Done**, a click on the sea or switching browser tabs finishes; an
  empty purse ends it with an "Out of coins" toast.

### Roads and Delivery Trucks

- The railway is gone. **Roads** (1 🪙 a tile, Shop tab 🛣️ Roads) join into straights, bends, T-junctions
  and crossings: dark asphalt, white dashed lines, light curbs.
- When a Road links a powered Candy Factory or Furniture Factory to a powered Seaport, a **Delivery Truck**
  drives the route: it loads at the factory, turns at every bend, stops at the dock to unload and drives
  back. Candy boxes delivered this way sell for 15 🪙 each (as with the train before).
- Saved islands keep their layout: every track tile became a road; Freight Trains were removed and
  their 30 🪙 refunded (migration 29).

### One Windmill

- The Grand Windmill is gone: the island has one **Windmill** (2×2, **60 🪙**) that powers a **10×10** area.
  Grand Windmills already standing became Windmills on the same tiles (migration 28), so nothing lost power.

### Rendered building sprites

- The Small Windmill, Candy Factory and Furniture Factory now show detailed rendered artwork (static
  images, no animation), anchored on their 2×2 tiles; an unpowered factory looks muted.
- While powered, the Candy Factory puffs white smoke from its chimney and rolls candies off its
  conveyor, and the Furniture Factory smokes from its pipe and sprays sawdust sparks and wood chips at
  the saw bench. The Small Windmill's turning rotor is built but off until a render without painted
  sails is supplied.
- The **Seaport** is now the rendered wharf with its crane and containers, fitted onto its 6×2 coastal
  footprint (the harbour water hangs out over the sea). While powered, a rendered cargo ship glides in
  from the open sea, docks beside the wharf, bobbing, then turns and heads back out.
- `npm run sprites` prepares the images from `raw-assets/structures/*.png` (outside `public/`) (removes the baked-in checkerboard and
  watermark, crops, and shrinks each from 6–7 MB to about 100 KB WebP).

### Fruit, candy and the railway

- **Harvesting gives fruit**: tapping 🍎 over a ripe tree adds 2 🍎 to the island (no more coins); the
  header shows `🍎 n  🪙 n`.
- **New prices**: Small Windmill 30, Large Windmill 60, Furniture Factory 50, Seaport 100 🪙.
- **Candy Factory** (2×2, 50 🪙, needs power): 10 🍎 → 1 🍬 candy box, one an hour.
- **Railroad Track** (1×1, **1 🪙 a tile**) joins up with its neighbours; a **Freight Train** (1×3, 30 🪙)
  stands on three tracks in a row. When track links a powered Candy Factory to a powered Seaport and a
  train is on it, the train runs the route and every candy box is exported for **15 🪙**: "+15 🪙"
  floats up over the Seaport with a shower of coins. All on the server (migration 26).

### The farm opens on your trees

- On arrival the island camera starts on the overview, then glides (about half a second, ease-out)
  onto the player's trees: one tree close up (1.3×), several framed together with a comfortable
  margin, none: the overview stays. Touching, dragging, pinching, scrolling or the zoom buttons stop it
  at once; with reduced motion it jumps straight there.

### Performance: smoother Workshop and farm

- **Tree Workshop**: typing in a row, opening a row for editing or adding a line re-renders only that
  row (it used to re-render every row of the tree on every keystroke). Rows are memoized; the
  connectors are recomputed only when the outline's shape changes. A test counts row renders on a
  200-row outline.
- **Farm**: its dialogs (Shop, tree and item popovers, Daily Delivery, naming prompt) are separate
  chunks, loaded when the browser is idle after the island appears (initial JS of `/`: 1065.8 → 1030.0
  KB raw, 301.1 → 288.4 KB gzip). The island's animations pause in a background tab and while a dialog
  is open over it (no per-frame re-blur of the dialog backdrop).
- Not profiled in a browser yet (React DevTools / Chrome Performance): the numbers above are from
  tests and the build output.

## Sign-in

- **Google 1-click** (active): the login dialog leads with "Đăng nhập bằng Google" (Google logo, loading
  state while redirecting). `signInWithOAuth({ provider: 'google' })` runs in the browser and Google
  returns to `/auth/callback`, then to the page the player was on.
- **Email magic link**: still there, under the Google button.
- **First sign-in**: both land on `/auth/callback`, which exchanges the code and makes sure the profile
  row exists with the 300 🪙 starter purse (`ensure_user_profile()`); the signup trigger fills the name
  and picture from Google. A new farm starts empty, so nothing else is created.

## Knowledge Engine

### Unified content nodes (supersedes the Workshop wording further down where they differ)

- **One table** (migration 23, `20261013000000_content_nodes.sql`): `content_nodes` = `id, deck_id,
  parent_id, content, node_type ('root' | 'statement', default 'statement'), sort_order` (+ `trap_rules`,
  `created_at`). It replaces `mindmap_nodes` + `knowledge_items`: every row is copied with its id, the
  outline keeps its order (each root's statements, then its sub-roots), progress (`user_progress`,
  tournament progress) now points at `content_nodes(id)`, and the old tables are renamed `legacy_*`
  (migration 24 drops them, optional). Any node can sit under any node; a top-level node is a root, and
  no node goes under its own branch (a trigger refuses both).
- **Practice is "every statement node"**: a drill reads the tree's `content_nodes` (one table, no join)
  and asks each `statement`, at any depth. Its root context is its nearest root (branch rounds, sibling
  swaps, breadcrumb); a statement under a short statement takes it as context ("Ty thể" › "sản sinh ATP"
  is asked as "Ty thể sản sinh ATP"). Trap rules are still read with the service role only.
- **One outline, one set of rules** (`decks/lib/contentTree.ts`, pure): the page and the database follow
  the same rules, so an edit shows at once (deck draft) and the server ends exactly there.
  - **Enter** saves and opens a sibling of the **same type at the same level** right below (the only key
    that creates a row). **Shift+Enter**, **Esc** or clicking away save; ✕ discards.
  - **Tab**: the row's parent becomes the row above it at its level (it goes last there). **Shift+Tab**:
    its parent becomes its parent's parent, right below the old parent; the siblings that were below it
    become its children. Nothing is created, deleted or moved up or down; only levels change, with the
    whole branch. `indent_content_node()` does it in the database from just the node and the direction,
    tested row by row against the page's prediction on PGlite.
  - **Alt** (a clean tap) or **Alt+Enter** flips `node_type` root ↔ statement in place: one UPDATE, no
    delete or re-insert, children and position kept (a top-level root stays a root). Also ⇄ on Workshop
    rows, canvas cards and the root drawer. Progress on a statement is kept while it is a root.
  - **Ctrl+Enter** / **⌘+Enter** opens the bulk importer under the row.
- **Shortcut panel**: a compact "⌨️ Shortcuts" card on the right of the Workshop outline from lg
  (1024 px) up: a `w-44` column, sticky down a long tree, one key badge + a 1–2 word label per row
  (Enter New item · Tab Indent · ⇧Tab Outdent · Alt Root ↔ Stmt · Ctrl+↵ Bulk add · Esc Done; full
  descriptions and Alt+Enter / ⌘+Enter on hover). One click on × minimizes it to a small
  "⌨️ Shortcuts" badge; below lg it sits under the outline as that badge. Remembered per browser.
- **📂 Move** (Workshop rows and drawer statements): a node moves with its branch under another root,
  last (optimistic; one UPDATE of `parent_id`). Progress and paid coins are kept.
- **Bulk preview**: each parsed line can be edited in place (✏️ or double-click) or discarded (🗑️,
  "Restore N discarded") before importing; edited lines are checked again.
- **Statements are readable by anyone who can read the tree** (`content` has a column grant; before,
  `correct_stmt` was service-role only). Owners and visitors of public trees already saw them; only the
  owner is graded, so this earns a visitor nothing. `trap_rules` stay service-role only.
- The earlier drafts (⬆️🌿 / ⬇️📜 conversions, one level of sub-statements, separate Tab rules for
  statements and roots, migrations "23 / 24" convert / indent) never shipped and are folded into this.

- **Authoring**: statements are plain text only (no LaTeX / OCR), cleaned (NFC, single spaces) and
  bounded to 5–500 characters. Roots nest into branches.
- **Bulk import**: paste notes into a root (Markdown, Unicode or numbered bullets); each bullet or line
  becomes a statement, with a live preview, de-duplication and a 100-item cap per import.
- **Cascading delete**: deleting a statement, a whole root branch or a tree relies on database
  `ON DELETE CASCADE` (sub-roots, statements, `user_progress`, tournament progress, farm tile), always
  behind a confirmation dialog that says what goes.
- **Edit**: `updateKnowledgeItem` rewrites a statement's text; trap rules and every player's progress
  (personal and tournament) are kept.
- **Tree Workshop outline** (deck page, owner only, the section under the mindmap): the roots are edited
  as a compact connected outline, with no dialogs. The mindmap canvas above and its 💧 Drill / ⚔️ Compete
  triggers are unchanged.
  - **Layout: writing first**: the outline is the first thing in the Workshop. Under it, one slim
    wrapping **Tree settings** bar holds the secondary controls: the species as a row of ten small round
    icon buttons, a "🌐 Share" switch (Public / Private, with a small copy-link button while public) and a
    "🏆 Tournament" switch (Live / Closed, "Share first" on a private tree). Their full explanations moved
    to tooltips and screen-reader hints. The three bulky cards above the editor are gone; the Danger Zone
    stays last. Same actions and optimistic behaviour as before.
  - **Root selector**: one chip per top-level root (with its branch's statement count). The selected
    root is shown below as an outline: 13 px roots, 12 px statements, joined
    by connector lines (a rail down each child list, an elbow into each row). Only roots and sub-roots
    carry leading markers (▾ / ▸, 🌱 / 🌿); a statement row starts with its text (aligned with the inline
    input, which has no leading icon for statements either), and its status is a subtle trailing
    micro-badge: ⏳ saving and 💧 not drillable always show, ✅ ready only on hover / focus.
  - **＋ Add root** is the last chip of the root selector row (a compact dashed pill, wrapping with the
    chips on narrow screens); clicking it turns it into the input the new root is typed in. The button
    pinned to the bottom of the screen is gone.
  - **Collapse / expand**: ▾ / ▸ next to every root and sub-root that has children. Collapsed, its whole
    branch (rows and connector lines) hides and a `+N items` pill counts what's tucked away (statements +
    sub-roots, at any depth; click it to expand). View state only (no server call, outside the deck
    draft), kept when switching root chips. Opening an input under a collapsed node (＋📜, ＋🌿, 📋, Tab)
    expands its path first so the field is visible and focused; collapsing closes an input inside it.
  - Hover a root for **＋📜 statement**, **＋🌿 sub-root**, ✏️ rename, 📋 bulk add (the importer opens
    inline) and 🗑️. ✏️ or a double-click edits a root or a statement in place (Enter or leaving the field
    saves, Esc cancels).
  - **Keyboard flow** (`decks/lib/outline.ts`, tested): **Enter** saves and opens a sibling (Enter on
    an empty line closes), **Tab** opens a child (statements under the root just typed; from a statement
    line, a sub-root), **Shift+Tab** goes up a level, **Esc** closes. Keys wait while an IME composes
    (Vietnamese Telex / VNI).
  - Everything goes through the deck draft (0 ms): a new root shows at once under a temp id, statements
    and sub-roots can be typed under it straight away and are sent once it has its real id. Writes go
    one at a time in typing order, so sibling order is kept. Only deletes ask for confirmation.
- **Hover-to-reveal owner tools**: ✏️ Edit / 🗑️ Delete (and ⚙️ Manage on roots) stay hidden until a card,
  pill or row is hovered or keyboard-focused (`shared/components/game` `HoverActions`), and are always
  visible on touch screens. Visitors and contestants never see them.
- **Snappy drill rounds**: a correct answer flashes gold and the next card comes on its own after 300 ms
  (`drill/lib/feedbackAdvance.ts`); a wrong answer waits so the right answer can be read. Enter, Space or a
  tap on any choice moves on at once. Keys: `1`–`4` / `A`–`D` (explicit maps, so a 4th choice shows `4`,
  never `0`), with physical-key fallbacks for the keypad, AZERTY and Vietnamese VNI / Telex IMEs, heard in
  the capture phase. Grading loads the deck row and its roots in parallel (one round trip fewer per answer).
- **Scoped question pacing**: one launch modal picks the session size (5 / 10 / 20 questions) and the
  scope (the whole tree or a single root branch, `?nodeId=`). 5/5 statements rest from normal rounds
  unless the player chooses review (`?review=1`).
- **Question engine, zero drop** (`shared/lib/questionEngine.ts` + `notePatterns.ts` + `trapEngine.ts`; all pure and
  seeded, no DB, no network; backend/ARCHITECTURE.md §7). Mindmap notes are fragments, so no note needs to be a full
  sentence any more: every note gets a 2–4 choice question (A–D), server-graded. The ✅ / 💧 "not drillable" status
  is gone in practice (only a lone note with no two distinct words or letters, like "aaa", can't be asked).
  - **Contextual inheritance**: a predicate-only note ("compiles down to clean JavaScript" under "TypeScript",
    "sản sinh ATP" under "Ty thể") takes its root's title as subject: "TypeScript compiles down to clean
    JavaScript". Every question shows its breadcrumb badge (`[Sinh học › Bào quan]`).
  - **Key–value & definitions**: `Key: Value`, `Key - Value`, `Key = Value`, "X là Y", "X nghĩa là Y", "X is
    defined as Y", "X refers to Y"… are asked both ways ("Ty thể: ____" and "____: nhà máy năng lượng"), with
    other notes' values / keys as the wrong choices.
  - **Cloze**: `[author marks]` (then only cloze), numbers and years (plausible wrong numbers: a year stays a
    year, `%` and decimals kept), "quoted" terms, proper nouns and technical terms (ATP, JavaScript, Hà Nội, pH).
  - **True / false**: the classic one-mutation traps (sibling swaps, tăng/giảm, operators, negation), now on the
    note's full proposition.
  - **Recognition**: short phrases / bullet items: "Which note belongs under “Phân tử”?" with items from
    sibling categories (never the same root or anything below it).
  - **Fallbacks** (nothing above fits): recognition across the deck, then "Which is exactly your note?" (copies
    with two words swapped or one dropped). Recognition stands in for the classic "front: root / back: note"
    flashcard so the answer is still checked on the server: a self-graded card would let anyone claim mastery
    and the 5/5 🪙.
  - **Plausible distractors**: closest notes first, only from the note's own subject when it has any (3 good
    choices beat 4 with an odd one out), never a root title shown in the badge.
  - **One context everywhere**: sessions, grading (`findDrillItem` now loads the whole deck: one deck read per
    graded answer) and the Mind Tournament prepare the same whole deck, so a branch round grades exactly what
    it showed (`drill/__tests__/questionConsistency.test.ts`). Tournament N now counts every note.
- **Visitors**: strict read-only. They read every root and statement of a shared tree, then clone it to
  practise (progress is not copied). The Mind Tournament is the only exception.

## Tree & roots chart (deck page)

The "Tree & roots" section of `/deck/[slug]` is the whole root hierarchy on a zoomable, pannable
canvas (`mindmap` `RootChart`; layout `hooks/orgChartLayout.ts`, camera `hooks/chartCamera.ts` +
`useChartCamera.ts`, tested). This supersedes the mindmap canvas described under "Knowledge Engine"
and "Opening a tree": that canvas (`RootMap`) is still in the feature but no longer mounted.

- **The tree stands free**: no box round it. The low-poly sprite stands on the ground line at the
  top of the canvas, swaying about the foot of its trunk (the farm's idle motion), on a small soil
  ring. Its name, stage and overall mastery float beside the trunk in one dark capsule.
- **Roots from the trunk**: a tapering taproot drops from the foot of the trunk into the soil and
  branches into curving tendrils that reach the top-level roots; each sub-root hangs under its
  parent by a tendril of its own. Tendrils are tinted by the child's mastery (gold at 5/5), thin
  with every tier and end on the top edge of their card.
- **Sky and soil**: the frame paints sky above the ground line, a strip of turf on it and soil
  below, in one gradient that follows the camera (`--mg-ground`, set by the camera hook).
- **Hierarchy**: every tier of roots under the tree: top-level roots, their sub-roots, and so on.
  Each root is centred over its own sub-roots; cards never overlap, whatever the tree's shape.
- **No statements on the canvas**: a card shows the root's title, a progress ring, a status badge (No
  statements / Seed / Growing / Thriving / Mighty Root), its own statement count and its sub-root
  count. Clicking the card, or its "View" button, opens that root's statements in the side drawer.
  Top-level roots also carry 💧 Drill / ⚔️ Compete; the owner's ✏️ / 🗑️ / ⚙️ tools appear on hover
  (always on touch) on every card.
- **Camera**: drag the background to pan in any direction; wheel or pinch to zoom at the cursor,
  between 50% and 180%; a corner toolbar has zoom out, the zoom percentage, zoom in and fit to
  screen. The chart is one element moved with `translate3d(...) scale(...)`, written once per
  animation frame without re-rendering React. A press only becomes a drag after 6 px and the click
  that ends a drag is swallowed, so cards and buttons still click. Fit to screen frames the whole
  diorama, the crown included (the tree's drawing box is part of the chart's bounds).
- **Frame**: 68vh tall (420–760 px); the deck page's skeleton and the lazy panel's placeholder match.

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
- **Drag-and-drop**: owners can also just grab things on the island. Hold a tree or any item (Farmer's
  House, Woodshop, stream, fence, rockery, cow, pig) for a moment (150 ms with a mouse, 400 ms with a finger;
  `garden/lib/dragGesture.ts`, tested) and it lifts into Move mode under the pointer: the green / red target
  tile, the floating ghost, live retiling and buff previews are Move mode's. Release snaps it to the tile
  under the pointer through the same optimistic `moveFarmPlacement` (0 ms, rolled back with a toast if the
  server refuses); a blocked or off-island release puts it back, and a release where it stood opens it like
  a tap. Moving before the hold completes is still a camera pan, so dragging across a busy farm keeps
  panning (`useCamera` `release` hands the pointer over once a drag starts). Phones buzz on pick-up where
  supported. Visitors can't drag. The ↔️ Move button stays (keyboard and small screens).
- **Streams are clickable**: each stream tile has an invisible diamond button, so a stream opens its popover
  (↔️ Move, 📦 Pick up) and can be dragged like any item; before, streams had no click target at all.
- **One layout table**: `garden_placements` already is the island layout (`item_type`, `grid_x`, `grid_y`,
  `width`, `height` for every placed tree and item), so drag-and-drop needed no migration. The island's
  scenery (beach palms, islets, clouds) is fixed decor around the grid, not placements.
- **Tree label capsule** (`FarmTree` `TreeLabel`): each tree's name and progress are one dark
  see-through pill, `[ 🪴 Name • 42% ]`, 18 px tall with 11 px text, centred on the trunk at the front
  edge of its tile (`plotSprite` `label`), under the crown and clear of the 💧 / 🍎 / ✨ bubbles. A long
  name is cut off; the percentage turns gold from 90 %. It replaced the wooden post sign and the round
  mastery badge. No backdrop blur (it repeats on every tile).
- **Tree labels toggle** (`garden/lib/treeLabels.ts`, tested; `hooks/useTreeLabels.ts`): a small 🏷
  button above the zoom buttons switches between showing every tree's label capsule, and
  a clean island where it appears only for the tree that is hovered, keyboard-focused or was just
  tapped / clicked (it fades and rises in, 180 ms). **Off by default**; the choice is remembered in
  `localStorage` (`mindgarden:showAllTreeLabels`). The 💧 water, 🍎 fruit and ✨ mastered bubbles are
  prompts, not labels: they always show. The mode is one class on the farm root (`.mg-labels-hover`)
  and the reveal is CSS, so flipping the toggle or hovering re-renders no tree.
- **Tree popover, compact**: under the big 💧 Water button (and 🍎 Harvest when fruit is ready), the
  owner's other actions are one pill row with dividers: Roots · ↔️ Move · 🪓 Chop, each with a
  tooltip. Roots opens the tree's page (mindmap, with the Tree Workshop below); the duplicate Edit
  button is gone. Visitors keep "Explore & clone" (their separate Roots button led to the same page).
- **Picking up** a Shop item gives no refund. **Trees can't be picked up**: once planted, a tree is only
  moved (↔️ Move or drag) or chopped (🪓, with the confirmation and the Woodshop refund). The "Store /
  Remove from farm" action is gone, and `removeFarmPlacement` refuses a tree (`AUTH_FORBIDDEN`). Trees
  not planted yet still wait in the Shop's Trees tab.
- **Visitors** see another farm's items and its public trees only, read-only, with no Shop.

## Tree vitality: withering, evergreen trees and fruit

- **Withering** (`shared/lib/treeVitality.ts`, tested): a farm tree nobody has practised for more than
  72 hours (counted from planting if it was never practised) withers: it turns grey and stands still (no
  sway, no crown lag, no bees, no falling leaves), shows a 🥀 sign and a "water it to bring it back" note.
  One practice answer revives it. It costs nothing and changes no mastery. Trees without statements
  never wither.
- **Evergreen from stage 4**: a tree at growth stage 4 (Mature Canopy, ≥ 66 %) or 5 is immune: however long
  it rests it keeps its colours, its sway and its bees ("🌳 Evergreen" in its popover). Stages 1–3 still
  wither. A test renders the real farm tree markup to check an inactive stage 4 tree stays coloured and
  swaying.
- **Fruit**: every tree you practised yesterday (your local day) bears fruit at your midnight, worth
  **2 🪙** (`FRUIT_COINS`), harvested once that day from the 🍎 +2 bubble or the popover. Any stage,
  stage 4+ included (they just never wither). Server-enforced (migration 15): a per-tree practice log
  written when an answer is saved (`user_progress.last_practiced_at` can't prove "yesterday"), a harvest
  ledger with one row per tree per day, and a service-role-only `harvest_tree_fruit()` that checks both
  and pays in one transaction; "today" comes from the server clock. Optimistic on the farm: the fruit
  goes and the purse grows at once, rolled back with a toast if refused.

## Tree species: 13 × 5 = 65 sprites

`decks.tree_type` is one of thirteen species (`shared/lib/treeSkins.ts`, validated by Zod, and by a
database check: migration 13 for the ten natural ones, widened to all thirteen by migration 17), each
drawn by its own function in `garden/components/TreeStageSvg.tsx`. Ten natural species:

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

Three **surreal** species (`SURREAL_FORMS`, `isSurrealForm`), drawn in light instead of leaves. They
are cosmetic like the rest: same seed price, same planting, moving, chopping, drilling and Workshop.

| Species (id) | Look | Effect (CSS class) |
|--------------|------|--------------------|
| 💠 Crystal Flora (`crystal_flora`) | A crystal stalk fanning into faceted shards in saturated jewel tones, each in its own hue pair (vivid lit facet, deep shaded facet): neon cyan, electric magenta, radiant amber gold, royal amethyst; small crystals at the base | A prismatic radial backglow breathing behind the crown (`.mg-core`); two faint rainbow sweeps cross-fading over the facets (`.mg-prism`); a cross-sparkle on every facet peak (`.mg-star`); dense rainbow motes drifting up (`.mg-mote`) |
| 🌌 Cosmic Nebula (`cosmic_nebula`) | A galaxy mushroom: a faceted cap in deep space violet `#3b1259`, cosmic magenta `#8a2be2` and neon purple-pink, with a neon lip and pale star spots, over glowing cyan and pink gills, on a chunky obsidian prism stem. Faceted miniature planets circle it, more with every stage: none on the sprout, then 1 (an azure moon), 2 (a lava planet, an icy turquoise moon), 4 (a ringed gas giant, a golden sun-orb, …) and 6 (ringed gas and emerald worlds, a crimson moon, …) | A violet-to-cyan backglow (`.mg-core`); two tilted orbits of dust carrying the planets, one behind the mushroom (`.mg-fringe`, 46 s) and one in front (`.mg-nebula`, 28 s, the other way), each planet counter-turning (`.mg-fringe-back` / `.mg-nebula-back`) so it stays upright and round; energy cracks pulsing up the stem (`.mg-rune`); cross-sparkles of stardust round the cap (`.mg-star`); a soft glow on the ground |
| ⏳ Chrono Willow (`chrono_willow`) | A bronze fossil trunk with rings, verdigris and brightly glowing platinum-and-gold runes; optic threads running sunset copper → molten gold → turquoise → celestial violet from root to tip, each ending in a bead of light | A warm golden backglow (`.mg-core`); runes pulsing in turn (`.mg-rune`); cross-sparkles at the thread ends (`.mg-star`); drifting motes (`.mg-mote`); rainbow grains of light-sand falling to the tile (`.mg-sand`) into spreading prismatic rings (`.mg-ring`) |

- **Bigger than natural trees**: every surreal sprite is drawn `SURREAL_SCALE` = 1.18× (`speciesScale`,
  `treeScale` = size tier × species, `shared/lib/treeSkins.ts`), scaled about the trunk base, so the
  trunk stays on the centre of its tile. On the farm the bubbles and shadows follow the bigger crown;
  the deck scene grows its tree box by the same factor. Frames that clip make room or opt out
  (`TreeStageSvg` `fit`): the Shop's seed packets and tree cards and the tree popover got headroom,
  the grid-view cards and profile thumbnails keep the tree inside its box.

- Their effects are a handful of small SVG shapes inside the sprite, animated with transform /
  opacity only, in groups with `pointer-events: none` so the tree stays the click and drag target. Off
  for reduced motion (rotations freeze; sand and rings are not shown) and for withered trees.
- **No filters, so no `hue-rotate`**: the flowing hue shift is two gradients cross-fading by opacity,
  which keeps the farm's rule that nothing moving uses a CSS filter.
- The multi-colour fills are SVG linear / radial gradients whose ids come from React `useId`, so any
  number of trees share a page without clashing. Every growth stage adds shards / arms / threads,
  runes, sparkles and motes.
- No bees or falling leaves on surreal trees (`FarmAmbience`): the effects above replace them.
- Stage 1 is the species' own drawing in miniature in the soil heap; stage 5 gets the same golden
  halo, aura and sparkles as every species.

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
- **Low-poly, lush set (all 13 species, all 5 stages)**. This supersedes the "soft layered
  volumes", rim-light and occlusion-shade wording elsewhere in this section. Three files in
  `garden/components`: `treeKit.tsx` (the shared pieces), `NaturalTrees.tsx` (the ten natural
  species and their sprouts), `TreeStageSvg.tsx` (the frame, stage-5 dressing and the three surreal
  species).
  - **Look**: crowns are overlapping faceted volumes (`Crown`, `facetedVolume`) with a deep crease
    between masses, trunks and limbs chiselled prisms (`Limb`, `prism`: a lit, a front and a shaded
    face with sharp ridges), fruit, nuts, cones and coconuts cut solids (`Solid`), blossoms kite
    petals (`Blossom`), fronds and sprout leaves two-plane blades (`Blade`). Every plane is a flat
    fill picked from a dark → light ramp by how much it faces one key light (upper left): chartreuse
    / amber in the sun, the species' core colour in front, cool deep tones in creases and undersides.
    No gradients on natural trees, no filters.
  - **Bigger crowns**: broad species (oak, cherry, citrus, maple) are 20–35% wider and taller than
    the rounded set at stages 4 and 5 (tested); stage 5 swells the mature crown and adds masses
    behind it, so the mastered tree is the biggest. Stage 3 and the saplings grow with the same design.
  - **Species**: pine is a stack of faceted cones with jagged skirts; willow a dome weeping faceted
    strands; mystic a twisted trunk with flat cloud pads; palm a ringed trunk with up to twelve
    fronds; cactus ribbed columns with capped arms; birch a white prism trunk with dark lenticels.
  - **Surreal species** keep their light effects (gradients, glows, motes, the galaxy disc, the
    optic threads); they gained prism trunks and branches, a contact shadow, 25% longer crystal
    shards, a wider galaxy and thread curtain, and a faceted golden knot on the Chrono Willow.
  - **View box and anchors** (`lib/plotSprite.ts`): the view box grew from 120 to 150 units and now
    starts left of and above the trunk's own box (`TREE_VIEW_X` / `TREE_VIEW_Y`), so no crown, halo
    or sparkle is clipped in cards and dialogs; it is placed so the trunk base is still at
    `TREE_BASE_RATIO` (0.5, 0.9). The farm's tree box went 132 → 165 px (same world scale), the
    deck scene's 176 → 220. Bubbles float above the taller crown and further out; the label capsule
    and the tap target (the soil tile and the tree's painted shapes) are unchanged. In small frames
    (Shop, popover, cards) the whole tree now fits, so its trunk is drawn about 20% smaller there.
  - **Shadows**: a flat two-step contact shadow under every tree, sized by stage; the farm's contact
    and cast shadows are a quarter wider.
  - Tests (`treeSprites.test.ts` "low-poly sprites"): facets and no filter / gradient for every
    natural sprite, more facets at every stage, the 20–35% growth, and nothing outside the view box.
- **Depth on the ground**: two soft shadows, blurred CSS radial gradients on the farm (outside the
  swaying tree, so they stay put): a dark contact shadow hugging the trunk and a longer cast shadow
  thrown back and to the right (sun upper left), growing with the stage and size tier. Elsewhere
  (cards, Shop) the SVG draws the same pair as stacked translucent ellipses (`shadow` prop).
- **Alive**: the tree sways about its trunk base (±1.75°) and breathes (scale 0.988 × 1.023) on a
  5.2 s loop (`.mg-tree-sway`); its crown (`.mg-foliage`) follows 0.45 s later for a bouncy lag,
  tilting ±0.95° about its own foot, drifting ±0.7 px sideways and lifting 1.4 px. That is about a
  sixth more than the first, subtler motion (±1.5° / ±0.8°); eased, transforms only (tested). The phase
  comes from the tile, `((x + 7y) mod 5) × 0.4 s` (`treeSwayPhase`, tested: side-by-side trees always
  differ), so the island never sways in unison. Stage 5's aura pulses (`.mg-aura`) and its sparkles
  twinkle out of step (`.mg-sparkle`). All off for reduced motion.
- **Tactile**: hover or keyboard focus springs the tree up to 105%, a tap squashes it (105% wide, 95%
  tall) and it bounces back (spring easing). Sway and squash sit on separate layers so they never
  fight; the stage sign, mastery badge, bubbles and buff tags live in the label layer and the shadows
  on the bed, so none of them jitter; bees and falling leaves ride with the crown.
- **On the farm**: every species grows from the same trunk base on the tile centre, so it stands on the
  full-tile garden bed with its stage sign, bees, popovers and buff tags unchanged.
- **Picking a species**: the planting form and the Tree Workshop's picker show all thirteen; the Shop's 🌳
  Trees tab has a seed gallery (each species as a young tree) that opens `/deck/new?species=<id>`.
- **Retired species**: sakura → cherry, saguaro → cactus, apple → citrus, bamboo → palm
  (`LEGACY_TREE_TYPES`). Old rows render as their successor; migration 13 rewrites them and adds the check.
- Tests (`garden/__tests__/treeSprites.test.ts`): all 65 render with no bad numbers, all 65 differ, gold
  only at stage 5, mature trees paint more than saplings and sprouts, retired ids draw like their successor,
  and both species migrations' ids and renames match the catalogue. Surreal species: in the registry
  with label and icon, each draws its own effect, sand falls exactly to the ground, particles take no
  pointer events, and their keyframes animate only transform / opacity inside a motion media block.

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
- **Distant karsts** (`distantKarsts` in `lib/diorama.ts`, tested; drawn by `DistantKarsts` in
  `FarmDiorama.tsx`): three Ha Long Bay style limestone formations in the ocean behind the island (twin
  peaks back-left, a tall tower back-right, a small far ridge behind the back corner). Lit and shaded rock
  faces, strata, mossy summits with palm silhouettes, thin waterfalls, sea haze dissolving their feet. No
  ink outlines and a per-karst opacity (0.9 / 0.82 / 0.6) keep them fainter than the farm. Ambient motion:
  mist drifting across the ridges (`.mg-mist`), water running down the falls (`.mg-cascade`), foam
  rippling from the rock bases (`.mg-shorefoam`); transform / opacity only, gradients instead of blur
  filters, still for reduced motion. Decorative only (`pointer-events: none`, in the ocean layer under
  the island): they are not placements and touch no grid, drag or harvest logic.
- **Palette**: a fresh, low-contrast meadow-green turf that leaves the trees as the focal point:
  `#82cb52` / `#74bb47` checkered tiles with a `rgba(45, 85, 25, 0.08)` seam, a `#44802c` raised edge and
  `#529633` tufts (`TROPIC` in `FarmDiorama.tsx`). Tilled soil (the ring under each tree, `SOIL` in
  `FarmStructures.tsx`, the sprite's mound and the sprout's heap) is a warm sandy clay: `#b08863`
  rim, `#966e4a` body, `#7a5537` inner edge, with no outline.
  Then a warm stone bevel under the beach, then
  muted brown earth darkening to slate cliff and a dark slate keel; turquoise water, citrus sand,
  terracotta roofs, coral flowers; thick dark-brown outlines (`#3b1f0e`), lit left faces and shaded
  right faces (sun upper left). Contact shadows under trees and structures are a soft deep grass tint,
  `rgba(25, 45, 20, 0.3)` (the tree's fades out as a gradient; no blur filters). Tile geometry,
  click targets and the camera are unchanged.
- **Low-poly props** (`FarmStructures.tsx`; this supersedes the outlined "toy" wording in the list
  below): every standing item is flat planes lit from the upper left, with no ink outlines, on a
  `rgba(20, 45, 15, 0.35)` contact ellipse. Farmer's House: cut stone plinth blocks, two-tone walls,
  timber posts, a hip roof in tile bands, a two-face brick chimney. Woodshop: plank walls, a
  two-tone saw blade, logs with hexagonal ends. Rockery: three faceted boulders with moss caps and
  low-poly flowers. Fence: square posts with chamfered caps and bevelled rails (auto-joining as
  before). Cow and pig: faceted bodies and heads. Beach palms, cliff pebbles, grass tufts and
  flowers (`FarmDiorama.tsx`) follow the same style. Bubble icons (`BubbleIcons.tsx`): a cut water
  drop, a faceted apple, a chunky bolt and a cut sparkle replace the 💧 / 🍎 / ✨ emoji in the tree
  bubbles and the ⚡ on the Daily Rush button; the bubbles' shapes, positions and animations are
  unchanged.
- **Low-poly terrain** (no ink outlines anywhere on the island; this supersedes the outlined stream,
  cliff and beach wording below):
  - Streams (`StreamNetwork`): a channel cut into the turf. A bevelled bank (sunlit rim `#e3d3a4`
    over `#b9a472`), the far wall of the cut, deep azure `#2b90b8` along the edges and a turquoise
    `#4ecdc4` surface sunk 2.4 px below the bank, with slanted planes of light and drifting foam
    chips. Auto-tiling geometry (`lib/streamTiles.ts`) and the ×1.2 buff are unchanged.
  - Cliff (`CliffFacets` in `FarmDiorama.tsx`): each stratum of both front faces is cut into 14
    pairs of triangles whose corners zigzag between strata; warm slate greys on the lit left face,
    cool charcoal browns on the shaded right; the keel is four flat planes.
  - Beach (`BeachFacets`): golden sand, `#e0b850` at the waterline and `#f4d06f` inland, eight
    facets a side, meeting the water at a white foam rim. The grass has a two-tone bevel on its
    front edges.
  - Geometry (`lib/diorama.ts`) is unchanged; the distant islets follow the same palette.
- **Day / night light** (`garden/lib/dayNight.ts`, tested; `hooks/useDayNight.ts`; CSS at the end of
  `globals.css`):
  - **When**: day from 06:00 up to 18:00 by the player's local clock, night otherwise; checked once
    a minute and when the tab comes back. A small button above the labels toggle steps through
    follow the clock → always day → always night, remembered in `localStorage`
    (`mindgarden:lighting`).
  - **No flash of daylight at night**: the server has no clock and renders daylight markup, so the
    root layout inlines a tiny script (`shared/lib/lightingBoot.ts` `LIGHTING_BOOT_SCRIPT`) that runs
    before the first paint and marks `<html data-mg-light="day|night">` from the pinned choice or the
    local hour. Every night rule in `globals.css` also matches a farm under that mark until the farm
    is hydrated; a live farm carries `data-lighting` and answers to its own `mg-night` class only.
  - **How**: one class on the farm root (`mg-night`), so switching re-renders no tree or tile.
    Colour variables and opacity cross-fades (900 ms) only: no filters, no keyframes.
  - **Day**: the sun's glow from the upper left, a warm pool of light across the turf fading to the
    lower right (`mg-sun-pool`), soft contact shadows `rgba(20, 40, 15, 0.35)`.
  - **Night**: a darker sea, a navy veil over the island under the labels layer (`mg-night-veil`), a
    vignette to `rgba(10, 20, 45, 0.35)` and a pale moon glow in screen space (`mg-moonlight`), a
    silver pool on the turf (`mg-moon-pool`), contact shadows `rgba(6, 12, 28, 0.58)`, silver-cyan
    chips on the crowns and sheens on streams, swell and foam, lamplight round the Farmer's House
    windows and door, a steady halo behind the surreal trees, and a ring of pale light round the
    floating bubbles (which sit above the veil, so they stay bright).
  - Shadows everywhere take their colour from `--mg-shadow-rgb` / `--mg-shadow-a` (`mg-contact`,
    `mg-contact-soft`, `mg-tree-contact`, `mg-tree-cast`); outside the farm they keep the day values.
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
  - Trees: stand in a small ring of tilled soil hugging the trunk base (`TreePlots`, `ROOT_RING`
    27 × 12.5 px on a 112 × 56 tile), centred on the tile: a soft contact shadow, a sunlit rim, an
    inner edge and the soil, with no outline. The square full-tile bed with furrows is gone, so the
    grass checkerboard shows right up to the trunk. The tree and its bees stay anchored on the tile
    centre; the tap target (the tile area round the base) is unchanged. The sprite's own mound
    (cards, dialogs) is the same compact ring.
- **Placement feedback**: the item floats over a free footprint with a glowing green outline, or throbs
  comic red with "✖ Blocked!". Placing a stream or Farmer's House previews its aura and pulses in the
  "+20% 🪙" / "+50% 🪙" tags it would add. Placed buffs show as floating glossy tags over each tree.
- **Player stats in the site header** (every page, signed in; `progress` `StreakBadge`, `CoinsBadge`,
  next to the gardener badge): only a 🔥 / 🌱 streak pill (count only, links to the profile; its tooltip
  names the next 🪙 bonus) and a 🪙 coins pill (opens the Coin Shop). The root layout loads them with
  `getFarmHud` (one load per request, shared with the page through React `cache`; read-only). Both
  update live from actions. On phones the wordmark hides (the 🌳 stays); "Plant a Tree" shows from `md`
  up.
- **No level / XP system**: the gardener level, its titles and the XP bar were removed everywhere
  (header, profile card, farm; `lib/gardenerLevel.ts`, `LevelCrest`). Progress is shown by mastery,
  the streak and coins.
- **Farm HUD**: the island's Garden Name on a wooden banner with gold trim and pills for the active
  buffs (how many trees each boosts, Woodshop refund on), centred at the top. The streak / coin pods
  are in the header, not on the farm; signed out, a "Sign in to start
  farming" button sits under the banner. The dock's 🏪 Shop is a hero orb that hops, with a gloss sheen and a red "SHOP" label.
- **Game kit** (`shared/components/game`, every screen): `GameButton` has deeper bottom borders and
  bold white labels with a thick dark outline; dock captions are outlined too.
- **Shop** (`FarmShopModal`): a wooden frame with a coin purse chip and chunky tabs. Items are trading
  cards with a coloured header, a gold coin price badge, the real sprite on a 3D grass pedestal, a perk
  tag, the size, and a green "Buy & Place". Unplanted trees get the same card with a soil pedestal.
- **Motion**: `.mg-cloud`, `.mg-drift`, `.mg-swell`, `.mg-islet`, `.mg-bubble`, `.mg-squash`, `.mg-float`,
  `.mg-throb`, `.mg-hop`, `.mg-sheen`, `.mg-sway` in `globals.css`, transform / opacity only. All of them
  are off for `prefers-reduced-motion`.
- **Responsive**: the camera still drags / pinches / zooms; on phones the island banner and buff pills
  wrap, and Shop cards stack in one column.

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
- **Chop, without the wait**: 🪓 Chop used to call `deleteDeck`, which revalidated three paths and redirected
  to `/?refund=N`, rebuilding the whole home page. On the farm it now calls `chopDeck` (same uproot and
  Woodshop refund, answers `{ id, refund, totalCoins }`, no redirect or revalidate): the tree vanishes in a
  puff of dust, leaves and wood chips the moment you confirm, the refund is credited locally (same rule as
  the database), and a refusal puts the tree back with a toast. The dev Coin Shop no longer revalidates
  `/` either.
- **Water and the popovers**: 💧 Water is a link to the drill (a practice round waters the tree, and the
  farm reads it fresh on return); the drill route has a `loading.tsx`, so the tap answers at once. There
  is no harvest action. Opening or closing a tree / item popover re-renders only the view's small parts,
  never the memoized grid (its props are stable; a test pins the memos). Tree and item taps stop at their
  button, and the popovers render in a portal outside the camera's element, so their clicks never pan the
  camera or reach the grid's tile-picking handler.
- **Deck page edits, also instant**: changing a tree's species in the Tree Workshop and adding statements
  (the Workshop list, the mindmap's ⚙️ Manage dialog, the bulk importer) used to wait on `router.refresh()`
  (and `createKnowledgeItems` also revalidated the page), re-rendering the whole deck page on the server.
  Now `DeckScene` is a client component holding a deck draft (`decks/lib/draft.ts`, tested): the new
  species or statements show at once across the page (tree sprite, species ribbon, Roots / Statements
  counts, size tier, mindmap, lists), the input clears, and `updateDeck` / `createKnowledgeItem(s)` run in
  the background. Confirmed statements take their real ids and drillable flags (✅ / 💧); until then they
  show ⏳ and can't be edited or deleted. A refusal rolls back: the old species with a toast, or the
  statement text back in its input (the importer reopens with the notes). The farm isn't mounted on the
  deck page, so nothing re-renders it; the next visit to `/` loads the new species fresh.
- **Deleting, also instant**: deleting a statement (Workshop list, the mindmap's drawer and ⚙️ Manage
  dialog) used to wait on `deleteKnowledgeItem` (which revalidated the deck page) and `router.refresh()`.
  Now the confirmation closes at once and the deck draft's `removeItem` op takes the statement out of the
  lists, the mindmap and the counts immediately; the delete runs in the background, and a refusal puts it
  back with a toast. Deleting a whole tree from the deck page's Danger Zone used `deleteDeck`, which
  revalidated `/`, `/deck/<slug>` and `/profile` and redirected on the server (rendering the home page
  inside the action). It now shows "Uprooting…" at once, awaits `chopDeck` (one RPC, no revalidations),
  and `router.replace`s to the farm, whose loading screen appears straight away; `deleteDeck` is gone.
  Root-branch deletes still wait for the server and refresh (they reshape the tree).
- **Roots and edits in the Workshop, also instant**: the Workshop's "Add a root" form waited on
  `createMindmapNode` and `router.refresh()`, and statement edits waited on `updateKnowledgeItem`, which
  revalidated the deck page. Now the deck draft has `addNode` / `renameNode` / `editItem` ops
  (`decks/lib/draft.ts`, tested): a root shows at 0 ms with a temp id and `confirmNode` moves everything
  typed under it onto its real id; an edited statement shows at once and takes the server's cleaned text
  and drillable flag (`confirmEdit`). `updateKnowledgeItem` no longer revalidates (its dialog refreshes
  itself). When another edit refreshes the page, settled ops drop and ops still in flight carry over onto
  the fresh data (`rebaseOps`), so nothing typed blinks out. The mindmap canvas's own dialogs
  (`AddRootDialog`, ⚙️ Manage) keep their original behaviour.
- **Opening a tree, faster** (farm → `/deck/[slug]`):
  - **Server, no waterfall**: the page ran four stages one after another (deck → progress + user →
    editor / reader + purse + boards → owner name), and up to five actions each made their own
    `supabase.auth.getUser()` round trip to Supabase Auth. Now it is two stages: the deck alongside the
    viewer, then every other read at once; the verified user is fetched once per request
    (`shared/lib/supabase/requestUser.ts` `getRequestUser`, React `cache`, request-scoped) and shared by
    `getCurrentUser`, `getProgressByDecks`, `getDeckEditor`, `getDeckReader`, `getFarmHud`,
    `getTournamentBoards`. `findDeckBySlug` loads the deck with its roots and statements embedded in one
    query (it was two, one after the other).
  - **Instant skeleton**: `app/deck/[slug]/loading.tsx` is shaped like the page (header, growth, stat
    slabs, the wooden-framed canvas with a tree and roots, the Workshop) and is server-only markup.
  - **Prefetch on intent**: hovering, focusing or touching a farm tree prefetches its page and its drill
    (`shared/hooks/usePrefetchOnIntent`: code + the loading shell, production only), so a popover link
    opens the skeleton at once. Not `prefetch={true}`: without Cache Components that renders the whole
    page and caches it for 5 minutes, and since deck edits are optimistic and never revalidate, a
    revisit could show statements from before your edits. The data is always fresh instead.
  - **Code splitting**: the mindmap canvas (`DeckRootsPanel`) and the Tree Workshop (`DeckWorkshop`, with
    decks' lazy `DeckEditor`) are `next/dynamic` chunks (still server-rendered; the canvas keeps a
    same-size frame while it loads). The deck page's own entry JS went from 651 to 617 KB raw (173 → 164 KB
    gzipped); most of the rest is the shared framework chunk.
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
| 15 | `20261003000000_tree_fruit.sql` | `deck_practice_days`, `tree_harvests`, `harvest_tree_fruit()` (service role: +2 🪙 once per tree per day after practice the day before) |
| 16 | `20261004000000_streak_rewards.sql` | `streak_rewards` ledger, `award_streak_reward()` (service role: streak milestone coins at 7, 30 and every 100 days, once per day) |
| 17 | `20261005000000_surreal_tree_species.sql` | `decks_tree_type_check` widened to thirteen ids (adds `crystal_flora`, `cosmic_nebula`, `chrono_willow`). Run **before or with** deploying the code |
| 18 | `20261006000000_species_seed_prices.sql` | `seed_price()` (180 for the three surreal ids, else 100); `plant_deck()` and `clone_deck()` charge by species; trigger `decks_charge_species_upgrade` charges the difference when a tree changes to a pricier species. Run **with** the deploy |
| 19 | `20261007000000_drop_unused_progress_columns.sql` | Drops `user_progress.mistake_count`, `users.streak_count`, `users.last_active_at` (written per answer, read by nothing). Destructive, optional; run only **after** the deploy |
| 20 | `20261008000000_daily_rush.sql` | `daily_rush_runs`, `start_daily_rush()`, `answer_daily_rush()`, `settle_daily_rush()` (service role: one Daily Rush a day, database-timed answers, coins = streak) |
| 21 | `20261009000000_special_tree_coin_bonus.sql` | `species_coin_multiplier()` (1.5 for a species priced at 180, else 1); `award_mastery_coin()` pays 1 × farm buff × species bonus. Run **with or after** the deploy |
| 30 | `20261019000000_clone_rewards.sql` | Clone gate (50 statements), +50 🪙 creator reward, `plant_clones`, `notifications`. With the deploy |
| 29 | `20261018000000_road_logistics.sql` | Roads replace the railway: tracks become roads, trains are refunded 30 🪙, candy exports over a road link. With the deploy |
| 28 | `20261017000000_unified_windmill.sql` | One Windmill: 60 🪙, a 10×10 field; Grand Windmills become Windmills; `windmill_large` retired. With the deploy |
| 27 | `20261016000000_grand_windmill.sql` | The Large Windmill becomes the 2×2 Grand Windmill (power reach 2: a 6×6 zone); standing ones shrink. With the deploy |
| 26 | `20261015000000_rail_logistics.sql` | New prices; Candy Factory, Railroad Track (1 🪙), Freight Train (on tracks only); fruit and candy inventory; harvests give 🍎 instead of 🪙; candy exported by train for 15 🪙 a box. Run **with** the deploy |
| 25 | `20261014000000_power_grid.sql` | Footprints up to 6; windmills, Furniture Factory, coastal Seaport; Farmer's House / Woodshop retired (ITEM_RETIRED); `farm_economy` + `settle_farm_economy()` (server-side production and cargo-ship payouts). Any time after 12 and 14, before or with the deploy |
| 24 | `20261013000100_drop_legacy_trees.sql` | Drops `legacy_mindmap_nodes` / `legacy_knowledge_items`. Destructive, optional; only once 23 works |
| 23 | `20261013000000_content_nodes.sql` | `content_nodes` (roots + statements, ids kept) replaces `mindmap_nodes` + `knowledge_items` (renamed `legacy_*`); shape trigger, RLS, column grants; progress FKs repointed; coin / uproot / clone / tournament functions re-created on it; `indent_content_node()`. Run **with** the deploy, after 22; not re-runnable; never re-run 12, 18, 21 or 22 after it |
| 22 | `20261010000000_sub_statements.sql` | `knowledge_items.parent_item_id` (sub-statements: composite FK to a statement of the same root, ON UPDATE / DELETE CASCADE, one level by trigger), `sort_order` (backfilled from `created_at`), their column grants; `clone_deck()` copies both. Run **before or with** the deploy; never re-run 18 after it |

Migration 12 must be applied with the farm deploy: without it the farm shows no placed trees and chopping
falls back to a plain delete with no refund. The Supabase CLI project (`supabase/config.toml`) is not set up
yet; migrations are applied in the hosted SQL Editor.

## Recent commits

Newest first. Add one line per commit. A commit can't know its own hash: log it as `(pending)`, and the
next commit replaces that with the real hash.

| Commit | Summary |
|--------|---------|
| (pending) | feat(garden): implement tree clone creator reward and 50-statement threshold (migration 30: gate, +50 🪙 creator reward, `plant_clones`; new `notifications` feature with layout toasts) |
| 9467a9b | feat(garden): add continuous placement mode for roads, water, and fences (`lib/buildMode.ts`; Esc / Done / sea click / hidden tab exit; stops when coins run out) |
| 403e28d | feat(garden): replace railway with modular roads and delivery trucks (migration 29) (`lib/roads.ts`, `RoadSprites`, truck sprite, migration 29: tracks → roads, trains refunded, candy over roads) |
| a298c40 | feat(garden): unify windmill into a single structure powering 10x10 area at 60 coins (migration 28): Grand Windmill removed from catalogue, Shop, types and drawings; standing ones converted (migration 28) |
| 1cd6af1 | feat(garden): integrate 3D low-poly Seaport and animated Cargo Ship loop (`SeaportImage`, `seaportFit`, `CargoShip`; prep script `flip`, `water`, `maxWidth`) with the ship's arrive / dock / depart loop (`.mg-dock`, `.mg-float`) |
| 68a97fa | feat(garden): add powered SVG overlay animations for Candy Factory and Furniture Factory: chimney / pipe smoke, rolling candies (`.mg-roll`), sawdust sparks; windmill rotor built, off while the render has painted sails (`WINDMILL_RENDER.bakedSails`); candy sprite without painted smoke |
| c186840 | feat(garden): integrate optimized 3D low-poly WebP sprites for Small Windmill and factories (`BuildingImage`, WebP made by `npm run sprites` from `raw-assets/structures/*.png`, anchored on the 2×2 footprint, unpowered factories muted). Also carries: vivid casual-game look for island buildings: saturated lighting with warm highlights and indigo shadows (`vivid`, `lit`), bevel highlights, footprint shadows, new props and details (planters, lanterns, brass cogs, striped sails, sawdust sparks, gumdrops, ripples, ship wake, ribboned candy crates) |
| fb5953c | feat(garden): restyle island buildings into 3D low-poly faceted aesthetic and resize Grand Windmill to 2x2 (migration 27). Also carries: power grid with windmills, Furniture Factory and coastal Seaport, Farmer's House and Woodshop retired (migration 25); fruit harvests, Candy Factory, Railroad Track (1 🪙) and Freight Train, candy exported by train for 15 🪙 a box (migration 26) |
| `dc04f9e` | feat(garden): auto-glide and focus camera on planted trees upon initial load. Also carries: buy a seed in the Shop → place it (open tiles glow) → name it → its Workshop opens on the first root; ✏️ rename trees inline (`renameDeck`); only 💧 / 🍎 icons over trees, resting on each species' crown tip; perf (Workshop rows memoized, farm dialogs lazy after idle, island animations paused when hidden or behind a dialog; happy-dom); a wider Tree Workshop column |
| `bf7a8e6` | feat(decks): unified `content_nodes` (roots + statements in one hierarchy, `node_type`), practice = every statement node, Enter / Tab / Shift+Tab / Alt in place on one outline (`lib/contentTree.ts` + `indent_content_node()`), compact "⌨️ Shortcuts" panel; tree connector lines (│ through-lines, ├ / └ elbows, stems) in the Workshop outline; migrations 23–24 |
| `15ab043` | feat(decks): sub-statements (drilled like statements), Notion-like Enter / Shift+Enter editing, 📂 move statements between roots, edit / discard lines in the bulk preview; migration 22 |
| `5f85bcd` | feat(progress): special trees (180 🪙 species) pay ×1.5 mastery coins; "⭐ 1.5x Coins" tags; migration 21. The same commit also carries the "Tree & roots" hierarchy canvas row below |
| (pending) | feat(mindmap): "Tree & roots" as a zoomable, pannable hierarchy canvas: the tree, every tier of roots as compact cards, curving tendrils, statements in the side drawer only, a transform-based camera (50%–180%); the tree stands free (no box) with a floating label, and the roots sprout from its trunk through a taproot |
| (pending) | feat(garden): Cosmic Nebula redrawn as a low-poly galaxy mushroom with faceted planets in orbit (0 / 1 / 2 / 4 / 6 by stage); tree sway and crown motion about a sixth stronger, wider orbits, brighter stem cracks |
| (pending) | feat(garden): day / night lighting on the farm (local clock or a pinned light): sun and moon pools, night veil and vignette, tinted shadows, lamplight and glows; decided before the first paint (no flash of daylight at night); fresher low-contrast turf (`#82cb52` / `#74bb47`) |
| (pending) | feat(garden): low-poly farm props (house, woodshop, rockery, fence, cow, pig, palms, flowers), faceted bubble icons, and borderless faceted streams, cliff and beach |
| (pending) | style(garden): light meadow-green turf (`#7dc24e` / `#65a63d`), a compact sandy-clay soil ring under each tree in place of the square bed, stone-and-slate island foundation, soft contact shadows |
| (pending) | feat(garden): low-poly, lush sprites for all 13 species × 5 stages (faceted crowns 20–35% bigger, prism trunks, cut-solid fruit, contact shadows); wider tree view box and farm anchors |
| `1cb8a8d` | feat(rush): Daily Rush, one sudden-death run a day (8 s a card, coins = streak), server-graded and database-timed |
| `f12a3ee` | refactor(progress): practice stores progress only; stop writing the unused mistake tally and streak mirror, migration to drop them |
| `8b9bccf` | feat(garden): toggle to show all tree labels or only the hovered / tapped tree's, remembered in localStorage |
| `e7ba90b` | feat(garden): three surreal tree species (Crystal Flora, Cosmic Nebula, Chrono Willow) with their own light effects, in prismatic / rainbow palettes. The same commit also carries: surreal seeds cost 180 🪙; price tags on every seed card; cloning and Workshop species changes priced by species |
| `a896a62` | feat(streak): streak milestone coins (7, 30, every 100 days) on the day's first watering; level / XP system removed. The same commit also carries: coins and streak pills in the site header; the compact tree popover (no Edit, no Store); the Tree Workshop layout (editor first, settings bar, inline Add root); the distant karst islands |
| `eb884e1` | feat(auth): Google 1-click sign-in in the login dialog |
| `12f6cb3` | feat(garden): withering after 72 h, evergreen trees from stage 4, and daily tree fruit (+2 🪙) |
| `3e31e55` | feat(garden): hold-and-drag every tree and item on the island; streams get a click target |
| `956ef3d` | fix(drill): 1–4 / A–D shortcuts for four choices, auto-advance after a right answer, tap to skip |
| `88dc2e7` | feat(drill): zero-drop question engine: inherited context, key–value recall, cloze, recognition, fallbacks |
| `eed0080` | perf(decks): faster tree opening: two-stage deck page, one auth call per request, prefetch on intent, matching skeleton, lazy canvas and workshop |
| `b9195ed` | style(decks): statement rows start with their text; status moves to a trailing badge |
| `89e737f` | feat(decks): collapse / expand roots and sub-roots in the Tree Workshop outline |
| `7d77fdb` | feat(decks): inline outline editor in the Tree Workshop; mindmap canvas restored |
| `92092dd` | feat(mindmap): fast-entry authoring on the canvas, root switcher and a compact layout (canvas part reverted by the next commit) |
| `91af687` | perf(decks): instant statement deletes and a lighter tree uproot |
| `44d3381` | perf(decks): optimistic species changes and statement adds on the deck page |
| `5ce4ce4` | perf(garden): optimistic chop with refund credit, no page re-renders from farm actions |
| `cf89bf0` | perf(garden): optimistic farm edits, memoized grid and filter-free shadows |
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

- `npm test`: 104 files, 1026 tests passing (DOM tests use happy-dom: `// @vitest-environment happy-dom` per file) (`testTimeout` 20 s). `npx tsc --noEmit`, `npm run lint` and `npm run build` clean.
- Every migration applies in order on PGlite (`src/test/pglite.ts`): `decks/__tests__/contentNodesMigration.test.ts` builds a tree
  in the old schema and checks migration 23 row by row; `indentContentNodeDb.test.ts` checks `indent_content_node()`. PGlite
  does not exercise RLS or column grants.

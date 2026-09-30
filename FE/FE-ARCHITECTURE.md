# Frontend Architecture

> **Read when**: building the garden, tree, root mindmap, or drill overlay; adding a route or UI feature.
> **Related**: [PROJECT-RULES.md](./FE-PROJECT-RULE.md) · [API_SPEC.md](../01.share-docx/API%20SPEC.md) · [backend/ARCHITECTURE.md](../BE/BE-ARCHITECTURE.md)

## 1. Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js App Router | Routes `/`, `/deck/[slug]`, `/deck/[slug]/drill`; Server Components load data |
| React 19 | Client UI, `useTransition` for Server Action calls |
| TypeScript (strict) | Typed props, view models, action contracts |
| Server Actions | Data contract (API_SPEC.md): `getDecks`, `getDeckBySlug`, `getProgressByDecks`, `getDrillQuestion`, `submitDrillResult` |
| Tailwind CSS | Cascade / split layout, gold & amber feedback, stage transitions |
| shadcn/ui (Radix) | Dialog (drill overlay, login), Button, Card, Skeleton, Alert, Toast in `src/shared/components/ui/` |
| Inline SVG (React) | Tree stages (surface) and root paths (subsurface); no chart/graph library |
| canvas-confetti | Mastery 3 and stage 4 celebrations, `disableForReducedMotion` |
| `@supabase/ssr` | OAuth sign-in, used only by `auth` |
| Vitest + React Testing Library | Tests by priority (PROJECT-RULES.md §11) |

---

## 2. Overview

- **Concept**: a growth-based ecosystem. Each deck is one scene split at the "ground line":
  - **Surface**: SVG tree growing through 5 stages from the deck's `masteryPercent`, drawn per species (`shared/lib/treeSkins.ts`)
  - **Subsurface**: the mindmap (`mindmap_nodes`) drawn as interactive SVG root paths
- **Layout**: vertical cascade on mobile (tree above, roots below); split screen from `lg:` up

```
deck/[slug]/page.tsx (Server Component: getDeckBySlug + getProgressByDecks)
  └── DeckScene (route-level composition)
        ├── DeckHeader             title · stage badge 🌱🌿🪴🌳✨
        ├── TreeCanvas  (garden)   SVG stage 1–4                    ◄── SURFACE
        ├── ─────────────── ground line ───────────────
        └── RootMap     (mindmap)  crown → category pills → statement cards                   ◄── SUBSURFACE
              └── RootNode × n     opacity = node mastery
                    │ click
                    ▼
     launch pop-up (5 / 10 / 20) ──► /deck/[slug]/drill?rootId=<id>&limit=10 ──► DrillOverlay (drill)
```

---

## 3. Folder Structure

```
src/
├── app/
│   ├── layout.tsx                  # StreakProvider, LoginDialogProvider, ToastProvider, ProfileButton
│   ├── _components/FarmWorld.tsx   # Composes garden's FarmIslandView + decks' DeleteDeckDialog (owner 🗑)
│   ├── page.tsx                    # Garden Overview: grid of trees (getDecks + getProgressByDecks)
│   └── deck/[slug]/
│       ├── page.tsx                # Single tree + root explorer
│       ├── _components/DeckScene.tsx   # Composes garden + mindmap (route-private)
│       ├── drill/page.tsx          # Focused drill overlay, reads ?rootId=<id> (or ?nodeId=) and ?limit=
│       └── tournament/page.tsx     # Mind Tournament round (DrillOverlay in tournament mode) for visitors
├── shared/
│   ├── components/game/            # Game design system (see §4a): GameButton, GamePanel, GameDialog, GameTabs, GameProgressBar, HUD pieces
│   ├── components/ui/              # shadcn/ui primitives (Sheet, Skeleton…); game screens use components/game instead
│   ├── hooks/                      # useReducedMotion, useMediaQuery
│   └── stores/                     # StreakProvider, LoginDialogProvider, ToastProvider (React Context; game-styled toasts that survive navigation)
└── features/
    ├── garden/                     # Surface: tree canvas & stage calculations
    │   ├── components/             # FarmIslandView (+ FarmHud with FarmDock, FarmPlotDialog), GardenGrid, TreeCard, TreeStageSvg
    │   ├── hooks/                  # useTreeStage (getTreeStage)
    │   └── types/                  # TreeStage, DeckCardView
    ├── mindmap/                    # Subsurface: SVG root rendering
    │   ├── components/             # RootMap, MindmapCards (NodePill, StatementCard), MasteryRing
    │   ├── hooks/                  # mindmapLayout (pure, tested), nodeMastery(), scene geometry
    │   └── types/                  # RootNodeView, RootLayout
    ├── drill/                      # 2–3 choice cards & feedback (+ getDrillQuestion on the server)
    │   ├── components/             # DrillOverlay, DrillCard, ChoiceButton, WateringScene, MutationHighlight
    │   ├── hooks/                  # useDrillSession
    │   └── types/                  # DrillState, DrillChoiceView
    ├── auth/                       # Login dialog & profile button
    │   └── components/             # LoginDialog, ProfileButton
    ├── decks/ · progress/          # Server-only features that provide the actions (backend/ARCHITECTURE.md)
    └── */index.ts                  # Public exports of every feature
```

---

## 4. Feature Boundaries

| Feature | Responsible for | Owns (components / hooks) | Does NOT | Input | Output / talks to |
|---------|-----------------|---------------------------|----------|-------|-------------------|
| `garden` | Farm World (default `/`): 16 × 16 isometric grid, 🏪 Shop, placement mode; classic grid (`/?view=grid`); single tree, stage math | `FarmIslandView`, `FarmIsometricGrid`, `FarmShopModal`, `GardenGrid`, `TreeCard`, `useTreeStage` | Know about roots or drill | Trees (decks + progress) and placements from the page | Its own farm actions (`placeFarmItem`, `removeFarmPlacement`); deck pages via links |
| `mindmap` | Mindmap layout (crown → categories → statements), collapse, 🔍 inspector drawer, owner ✏️ hooks (wired to decks in `app/`) | `RootMap`, `NodePill`, `StatementCard`, `layoutMindmap` | Load questions, compute tree stage | `tree` + item levels props | URL: `router.push('/deck/[slug]/drill?nodeId=id')` |
| `drill` | Question, 2–3 choices, feedback, confetti | `DrillOverlay`, `DrillCard`, `ChoiceButton`, `MutationHighlight`, `useDrillSession` | Draw trees/roots, render login UI | `slug` + `?nodeId=` | `getDrillQuestion`, `submitDrillResult`, `StreakProvider`, `LoginDialogProvider`, `router.refresh()` |
| `auth` | Sign-in and profile entry points | `LoginDialog`, `ProfileButton` | Touch deck or progress data | Server user (layout) | Supabase OAuth → `/auth/callback` |
| `tournament` | Mind Tournament boards on `/deck/[slug]` (📜 Hall of Fame, 🌱 Active Learners) and the live badge | `TournamentBoard`, `TournamentLiveBadge` | Draw rounds (drill does, in `mode: 'tournament'`) | Boards + the viewer's standing from `getTournamentBoards` | Owner switch lives in decks (`TournamentHostToggle`); "⚔️ Join Mind Tournament" links to `/deck/[slug]/tournament` |
| `user-profile` | Gardener's Trophy & Record Hall on `/profile` | `GardenerCard`, `GardenStatsGrid`, `MightyShowcase`, `PlantedTreeList` | Call actions or query tables | View models from the page (`auth` user, `progress.getGardenStats`, tree pictures from `garden`) | Links to `/deck/[slug]`, `/deck/[slug]/drill`, `/deck/new` |

- **Composition**: only `app/**` (pages, `_components/`) combines features
- **No feature-to-feature UI imports**: `mindmap` → `drill` via URL; `drill` opens login through `LoginDialogProvider`

### 4a. Art direction & game design system (`shared/components/game`)

A casual game running as a web app, not a web app with gamification bolted on. Premium, colourful but controlled, with physical depth. No flat SaaS cards, no 1px grey borders, no neon or casino clutter.

| Piece | Use it for |
|-------|-----------|
| `GameButton` (`tone`: leaf, sun, sky, wood, clay, cream; `asChild`) | Every action. 3D bevel lip (`shadow-[0_4px_0_…]`) that sinks on press, gloss, bouncy hover |
| `GamePanel` (`tone`: parchment, wood, stone, leaf, sky, gold; `title` → `Ribbon` plaque), `GameSlab`, `Ribbon` | Containers, rows, tiles, badges |
| `GameDialog` + `GameDialogContent` (`title`, `description`, `tone`, `ribbon`, `size`) | Every popup (replaces shadcn `Dialog` in features) |
| `GameTabs*` | Wooden drawer tabs inside dialogs |
| `GameInput`, `GameTextarea`, `GameLabel`, `GAME_FIELD` | Form fields (recessed wells) |
| `GameProgressBar` (`segments`, `caption`) | Capsule gauges: XP, growth, round progress, mastery 0–5 (5 notches) |
| `LevelCrest`, `ResourcePill`, `ActionDock` + `DockOrb` + `DOCK_BUTTON` | Floating HUD (top-left crest, top-right 🔥 🪙 💎, bottom-centre dock) |
| `KeyChip`, `ParticleBurst` | Hotkey caps, level-up bursts |
| `HoverActions` + `HoverActionButton`, `HOVER_REVEAL` | Owner tools (✏️ Edit, 🗑️ Delete…) that stay hidden until their `group` (card, pill, row) is hovered or keyboard-focused; always visible on touch screens (`@media (hover: none)`) |

- Display font: Baloo 2 (`font-game`, Vietnamese subset); body stays Geist.
- Motion: `mg-*` keyframes in `app/globals.css` (`mg-spring`, `mg-land`, `mg-wobble`, `mg-shimmer`, `mg-pour`, `mg-stream`, `mg-burst`), all off under `prefers-reduced-motion`.
- Feedback keeps hard rule 10: correct = gold, wrong = amber (soft wobble, never a shake, heart or timer).
- Pure helpers `gaugePercent`, `notchOffsets`, `burstParticles` are unit-tested (`shared/components/game/__tests__`).

---

## 5. Visual Growth Mapping

`masteryPercent` comes from `getProgressByDecks` (Σ mastery_level / (5 × item count) × 100; the scale lives in `shared/lib/mastery.ts`, `MAX_MASTERY = 5`)

| Stage | Range | Name | Visual | SVG notes |
|-------|-------|------|--------|-----------|
| 1 | 0–20% | Sprout | 🌱 | Plump seedling with its seed cap / cotyledons in the species' colours (pine: a needle tuft, palm: a sprouting coconut, cactus: a round bud) |
| 2 | 21–40% | Young Sapling | 🌿 | Thick stem with a mini species crown |
| 3 | 41–65% | Growing Tree | 🪴 | The species' recognisable silhouette; bees start buzzing |
| 4 | 66–89% | Mature Canopy | 🌳 | Full crown with depth layers (acorns, cones, blossoms, oranges, coconuts, cactus flowers) |
| 5 | 90–100% | Golden Ancient Bloom | 🌟 | The mature crown with a gold rim round its silhouette, golden aura, sparkles and the species' finest accents |

**Species** (`decks.tree_type`, catalog in `shared/lib/treeSkins.ts`, each with its own drawing in `garden/components/TreeStageSvg.tsx`, 10 × 5 = 50 sprites): 🌳 oak · 🌲 pine · 🍂 birch · 🌸 cherry · 🌿 willow · 🔮 mystic · 🌴 palm · 🍊 citrus · 🍁 maple · 🌵 cactus. Retired ids (sakura, saguaro, apple, bamboo) render as cherry, cactus, citrus, palm (`LEGACY_TREE_TYPES`). Every drawing grows from the same trunk base (`TREE_BASE_RATIO`), so the deck scene's roots attach for all species. Gold "fully grown" accents use `GOLDEN_BLOOM_PERCENT` (90).

```ts
// features/garden/hooks/useTreeStage.ts
export const getTreeStage = (pct: number): TreeStage =>
  pct <= 20 ? 1 : pct <= 40 ? 2 : pct <= 65 ? 3 : pct < GOLDEN_BLOOM_PERCENT ? 4 : 5
```

- Stage change → cross-fade SVGs (`transition-opacity duration-700`); reaching stage 5 → one confetti burst
- **Farm World** (`garden/components/FarmIslandView.tsx`, geometry `garden/lib/farmLayout.ts`, camera `shared/lib/camera.ts` + `shared/hooks/useCamera.ts`, shared with the mindmap): the full-bleed home page (`/`) under the site header. An isometric farmstead on an island: plots 1.45 tiles apart on raised soil beds with border stones and contact shadows, cobblestone lanes (spanning tree from the dock + a lane to the farmhouse), a white picket fence along the front edge (open at the dock), lampposts, benches, straw bales, beehives beside flowering trees (sakura / apple from stage 3), flower patches and grass tufts (seeded). Scenery is pure SVG (`FarmScenery.tsx`); trees and landmarks are HTML buttons over it, stacked back-to-front
  - **Landmarks**: 🏡 farmhouse → `/profile` (sign-in dialog when signed out); 🚜 tractor → Daily Delivery dialog listing today's thirsty trees with a "Start delivery" into the first one's drill (no quest system yet)
  - **Per plot**: 💧 when signed in and not practised today (player's local day), ✨ at 100%, wooden nameplate; stage 4–5 trees drop leaves/petals, bees buzz round every tree from stage 3 (cacti when flowering) (max 12 animated trees); a one-time water splash + ripple the first time a watered tree is seen that day (per browser, `localStorage`)
  - **HUD** (corners): level + XP bar (top-left); 🔥 streak, 🪙 coins, 💎 gems (top-right); zoom − / % / + / fit (bottom-left); Farm/Grid toggle (bottom-centre); seed sack → `/deck/new` (bottom-right); island switcher + notices (top-centre, when needed). Coins = stored 🪙 gold (1 per statement mastered for the first time, `users.coins`; the drill updates it live through `CoinsProvider`), gems = Mighty Roots on the island. Coins buy tree seeds (100 🪙) and clones (min(100 + statements, 150) 🪙); the ➕ on the coin pill opens the Coin Shop
  - **Camera**: fits and centres on arrival; drag to pan with mouse or one finger (`touch-action: none`), two-finger pinch and Ctrl/⌘ + wheel (trackpad pinch) zoom around the fingers/cursor (35–180%); a drag > 6 px swallows the click that ends it so dragging over a plot never opens it
  - **Motion**: CSS-only `.mg-*` keyframes in `globals.css` (transform/opacity); all particles, bees and splashes are off under `prefers-reduced-motion`
- A plot opens a dialog: Water Tree (practice), Inspect Roots (mindmap), Edit (owner)
- **Gardener level** (`progress/lib/gardenerLevel.ts`): XP = 10 × Σ mastery levels over every practised item; level L → L + 1 costs 50 + 25 × (L − 1) XP
- **Root opacity**: `0.35 + 0.65 × (node mastery / 5)`, node mastery = average `masteryLevel` of its items; soft glow from two thirds (`STRONG_MASTERY`), gold at 5/5
- **Round size & launch pop-up**: every start on the deck page (Water Tree, Review, ⚔️ Join Mind Tournament, and Drill Root / Compete Root on any root) opens drill's `SessionLaunchModal`: mode + scope title, available questions, 5 / 10 (default) / 20 (remembered in localStorage + cookie `mindgarden_drill_size`), "Start Session". Watering and competing share one header and runner; the round header shows "Question 3 / 10"
- **Review mode**: normal rounds rest 5/5 items. "Review Mastered 🌿" / "Include Mastered Items (Review Mode)" links to the same round with `?review=1`: on the drill page (`ReviewModeToggle`), the deck header, the farm plot popup switch, the mindmap inspector, and the profile ("🌿 Review" for fully mastered trees). A round with nothing left shows "🌳 Fully Cultivated!" (`DRILL_ALL_MASTERED`)

---

## 6. Data Flow

```
RootNode clicked
  ▼
launch pop-up → router.push('/deck/[slug]/drill?rootId=<id>&limit=10')   sessionId = crypto.randomUUID() on overlay mount
  ▼
getDrillQuestion({ nodeId, sessionId })  ──► { itemId, prompt, seed, choices A · B · C }
  ▼
User selects a tag  ──► picked card: pending pulse
  ▼
submitDrillResult({ itemId, seed, tag })
  ├── AUTH_UNAUTHORIZED ──► open LoginDialog, keep the question on screen
  ▼
isCorrect?
  ├── yes ──► gold highlight (confetti once at the round summary if saved mastery rose)
  └── no  ──► amber highlight + MutationHighlight marks the changed words
  ▼
router.refresh() ──► page re-runs getProgressByDecks ──► tree stage + root opacity re-render
```

**Drill overlay states**
```
loading ──ok──► answering ──select──► checking ──ok──► feedback ──next──► loading
   │                                     │                 └──close──► back to /deck/[slug]
   └── NODE_NOT_FOUND / DRILL_NO_ITEMS ─►│ error
                                         └── AUTH_UNAUTHORIZED ──► needLogin ──dialog closed──► answering
```

- **Validation timing**: `correctTag` only arrives with `submitDrillResult` (API_SPEC.md), so feedback shows right after the action returns
- **Mutated word highlight**: `MutationHighlight` diffs the picked trap against the correct choice word-by-word (`bg-amber-200 rounded px-0.5`)
- **Re-render**: `router.refresh()` reloads Server Component props; no client cache to sync

---

## 7. Rendering Split

| Piece | Type | Why |
|-------|------|-----|
| `app/page.tsx`, `deck/[slug]/page.tsx` | Server Component | Data loading, SEO for public decks |
| `DeckScene`, `TreeCanvas`, `RootMap` | Client Component | Hover, click, transitions |
| `DrillOverlay` and children | Client Component | Session state, confetti |
| `LoginDialog`, `ProfileButton` | Client Component | OAuth redirect |
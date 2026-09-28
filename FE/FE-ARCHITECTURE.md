# Frontend Architecture

> **Read when**: building the garden, tree, root mindmap, or drill overlay; adding a route or UI feature.
> **Related**: [PROJECT-RULES.md](./PROJECT-RULES.md) · [../API_SPEC.md](../API_SPEC.md) · [../backend/ARCHITECTURE.md](../backend/ARCHITECTURE.md)

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
        └── RootMap     (mindmap)  SVG root paths                   ◄── SUBSURFACE
              └── RootNode × n     opacity = node mastery
                    │ click
                    ▼
              /deck/[slug]/drill?nodeId=<id> ──► DrillOverlay (drill)
```

---

## 3. Folder Structure

```
src/
├── app/
│   ├── layout.tsx                  # StreakProvider, LoginDialogProvider, Toaster, ProfileButton
│   ├── page.tsx                    # Garden Overview: grid of trees (getDecks + getProgressByDecks)
│   └── deck/[slug]/
│       ├── page.tsx                # Single tree + root explorer
│       ├── _components/DeckScene.tsx   # Composes garden + mindmap (route-private)
│       └── drill/page.tsx          # Focused drill overlay, reads ?nodeId=<id>
├── shared/
│   ├── components/ui/              # shadcn/ui: Button, Dialog, Card, Skeleton, Alert, Toast
│   ├── hooks/                      # useReducedMotion, useMediaQuery
│   └── stores/                     # StreakProvider, LoginDialogProvider (React Context)
└── features/
    ├── garden/                     # Surface: tree canvas & stage calculations
    │   ├── components/             # FarmIslandView (+ FarmHud, FarmPlotDialog), GardenGrid, TreeCard, TreeStageSvg
    │   ├── hooks/                  # useTreeStage (getTreeStage)
    │   └── types/                  # TreeStage, DeckCardView
    ├── mindmap/                    # Subsurface: SVG root rendering
    │   ├── components/             # RootMap, RootPath, RootNode
    │   ├── hooks/                  # useRootLayout (tree → x/y), nodeMastery()
    │   └── types/                  # RootNodeView, RootLayout
    ├── drill/                      # 2–3 choice cards & feedback (+ getDrillQuestion on the server)
    │   ├── components/             # DrillOverlay, DrillCard, ChoiceButton, MutationHighlight
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
| `garden` | Farm Island world map (default `/`), classic grid (`/?view=grid`), single tree, stage math | `GardenGrid`, `TreeCard`, `TreeCanvas`, `useTreeStage` | Call actions, know about roots or drill | Deck + `masteryPercent` props | Renders only |
| `mindmap` | Root layout, node interaction | `RootMap`, `RootPath`, `RootNode`, `useRootLayout` | Load questions, compute tree stage | `tree` + item levels props | URL: `router.push('/deck/[slug]/drill?nodeId=id')` |
| `drill` | Question, 2–3 choices, feedback, confetti | `DrillOverlay`, `DrillCard`, `ChoiceButton`, `MutationHighlight`, `useDrillSession` | Draw trees/roots, render login UI | `slug` + `?nodeId=` | `getDrillQuestion`, `submitDrillResult`, `StreakProvider`, `LoginDialogProvider`, `router.refresh()` |
| `auth` | Sign-in and profile entry points | `LoginDialog`, `ProfileButton` | Touch deck or progress data | Server user (layout) | Supabase OAuth → `/auth/callback` |
| `user-profile` | Gardener overview on `/profile` | `GardenerCard`, `GardenStatsGrid`, `PlantedTreeList` | Call actions or query tables | View models from the page (`auth` user, `progress.getGardenStats`, tree pictures from `garden`) | Links to `/deck/[slug]`, `/deck/[slug]/drill`, `/deck/new` |

- **Composition**: only `app/**` (pages, `_components/`) combines features
- **No feature-to-feature UI imports**: `mindmap` → `drill` via URL; `drill` opens login through `LoginDialogProvider`

---

## 5. Visual Growth Mapping

`masteryPercent` comes from `getProgressByDecks` (Σ mastery_level / (3 × item count) × 100)

| Stage | Range | Name | Visual | SVG notes |
|-------|-------|------|--------|-----------|
| 1 | 0–20% | Sprout | 🌱 | Tender shoot breaking the soil (cactus: a nub, bamboo: one shoot) |
| 2 | 21–40% | Young Sapling | 🌿 | Thin trunk with branching stems |
| 3 | 41–65% | Growing Tree | 🪴 | Distinct foliage volume |
| 4 | 66–89% | Mature Canopy | 🌳 | Full, textured canopy (apple: red fruit) |
| 5 | 90–100% | Golden Ancient Bloom | 🌟 | Golden aura + sparkles, blossoms / fruit / pine star / cactus flowers |

**Species** (`decks.tree_type`, catalog in `shared/lib/treeSkins.ts`, one silhouette family each): 🌳 oak, 🌸 sakura, 🍎 apple (broadleaf) · 🌲 pine (conifer) · 🎋 bamboo · 🌵 saguaro (cactus). Every drawing grows from the same trunk base (`TREE_BASE_RATIO`), so the deck scene's roots attach for all species. Gold "fully grown" accents use `GOLDEN_BLOOM_PERCENT` (90).

```ts
// features/garden/hooks/useTreeStage.ts
export const getTreeStage = (pct: number): TreeStage =>
  pct <= 20 ? 1 : pct <= 40 ? 2 : pct <= 65 ? 3 : pct < GOLDEN_BLOOM_PERCENT ? 4 : 5
```

- Stage change → cross-fade SVGs (`transition-opacity duration-700`); reaching stage 5 → one confetti burst
- **Farm World** (`garden/components/FarmIslandView.tsx`, geometry `garden/lib/farmLayout.ts`, camera `garden/lib/camera.ts` + `hooks/useFarmCamera.ts`): the full-bleed home page (`/`) under the site header. An isometric farmstead on an island: plots 1.45 tiles apart on raised soil beds with border stones and contact shadows, cobblestone lanes (spanning tree from the dock + a lane to the farmhouse), a white picket fence along the front edge (open at the dock), lampposts, benches, straw bales, beehives beside flowering trees (sakura / apple from stage 3), flower patches and grass tufts (seeded). Scenery is pure SVG (`FarmScenery.tsx`); trees and landmarks are HTML buttons over it, stacked back-to-front
  - **Landmarks**: 🏡 farmhouse → `/profile` (sign-in dialog when signed out); 🚜 tractor → Daily Delivery dialog listing today's thirsty trees with a "Start delivery" into the first one's drill (no quest system yet)
  - **Per plot**: 💧 when signed in and not practised today (player's local day), ✨ at 100%, wooden nameplate; stage 4–5 trees drop leaves/petals, apple & sakura get two orbiting bees (max 12 animated trees); a one-time water splash + ripple the first time a watered tree is seen that day (per browser, `localStorage`)
  - **HUD** (corners): level + XP bar (top-left); 🔥 streak, 🪙 coins, 💎 gems (top-right); zoom − / % / + / fit (bottom-left); Farm/Grid toggle (bottom-centre); seed sack → `/deck/new` (bottom-right); island switcher + notices (top-centre, when needed). Coins = 5 per mastery step, gems = Mighty Roots on the island: display only, nothing to spend
  - **Camera**: fits and centres on arrival; drag to pan with mouse or one finger (`touch-action: none`), two-finger pinch and Ctrl/⌘ + wheel (trackpad pinch) zoom around the fingers/cursor (35–180%); a drag > 6 px swallows the click that ends it so dragging over a plot never opens it
  - **Motion**: CSS-only `.mg-*` keyframes in `globals.css` (transform/opacity); all particles, bees and splashes are off under `prefers-reduced-motion`
- A plot opens a dialog: Water Tree (practice), Inspect Roots (mindmap), Edit (owner)
- **Gardener level** (`progress/lib/gardenerLevel.ts`): XP = 10 × Σ mastery levels over every practised item; level L → L + 1 costs 50 + 25 × (L − 1) XP
- **Root opacity**: `0.35 + 0.65 × (node mastery / 3)`, node mastery = average `masteryLevel` of its items

---

## 6. Data Flow

```
RootNode clicked
  ▼
router.push('/deck/[slug]/drill?nodeId=<id>')        sessionId = crypto.randomUUID() on overlay mount
  ▼
getDrillQuestion({ nodeId, sessionId })  ──► { itemId, prompt, seed, choices A · B · C }
  ▼
User selects a tag  ──► picked card: pending pulse
  ▼
submitDrillResult({ itemId, seed, tag })
  ├── AUTH_UNAUTHORIZED ──► open LoginDialog, keep the question on screen
  ▼
isCorrect?
  ├── yes ──► gold highlight (+ confetti if masteryLevel = 3)
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
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
  - **Surface**: SVG tree growing through 4 stages from the deck's `masteryPercent`
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
              /deck/[slug]/drill?node=<id> ──► DrillOverlay (drill)
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
│       └── drill/page.tsx          # Focused drill overlay, reads ?node=<id>
├── shared/
│   ├── components/ui/              # shadcn/ui: Button, Dialog, Card, Skeleton, Alert, Toast
│   ├── hooks/                      # useReducedMotion, useMediaQuery
│   └── stores/                     # StreakProvider, LoginDialogProvider (React Context)
└── features/
    ├── garden/                     # Surface: tree canvas & stage calculations
    │   ├── components/             # GardenGrid, TreeCard, TreeCanvas, TreeStageSvg
    │   ├── hooks/                  # useTreeStage (getTreeStage)
    │   └── types/                  # TreeStage, DeckCardView
    ├── mindmap/                    # Subsurface: SVG root rendering
    │   ├── components/             # RootMap, RootPath, RootNode
    │   ├── hooks/                  # useRootLayout (tree → x/y), nodeMastery()
    │   └── types/                  # RootNodeView, RootLayout
    ├── drill/                      # Trilateral choice cards & feedback (+ getDrillQuestion on the server)
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
| `garden` | Tree grid + single tree, stage math | `GardenGrid`, `TreeCard`, `TreeCanvas`, `useTreeStage` | Call actions, know about roots or drill | Deck + `masteryPercent` props | Renders only |
| `mindmap` | Root layout, node interaction | `RootMap`, `RootPath`, `RootNode`, `useRootLayout` | Load questions, compute tree stage | `tree` + item levels props | URL: `router.push('/deck/[slug]/drill?node=id')` |
| `drill` | Question, 3 choices, feedback, confetti | `DrillOverlay`, `DrillCard`, `ChoiceButton`, `MutationHighlight`, `useDrillSession` | Draw trees/roots, render login UI | `slug` + `?node=` | `getDrillQuestion`, `submitDrillResult`, `StreakProvider`, `LoginDialogProvider`, `router.refresh()` |
| `auth` | Sign-in and profile entry points | `LoginDialog`, `ProfileButton` | Touch deck or progress data | Server user (layout) | Supabase OAuth → `/auth/callback` |

- **Composition**: only `app/**` (pages, `_components/`) combines features
- **No feature-to-feature UI imports**: `mindmap` → `drill` via URL; `drill` opens login through `LoginDialogProvider`

---

## 5. Visual Growth Mapping

`masteryPercent` comes from `getProgressByDecks` (Σ mastery_level / (3 × item count) × 100)

| Stage | Range | Name | Visual | SVG notes |
|-------|-------|------|--------|-----------|
| 1 | 0–25% | Sprout | 🌱 | Two leaves, thin stem, no canopy |
| 2 | 26–50% | Sapling | 🌿 | Trunk + 3 branches, light-green canopy |
| 3 | 51–80% | Maturing Tree | 🪴 | Full trunk, layered canopy |
| 4 | 81–100% | Blooming Golden Tree | 🌳✨ | Gold canopy tint + sparkle particles |

```ts
// features/garden/hooks/useTreeStage.ts
export const getTreeStage = (pct: number): TreeStage => (pct <= 25 ? 1 : pct <= 50 ? 2 : pct <= 80 ? 3 : 4)
```

- Stage change → cross-fade SVGs (`transition-opacity duration-700`); reaching stage 4 → one confetti burst
- **Root opacity**: `0.35 + 0.65 × (node mastery / 3)`, node mastery = average `masteryLevel` of its items

---

## 6. Data Flow

```
RootNode clicked
  ▼
router.push('/deck/[slug]/drill?node=<id>')        sessionId = crypto.randomUUID() on overlay mount
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
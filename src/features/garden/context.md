# garden

UI-only feature: the tree surface (grid of decks, single tree).

## Owned tables
None. Never calls actions; pages pass data in as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenGrid({ decks })` | Grid of `TreeCard`s, with a built-in empty state |
| `GardenGridSkeleton({ count? })` | Loading state, used by `app/loading.tsx` |
| `TreeCard({ deck })` | Links to `/deck/[slug]`; stage SVG + stage badge + `GrowthBar` from `masteryPercent` |
| `TreeStageSvg({ stage, treeType, label, ground? })` | Inline SVG per stage; canopy and trunk colors from `shared/lib/treeSkins` (oak, pine, sakura); stage 4 gold tint + sparkles. `ground={false}` hides the soil mound when a scene draws its own ground |
| `TREE_BASE_RATIO` | Where the trunk meets the ground as a fraction of the drawn size (`{ x: 0.5, y: 0.9 }`); the deck scene attaches the roots there |
| `GrowthBar({ percent })` | 0–100 bar, gold above 80% |
| `getTreeStage(pct)`, `useTreeStage(pct)`, `TREE_STAGES` | Pure stage math (frontend/ARCHITECTURE.md §5) and stage names/emoji |
| `type DeckCardView` | `{ id, slug, title, description, treeType, masteryPercent }` |
| `type TreeStage` | `1 \| 2 \| 3 \| 4` |

## Not built yet
`TreeCanvas` (client, cross-fade between stages), stage-up confetti

## May import
`@/shared/*` only

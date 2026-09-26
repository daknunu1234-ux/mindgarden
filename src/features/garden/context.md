# garden

UI-only feature: the tree surface (grid of decks, single tree).

## Owned tables
None. Never calls actions; pages pass data in as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenGrid({ decks })` | Grid of `TreeCard`s, with a built-in empty state |
| `GardenGridSkeleton({ count? })` | Loading state, used by `app/loading.tsx` |
| `TreeCard({ deck })` | Links to `/deck/[slug]`; icon from `treeType` (oak, pine, sakura) |
| `type DeckCardView` | `{ id, slug, title, description, treeType }` |

## Not built yet
`TreeCanvas`, `TreeStageSvg`, `useTreeStage` / `getTreeStage`, stage badge from `masteryPercent` (needs `progress`)

## May import
`@/shared/*` only

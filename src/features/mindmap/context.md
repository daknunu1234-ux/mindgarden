# mindmap

UI-only feature: the underground roots (mindmap nodes) of a deck.

## Owned tables
None. Never calls actions; pages pass the tree and item levels as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `RootOutline({ nodes, levels })` | Nested outline; each root's opacity and dots follow its mastery. Stand-in for the SVG `RootMap` |
| `nodeMastery(node, levels)` | Average level (0–3) of the node's own items, `null` without items |
| `rootOpacity(mastery)` | `0.35 + 0.65 × (mastery / 3)` (frontend/ARCHITECTURE.md §5) |
| `type RootNodeView` | `{ id, title, items: { id }[], children }`; decks' `DeckTreeNode` fits it |
| `type ItemLevels` | `Record<itemId, level>`; missing items count as 0 |

## Not built yet
`RootMap`, `RootPath`, `RootNode` (SVG, client), `useRootLayout`, click → `/deck/[slug]/drill?node=<id>`

## May import
`@/shared/*` only

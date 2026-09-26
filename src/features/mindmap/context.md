# mindmap

UI-only feature: the underground roots (mindmap nodes) of a deck.

## Owned tables
None. Never calls actions; pages pass the tree and item levels as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `RootMap({ nodes, levels, deckSlug })` | Client. Top-down root system: SVG S-curve lines from a trunk point, HTML cards (`RootNode`) with a `MasteryRing`, "Drill branch 🌿" link to `/deck/<slug>/drill?nodeId=<id>`. Hover/focus lights the path to the trunk. Scrolls horizontally when wide |
| `MasteryRing({ value, mighty })` | 0–3 ring with the level in the middle |
| `layoutRoots(tree)`, `ancestorPath(layout, id)` | Pure layout (leaves in slots, parents centered, rows by depth) and the highlight path |
| `nodeMastery(node, levels)` | Average level (0–3) of the node's own items, `null` without items |
| `displayMastery(node, levels)` | Own items' mastery, else the branch average (grouping roots), else `null` |
| `branchItemIds(node)`, `isMightyRoot(m)` | Items in a branch; Mighty Root = displayed mastery 3 (gold card, ring and line) |
| `rootOpacity(mastery)` | `0.35 + 0.65 × (mastery / 3)` (frontend/ARCHITECTURE.md §5); used for each line into a root |
| `type RootNodeView` | `{ id, title, items: { id }[], children }`; decks' `DeckTreeNode` fits it |
| `type ItemLevels` | `Record<itemId, level>`; missing items count as 0 |

## Not built yet
Zoom/pan, collapsing branches, keyboard arrow navigation between roots

## May import
`@/shared/*` only

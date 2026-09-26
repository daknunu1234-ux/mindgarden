# mindmap

UI-only feature: the underground roots (mindmap nodes) of a deck.

## Owned tables
None. Never calls actions; pages pass the tree and item levels as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `RootMap({ nodes, levels, deckSlug, treeType, surface?, emptyLabel? })` | Client. One scene: `surface.content` (the page passes the garden tree) stands on a rolling grass ground line with its trunk base (`surface.baseX/baseY`) on a tapered conduit into the soil; the conduit ends in a root crown and bezier roots fan out to the cards. Root wood/glow colors come from `shared/lib/treeSkins` (`treeType`); lines use a wood→glow gradient, a soft blur glow from 2/3 and gold at 3/3, opacity `0.35 + 0.65 × mastery / 3`. Tree, soil and roots share one CSS-scaled canvas, so zoom/pan keep the tree anchored. Top-down root system: SVG S-curve lines, HTML cards (`RootNode`) with a `MasteryRing`, "Drill branch 🌿" link to `/deck/<slug>/drill?nodeId=<id>`. Hover/focus lights the path to the trunk. Toolbar: zoom out/in (50–150%, `hooks/zoom.ts`), Reset view (100%, scroll to the trunk), Collapse/Expand all. Each root with sub-roots has a −/+N toggle (`aria-expanded`) on its bottom edge. Pans by scrolling or dragging empty canvas with the mouse |
| `MasteryRing({ value, mighty })` | 0–3 ring with the level in the middle |
| `pruneCollapsed(tree, collapsed)`, `countDescendants(node)`, `allNodeIds(tree)` | Collapse helpers; only the layout sees the pruned tree, so mastery and drills keep the full branch |
| `sceneGeometry(layout, surface, viewportWidth, zoom)` | Pure: canvas size (fills the viewport at any zoom), ground line, root offset, tree box so its base sits on the trunk |
| `rootStroke(mastery, colors, highlighted?)`, `conduitPath`, `groundPath` | Pure line styling and scene paths (`hooks/scene.ts`) |
| `stepZoom(zoom, ±1)` | 0.25 steps, clamped to 0.5–1.5 |
| `layoutRoots(tree)`, `ancestorPath(layout, id)` | Pure layout (leaves in slots, parents centered, rows by depth) and the highlight path |
| `nodeMastery(node, levels)` | Average level (0–3) of the node's own items, `null` without items |
| `displayMastery(node, levels)` | Own items' mastery, else the branch average (grouping roots), else `null` |
| `branchItemIds(node)`, `isMightyRoot(m)` | Items in a branch; Mighty Root = displayed mastery 3 (gold card, ring and line) |
| `rootOpacity(mastery)` | `0.35 + 0.65 × (mastery / 3)` (frontend/ARCHITECTURE.md §5); used for each line into a root |
| `type RootNodeView` | `{ id, title, items: { id }[], children }`; decks' `DeckTreeNode` fits it |
| `type ItemLevels` | `Record<itemId, level>`; missing items count as 0 |

## Not built yet
Arrow-key navigation between roots, pinch/ctrl+wheel zoom, remembering collapsed branches across visits

## Keyboard
Tab reaches each root's "Drill branch 🌿" link (Enter opens the branch drill) and its collapse toggle (Enter/Space), in depth-first order; focus lights the branch path

## May import
`@/shared/*` only

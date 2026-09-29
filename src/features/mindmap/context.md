# mindmap

UI-only feature: "Inspect Roots", the deck's knowledge as a mindmap growing out of its tree.

## Owned tables
None. Never calls actions; pages pass the tree and item levels as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `RootMap({ nodes, levels, deckSlug, treeType, surface?, emptyLabel? })` | Client. One scene: `surface.content` (the page passes the garden tree) stands on the ground line; a tapered conduit runs from the trunk to the crown, then Bezier roots (`M … C …`) reach category pills in a row, and each category's statements and sub-branches stack in a column below it. Pills toggle collapse (−/+N, `aria-expanded`), cards animate to their new place; statement cards show mastery 0–5/5 and a 🌿 Drill shortcut (their branch). 5/5 glows gold. Root lines: wood→glow gradient, opacity `0.35 + 0.65 × mastery / 5`, soft glow from 2/3, gold at 5/5. Toolbar: zoom −/+, "Center view", Collapse/Expand all. Camera: `shared/hooks/useCamera` (drag, pinch, Ctrl/⌘ + wheel, fit on arrival) |
| `NodePill`, `StatementCard` | The card components (`components/MindmapCards.tsx`). Pills: collapse toggle, 🔍 inspect (branch statement count), ✏️ manage (only when the page passes `onManage`) |
| `NodeInspector({ node, levels, deckSlug, … })` | Client side drawer (shadcn Sheet): a root's statements (prompt or "Statement n", mastery), sub-branches (inspect in turn), "Practice Branch 🌿", "Manage" for owners. Never shows statement text. Opening it expands the branch and lights its path + child connections; the camera is untouched |
| `RootMap` owner props | `onManage(nodeId)`, `onAddRoot()`: the page wires them to decks' `NodeManageDialog` / `AddRootDialog` (`app/deck/[slug]/_components/DeckRootsPanel.tsx`); the mindmap never calls actions |
| `descendantKeys(layout, key)`, `branchNodeIds(node)` | Inspector helpers: cards below a node; ids of a root and all its sub-roots |
| `layoutMindmap(tree, collapsed?)` | Pure layout (`hooks/mindmapLayout.ts`, tested): cards (category / branch / statement) with positions and sizes, edges (ports: under the parent's left edge → child's left middle; categories from the crown), trunk + crown, canvas size. Columns never share x-ranges, so cards never overlap |
| `ancestorKeys(layout, key)` | Card → its category, to light the path back to the crown on hover/focus |
| `statementTitle(prompt, nodeTitle, n)` | Card label: the prompt when it differs from the root title, else "Statement n" |
| `allNodeIds`, `collapsibleNodeIds`, `indexNodes` | Collapse helpers (`hooks/collapse.ts`) |
| `nodeMastery`, `displayMastery`, `branchItemIds`, `isMightyRoot`, `rootOpacity` | Mastery math (`hooks/nodeMastery.ts`). A node shows its own items' average, or its branch average when it has none |
| `type RootNodeView` | `{ id, title, items: { id, prompt? }[], children }`; decks' `DeckTreeNode` fits it |
| `type ItemLevels` | `Record<itemId, level>`; missing items count as 0 |

## Rules
- Statement text (`correct_stmt`) is the drill answer and never reaches this feature; cards show the prompt or "Statement n"
- Per-statement drilling doesn't exist: the statement's 🌿 Drill opens its branch (`/deck/<slug>/drill?nodeId=<node>`)
- Mighty Root = the node's own statements all at 5/5 (same rule as the profile stats)

## Scene
`hooks/scene.ts`: `sceneGeometry(layout, surface, sideMargin?)` gives a fixed-size world (soil 480px past the roots on each side), the ground line, the tree box on the trunk, and a `focus` box for the camera to fit. `rootStroke`, `conduitPath`, `groundPath` are pure helpers.

## Not built yet
Arrow-key navigation between cards, remembering collapsed branches across visits

## May import
`@/shared/*` only

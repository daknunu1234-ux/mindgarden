# mindmap

UI-only feature: "Inspect Roots", the deck's knowledge as a mindmap growing out of its tree.

## Owned tables
None. Never calls actions; pages pass the tree and item levels as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `RootMap({ nodes, levels, treeType, surface?, emptyLabel?, practice? })` | Client. One scene: `surface.content` (the page passes the garden tree) stands on the ground line; a tapered conduit runs from the trunk to the crown, then Bezier roots (`M … C …`) reach category pills in a row, and each category's statements and sub-branches stack in a column below it. Pills toggle collapse (−/+N, `aria-expanded`), cards animate to their new place; statement cards show mastery 0–5/5 and a 🌿 Drill shortcut (their branch). 5/5 glows gold. Root lines: wood→glow gradient, opacity `0.35 + 0.65 × mastery / 5`, soft glow from 2/3, gold at 5/5. Toolbar: zoom −/+, "Center view", Collapse/Expand all. Camera: `shared/hooks/useCamera` (drag, pinch, Ctrl/⌘ + wheel, fit on arrival) |
| `NodePill`, `StatementCard` | The card components (`components/MindmapCards.tsx`). Pills: collapse toggle, 🔍 inspect (branch statement count), on **top-level roots only** 💧 Drill / ⚔️ Compete (`onPractice`, `practiceMode`), and for the owner a **hover-to-reveal** group floating over the corner: ✏️ Edit (`onEdit`), 🗑️ Delete (`onDelete`), ⚙️ Manage (`onManage`, the add-statements / sub-branches dialog). Statement cards show the statement and its mastery, with **no** practice button; the owner gets a hover ✏️ / 🗑️ in the corner. Tools use `shared/components/game` `HoverActions` (hidden until hover or keyboard focus, always shown on touch screens) |
| `NodeInspector({ node, levels, …, practice?, statements? })` | Client side drawer (shadcn Sheet): a root's statements (prompt or "Statement n", mastery), sub-branches (inspect in turn), "💧 Drill Root" / "🌿 Review" (owner) or "⚔️ Compete Root" (tournament contestant), "Manage" for owners. The buttons call `practice.onPractice({ rootId, review? })`; with no `practice` they become a disabled "Clone to practice this tree 🌱". Shows each statement's text (`statementLabel`: the text, else the prompt / "Statement n"). Its Drill Root / Compete Root also works for a sub-branch opened in the drawer (scoped to that node). Opening it expands the branch and lights its path + child connections; the camera is untouched |
| `RootMap` practice / visitor props | `practice: MindmapPractice \| null` (default null) = `{ mode: 'drill' \| 'compete', onPractice }`: the top-level root pills' 💧 Drill / ⚔️ Compete and the inspector buttons call it (the page opens drill's launch pop-up scoped to that `rootId`; the mindmap never links to a round, so it has no `deckSlug`). null = read-only visitor: no practice buttons, and the inspector's lock. `statements` (item id → text): the page passes the owner's texts (decks' `getDeckEditor`, so a cloned tree shows its copied statements) or a visitor's (`getDeckReader`) |
| `RootMap` owner props | `ownerTools: MindmapOwnerTools` (`{ onEditStatement, onDeleteStatement, onEditRoot, onDeleteRoot }`): the hover ✏️ / 🗑️ on root pills and statement cards, the drawer's statements, and the drawer header's "✏️ Edit" / "🗑️ Delete Root"; the page opens decks' edit and confirmation dialogs. Absent for everyone but the owner. `onManage(nodeId)`, `onAddRoot()`: the page wires them to decks' `NodeManageDialog` / `AddRootDialog` (`app/deck/[slug]/_components/DeckRootsPanel.tsx`); the mindmap never calls actions |
| `descendantKeys(layout, key)`, `branchNodeIds(node)` | Inspector helpers: cards below a node; ids of a root and all its sub-roots |
| `layoutMindmap(tree, collapsed?)` | Pure layout (`hooks/mindmapLayout.ts`, tested): cards (category / branch / statement) with positions and sizes, edges (ports: under the parent's left edge → child's left middle; categories from the crown), trunk + crown, canvas size. Columns never share x-ranges, so cards never overlap |
| `ancestorKeys(layout, key)` | Card → its category, to light the path back to the crown on hover/focus |
| `statementLabel(text, prompt, nodeTitle, n)`, `statementTitle(prompt, nodeTitle, n)` | Card / inspector label: the statement text when present; else the prompt when it differs from the root title; else "Statement n" |
| `allNodeIds`, `collapsibleNodeIds`, `indexNodes` | Collapse helpers (`hooks/collapse.ts`) |
| `nodeMastery`, `displayMastery`, `branchItemIds`, `isMightyRoot`, `rootOpacity` | Mastery math (`hooks/nodeMastery.ts`). A node shows its own items' average, or its branch average when it has none |
| `type RootNodeView` | `{ id, title, items: { id, prompt? }[], children }`; decks' `DeckTreeNode` fits it |
| `type ItemLevels` | `Record<itemId, level>`; missing items count as 0 |

## Rules
- Cards show the statement text (`correct_stmt`) to everyone who can read it: the owner wrote it (or cloned it) and already sees it in the Tree Workshop; visitors read shared trees. "Statement n" is only the fallback for a missing or blank text (`statementLabel`). Answers still stay secret where it matters: drill questions never carry `correctTag`, and grading happens on the server
- Per-statement drilling doesn't exist: rounds start from a top-level root pill (or the inspector), never from a statement card
- Mighty Root = the node's own statements all at 5/5 (same rule as the profile stats)

## Scene
`hooks/scene.ts`: `sceneGeometry(layout, surface, sideMargin?)` gives a fixed-size world (soil 480px past the roots on each side), the ground line, the tree box on the trunk, and a `focus` box for the camera to fit. `rootStroke`, `conduitPath`, `groundPath` are pure helpers.

## Not built yet
Arrow-key navigation between cards, remembering collapsed branches across visits

## May import
`@/shared/*` only

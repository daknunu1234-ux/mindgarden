// Minimal node shape the mindmap needs. decks' DeckTreeNode satisfies it structurally.
export type RootNodeView = {
  id: string
  title: string
  // prompt is optional so plain { id } items still fit; decks' DeckTreeNode items carry it.
  items: { id: string; prompt?: string }[]
  children: RootNodeView[]
}

// itemId → mastery level 0–3. Missing items count as 0.
// Practice from the mindmap (the page wires it to drill's launch pop-up; the mindmap never links to
// a round itself). 'drill' = the owner waters their tree; 'compete' = a Mind Tournament contestant.
// No practice (null) = read-only visitor.
export type MindmapPractice = {
  mode: 'drill' | 'compete'
  onPractice: (request: { rootId: string; review?: boolean }) => void
}

// Owner-only ✏️ Edit / 🗑️ Delete hooks for statements and roots (hover tools on the canvas and in
// the root drawer). The page opens decks' dialogs; the mindmap never edits or deletes anything
// itself. Absent for everyone else, so visitors and contestants never see the tools.
export type MindmapOwnerTools = {
  onEditStatement: (statement: { id: string; text: string }) => void
  onDeleteStatement: (statement: { id: string; text: string }) => void
  onEditRoot: (root: { id: string; title: string }) => void
  onDeleteRoot: (rootId: string) => void
}

// Owner-only fast entry on the canvas (quick-add inputs, inline rename). The page wires these to
// decks' optimistic deck draft: each shows at once and saves in the background. addRoot / addBranch
// return the new node's id right away (a temporary one until saved), so the keyboard flow can nest
// statements and sub-roots under it immediately.
export type MindmapAuthoring = {
  addRoot: (title: string) => string
  addBranch: (parentId: string, title: string) => string
  addStatement: (nodeId: string, text: string) => void
  renameRoot: (nodeId: string, title: string) => void
  // Still saving: no edit / delete / manage / practice on it yet.
  isPending: (id: string) => boolean
  // A temporary id → the real one once saved (the canvas keeps an open input on its root).
  resolveId: (id: string) => string
}

// Owner-only micro-badge on a statement card: still saving (⏳), or saved but not drillable yet (💧).
export type StatementStatus = 'saving' | 'not-drillable'

export type ItemLevels = Readonly<Record<string, number>>

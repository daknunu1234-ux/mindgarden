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

export type ItemLevels = Readonly<Record<string, number>>

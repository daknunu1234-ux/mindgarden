// Minimal node shape the mindmap needs. decks' DeckTreeNode satisfies it structurally.
export type RootNodeView = {
  id: string
  title: string
  items: { id: string }[]
  children: RootNodeView[]
}

// itemId → mastery level 0–3. Missing items count as 0.
export type ItemLevels = Readonly<Record<string, number>>

// Minimal node shape the mindmap needs. decks' DeckTreeNode satisfies it structurally.
export type RootNodeView = {
  id: string
  title: string
  // prompt is optional so plain { id } items still fit; decks' DeckTreeNode items carry it.
  items: { id: string; prompt?: string }[]
  children: RootNodeView[]
}

// itemId → mastery level 0–3. Missing items count as 0.
export type ItemLevels = Readonly<Record<string, number>>

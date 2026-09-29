import type { PlantedTreeView } from '../types'

export type ShowcaseSlot = { kind: 'trophy'; tree: PlantedTreeView } | { kind: 'locked'; index: number }

// Pure: fills the Mighty Roots showcase. Trees with at least one Mighty Root are trophies (most
// Mighty Roots first, then most grown); the shelf always shows `minSlots` frames and grows in rows
// of `perRow`, with locked frames as goals.
export function showcaseSlots(trees: PlantedTreeView[], minSlots = 6, perRow = 3): ShowcaseSlot[] {
  const trophies = trees
    .filter((t) => t.mightyRoots > 0)
    .sort((a, b) => b.mightyRoots - a.mightyRoots || b.masteryPercent - a.masteryPercent || a.title.localeCompare(b.title))
  const row = Math.max(1, Math.floor(perRow))
  const total = Math.ceil(Math.max(minSlots, trophies.length) / row) * row
  return [
    ...trophies.map((tree): ShowcaseSlot => ({ kind: 'trophy', tree })),
    ...Array.from({ length: total - trophies.length }, (_, i): ShowcaseSlot => ({ kind: 'locked', index: i })),
  ]
}

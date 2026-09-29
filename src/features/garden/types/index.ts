export type TreeStage = 1 | 2 | 3 | 4 | 5

// What a tree card needs to render. Pages map feature data (Deck + DeckProgress) into this shape.
export type DeckCardView = {
  id: string
  slug: string
  title: string
  description: string | null
  treeType: string
  // 0–100, from progress.getProgressByDecks (0 for signed-out players).
  masteryPercent: number
}

// One planted deck on the Farm Island. The page maps decks + progress into this.
export type FarmPlotView = {
  id: string
  slug: string
  title: string
  treeType: string
  masteryPercent: number
  itemCount: number
  // Items the player has at 5/5: they rest in normal rounds (the popup offers review mode).
  masteredCount: number
  mightyRoots: number
  // true: show 💧 (not practised today); false: watered; null: unknown (signed out).
  needsWater: boolean | null
  // The player's local day of the latest practice when it is today (drives the watering splash).
  wateredDay: string | null
  isOwner: boolean
}

// Farm HUD. level/streak/coins are null when signed out.
export type FarmHudView = {
  level: { level: number; title: string; progress: number; xpIntoLevel: number; xpForNextLevel: number } | null
  streak: { current: number; practicedToday: boolean } | null
  // 🪙 5 per mastery step earned in any deck.
  coins: number | null
  // When `coins` was read on the server (epoch ms); newer live balances from actions win.
  coinsAsOf?: number
  // 💎 Mighty Roots on this island.
  gems: number
}

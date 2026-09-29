import type { ReactNode } from 'react'

// View models only: the page maps auth / progress data into these. This feature owns no tables.
export type GardenerView = { email: string; joinedAt: string }

// Gardener level (from progress.getFarmHud); optional on the card.
export type GardenerLevelView = { level: number; title: string; xpIntoLevel: number; xpForNextLevel: number }

export type GardenStatsView = {
  treeCount: number
  itemCount: number
  mightyRootCount: number
  masteryPercent: number
  currentStreak: number
  bestStreak: number
  practicedToday: boolean
}

export type PlantedTreeView = {
  slug: string
  title: string
  treeType: string
  isPublic: boolean
  itemCount: number
  // Items at 5/5 (shown as "n/total at 5/5"); optional for older callers.
  masteredCount?: number
  masteryPercent: number
  mightyRoots: number
  // Optional picture composed by the page (e.g. garden's TreeStageSvg).
  illustration?: ReactNode
  // Growth stage (mastery), e.g. { emoji: '🌳', name: 'Mighty Tree' }.
  stage?: { emoji: string; name: string }
  // Size tier (subject scope from the item count), e.g. { badge: '👑 Colossal', name: 'Colossal Grand', tier: 'xl' }.
  size?: { badge: string; name: string; tier: 'sm' | 'md' | 'lg' | 'xl' }
}

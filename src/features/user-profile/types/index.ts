import type { ReactNode } from 'react'

// View models only: the page maps auth / progress data into these. This feature owns no tables.
export type GardenerView = { email: string; joinedAt: string }

export type GardenStatsView = {
  treeCount: number
  itemCount: number
  mightyRootCount: number
  masteryPercent: number
}

export type PlantedTreeView = {
  slug: string
  title: string
  treeType: string
  isPublic: boolean
  itemCount: number
  masteryPercent: number
  mightyRoots: number
  // Optional picture composed by the page (e.g. garden's TreeStageSvg).
  illustration?: ReactNode
}

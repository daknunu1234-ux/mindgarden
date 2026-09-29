import type { Metadata } from 'next'
import { GamePanel } from '@/shared/components/game'
import { SignInPrompt } from '@/shared/components/SignInPrompt'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { getCurrentUser } from '@/features/auth'
import { getTreeStage, TreeStageSvg, TREE_STAGES } from '@/features/garden'
import { getFarmHud, getGardenStats, type GardenTree } from '@/features/progress'
import { GardenerCard, GardenStatsGrid, MightyShowcase, PlantedTreeList, type PlantedTreeView } from '@/features/user-profile'

export const metadata: Metadata = { title: 'Trophy Hall · MindGarden' }

// The Gardener's Trophy & Record Hall. Composes auth (who), progress (stats, level) and garden
// (tree pictures) into the UI-only user-profile feature.
export default async function ProfilePage() {
  const userRes = await getCurrentUser()
  const user = userRes.success ? userRes.data : null

  if (!user) {
    return (
      <main className="mg-meadow-bg w-full flex-1">
        <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
          <SignInPrompt
            emoji="🧑‍🌾"
            title="Sign in to see your garden"
            description="Your planted trees, Mighty Roots and overall mastery live in your Trophy Hall."
          />
        </div>
      </main>
    )
  }

  const [stats, hud] = await Promise.all([getGardenStats(), getFarmHud()])
  const level = hud.success && hud.data ? hud.data.level : null
  const coins = hud.success && hud.data ? hud.data.coins : null
  const trees = stats.success ? stats.data.trees.map(toTreeView) : []

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:px-6">
        <GardenerCard
          gardener={{ email: user.email, joinedAt: user.createdAt }}
          masteryPercent={stats.success ? stats.data.masteryPercent : 0}
          coins={coins}
          level={
            level && { level: level.level, title: level.title, xpIntoLevel: level.xpIntoLevel, xpForNextLevel: level.xpForNextLevel }
          }
        />

        {stats.success ? (
          <>
            <GardenStatsGrid stats={stats.data} />
            <MightyShowcase trees={trees} />
            <PlantedTreeList trees={trees} />
          </>
        ) : (
          <GamePanel tone="stone" title="Your records are resting">
            <p className="text-center text-sm">{stats.error.message}. Try again in a moment.</p>
          </GamePanel>
        )}
      </div>
    </main>
  )
}

function toTreeView(tree: GardenTree): PlantedTreeView {
  const stage = getTreeStage(tree.masteryPercent)
  const size = getTreeSizeTier(tree.itemCount)
  return {
    stage: { emoji: TREE_STAGES[stage].emoji, name: TREE_STAGES[stage].name },
    size: { badge: size.badge, name: size.name, tier: size.tier },
    slug: tree.slug,
    title: tree.title,
    treeType: tree.treeType,
    isPublic: tree.isPublic,
    itemCount: tree.itemCount,
    masteredCount: tree.masteredCount,
    masteryPercent: tree.masteryPercent,
    mightyRoots: tree.mightyRoots,
    illustration: (
      <TreeStageSvg stage={stage} treeType={tree.treeType} label={`${TREE_STAGES[stage].name} tree`} className="size-full" />
    ),
  }
}

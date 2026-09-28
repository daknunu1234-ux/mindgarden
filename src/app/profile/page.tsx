import type { Metadata } from 'next'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { SignInPrompt } from '@/shared/components/SignInPrompt'
import { getCurrentUser } from '@/features/auth'
import { getTreeStage, TreeStageSvg, TREE_STAGES } from '@/features/garden'
import { getGardenStats, type GardenTree } from '@/features/progress'
import { GardenerCard, GardenStatsGrid, PlantedTreeList, type PlantedTreeView } from '@/features/user-profile'

export const metadata: Metadata = { title: 'Your garden · MindGarden' }

// Composes auth (who), progress (stats over owned trees) and garden (tree pictures)
// into the UI-only user-profile feature.
export default async function ProfilePage() {
  const userRes = await getCurrentUser()
  const user = userRes.success ? userRes.data : null

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <SignInPrompt
          emoji="🧑‍🌾"
          title="Sign in to see your garden"
          description="Your planted trees, Mighty Roots and overall mastery live on your profile."
        />
      </main>
    )
  }

  const stats = await getGardenStats()

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-12 sm:px-6">
      <GardenerCard
        gardener={{ email: user.email, joinedAt: user.createdAt }}
        masteryPercent={stats.success ? stats.data.masteryPercent : 0}
      />

      {stats.success ? (
        <>
          <GardenStatsGrid stats={stats.data} />
          <section aria-labelledby="trees-heading" className="space-y-3">
            <h2 id="trees-heading" className="text-lg font-medium">
              Your trees
            </h2>
            <PlantedTreeList trees={stats.data.trees.map(toTreeView)} />
          </section>
        </>
      ) : (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>Your garden stats are resting</AlertTitle>
          <AlertDescription>{stats.error.message}. Try again in a moment.</AlertDescription>
        </Alert>
      )}
    </main>
  )
}

function toTreeView(tree: GardenTree): PlantedTreeView {
  const stage = getTreeStage(tree.masteryPercent)
  return {
    slug: tree.slug,
    title: tree.title,
    treeType: tree.treeType,
    isPublic: tree.isPublic,
    itemCount: tree.itemCount,
    masteryPercent: tree.masteryPercent,
    mightyRoots: tree.mightyRoots,
    illustration: (
      <TreeStageSvg stage={stage} treeType={tree.treeType} label={`${TREE_STAGES[stage].name} tree`} className="size-full" />
    ),
  }
}

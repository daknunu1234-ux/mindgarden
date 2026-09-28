import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { countDeckTree, DeckEditor, type DeckDetail, type DeckEditorData } from '@/features/decks'
import { GrowthBar, TREE_BASE_RATIO, TreeStageSvg, useTreeStage } from '@/features/garden'
import { RootMap, type ItemLevels } from '@/features/mindmap'
import type { DeckProgress } from '@/features/progress'

// editor is set only for the deck owner.
type DeckSceneProps = { detail: DeckDetail; progress: DeckProgress | null; editor: DeckEditorData | null }

// Rendered size of the tree in the scene; its trunk base is where the roots attach.
const TREE_SIZE = 176

// Route-level composition for /deck/[slug]: one scene where the garden tree stands on the
// ground line and the mindmap roots grow out of its trunk into the soil.
function DeckScene({ detail, progress, editor }: DeckSceneProps) {
  const { deck, tree } = detail
  const { nodeCount, itemCount } = countDeckTree(tree)
  const masteryPercent = progress?.masteryPercent ?? 0
  const { stage, name, emoji } = useTreeStage(masteryPercent)
  const levels: ItemLevels = Object.fromEntries(progress?.items.map((i) => [i.itemId, i.masteryLevel]) ?? [])

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Garden
      </Link>

      <header className="mt-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{deck.title}</h1>
            <Badge variant="outline" className={stage === 5 ? 'border-yellow-500 bg-yellow-50' : undefined}>
              {emoji} {name}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {deck.treeType}
            </Badge>
            {!deck.isPublic && <Badge variant="secondary">Private</Badge>}
          </div>
          {deck.description && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{deck.description}</p>
          )}
          <GrowthBar percent={masteryPercent} className="mt-4 max-w-sm" />
          <dl className="mt-4 flex gap-6 text-sm">
            <Stat label="Roots" value={nodeCount} />
            <Stat label="Knowledge items" value={itemCount} />
          </dl>
          {itemCount > 0 && (
            <Button asChild className="mt-5">
              <Link href={`/deck/${deck.slug}/drill`}>Start practice 🌿</Link>
            </Button>
          )}
        </div>
      </header>

      <section aria-labelledby="roots-heading" className="mt-8">
        <h2 id="roots-heading" className="text-lg font-medium">
          Tree &amp; roots
        </h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          {tree.length === 0
            ? 'Every concept you add becomes a root under this tree.'
            : 'Roots glow brighter as you master them. Hover a root to trace it back to the trunk, or drill just that branch.'}
        </p>
        <RootMap
          nodes={tree}
          levels={levels}
          deckSlug={deck.slug}
          treeType={deck.treeType}
          surface={{
            width: TREE_SIZE,
            height: TREE_SIZE,
            baseX: TREE_SIZE * TREE_BASE_RATIO.x,
            baseY: TREE_SIZE * TREE_BASE_RATIO.y,
            content: (
              <TreeStageSvg
                stage={stage}
                treeType={deck.treeType}
                label={`${name} tree`}
                ground={false}
                className="size-full transition-opacity duration-700"
              />
            ),
          }}
          emptyLabel={editor ? 'No roots yet. Add the first concept below 🌱' : 'No roots yet. This tree is waiting for its first concept 🌱'}
        />
      </section>

      {editor && (
        <section aria-labelledby="grow-heading" className="mt-10">
          <h2 id="grow-heading" className="text-lg font-medium">
            Grow your roots
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Add concepts as roots, then write true statements for each. Traps are made for you.
          </p>
          <DeckEditor editor={editor} />
        </section>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

export { DeckScene }

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { GameButton, GamePanel, GameSlab, Ribbon } from '@/shared/components/game'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { countDeckTree, DeckDangerZone, DeckEditor, type DeckDetail, type DeckEditorData } from '@/features/decks'
import { GrowthBar, TREE_BASE_RATIO, TreeStageSvg, useTreeStage } from '@/features/garden'
import type { ItemLevels } from '@/features/mindmap'
import type { DeckProgress } from '@/features/progress'
import { DeckRootsPanel } from './DeckRootsPanel'

// editor is set only for the deck owner.
type DeckSceneProps = { detail: DeckDetail; progress: DeckProgress | null; editor: DeckEditorData | null }

// Rendered size of a Standard (md) tree in the scene; its trunk base is where the roots attach.
const TREE_SIZE = 176

// Route-level composition for /deck/[slug]: one scene where the garden tree stands on the
// ground line and the mindmap roots grow out of its trunk into the soil.
function DeckScene({ detail, progress, editor }: DeckSceneProps) {
  const { deck, tree } = detail
  const { nodeCount, itemCount } = countDeckTree(tree)
  const masteryPercent = progress?.masteryPercent ?? 0
  const { stage, name, emoji } = useTreeStage(masteryPercent)
  // Size tier = subject scope (knowledge items only); growth stage = mastery. Independent axes.
  const size = getTreeSizeTier(itemCount)
  // The scene reserves sky above the surface box, so here the box itself grows (from the trunk
  // base), rather than scaling inside a fixed box. Base point = box × TREE_BASE_RATIO either way,
  // so the root conduit still attaches exactly at the trunk.
  const treeBox = Math.round(TREE_SIZE * size.scale)
  const levels: ItemLevels = Object.fromEntries(progress?.items.map((i) => [i.itemId, i.masteryLevel]) ?? [])

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <GameButton asChild tone="cream" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" strokeWidth={3} aria-hidden />
            Garden
          </Link>
        </GameButton>

        <GamePanel tone="parchment" className="mt-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h1 className="font-game text-3xl leading-tight font-extrabold text-amber-950 sm:text-4xl">{deck.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 pl-3">
                <Ribbon tone={stage === 5 ? 'gold' : 'leaf'}>
                  {emoji} {name}
                </Ribbon>
                <Ribbon tone="wood">
                  <span className="capitalize">{deck.treeType}</span>
                </Ribbon>
                <Ribbon tone={size.tier === 'xl' ? 'gold' : 'sky'}>
                  <span title={`${size.name}: ${itemCount} ${itemCount === 1 ? 'statement' : 'statements'}`}>{size.badge}</span>
                </Ribbon>
                {!deck.isPublic && <Ribbon tone="berry">🔒 Private</Ribbon>}
              </div>
              {deck.description && <p className="mt-4 whitespace-pre-wrap text-amber-900/75">{deck.description}</p>}
              <GrowthBar percent={masteryPercent} className="mt-5 max-w-md" />
            </div>
            <div className="flex shrink-0 flex-row gap-3 sm:flex-col sm:items-stretch">
              <dl className="flex gap-3">
                <Stat icon="🌱" label="Roots" value={nodeCount} />
                <Stat icon="📜" label="Statements" value={itemCount} />
              </dl>
              {itemCount > 0 && (
                <GameButton asChild tone="sky" size="lg" className="flex-1">
                  <Link href={`/deck/${deck.slug}/drill`}>💧 Water Tree</Link>
                </GameButton>
              )}
            </div>
          </div>
        </GamePanel>

        <section aria-labelledby="roots-heading" className="mt-10">
          <h2 id="roots-heading" className="font-game text-2xl font-extrabold text-emerald-950">
            Tree &amp; roots
          </h2>
          <p className="mt-1 mb-3 text-sm font-medium text-emerald-900/65">
            {tree.length === 0
              ? 'Every concept you add becomes a root under this tree.'
              : editor
                ? 'Tap 🔍 to inspect a root, ✏️ to rename it or add and remove statements. Roots glow brighter as they are mastered.'
                : 'Tap 🔍 on a root to see its statements and practise that branch. Roots glow brighter as you master them.'}
          </p>
          <DeckRootsPanel
            deckId={deck.id}
            deckSlug={deck.slug}
            treeType={deck.treeType}
            tree={tree}
            levels={levels}
            editor={editor}
            surface={{
              width: treeBox,
              height: treeBox,
              baseX: treeBox * TREE_BASE_RATIO.x,
              baseY: treeBox * TREE_BASE_RATIO.y,
              content: (
                <TreeStageSvg
                  stage={stage}
                  treeType={deck.treeType}
                  label={`${name} ${size.name.toLowerCase()} tree`}
                  ground={false}
                  className="size-full transition-opacity duration-700"
                />
              ),
            }}
            emptyLabel={editor ? 'No roots yet. Use ＋ Add root above to plant the first concept 🌱' : 'No roots yet. This tree is waiting for its first concept 🌱'}
          />
        </section>

        {editor && (
          <section aria-labelledby="grow-heading" className="mt-12">
            <GamePanel tone="wood" ribbon="gold" title={<span id="grow-heading">🛠️ Tree Workshop</span>}>
              <p className="mb-5 text-center text-sm text-amber-100/85">
                Change the tree species, or work through every root as a list. Everything here can also be done on the mindmap above.
              </p>
              <DeckEditor editor={editor} />
              <div className="mt-8">
                <DeckDangerZone deckId={deck.id} deckTitle={deck.title} />
              </div>
            </GamePanel>
          </section>
        )}
      </div>
    </main>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <GameSlab className="flex min-w-24 flex-col items-center px-3 py-2">
      <dt className="flex items-center gap-1 font-game text-xs font-bold text-amber-900/65">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd className="font-game text-2xl leading-tight font-extrabold text-amber-950 tabular-nums">{value}</dd>
    </GameSlab>
  )
}

export { DeckScene }

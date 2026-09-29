import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { GameButton, GamePanel, GameSlab, Ribbon } from '@/shared/components/game'
import { isMastered } from '@/shared/lib/mastery'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { drillHref } from '@/features/drill'
import {
  CloneTreeButton,
  countDeckTree,
  DeckDangerZone,
  DeckEditor,
  DeckReader,
  DeckShareToggle,
  type DeckDetail,
  type DeckEditorData,
} from '@/features/decks'
import { GrowthBar, neighborName, TREE_BASE_RATIO, TreeStageSvg, useTreeStage, visitHref } from '@/features/garden'
import type { ItemLevels } from '@/features/mindmap'
import type { DeckProgress } from '@/features/progress'
import { DeckRootsPanel } from './DeckRootsPanel'

// Someone else's tree (strict read-only visitor mode): the statements to read (null if they could
// not be loaded) and the visitor's purse for the clone fee.
export type DeckVisitor = { reader: DeckEditorData | null; signedIn: boolean; coins: number | null; coinsAsOf?: number }

// editor is set only for the deck owner; visitor only for everyone else.
type DeckSceneProps = { detail: DeckDetail; progress: DeckProgress | null; editor: DeckEditorData | null; visitor: DeckVisitor | null }

// Rendered size of a Standard (md) tree in the scene; its trunk base is where the roots attach.
const TREE_SIZE = 176

// Route-level composition for /deck/[slug]: one scene where the garden tree stands on the
// ground line and the mindmap roots grow out of its trunk into the soil.
function DeckScene({ detail, progress, editor, visitor }: DeckSceneProps) {
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
  const masteredCount = progress?.items.filter((i) => isMastered(i.masteryLevel)).length ?? 0
  // Visitors read the true statements; they can't drill them (practice is owner-only).
  const visitorStatements = visitor?.reader
    ? Object.fromEntries(visitor.reader.nodes.flatMap((n) => n.items.map((i) => [i.id, i.statement] as const)))
    : undefined
  const cloneButton = (size: 'sm' | 'md' | 'lg') =>
    visitor && (
      <CloneTreeButton
        deckId={deck.id}
        deckTitle={deck.title}
        statementCount={itemCount}
        coins={visitor.coins}
        coinsAsOf={visitor.coinsAsOf}
        signedIn={visitor.signedIn}
        size={size}
      />
    )

  return (
    <main className="mg-meadow-bg w-full flex-1">
      {/* Strict read-only visitor mode: a floating bar says whose tree this is, with the clone offer. */}
      {visitor && (
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-30 mx-auto mt-3 w-full max-w-5xl px-4 sm:px-6">
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border-[3px] border-[#1f5d2b] bg-gradient-to-b from-[#e9fbd9] to-[#bfe8a2] px-4 py-2.5 shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_5px_0_#2f7a3a,0_10px_22px_rgba(20,60,20,0.25)]"
          >
            <p className="font-game text-sm font-extrabold text-[#1f4d25] sm:text-base">
              🌿 You are exploring {neighborName(deck.userId)}&apos;s Tree (Read-Only)
            </p>
            {cloneButton('sm')}
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center gap-3">
          <GameButton asChild tone="cream" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" strokeWidth={3} aria-hidden />
              {visitor ? 'My garden' : 'Garden'}
            </Link>
          </GameButton>
          {visitor && (
            <GameButton asChild tone="leaf" size="sm">
              <Link href={visitHref(deck.userId)}>Visit their garden</Link>
            </GameButton>
          )}
        </div>

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
              {/* Visitors explore only: practice stays locked until they clone the tree. */}
              {visitor && (
                <div className="flex flex-1 flex-col gap-2">
                  <GameButton tone="sky" size="lg" disabled title="Visitors can explore but not practise: clone this tree to your garden first">
                    Clone to practice this tree 🌱
                  </GameButton>
                  {cloneButton('md')}
                </div>
              )}
              {!visitor && itemCount > 0 && (
                <div className="flex flex-1 flex-col gap-2">
                  {masteredCount < itemCount && (
                    <GameButton asChild tone="sky" size="lg">
                      <Link href={drillHref(deck.slug)}>💧 Water Tree</Link>
                    </GameButton>
                  )}
                  {/* Review Mode: 5/5 items rest in normal rounds; this mixes them back in. */}
                  {masteredCount > 0 && (
                    <GameButton
                      asChild
                      tone={masteredCount >= itemCount ? 'sky' : 'cream'}
                      size={masteredCount >= itemCount ? 'lg' : 'sm'}
                      title={`Include Mastered Items (Review Mode): ${masteredCount} at 5/5`}
                    >
                      <Link href={drillHref(deck.slug, { review: true })}>🌿 Review Mastered ({masteredCount})</Link>
                    </GameButton>
                  )}
                </div>
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
              : visitor
                ? 'Tap 🔍 on a root to read its statements. This tree is read-only: clone it to your garden to practise it.'
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
            canPractice={visitor === null}
            visitorStatements={visitorStatements}
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

        {visitor && (
          <section aria-labelledby="read-heading" className="mt-12">
            <GamePanel tone="wood" ribbon="leaf" title={<span id="read-heading">📖 Read this Tree</span>}>
              <p className="mb-5 text-center text-sm text-amber-100/85">
                Every root and statement, read-only. Like it? Clone it to your garden to edit it and practise it from 0/5.
              </p>
              {visitor.reader ? (
                <DeckReader reader={visitor.reader} />
              ) : (
                <p className="text-center text-sm text-amber-100/85">The statements could not be loaded right now. Try again in a moment.</p>
              )}
              {itemCount > 0 && <div className="mt-6 flex justify-center">{cloneButton('lg')}</div>}
            </GamePanel>
          </section>
        )}

        {editor && (
          <section aria-labelledby="grow-heading" className="mt-12">
            <GamePanel tone="wood" ribbon="gold" title={<span id="grow-heading">🛠️ Tree Workshop</span>}>
              <p className="mb-5 text-center text-sm text-amber-100/85">
                Change the tree species, or work through every root as a list. Everything here can also be done on the mindmap above.
              </p>
              <div className="mb-5">
                <DeckShareToggle deckId={deck.id} slug={deck.slug} isPublic={deck.isPublic} />
              </div>
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

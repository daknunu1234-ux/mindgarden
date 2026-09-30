'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { GameButton, GamePanel, GameSlab, Ribbon } from '@/shared/components/game'
import { isMastered } from '@/shared/lib/mastery'
import { getTreeSizeTier, getTreeSpecies } from '@/shared/lib/treeSkins'
import { DisplayNameEditor } from '@/features/auth'
import { launchPool, SessionLaunchButton, SessionLaunchProvider, type LaunchContext } from '@/features/drill'
import {
  CloneTreeButton,
  countDeckTree,
  DeckDangerZone,
  DeckDraftProvider,
  DeckEditor,
  DeckReader,
  DeckShareToggle,
  TournamentHostToggle,
  useDeckDraft,
  type DeckDetail,
  type DeckEditorData,
} from '@/features/decks'
import { GrowthBar, neighborName, TREE_BASE_RATIO, TreeStageSvg, useTreeStage, visitHref } from '@/features/garden'
import type { ItemLevels } from '@/features/mindmap'
import type { DeckProgress } from '@/features/progress'
import { TournamentBoard, TournamentLiveBadge, type TournamentBoardsView } from '@/features/tournament'
import { DeckRootsPanel } from './DeckRootsPanel'

// Someone else's tree (strict read-only visitor mode): the statements to read (null if they could
// not be loaded) and the visitor's purse for the clone fee.
export type DeckVisitor = { reader: DeckEditorData | null; signedIn: boolean; coins: number | null; coinsAsOf?: number }

// Mind Tournament on a shared tree: whether the owner hosts one now, and its boards (null on a
// private tree or when they couldn't be loaded).
export type DeckTournament = {
  isOpen: boolean
  boards: TournamentBoardsView | null
  viewerId: string | null
  // The viewer's chosen Garden Name (null = pseudonym), for the ✏️ on their own board row.
  viewerDisplayName: string | null
}

// editor is set only for the deck owner; visitor only for everyone else.
type DeckSceneProps = {
  detail: DeckDetail
  // The owner's public name (chosen Garden Name, else pseudonym), for the visitor banner.
  ownerName: string
  progress: DeckProgress | null
  editor: DeckEditorData | null
  visitor: DeckVisitor | null
  tournament: DeckTournament
}

// Rendered size of a Standard (md) tree in the scene; its trunk base is where the roots attach.
const TREE_SIZE = 176

// Route-level composition for /deck/[slug]: one scene where the garden tree stands on the
// ground line and the mindmap roots grow out of its trunk into the soil. A client component so the
// owner's edits are optimistic (decks' deck draft): a new species or new statements show across the
// whole scene at once (sprite, ribbon, counts, size tier, mindmap, Workshop list) and sync in the
// background, with no page refresh.
function DeckScene({ detail: serverDetail, ownerName, progress, editor: serverEditor, visitor, tournament }: DeckSceneProps) {
  const { view, actions } = useDeckDraft(serverDetail, serverEditor)
  const { detail, editor } = view
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
  // Statement texts for the mindmap: the owner's from the editor (their own tree, a clone included),
  // visitors' from the reader. Without them the cards fall back to "Statement n".
  const statementSource = editor ?? visitor?.reader ?? null
  const statementTexts = statementSource
    ? Object.fromEntries(statementSource.nodes.flatMap((n) => n.items.map((i) => [i.id, i.statement] as const)))
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
  // Visitors join while it's live; the boards stay up after the host closes it (graduates are engraved).
  const canJoin = visitor !== null && tournament.isOpen && itemCount > 0
  // One launch pop-up for the page (5 / 10 / 20, whole tree or one root). The owner waters
  // (user_progress); a visitor competes while a tournament is live (tournament levels); any other
  // visitor has nothing to launch. Scope counts use the drillable flags from the editor / reader.
  const launchMode: LaunchContext['mode'] | null = visitor ? (canJoin ? 'compete' : null) : 'drill'
  const tournamentLevels = tournament.boards?.levels ?? {}
  const drillable = new Map((editor ?? visitor?.reader)?.nodes.flatMap((n) => n.items.map((i) => [i.id, i.drillable] as const)) ?? [])
  const launch: LaunchContext | null = launchMode && {
    mode: launchMode,
    slug: deck.slug,
    ...launchPool(tree, drillable),
    levels: launchMode === 'compete' ? tournamentLevels : levels,
  }
  // The mindmap shows the levels of the practice at hand: a contestant sees their tournament levels.
  const mapLevels = launchMode === 'compete' ? tournamentLevels : levels
  const hasEntries = (tournament.boards?.active.length ?? 0) + (tournament.boards?.hallOfFame.length ?? 0) > 0
  // Open → always (the join launcher lives here); closed → only while it has results to show.
  const showBoards = tournament.isOpen || (tournament.boards !== null && hasEntries)
  const joinButton = (size: 'sm' | 'md' | 'lg') =>
    canJoin && <SessionLaunchButton label="⚔️ Join Mind Tournament" tone="sun" size={size} />

  const scene = (
    <main className="mg-meadow-bg w-full flex-1">
      {/* Strict read-only visitor mode: a floating bar says whose tree this is, with the clone offer. */}
      {visitor && (
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-30 mx-auto mt-3 w-full max-w-5xl px-4 sm:px-6">
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border-[3px] border-[#1f5d2b] bg-gradient-to-b from-[#e9fbd9] to-[#bfe8a2] px-4 py-2.5 shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_5px_0_#2f7a3a,0_10px_22px_rgba(20,60,20,0.25)]"
          >
            <p className="font-game text-sm font-extrabold text-[#1f4d25] sm:text-base">
              🌿 You are exploring {ownerName}&apos;s Tree (Read-Only)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {joinButton('sm')}
              {cloneButton('sm')}
            </div>
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
                  {getTreeSpecies(deck.treeType).icon} {getTreeSpecies(deck.treeType).label}
                </Ribbon>
                <Ribbon tone={size.tier === 'xl' ? 'gold' : 'sky'}>
                  <span title={`${size.name}: ${itemCount} ${itemCount === 1 ? 'statement' : 'statements'}`}>{size.badge}</span>
                </Ribbon>
                {!deck.isPublic && <Ribbon tone="berry">🔒 Private</Ribbon>}
                {tournament.isOpen && <TournamentLiveBadge />}
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
                  {joinButton('md')}
                  {cloneButton('md')}
                </div>
              )}
              {/* Each opens the launch pop-up: 5 / 10 / 20 questions, then the round. */}
              {!visitor && itemCount > 0 && (
                <div className="flex flex-1 flex-col gap-2">
                  {masteredCount < itemCount && <SessionLaunchButton label="💧 Water Tree" tone="sky" size="lg" />}
                  {/* Review Mode: 5/5 items rest in normal rounds; this mixes them back in. */}
                  {masteredCount > 0 && (
                    <SessionLaunchButton
                      review
                      label={`🌿 Review Mastered (${masteredCount})`}
                      tone={masteredCount >= itemCount ? 'sky' : 'cream'}
                      size={masteredCount >= itemCount ? 'lg' : 'sm'}
                      title={`Include Mastered Items (Review Mode): ${masteredCount} at 5/5`}
                    />
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
                ? 'Tap a root’s 📜 count to read its statements. This tree is read-only: clone it to your garden to practise it.'
                : editor
                  ? 'Hover a root for ＋📜 statement or ＋🌿 sub-root and type right on the map: Enter adds the next, Tab nests, Shift+Tab goes up. Chips above jump to any root.'
                  : 'Tap a root’s 📜 count to see its statements and practise that branch. Roots glow brighter as you master them.'}
          </p>
          <DeckRootsPanel
            deckId={deck.id}
            treeType={deck.treeType}
            tree={tree}
            levels={mapLevels}
            editor={editor}
            practiceMode={launchMode}
            statements={statementTexts}
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
            emptyLabel={editor ? 'No roots yet. Plant the first concept below, or tap ＋ Root any time 🌱' : 'No roots yet. This tree is waiting for its first concept 🌱'}
          />
        </section>

        {showBoards && (
          <section id="tournament" aria-labelledby="tournament-heading" className="mt-12 scroll-mt-24">
            <GamePanel tone="parchment" ribbon="gold" title={<span id="tournament-heading">Tournament Leaderboard 📜</span>}>
              <p className="mb-4 text-center text-sm text-amber-900/75">
                {tournament.isOpen
                  ? 'Master every statement (5/5) in the fewest practice days. Graduates are engraved in the Hall of Fame forever.'
                  : 'The host closed this tournament. Its graduates stay engraved in the Hall of Fame.'}
              </p>
              {tournament.boards ? (
                <TournamentBoard
                  active={tournament.boards.active}
                  hallOfFame={tournament.boards.hallOfFame}
                  viewerId={tournament.viewerId}
                  standing={tournament.boards.standing}
                  // Your own row: ✏️ edit your Garden Name right there; saving refreshes both tabs.
                  viewerAction={
                    tournament.viewerId && (
                      <DisplayNameEditor
                        variant="inline"
                        current={tournament.viewerDisplayName}
                        fallback={neighborName(tournament.viewerId)}
                      />
                    )
                  }
                />
              ) : (
                <p className="text-center text-sm font-semibold text-amber-900/70">The leaderboard could not be loaded right now. Try again in a moment.</p>
              )}
              {canJoin && <div className="mt-6 flex justify-center">{joinButton('lg')}</div>}
            </GamePanel>
          </section>
        )}

        {visitor && (
          <section aria-labelledby="read-heading" className="mt-12">
            <GamePanel tone="wood" ribbon="leaf" title={<span id="read-heading">📖 Read this Tree</span>}>
              <p className="mb-5 text-center text-sm text-amber-100/85">
                Every root and statement, read-only. Like it? Clone it to your garden to edit it and practise it from 0/5.
              </p>
              {visitor.reader ? (
                <DeckReader
                  reader={visitor.reader}
                  // Mind Tournament: compete on one root straight from the list.
                  rootAction={canJoin ? (rootId) => <SessionLaunchButton rootId={rootId} label="⚔️ Compete Root" tone="sun" size="sm" /> : undefined}
                />
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
              <div className="mb-5">
                <TournamentHostToggle deckId={deck.id} isPublic={deck.isPublic} isOpen={deck.isTournamentOpen} />
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

  const withDraft = <DeckDraftProvider value={actions}>{scene}</DeckDraftProvider>
  return launch ? <SessionLaunchProvider context={launch}>{withDraft}</SessionLaunchProvider> : withDraft
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

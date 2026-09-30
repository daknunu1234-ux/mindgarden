import Link from 'next/link'
import { GameButton, GamePanel, Ribbon } from '@/shared/components/game'
import { isMastered } from '@/shared/lib/mastery'
import { getCurrentUser, getDisplayNames } from '@/features/auth'
import { getDecks, getNeighborGarden, getVisitedGardens, type Deck } from '@/features/decks'
import { FarmWorld } from './_components/FarmWorld'
import {
  GardenGrid,
  getFarmPlacements,
  groupVisitedGardens,
  publicName,
  treeBuff,
  ViewToggle,
  VisitedGardensDrawer,
  type DeckCardView,
  type FarmHudView,
  type FarmPlotView,
} from '@/features/garden'
import { getFarmHud, getProgressByDecks, type DeckProgress } from '@/features/progress'

type View = 'farm' | 'grid'

// `/` shows the Farm Island by default; `?view=grid` is the classic card grid.
const hrefFor = (view: View, page = 1) => {
  const params = new URLSearchParams()
  if (view === 'grid') params.set('view', 'grid')
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/?${query}` : '/'
}

// Joins decks with the player's progress (50 decks per request). If progress fails to load, trees
// show 0% instead of failing the page.
async function loadProgress(decks: Deck[]): Promise<Map<string, DeckProgress>> {
  const map = new Map<string, DeckProgress>()
  for (let i = 0; i < decks.length; i += 50) {
    const res = await getProgressByDecks({ deckIds: decks.slice(i, i + 50).map((d) => d.id) })
    if (res.success) for (const p of res.data) map.set(p.deckId, p)
  }
  return map
}

// The farm shows every tree the gardener owns (not one page): up to FARM_DECK_PAGES × 50.
const FARM_DECK_PAGES = 4
async function loadAllOwnDecks(): Promise<Awaited<ReturnType<typeof getDecks>>> {
  const first = await getDecks({ limit: 50, page: 1 })
  if (!first.success) return first
  const decks = [...first.data]
  const pages = Math.min(FARM_DECK_PAGES, Math.ceil((first.meta?.total ?? 0) / 50))
  for (let page = 2; page <= pages; page++) {
    const next = await getDecks({ limit: 50, page })
    if (next.success) decks.push(...next.data)
  }
  return { ...first, data: decks }
}

function toPlotView(d: Deck, p: DeckProgress | undefined, userId: string | null): FarmPlotView {
  const isOwner = userId !== null && d.userId === userId
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    treeType: d.treeType,
    masteryPercent: p?.masteryPercent ?? 0,
    itemCount: p?.itemCount ?? 0,
    masteredCount: p?.items.filter((i) => isMastered(i.masteryLevel)).length ?? 0,
    mightyRoots: p?.mightyRoots ?? 0,
    // Only the owner waters a tree (visitors are read-only), so only they get watering status.
    needsWater: isOwner ? !(p?.practicedToday ?? false) : null,
    wateredDay: isOwner && p?.practicedToday ? p.lastPracticedDay : null,
    isOwner,
    isTournamentOpen: d.isPublic && d.isTournamentOpen,
  }
}

// ?visit=<gardener id>: read-only visit to a neighbour's farm (their shared trees only).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Home({ searchParams }: PageProps<'/'>) {
  const { page, login, view: rawView, visit: rawVisit, refund: rawRefund } = await searchParams
  const view: View = rawView === 'grid' ? 'grid' : 'farm'

  const [userRes, hudRes, visitedRes] = await Promise.all([getCurrentUser(), getFarmHud(), getVisitedGardens()])
  const userId = userRes.success ? (userRes.data?.id ?? null) : null
  // Visiting yourself is just your own garden.
  const visitOwnerId = view === 'farm' && typeof rawVisit === 'string' && UUID.test(rawVisit) && rawVisit !== userId ? rawVisit : null

  // Farm: every own tree (or the neighbour's shared ones) + the farm's placements. Grid: one page.
  const res =
    view === 'farm'
      ? visitOwnerId
        ? await getNeighborGarden({ ownerId: visitOwnerId, limit: 50 })
        : await loadAllOwnDecks()
      : await getDecks({ page: typeof page === 'string' ? page : undefined })
  const decks = res.success ? res.data : []
  const [progress, placementsRes] = await Promise.all([
    loadProgress(decks),
    view === 'farm' ? getFarmPlacements(visitOwnerId ? { ownerId: visitOwnerId } : {}) : null,
  ])
  const placements = placementsRes?.success ? placementsRes.data : []
  const currentPage = res.success ? (res.meta?.page ?? 1) : 1
  // Visited Gardens drawer: shared trees this player opened. A failed load shows an empty drawer.
  // Gardeners show by their chosen Garden Name, else their pseudonym.
  const visited = visitedRes.success ? visitedRes.data : []
  // Your own name too: the farm's top banner shows it.
  const namesRes = await getDisplayNames({
    userIds: [...new Set([...visited.map((t) => t.ownerId), ...(visitOwnerId ? [visitOwnerId] : []), ...(userId && !visitOwnerId ? [userId] : [])])],
  })
  const names = namesRes.success ? namesRes.data : {}
  const visitedGardens = groupVisitedGardens(visited, userId, names)
  const visitName = visitOwnerId ? publicName(names[visitOwnerId], visitOwnerId) : null
  const gardenName = userId && !visitOwnerId ? publicName(names[userId], userId) : undefined

  const cards: DeckCardView[] = decks.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    treeType: d.treeType,
    masteryPercent: progress.get(d.id)?.masteryPercent ?? 0,
  }))

  // Trees on the farm carry their tile and coin buff; own trees without a tile wait in the Shop.
  const treeTiles = new Map(placements.filter((p) => p.itemType === 'tree' && p.deckId).map((p) => [p.deckId!, p]))
  const allPlots = decks.map((d) => toPlotView(d, progress.get(d.id), userId))
  const plots: FarmPlotView[] = allPlots.flatMap((plot) => {
    const tile = treeTiles.get(plot.id)
    return tile ? [{ ...plot, placementId: tile.id, buff: treeBuff(tile.x, tile.y, placements).multiplier }] : []
  })
  const unplacedTrees = visitOwnerId ? [] : allPlots.filter((plot) => plot.isOwner && !treeTiles.has(plot.id))

  const hud = hudRes.success ? hudRes.data : null
  const hudView: FarmHudView = {
    level: hud
      ? {
          level: hud.level.level,
          title: hud.level.title,
          progress: hud.level.progress,
          xpIntoLevel: hud.level.xpIntoLevel,
          xpForNextLevel: hud.level.xpForNextLevel,
        }
      : null,
    streak: hud ? { current: hud.streak.current, practicedToday: hud.streak.practicedToday } : null,
    coins: hud ? hud.coins : null,
    coinsAsOf: hud?.coinsAsOf,
  }

  const total = res.success ? (res.meta?.total ?? 0) : 0
  const limit = res.success ? (res.meta?.limit ?? 20) : 20

  // Farm World: full-bleed game viewport under the site header; everything else floats in the HUD.
  if (view === 'farm' && res.success) {
    const refund = typeof rawRefund === 'string' && /^\d{1,3}$/.test(rawRefund) ? Number(rawRefund) : 0
    const notices = (
      <>
        {login === 'error' && (
          <p className="rounded-full border-2 border-amber-500 bg-amber-50/95 px-3 py-1 font-game text-sm font-semibold text-amber-900 shadow-[0_3px_0_rgba(180,83,9,0.4)]">
            That sign-in link didn&apos;t work. Request a new one with Sign in.
          </p>
        )}
        {refund > 0 && !visitOwnerId && (
          <p className="rounded-full border-2 border-amber-500 bg-amber-50/95 px-3 py-1 font-game text-sm font-semibold text-amber-900 shadow-[0_3px_0_rgba(180,83,9,0.4)]">
            🪚 Woodshop refund: +{refund} 🪙 for the chopped tree
          </p>
        )}
      </>
    )
    return (
      <main className="flex w-full flex-1 flex-col">
        <h1 className="sr-only">{visitName ? `${visitName}'s Garden` : 'Farm World'}</h1>
        <FarmWorld
          // A fresh farm (camera, popups) when switching between gardens.
          key={visitOwnerId ?? userId ?? 'guest'}
          plots={plots}
          placements={placements}
          unplacedTrees={unplacedTrees}
          hud={hudView}
          gardenName={gardenName}
          signedIn={userId !== null}
          gridHref={hrefFor('grid', currentPage)}
          visitor={visitName ? { name: visitName, backHref: '/' } : null}
          leftEdge={<VisitedGardensDrawer gardens={visitedGardens} signedIn={userId !== null} visitingOwnerId={visitOwnerId} />}
          topCenter={!visitOwnerId && (login === 'error' || refund > 0) && <div className="flex flex-col items-center gap-1.5">{notices}</div>}
        />
      </main>
    )
  }

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-game text-4xl font-extrabold tracking-tight text-emerald-900 [text-shadow:0_2px_0_rgba(255,255,255,0.8)]">
              Garden 🌳
            </h1>
            <p className="mt-1 font-medium text-emerald-900/70">Pick a tree and start growing its roots.</p>
          </div>
          <ViewToggle view={view} farmHref={hrefFor('farm', currentPage)} gridHref={hrefFor('grid', currentPage)} />
        </header>

        {login === 'error' && (
          <GamePanel tone="gold" ribbon="gold" title="Sign-in link wilted" className="mb-8">
            <p className="text-center text-sm">
              It may have expired or been opened in a different browser. Request a new one with Sign in.
            </p>
          </GamePanel>
        )}

        {res.success ? (
          <>
            <GardenGrid decks={cards} />
            <Pagination view={view} page={currentPage} limit={limit} total={total} />
          </>
        ) : (
          <GamePanel tone="stone" title="The garden is resting">
            <p className="text-center text-sm">{res.error.message}. Try again in a moment.</p>
          </GamePanel>
        )}
      </div>
    </main>
  )
}

function Pagination({ view, page, limit, total }: { view: View; page: number; limit: number; total: number }) {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1) return null

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
      <PageLink href={hrefFor(view, page - 1)} enabled={page > 1} label="◀ Previous" />
      <Ribbon tone="leaf">
        <span className="tabular-nums">
          Page {page} of {lastPage}
        </span>
      </Ribbon>
      <PageLink href={hrefFor(view, page + 1)} enabled={page < lastPage} label="Next ▶" />
    </nav>
  )
}

function PageLink({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  if (!enabled) {
    return (
      <GameButton tone="cream" disabled>
        {label}
      </GameButton>
    )
  }
  return (
    <GameButton tone="cream" asChild>
      <Link href={href}>{label}</Link>
    </GameButton>
  )
}

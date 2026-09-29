import Link from 'next/link'
import { GameButton, GamePanel, Ribbon } from '@/shared/components/game'
import { getCurrentUser } from '@/features/auth'
import { getDecks, type Deck } from '@/features/decks'
import { FarmWorld } from './_components/FarmWorld'
import {
  GardenGrid,
  ViewToggle,
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

// Joins decks with the player's progress. If progress fails to load, trees show 0% instead of failing the page.
async function loadProgress(decks: Deck[]): Promise<Map<string, DeckProgress>> {
  if (decks.length === 0) return new Map()
  const res = await getProgressByDecks({ deckIds: decks.map((d) => d.id) })
  return new Map(res.success ? res.data.map((p) => [p.deckId, p]) : [])
}

export default async function Home({ searchParams }: PageProps<'/'>) {
  const { page, login, view: rawView } = await searchParams
  const view: View = rawView === 'grid' ? 'grid' : 'farm'

  const [res, userRes, hudRes] = await Promise.all([
    getDecks({ page: typeof page === 'string' ? page : undefined }),
    getCurrentUser(),
    getFarmHud(),
  ])
  const decks = res.success ? res.data : []
  const progress = await loadProgress(decks)
  const userId = userRes.success ? (userRes.data?.id ?? null) : null
  const currentPage = res.success ? (res.meta?.page ?? 1) : 1

  const cards: DeckCardView[] = decks.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    treeType: d.treeType,
    masteryPercent: progress.get(d.id)?.masteryPercent ?? 0,
  }))

  const plots: FarmPlotView[] = decks.map((d) => {
    const p = progress.get(d.id)
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      treeType: d.treeType,
      masteryPercent: p?.masteryPercent ?? 0,
      itemCount: p?.itemCount ?? 0,
      mightyRoots: p?.mightyRoots ?? 0,
      // Only a signed-in player has watering status.
      needsWater: userId ? !(p?.practicedToday ?? false) : null,
      wateredDay: userId && p?.practicedToday ? p.lastPracticedDay : null,
      isOwner: userId !== null && d.userId === userId,
    }
  })

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
    gems: plots.reduce((sum, p) => sum + p.mightyRoots, 0),
  }

  const total = res.success ? (res.meta?.total ?? 0) : 0
  const limit = res.success ? (res.meta?.limit ?? 20) : 20
  const lastPage = Math.max(1, Math.ceil(total / limit))

  // Farm World: full-bleed game viewport under the site header; everything else floats in the HUD.
  if (view === 'farm' && res.success) {
    const loginNotice = login === 'error' && (
      <p className="rounded-full border-2 border-amber-500 bg-amber-50/95 px-3 py-1 font-game text-sm font-semibold text-amber-900 shadow-[0_3px_0_rgba(180,83,9,0.4)]">
        That sign-in link didn&apos;t work. Request a new one with Sign in.
      </p>
    )
    const islands = lastPage > 1 && (
      <nav aria-label="Islands" className="flex items-center gap-4">
        <IslandStep href={currentPage > 1 ? hrefFor('farm', currentPage - 1) : null} label="Previous island" glyph="◀" />
        <Ribbon tone="sky">
          <span className="tabular-nums">
            Island {currentPage} / {lastPage}
          </span>
        </Ribbon>
        <IslandStep href={currentPage < lastPage ? hrefFor('farm', currentPage + 1) : null} label="Next island" glyph="▶" />
      </nav>
    )
    return (
      <main className="flex w-full flex-1 flex-col">
        <h1 className="sr-only">Farm World</h1>
        <FarmWorld
          plots={plots}
          hud={hudView}
          signedIn={userId !== null}
          gridHref={hrefFor('grid', currentPage)}
          topCenter={
            (loginNotice || islands) && (
              <div className="flex flex-col items-center gap-1.5">
                {loginNotice}
                {islands}
              </div>
            )
          }
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

function IslandStep({ href, label, glyph }: { href: string | null; label: string; glyph: string }) {
  return href ? (
    <GameButton asChild tone="cream" size="icon-sm">
      <Link href={href} aria-label={label}>
        {glyph}
      </Link>
    </GameButton>
  ) : (
    <GameButton tone="cream" size="icon-sm" disabled aria-label={label}>
      {glyph}
    </GameButton>
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
          {view === 'farm' ? 'Island' : 'Page'} {page} of {lastPage}
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

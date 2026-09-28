import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { getCurrentUser } from '@/features/auth'
import { getDecks, type Deck } from '@/features/decks'
import {
  FarmIslandView,
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
      <p className="rounded-full border-2 border-amber-500 bg-amber-50/95 px-3 py-1 text-xs font-medium text-amber-900 shadow">
        That sign-in link didn&apos;t work. Request a new one with Sign in.
      </p>
    )
    const islands = lastPage > 1 && (
      <nav aria-label="Islands" className="flex items-center gap-1 rounded-full border-2 border-amber-900/25 bg-amber-50/90 p-1 text-xs font-semibold text-amber-950 shadow">
        {currentPage > 1 ? (
          <Link href={hrefFor('farm', currentPage - 1)} className="rounded-full px-2 py-0.5 hover:bg-amber-100">
            ◀
          </Link>
        ) : (
          <span className="px-2 py-0.5 opacity-40">◀</span>
        )}
        <span className="tabular-nums">
          Island {currentPage} / {lastPage}
        </span>
        {currentPage < lastPage ? (
          <Link href={hrefFor('farm', currentPage + 1)} className="rounded-full px-2 py-0.5 hover:bg-amber-100">
            ▶
          </Link>
        ) : (
          <span className="px-2 py-0.5 opacity-40">▶</span>
        )}
      </nav>
    )
    return (
      <main className="flex w-full flex-1 flex-col">
        <h1 className="sr-only">Farm World</h1>
        <FarmIslandView
          plots={plots}
          hud={hudView}
          signedIn={userId !== null}
          farmHref={hrefFor('farm', currentPage)}
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Garden 🌳</h1>
          <p className="mt-1 text-muted-foreground">Pick a tree and start growing its roots.</p>
        </div>
        <ViewToggle view={view} farmHref={hrefFor('farm', currentPage)} gridHref={hrefFor('grid', currentPage)} />
      </header>

      {login === 'error' && (
        <Alert className="mb-6 border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>That sign-in link didn&apos;t work</AlertTitle>
          <AlertDescription>
            It may have expired or been opened in a different browser. Request a new one with Sign in.
          </AlertDescription>
        </Alert>
      )}

      {res.success ? (
        <>
          <GardenGrid decks={cards} />
          <Pagination view={view} page={currentPage} limit={limit} total={total} />
        </>
      ) : (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>The garden is resting</AlertTitle>
          <AlertDescription>{res.error.message}. Try again in a moment.</AlertDescription>
        </Alert>
      )}
    </main>
  )
}

function Pagination({ view, page, limit, total }: { view: View; page: number; limit: number; total: number }) {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1) return null

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
      <PageLink href={hrefFor(view, page - 1)} enabled={page > 1} label="Previous" />
      <span className="text-sm text-muted-foreground">
        {view === 'farm' ? 'Island' : 'Page'} {page} of {lastPage}
      </span>
      <PageLink href={hrefFor(view, page + 1)} enabled={page < lastPage} label="Next" />
    </nav>
  )
}

function PageLink({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  if (!enabled) {
    return (
      <Button variant="outline" disabled>
        {label}
      </Button>
    )
  }
  return (
    <Button variant="outline" asChild>
      <Link href={href}>{label}</Link>
    </Button>
  )
}

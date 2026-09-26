import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { getDecks } from '@/features/decks'
import { GardenGrid } from '@/features/garden'

export default async function Home({ searchParams }: PageProps<'/'>) {
  const { page, login } = await searchParams
  const res = await getDecks({ page: typeof page === 'string' ? page : undefined })

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Garden 🌳</h1>
        <p className="mt-2 text-muted-foreground">Pick a tree and start growing its roots.</p>
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
          <GardenGrid decks={res.data} />
          <Pagination page={res.meta?.page ?? 1} limit={res.meta?.limit ?? 20} total={res.meta?.total ?? 0} />
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

function Pagination({ page, limit, total }: { page: number; limit: number; total: number }) {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1) return null

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
      <PageLink page={page - 1} enabled={page > 1} label="Previous" />
      <span className="text-sm text-muted-foreground">
        Page {page} of {lastPage}
      </span>
      <PageLink page={page + 1} enabled={page < lastPage} label="Next" />
    </nav>
  )
}

function PageLink({ page, enabled, label }: { page: number; enabled: boolean; label: string }) {
  if (!enabled) {
    return (
      <Button variant="outline" disabled>
        {label}
      </Button>
    )
  }
  return (
    <Button variant="outline" asChild>
      <Link href={`/?page=${page}`}>{label}</Link>
    </Button>
  )
}

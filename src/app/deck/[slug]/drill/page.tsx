import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { getCurrentUser } from '@/features/auth'
import { DrillOverlay, getDrillSession } from '@/features/drill'

export const metadata: Metadata = { title: 'Practice · MindGarden' }

// /deck/[slug]/drill            → the whole tree
// /deck/[slug]/drill?nodeId=<id> → one root and its sub-roots ("Drill branch" in the mindmap)
export default async function DrillPage({ params, searchParams }: PageProps<'/deck/[slug]/drill'>) {
  const { slug } = await params
  const { nodeId: rawNodeId } = await searchParams
  const nodeId = typeof rawNodeId === 'string' && rawNodeId !== '' ? rawNodeId : undefined

  const [res, userRes] = await Promise.all([getDrillSession({ slug, nodeId }), getCurrentUser()])
  const isSignedIn = userRes.success && userRes.data !== null

  if (!res.success) {
    const { code, message } = res.error
    // Unknown deck, unknown root, or a malformed slug / nodeId can never match: 404.
    if (code === 'DECK_NOT_FOUND' || code === 'NODE_NOT_FOUND' || code === 'VALIDATION_FAILED') notFound()

    const noItems = code === 'DRILL_NO_ITEMS'
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <Alert className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>{noItems ? 'Nothing to practice yet 🌱' : 'The drill is resting'}</AlertTitle>
          <AlertDescription>
            {noItems
              ? `${nodeId ? 'This branch' : 'This tree'} has no drillable statements yet. Add statements about sibling concepts, or with words like tăng/giảm, trước/sau or là.`
              : `${message}. Try again in a moment.`}
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link href={`/deck/${slug}`}>Back to tree</Link>
          </Button>
          {nodeId && noItems && (
            <Button variant="ghost" asChild>
              <Link href={`/deck/${slug}/drill`}>Practice the whole tree</Link>
            </Button>
          )}
        </div>
      </main>
    )
  }

  const { deck, focus, sessionId } = res.data
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{deck.title}</h1>
        {focus && (
          <>
            <Badge variant="secondary">Branch: {focus.title}</Badge>
            <Link href={`/deck/${deck.slug}/drill`} className="text-sm text-muted-foreground hover:text-foreground">
              Practice the whole tree
            </Link>
          </>
        )}
      </div>
      {/* A new session (e.g. after "Practice again" refreshes) remounts the overlay with fresh state. */}
      <DrillOverlay key={sessionId} session={res.data} isSignedIn={isSignedIn} />
    </main>
  )
}

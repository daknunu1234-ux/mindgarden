import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { getCurrentUser } from '@/features/auth'
import { DrillOverlay, getDrillSession } from '@/features/drill'

export const metadata: Metadata = { title: 'Practice · MindGarden' }

export default async function DrillPage({ params }: PageProps<'/deck/[slug]/drill'>) {
  const { slug } = await params
  const [res, userRes] = await Promise.all([getDrillSession({ slug }), getCurrentUser()])
  const isSignedIn = userRes.success && userRes.data !== null

  if (!res.success) {
    const { code, message } = res.error
    if (code === 'DECK_NOT_FOUND' || code === 'VALIDATION_FAILED') notFound()

    const noItems = code === 'DRILL_NO_ITEMS'
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <Alert className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>{noItems ? 'Nothing to practice yet 🌱' : 'The drill is resting'}</AlertTitle>
          <AlertDescription>
            {noItems
              ? 'This tree has no drillable statements yet. Add statements with words like tăng/giảm, trước/sau or là.'
              : `${message}. Try again in a moment.`}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-6">
          <Link href={`/deck/${slug}`}>Back to tree</Link>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{res.data.deck.title}</h1>
      {/* A new session (e.g. after "Practice again" refreshes) remounts the overlay with fresh state. */}
      <DrillOverlay key={res.data.sessionId} session={res.data} isSignedIn={isSignedIn} />
    </main>
  )
}

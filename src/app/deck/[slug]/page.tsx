import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { getDeckBySlug } from '@/features/decks'
import { DeckScene } from './_components/DeckScene'

// generateMetadata and the page share one query per request.
const loadDeck = cache((slug: string) => getDeckBySlug({ slug }))

export async function generateMetadata({ params }: PageProps<'/deck/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const res = await loadDeck(slug)
  if (!res.success) return { title: 'MindGarden' }
  return {
    title: `${res.data.deck.title} · MindGarden`,
    description: res.data.deck.description ?? undefined,
  }
}

export default async function DeckPage({ params }: PageProps<'/deck/[slug]'>) {
  const { slug } = await params
  const res = await loadDeck(slug)

  if (!res.success) {
    // A malformed slug can never match a deck, so it is a 404 too.
    if (res.error.code === 'DECK_NOT_FOUND' || res.error.code === 'VALIDATION_FAILED') notFound()

    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <Alert className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTitle>This tree is resting</AlertTitle>
          <AlertDescription>{res.error.message}. Try again in a moment.</AlertDescription>
        </Alert>
      </main>
    )
  }

  return <DeckScene detail={res.data} />
}

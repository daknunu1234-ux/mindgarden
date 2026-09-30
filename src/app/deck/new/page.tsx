import type { Metadata } from 'next'
import { getCurrentUser } from '@/features/auth'
import { CreateDeckForm } from '@/features/decks'
import { getFarmHud } from '@/features/progress'
import { GamePanel } from '@/shared/components/game'
import { SignInPrompt } from '@/shared/components/SignInPrompt'
import { SEED_PRICE_COINS } from '@/shared/lib/economy'
import { TREE_TYPE_IDS, type TreeTypeId } from '@/shared/lib/treeSkins'

export const metadata: Metadata = { title: 'Plant a Tree · MindGarden' }

// Composes auth (who), progress (the purse) and decks (the paid planting form). `?species=<id>`
// (the farm Shop's seed gallery) preselects a species; anything else starts on oak.
export default async function NewDeckPage({ searchParams }: PageProps<'/deck/new'>) {
  const { species } = await searchParams
  const initialTreeType = typeof species === 'string' && (TREE_TYPE_IDS as readonly string[]).includes(species) ? (species as TreeTypeId) : undefined
  const res = await getCurrentUser()
  const signedIn = res.success && res.data !== null
  const hud = signedIn ? await getFarmHud() : null
  const purse = hud?.success && hud.data ? hud.data : null

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        {signedIn ? (
          <GamePanel tone="parchment" ribbon="leaf" title="🌱 Plant a Tree" titleAs="h1">
            <p className="mb-6 text-center text-sm text-amber-900/70">
              Buy a seed for {SEED_PRICE_COINS} 🪙 and name your deck. You&apos;ll add its roots and statements next.
            </p>
            <CreateDeckForm coins={purse?.coins ?? null} coinsAsOf={purse?.coinsAsOf} initialTreeType={initialTreeType} />
          </GamePanel>
        ) : (
          <SignInPrompt title="Sign in to plant your own tree" description="Your trees and their roots are saved to your account." />
        )}
      </div>
    </main>
  )
}

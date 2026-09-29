import type { Metadata } from 'next'
import { getCurrentUser } from '@/features/auth'
import { CreateDeckForm } from '@/features/decks'
import { GamePanel } from '@/shared/components/game'
import { SignInPrompt } from '@/shared/components/SignInPrompt'

export const metadata: Metadata = { title: 'Plant a Tree · MindGarden' }

export default async function NewDeckPage() {
  const res = await getCurrentUser()
  const signedIn = res.success && res.data !== null

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        {signedIn ? (
          <GamePanel tone="parchment" ribbon="leaf" title="🌱 Plant a Tree" titleAs="h1">
            <p className="mb-6 text-center text-sm text-amber-900/70">Name your deck. You&apos;ll add its roots and statements next.</p>
            <CreateDeckForm />
          </GamePanel>
        ) : (
          <SignInPrompt title="Sign in to plant your own tree" description="Your trees and their roots are saved to your account." />
        )}
      </div>
    </main>
  )
}

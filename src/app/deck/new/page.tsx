import type { Metadata } from 'next'
import { getCurrentUser } from '@/features/auth'
import { CreateDeckForm } from '@/features/decks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { SignInPrompt } from './_components/SignInPrompt'

export const metadata: Metadata = { title: 'Plant a Tree · MindGarden' }

export default async function NewDeckPage() {
  const res = await getCurrentUser()
  const signedIn = res.success && res.data !== null

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
      {signedIn ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Plant a Tree 🌱</CardTitle>
            <CardDescription>Name your deck. You&apos;ll add its roots and statements next.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateDeckForm />
          </CardContent>
        </Card>
      ) : (
        <SignInPrompt />
      )}
    </main>
  )
}

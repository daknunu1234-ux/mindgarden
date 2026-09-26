import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'

export default function DeckNotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <Alert className="border-amber-500 bg-amber-50 text-amber-900">
        <AlertTitle>This tree hasn&apos;t been planted</AlertTitle>
        <AlertDescription>
          We couldn&apos;t find that deck. It may have been removed, or it&apos;s private.
        </AlertDescription>
      </Alert>
      <Button variant="outline" asChild className="mt-6">
        <Link href="/">Back to the garden</Link>
      </Button>
    </main>
  )
}

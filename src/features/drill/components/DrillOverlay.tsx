'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { useDrillSession } from '../hooks/useDrillSession'
import type { DrillSession } from '../types'
import { DrillCard } from './DrillCard'

type DrillOverlayProps = { session: DrillSession; isSignedIn: boolean }

// One burst when a round ends with at least one root grown. Loaded lazily; respects reduced motion.
function celebrate() {
  import('canvas-confetti').then(({ default: confetti }) =>
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true }),
  )
}

// Practice round for one deck: question → answer → feedback → next, then a summary.
function DrillOverlay({ session, isSignedIn }: DrillOverlayProps) {
  const router = useRouter()
  const { open: openLogin } = useLoginDialog()
  const { question, index, total, state, stats, saving, isPending, pick, retry, next } = useDrillSession(
    session.questions,
    isSignedIn,
  )
  const isDone = state.status === 'done'
  const grewRoots = stats.improved > 0

  useEffect(() => {
    if (isDone && grewRoots) celebrate()
  }, [isDone, grewRoots])
  const deckHref = `/deck/${session.deck.slug}`
  const answered = index + (state.status === 'feedback' || state.status === 'done' ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>
          {state.status === 'done' ? 'Round complete' : `Question ${index + 1} of ${total}`}
        </span>
        <Link href={deckHref} className="hover:text-foreground">
          Back to tree
        </Link>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Round progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(answered / total) * 100}%` }}
        />
      </div>

      {state.status === 'done' ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p aria-hidden className="text-5xl">
              🌳
            </p>
            <h2 className="mt-4 text-2xl font-semibold">Your tree soaked it all up!</h2>
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-yellow-700">{stats.correct} golden</span>
              {total - stats.correct > 0 && (
                <>
                  {' · '}
                  <span className="font-medium text-amber-700">{total - stats.correct} to water again</span>
                </>
              )}
            </p>
            {saving && grewRoots && (
              <p className="mt-3 text-sm">
                {stats.improved} {stats.improved === 1 ? 'root' : 'roots'} grew stronger
                {stats.mastered > 0 && ` · ${stats.mastered} reached Mighty Root ✨`}
              </p>
            )}
            {!saving && (
              <p className="mt-3 text-sm text-muted-foreground">
                <button type="button" onClick={openLogin} className="font-medium text-foreground underline underline-offset-4">
                  Sign in
                </button>{' '}
                to save mastery and grow your tree.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => router.refresh()}>Practice again</Button>
              <Button variant="outline" asChild>
                <Link href={deckHref}>Back to tree</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        question && (
          <>
            <DrillCard question={question} state={state} onSelect={pick} />

            {state.status === 'error' && (
              <Alert className="border-amber-500 bg-amber-50 text-amber-900">
                <AlertTitle>We couldn&apos;t check that answer</AlertTitle>
                <AlertDescription>{state.error.message}.</AlertDescription>
                <AlertAction>
                  <Button size="sm" variant="outline" onClick={retry} disabled={isPending}>
                    Try again
                  </Button>
                </AlertAction>
              </Alert>
            )}

            {state.status === 'feedback' && (
              <div className="flex justify-end">
                <Button onClick={next} autoFocus>
                  {index + 1 >= total ? 'See results' : 'Next question'}
                </Button>
              </div>
            )}
          </>
        )
      )}

      {session.skippedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {session.skippedCount} {session.skippedCount === 1 ? 'item was' : 'items were'} skipped: add
          trap swaps to make them drillable.
        </p>
      )}
    </div>
  )
}

export { DrillOverlay }

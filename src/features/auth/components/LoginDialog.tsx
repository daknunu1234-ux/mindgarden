'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent, GameInput, GameLabel, GameSlab } from '@/shared/components/game'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { signInWithEmail } from '../actions/signInWithEmail'
import { GoogleSignInButton } from './GoogleSignInButton'

type Status = { kind: 'idle' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }

function LoginDialog() {
  const { isOpen, setOpen } = useLoginDialog()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  const query = searchParams.toString()
  const next = query ? `${pathname}?${query}` : pathname

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const res = await signInWithEmail({ email, next })
      setStatus(res.success ? { kind: 'sent', email: email.trim() } : { kind: 'error', message: res.error.message })
    })
  }

  const onOpenChange = (open: boolean) => {
    setOpen(open)
    if (!open) setStatus({ kind: 'idle' })
  }

  return (
    <GameDialog open={isOpen} onOpenChange={onOpenChange}>
      <GameDialogContent
        title="🌱 Join the Garden"
        ribbon="leaf"
        description="Sign in with Google in one click, or get a magic link by email. Signing in saves the mastery your trees earn."
      >
        {status.kind === 'sent' ? (
          <GameSlab role="status" tone="gold" className="p-4 text-center text-sm text-amber-950">
            <p aria-hidden className="text-4xl">
              📬
            </p>
            <p className="mt-2">
              Check <span className="font-bold">{status.email}</span> for your sign-in link. Open it in this browser to come right back
              here.
            </p>
          </GameSlab>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <GoogleSignInButton next={next} onError={(message) => setStatus({ kind: 'error', message })} />
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-amber-900/60">
              <span aria-hidden className="h-px flex-1 bg-amber-900/20" />
              or
              <span aria-hidden className="h-px flex-1 bg-amber-900/20" />
            </p>
            <div>
              <GameLabel htmlFor="login-email">Email</GameLabel>
              <GameInput
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {status.kind === 'error' && (
              <p role="alert" className="text-sm font-medium text-amber-800">
                {status.message}.
              </p>
            )}
            <GameButton type="submit" tone="leaf" size="lg" className="w-full" disabled={isPending}>
              {isPending ? 'Sending…' : '✉️ Email me a magic link'}
            </GameButton>
          </form>
        )}
      </GameDialogContent>
    </GameDialog>
  )
}

export { LoginDialog }

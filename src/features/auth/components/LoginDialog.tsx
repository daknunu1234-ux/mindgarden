'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { signInWithEmail } from '../actions/signInWithEmail'

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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to MindGarden 🌱</DialogTitle>
          <DialogDescription>
            We&apos;ll email you a magic link. Signing in saves the mastery your trees earn.
          </DialogDescription>
        </DialogHeader>

        {status.kind === 'sent' ? (
          <div role="status" className="rounded-xl border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900">
            Check <span className="font-medium">{status.email}</span> for your sign-in link. Open it in this
            browser to come right back here.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
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
              <p role="alert" className="text-sm text-amber-800">
                {status.message}.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Sending…' : 'Email me a magic link'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { LoginDialog }

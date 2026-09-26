'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { signOut } from '../actions/signOut'
import type { SessionUser } from '../types'

type ProfileButtonProps = { user: SessionUser | null }

function ProfileButton({ user }: ProfileButtonProps) {
  const { open } = useLoginDialog()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!user) {
    return (
      <Button variant="outline" onClick={open}>
        Sign in
      </Button>
    )
  }

  const onSignOut = () =>
    startTransition(async () => {
      const res = await signOut()
      if (res.success) router.refresh()
    })

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline" title={user.email}>
        {user.email}
      </span>
      <Button variant="ghost" onClick={onSignOut} disabled={isPending} aria-label="Sign out">
        <LogOut aria-hidden />
        <span className="sm:hidden">Sign out</span>
      </Button>
    </div>
  )
}

export { ProfileButton }

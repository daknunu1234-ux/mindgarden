'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, UserRound } from 'lucide-react'
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
      <Link
        href="/profile"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        title={user.email}
        aria-label={`Your profile (${user.email})`}
      >
        <UserRound className="size-4 shrink-0" aria-hidden />
        <span className="hidden max-w-44 truncate sm:inline">{user.email}</span>
        <span className="sm:hidden">Profile</span>
      </Link>
      <Button variant="ghost" size="icon-sm" onClick={onSignOut} disabled={isPending} aria-label="Sign out" title="Sign out">
        <LogOut aria-hidden />
      </Button>
    </div>
  )
}

export { ProfileButton }

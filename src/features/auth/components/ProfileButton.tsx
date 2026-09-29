'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { GameButton } from '@/shared/components/game'
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
      <GameButton tone="cream" size="sm" onClick={open}>
        Sign in
      </GameButton>
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
        className="group flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-3 pl-0.5 font-game text-sm font-bold text-amber-50 transition-colors hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
        title={user.email}
        aria-label={`Your Trophy Hall (${user.email})`}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-yellow-400 bg-gradient-to-b from-emerald-300 to-emerald-600 text-sm font-extrabold text-white uppercase shadow-[0_2px_0_#78350f] transition-transform group-hover:scale-110"
        >
          {user.email.charAt(0)}
        </span>
        <span className="hidden max-w-36 truncate sm:inline">{user.email.split('@')[0]}</span>
      </Link>
      <GameButton tone="wood" size="icon-sm" onClick={onSignOut} disabled={isPending} aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" aria-hidden />
      </GameButton>
    </div>
  )
}

export { ProfileButton }

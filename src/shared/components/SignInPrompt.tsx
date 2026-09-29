'use client'

import { GameButton, GamePanel } from '@/shared/components/game'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'

type SignInPromptProps = { title: string; description: string; emoji?: string }

// Shown instead of a page that needs a session; opens the shared login dialog.
export function SignInPrompt({ title, description, emoji = '🌱' }: SignInPromptProps) {
  const { open } = useLoginDialog()
  return (
    <GamePanel tone="parchment" ribbon="leaf" title={title} className="text-center">
      <p aria-hidden className="text-5xl">
        {emoji}
      </p>
      <p className="mt-3 text-amber-900/75">{description}</p>
      <GameButton tone="leaf" size="lg" className="mt-6" onClick={open}>
        Sign in
      </GameButton>
    </GamePanel>
  )
}

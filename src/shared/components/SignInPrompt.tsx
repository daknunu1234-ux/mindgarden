'use client'

import { Button } from '@/shared/components/ui/button'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'

type SignInPromptProps = { title: string; description: string; emoji?: string }

// Shown instead of a page that needs a session; opens the shared login dialog.
export function SignInPrompt({ title, description, emoji = '🌱' }: SignInPromptProps) {
  const { open } = useLoginDialog()
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p aria-hidden className="text-4xl">
        {emoji}
      </p>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Button className="mt-6" onClick={open}>
        Sign in
      </Button>
    </div>
  )
}

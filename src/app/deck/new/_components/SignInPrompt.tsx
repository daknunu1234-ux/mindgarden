'use client'

import { Button } from '@/shared/components/ui/button'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'

export function SignInPrompt() {
  const { open } = useLoginDialog()
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p aria-hidden className="text-4xl">
        🌱
      </p>
      <p className="mt-3 font-medium">Sign in to plant your own tree</p>
      <p className="mt-1 text-sm text-muted-foreground">Your trees and their roots are saved to your account.</p>
      <Button className="mt-6" onClick={open}>
        Sign in
      </Button>
    </div>
  )
}

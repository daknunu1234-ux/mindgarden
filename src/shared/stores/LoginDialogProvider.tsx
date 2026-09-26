'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type LoginDialogContextValue = {
  isOpen: boolean
  open: () => void
  setOpen: (open: boolean) => void
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null)

// Lets any feature (e.g. drill) ask for the login dialog without importing auth.
// The dialog itself (auth's LoginDialog) is rendered once in the root layout.
function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const value = useMemo(() => ({ isOpen, open: () => setOpen(true), setOpen }), [isOpen])
  return <LoginDialogContext.Provider value={value}>{children}</LoginDialogContext.Provider>
}

function useLoginDialog(): LoginDialogContextValue {
  const ctx = useContext(LoginDialogContext)
  if (!ctx) throw new Error('useLoginDialog must be used inside <LoginDialogProvider>')
  return ctx
}

export { LoginDialogProvider, useLoginDialog }

'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type PaymentDialogContextValue = {
  isOpen: boolean
  // The coin pack picked when the dialog opens ('coins-50', …); null = the dialog's default.
  productId: string | null
  open: (productId?: string) => void
  setOpen: (open: boolean) => void
}

const PaymentDialogContext = createContext<PaymentDialogContextValue | null>(null)

// Lets the Coin Shop open the payment dialog (payment feature's PaymentModal, rendered once in the
// root layout) without importing it.
function PaymentDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ isOpen: boolean; productId: string | null }>({ isOpen: false, productId: null })
  const value = useMemo(
    () => ({
      ...state,
      open: (productId?: string) => setState({ isOpen: true, productId: productId ?? null }),
      setOpen: (isOpen: boolean) => setState((s) => ({ ...s, isOpen })),
    }),
    [state],
  )
  return <PaymentDialogContext.Provider value={value}>{children}</PaymentDialogContext.Provider>
}

function usePaymentDialog(): PaymentDialogContextValue {
  const ctx = useContext(PaymentDialogContext)
  if (!ctx) throw new Error('usePaymentDialog must be used inside <PaymentDialogProvider>')
  return ctx
}

export { PaymentDialogProvider, usePaymentDialog }

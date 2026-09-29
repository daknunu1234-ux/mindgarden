'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type CoinShopContextValue = {
  isOpen: boolean
  open: () => void
  setOpen: (open: boolean) => void
}

const CoinShopContext = createContext<CoinShopContextValue | null>(null)

// Lets any feature (farm HUD "+" button, the planting form's "Get More Coins") open the Coin Shop
// without importing it. The modal itself (shared/components/game/CoinShopModal) is rendered once
// in the root layout, which wires it to the progress feature's top-up action.
function CoinShopProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const value = useMemo(() => ({ isOpen, open: () => setOpen(true), setOpen }), [isOpen])
  return <CoinShopContext.Provider value={value}>{children}</CoinShopContext.Provider>
}

function useCoinShop(): CoinShopContextValue {
  const ctx = useContext(CoinShopContext)
  if (!ctx) throw new Error('useCoinShop must be used inside <CoinShopProvider>')
  return ctx
}

export { CoinShopProvider, useCoinShop }

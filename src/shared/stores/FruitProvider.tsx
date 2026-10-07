'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { freshestCoins, type CoinsSnapshot } from './CoinsProvider'

type FruitContextValue = {
  // Latest 🍎 count this client learned from an action (a harvest, the factory using fruit).
  live: CoinsSnapshot | null
  setFruit: (fruit: number | null) => void
}

const FruitContext = createContext<FruitContextValue | null>(null)

// The island's fruit as seen during this visit, beside the coins in the header. Harvesting a tree
// pushes the new count here, so the header updates at once; the server's figure (with the time it was
// read) wins when it is newer (same rule as the coins: freshestCoins).
function FruitProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<CoinsSnapshot | null>(null)
  const setFruit = useCallback((fruit: number | null) => setLive(fruit === null ? null : { coins: fruit, at: Date.now() }), [])
  const value = useMemo(() => ({ live, setFruit }), [live, setFruit])
  return <FruitContext.Provider value={value}>{children}</FruitContext.Provider>
}

function useFruit(): FruitContextValue {
  const ctx = useContext(FruitContext)
  if (!ctx) throw new Error('useFruit must be used inside <FruitProvider>')
  return ctx
}

// The fruit count to show, given the server's figure and when it was read.
function useDisplayedFruit(serverFruit: number | null, serverAt: number | undefined): number | null {
  const { live } = useFruit()
  return freshestCoins(serverFruit === null ? null : { coins: serverFruit, at: serverAt ?? 0 }, live)
}

export { FruitProvider, useDisplayedFruit, useFruit }

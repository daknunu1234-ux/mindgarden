'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type CoinsContextValue = {
  // Latest 🪙 balance the client has seen (from a saved drill answer); null until then.
  coins: number | null
  setCoins: (next: number | null) => void
}

const CoinsContext = createContext<CoinsContextValue | null>(null)

// The gold balance as seen during this visit. The drill writes it after each saved answer (the
// server returns totalCoins), so the farm HUD shows the new balance right away, even when the
// router reuses a cached farm page. Revalidating in the drill action instead would re-render the
// drill route and restart the round (same reason as StreakProvider).
function CoinsProvider({ children }: { children: ReactNode }) {
  const [coins, setCoins] = useState<number | null>(null)
  const value = useMemo(() => ({ coins, setCoins }), [coins])
  return <CoinsContext.Provider value={value}>{children}</CoinsContext.Provider>
}

function useCoins(): CoinsContextValue {
  const ctx = useContext(CoinsContext)
  if (!ctx) throw new Error('useCoins must be used inside <CoinsProvider>')
  return ctx
}

// What to display: the newest of the server's figure and the client's. Coins only ever go up
// (nothing to spend yet), so the larger value is the newer one.
export function freshestCoins(server: number | null, client: number | null): number | null {
  if (server === null) return client
  if (client === null) return server
  return Math.max(server, client)
}

export { CoinsProvider, useCoins }

'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// A balance with the moment it was known (epoch ms).
export type CoinsSnapshot = { coins: number; at: number }

type CoinsContextValue = {
  // Latest 🪙 balance this client learned from an action (drill answer, planting, top-up).
  live: CoinsSnapshot | null
  setCoins: (coins: number | null) => void
}

const CoinsContext = createContext<CoinsContextValue | null>(null)

// The gold balance as seen during this visit. Actions that change it (a drill answer's first
// mastery, planting a seed, a shop top-up) push the new total here, so the HUD and the planting
// form update right away, even when the router reuses a cached page. Server pages pass their own
// snapshot with its time; whichever is newer is shown (freshestCoins).
function CoinsProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<CoinsSnapshot | null>(null)
  const setCoins = useCallback((coins: number | null) => setLive(coins === null ? null : { coins, at: Date.now() }), [])
  const value = useMemo(() => ({ live, setCoins }), [live, setCoins])
  return <CoinsContext.Provider value={value}>{children}</CoinsContext.Provider>
}

function useCoins(): CoinsContextValue {
  const ctx = useContext(CoinsContext)
  if (!ctx) throw new Error('useCoins must be used inside <CoinsProvider>')
  return ctx
}

// Pure: the balance to display. Coins can go down now (planting spends them), so the newer
// snapshot wins, not the larger one. On a tie the client's (it came from an action) wins.
export function freshestCoins(server: CoinsSnapshot | null, client: CoinsSnapshot | null): number | null {
  if (!server) return client?.coins ?? null
  if (!client) return server.coins
  return client.at >= server.at ? client.coins : server.coins
}

// Convenience for components: the displayed balance given the server's figure and when it was read.
function useDisplayedCoins(serverCoins: number | null, serverAt: number | undefined): number | null {
  const { live } = useCoins()
  return freshestCoins(serverCoins === null ? null : { coins: serverCoins, at: serverAt ?? 0 }, live)
}

export { CoinsProvider, useCoins, useDisplayedCoins }

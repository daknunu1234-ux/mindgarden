'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type StreakState = { current: number; best: number; practicedToday: boolean }

type StreakContextValue = {
  streak: StreakState | null
  setStreak: (next: StreakState | null) => void
}

const StreakContext = createContext<StreakContextValue | null>(null)

// Daily streak shown in the header. The root layout seeds it from the server; the drill
// updates it after a saved answer without reloading the page (frontend/ARCHITECTURE.md §3).
function StreakProvider({ initial, children }: { initial: StreakState | null; children: ReactNode }) {
  const [streak, setStreak] = useState(initial)
  const value = useMemo(() => ({ streak, setStreak }), [streak])
  return <StreakContext.Provider value={value}>{children}</StreakContext.Provider>
}

function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext)
  if (!ctx) throw new Error('useStreak must be used inside <StreakProvider>')
  return ctx
}

export { StreakProvider, useStreak }

import type { TrapType } from '@/shared/lib/questionEngine'

// Trap-type scheduling for a drill round (pure, unit-tested). Each question gets one of the 8 trap
// types its statement is eligible for (questionEngine trapTypes), so that:
//   • the round spreads evenly over the types: the least-used eligible type wins (≈ 12.5 % each when
//     every statement supports all 8), ties broken by the session's seed;
//   • no type repeats within HISTORY questions: a type used by either of the last 2 questions is
//     skipped. When the next statement can only be asked as a recent type, one of the next
//     LOOKAHEAD statements that can avoid the repeat goes first instead (the round order, lowest
//     mastery first, barely moves). Only when none can (a round of statements with a single eligible
//     type) does a repeat happen.
// A statement with no type (asked by the last-resort card) keeps its place and type null.

export const TRAP_HISTORY = 2
export const TRAP_LOOKAHEAD = 4

export type Scheduled<T> = { item: T; type: TrapType | null }

export function scheduleTrapTypes<T>(items: readonly { item: T; eligible: readonly TrapType[] }[], random: () => number): Scheduled<T>[] {
  const counts = new Map<TrapType, number>()
  const recent: TrapType[] = []
  const remaining = [...items]
  const out: Scheduled<T>[] = []
  while (remaining.length > 0) {
    // The first of the next few statements that can be asked as a type not used just now.
    let index = 0
    let allowed: readonly TrapType[] = remaining[0].eligible
    for (let i = 0; i < Math.min(TRAP_LOOKAHEAD, remaining.length); i++) {
      const fresh = remaining[i].eligible.filter((t) => !recent.includes(t))
      if (fresh.length > 0 || remaining[i].eligible.length === 0) {
        index = i
        allowed = fresh
        break
      }
    }
    const [{ item, eligible }] = remaining.splice(index, 1)
    if (eligible.length === 0) {
      out.push({ item, type: null })
      continue
    }
    const pool = allowed.length > 0 ? allowed : eligible
    const least = Math.min(...pool.map((t) => counts.get(t) ?? 0))
    const tied = pool.filter((t) => (counts.get(t) ?? 0) === least)
    const type = tied[Math.floor(random() * tied.length)]
    counts.set(type, least + 1)
    recent.push(type)
    if (recent.length > TRAP_HISTORY) recent.shift()
    out.push({ item, type })
  }
  return out
}

// How often each type was served (for tests and diagnostics).
export function typeCounts(types: readonly (TrapType | null)[]): Map<TrapType, number> {
  const counts = new Map<TrapType, number>()
  for (const t of types) if (t !== null) counts.set(t, (counts.get(t) ?? 0) + 1)
  return counts
}

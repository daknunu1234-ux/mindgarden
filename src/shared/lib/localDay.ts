// Local calendar days (pure, tested via progress/__tests__/streak.test.ts). A "day" is the player's
// own calendar date, so streaks and tournament practice days roll over at the player's midnight.

// A valid IANA timezone, or UTC for anything unknown/garbled (the value comes from the browser).
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

// The calendar day of `at` in `timeZone`, as 'YYYY-MM-DD'.
export function localDay(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

// The calendar day before `day` ('YYYY-MM-DD' → 'YYYY-MM-DD'), across months and years.
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

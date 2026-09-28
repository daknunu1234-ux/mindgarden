'use client'

import Link from 'next/link'
import { useStreak } from '@/shared/stores/StreakProvider'
import { cn } from '@/shared/utils/cn'
import { nextStreakMilestone, streakMilestone } from '../lib/streak'

// Subtle header badge: "🔥 3 days" once practised today, "🌱 3 days" (water today) while the
// streak is alive but today is still open. Nothing before the first practice day.
// Never a warning or a countdown (hard rule 10): missing a day just starts a new streak.
function StreakBadge() {
  const { streak } = useStreak()
  if (!streak || streak.current === 0) return null

  const { current, best, practicedToday } = streak
  const milestone = streakMilestone(current)
  const next = nextStreakMilestone(current)
  const days = `${current} ${current === 1 ? 'day' : 'days'}`
  const hint = practicedToday
    ? `Watered today. ${next ? `${next - current} more to reach ${next} days.` : 'Legendary gardener!'} Best: ${best}.`
    : `Practise today to keep your ${days} streak growing. Best: ${best}.`

  return (
    <Link
      href="/profile"
      title={hint}
      aria-label={`Daily streak: ${days}${practicedToday ? ', practised today' : ', not practised yet today'}`}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        !practicedToday
          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50'
          : milestone && milestone >= 7
            ? 'border-yellow-400 bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
            : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
      )}
    >
      <span aria-hidden>{practicedToday ? '🔥' : '🌱'}</span>
      {days}
    </Link>
  )
}

export { StreakBadge }

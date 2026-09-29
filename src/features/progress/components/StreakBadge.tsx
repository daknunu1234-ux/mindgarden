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
      className="group inline-flex items-center rounded-full focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
    >
      {/* Resource capsule: round icon socket + dark value well (matches the farm HUD). */}
      <span
        aria-hidden
        className={cn(
          'relative z-10 flex size-8 items-center justify-center rounded-full border-2 bg-gradient-to-b text-base shadow-[0_2px_0_rgba(0,0,0,0.25)] transition-transform group-hover:scale-110',
          !practicedToday
            ? 'border-emerald-700 from-lime-200 to-emerald-500'
            : milestone && milestone >= 7
              ? 'border-amber-700 from-yellow-200 to-amber-500'
              : 'border-rose-700 from-orange-300 to-rose-500',
        )}
      >
        {practicedToday ? '🔥' : '🌱'}
      </span>
      <span className="-ml-3 flex h-6 items-center rounded-r-full border-2 border-l-0 border-black/20 bg-slate-900/70 pr-2.5 pl-4 font-game text-sm leading-none font-bold text-white tabular-nums shadow-[inset_0_2px_3px_rgba(0,0,0,0.4)]">
        {days}
      </span>
    </Link>
  )
}

export { StreakBadge }

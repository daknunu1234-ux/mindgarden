'use client'

import Link from 'next/link'
import { useStreak } from '@/shared/stores/StreakProvider'
import { nextStreakReward } from '../lib/streak'
import { HEADER_PILL } from './HeaderStats'

// Compact header pill: "🔥 3" once practised today, "🌱 3" (water today) while today is still open,
// "🌱 0" before the first practice day. The details and the next 🪙 bonus are in the tooltip. It
// grows only when a tree is watered (a saved practice answer), never by opening the game.
// Never a warning or a countdown (hard rule 10): missing a day just starts a new streak.
function StreakBadge() {
  const { streak } = useStreak()
  if (!streak) return null

  const { current, best, practicedToday } = streak
  const next = nextStreakReward(current)
  const days = `${current} ${current === 1 ? 'day' : 'days'}`
  const bonus = `A ${next.streak}-day streak pays +${next.coins} 🪙.`
  const hint = practicedToday
    ? `Watered today. ${bonus} Best: ${best}.`
    : current === 0
      ? `Water a tree today to start a streak. ${bonus}`
      : `Water a tree today to keep your ${days} streak growing. ${bonus} Best: ${best}.`

  return (
    <Link
      href="/profile"
      title={hint}
      aria-label={`Daily streak: ${days}${practicedToday ? ', practised today' : ', not practised yet today'}`}
      className={HEADER_PILL}
    >
      <span aria-hidden>{practicedToday ? '🔥' : '🌱'}</span>
      {current}
    </Link>
  )
}

export { StreakBadge }

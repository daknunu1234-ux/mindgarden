import { Card, CardContent } from '@/shared/components/ui/card'
import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { plural } from '../lib/format'
import type { GardenStatsView } from '../types'

type GardenStatsGridProps = { stats: GardenStatsView }

function GardenStatsGrid({ stats }: GardenStatsGridProps) {
  const golden = stats.masteryPercent >= GOLDEN_BLOOM_PERCENT
  const tiles = [
    { label: 'Trees planted', value: String(stats.treeCount), icon: '🌳' },
    { label: 'Knowledge items', value: String(stats.itemCount), icon: '📜' },
    { label: 'Mighty Roots', value: String(stats.mightyRootCount), icon: '✨', gold: stats.mightyRootCount > 0 },
    { label: 'Garden mastery', value: `${stats.masteryPercent}%`, icon: '🌿', gold: golden },
    {
      label: 'Current streak',
      value: plural(stats.currentStreak, 'day', 'days'),
      icon: stats.practicedToday ? '🔥' : '🌱',
      gold: stats.currentStreak >= 7,
      note: stats.currentStreak === 0 ? 'Practise today to start one' : stats.practicedToday ? 'Watered today' : 'Practise today to keep it',
    },
    {
      label: 'Best streak',
      value: plural(stats.bestStreak, 'day', 'days'),
      icon: '🏆',
      gold: stats.bestStreak >= 7,
      note: stats.bestStreak > 0 && stats.bestStreak === stats.currentStreak ? 'Your best, right now' : undefined,
    },
  ]

  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="sr-only">
        Garden statistics
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Card className={cn('h-full py-4', tile.gold && 'bg-yellow-50 ring-yellow-500')}>
              <CardContent className="px-4">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span aria-hidden>{tile.icon}</span>
                  {tile.label}
                </p>
                <p className={cn('mt-1 text-3xl font-semibold tabular-nums', tile.gold && 'text-yellow-800')}>
                  {tile.value}
                </p>
                {'note' in tile && tile.note && <p className="mt-0.5 text-xs text-muted-foreground">{tile.note}</p>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {/* Overall mastery bar: same green → gold rule as the tree growth bar. */}
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Garden mastery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.masteryPercent}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700', golden ? 'bg-yellow-500' : 'bg-emerald-500')}
          style={{ width: `${stats.masteryPercent}%` }}
        />
      </div>
    </section>
  )
}

export { GardenStatsGrid }

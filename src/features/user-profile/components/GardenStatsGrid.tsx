import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/shared/utils/cn'
import type { GardenStatsView } from '../types'

type GardenStatsGridProps = { stats: GardenStatsView }

function GardenStatsGrid({ stats }: GardenStatsGridProps) {
  const golden = stats.masteryPercent > 80
  const tiles = [
    { label: 'Trees planted', value: String(stats.treeCount), icon: '🌳' },
    { label: 'Knowledge items', value: String(stats.itemCount), icon: '📜' },
    { label: 'Mighty Roots', value: String(stats.mightyRootCount), icon: '✨', gold: stats.mightyRootCount > 0 },
    { label: 'Garden mastery', value: `${stats.masteryPercent}%`, icon: '🌿', gold: golden },
  ]

  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="sr-only">
        Garden statistics
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

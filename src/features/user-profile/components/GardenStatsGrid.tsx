import { GamePanel, GameProgressBar } from '@/shared/components/game'
import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { plural } from '../lib/format'
import type { GardenStatsView } from '../types'

type GardenStatsGridProps = { stats: GardenStatsView }

// Record plaques: each stat is a medallion plaque; earned records turn gold with a ribbon tail.
function GardenStatsGrid({ stats }: GardenStatsGridProps) {
  const golden = stats.masteryPercent >= GOLDEN_BLOOM_PERCENT
  const tiles = [
    { label: 'Trees planted', value: String(stats.treeCount), icon: '🌳', gold: false },
    { label: 'Knowledge items', value: String(stats.itemCount), icon: '📜', gold: false },
    { label: 'Mighty Roots', value: String(stats.mightyRootCount), icon: '💎', gold: stats.mightyRootCount > 0 },
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
    <GamePanel tone="stone" ribbon="sky" title="Record Hall">
      <h2 className="sr-only">Garden statistics</h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li
            key={tile.label}
            className={cn(
              'relative flex flex-col items-center rounded-2xl border-[3px] px-3 pt-8 pb-3 text-center',
              tile.gold
                ? 'border-yellow-500 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-[0_4px_0_#ca8a04,0_0_20px_rgba(250,204,21,0.35)]'
                : 'border-stone-400/50 bg-gradient-to-b from-white to-stone-100 shadow-[0_4px_0_rgba(87,83,78,0.35)]',
            )}
          >
            {/* Medallion on top of the plaque. */}
            <span
              aria-hidden
              className={cn(
                'absolute -top-5 flex size-11 items-center justify-center rounded-full border-[3px] text-xl shadow-[0_3px_0_rgba(0,0,0,0.2)]',
                tile.gold ? 'border-amber-600 bg-gradient-to-b from-yellow-200 to-amber-400' : 'border-stone-400 bg-gradient-to-b from-white to-stone-200',
              )}
            >
              {tile.icon}
            </span>
            <p className={cn('font-game text-3xl leading-none font-extrabold tabular-nums', tile.gold ? 'text-amber-800' : 'text-stone-800')}>{tile.value}</p>
            <p className="mt-1 font-game text-sm font-bold text-stone-600">{tile.label}</p>
            {'note' in tile && tile.note && <p className="mt-0.5 text-xs text-stone-500">{tile.note}</p>}
          </li>
        ))}
      </ul>
      {/* Overall mastery: same green → gold rule as the tree growth bar. */}
      <GameProgressBar
        value={stats.masteryPercent}
        tone={golden ? 'gold' : 'leaf'}
        size="lg"
        segments={5}
        label="Garden mastery"
        caption={`Garden mastery ${stats.masteryPercent}%`}
        className="mt-6"
      />
    </GamePanel>
  )
}

export { GardenStatsGrid }

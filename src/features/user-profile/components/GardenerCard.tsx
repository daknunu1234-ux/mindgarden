import { CalendarDays, Mail } from 'lucide-react'
import { GameIcon, GamePanel, GameProgressBar, Ribbon } from '@/shared/components/game'
import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { formatJoined, gardenerName } from '../lib/format'
import type { GardenerLevelView, GardenerView } from '../types'

type GardenerCardProps = {
  gardener: GardenerView
  masteryPercent: number
  level?: GardenerLevelView | null
  // 🪙 stored gold balance (users.coins); hidden when unknown.
  coins?: number | null
}

// The hall's nameplate: a carved wooden board with a gold-framed portrait, the level gauge and the
// gardener's gold.
function GardenerCard({ gardener, masteryPercent, level, coins }: GardenerCardProps) {
  const name = gardener.name?.trim() || gardenerName(gardener.email)
  return (
    <GamePanel tone="wood" className="text-amber-50">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="flex size-24 items-center justify-center rounded-full border-[5px] border-yellow-400 bg-gradient-to-b from-emerald-300 to-emerald-600 font-game text-5xl font-extrabold text-white uppercase shadow-[0_0_0_3px_#92400e,0_5px_0_3px_#451a03] [text-shadow:0_2px_0_rgba(6,78,59,0.6)]"
          >
            {name.charAt(0)}
          </div>
          {level && (
            <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full border-[3px] border-amber-700 bg-gradient-to-b from-yellow-200 to-amber-400 font-game text-lg font-extrabold text-amber-900 shadow-[0_3px_0_#78350f]">
              <span className="sr-only">Level </span>
              {level.level}
            </span>
          )}
        </div>
        <div className="w-full min-w-0 flex-1 text-center sm:text-left">
          <p className="font-game text-sm font-bold tracking-wide text-amber-200/80 uppercase">Gardener&apos;s Trophy Hall</p>
          <h1 className="truncate font-game text-3xl leading-tight font-extrabold [text-shadow:0_2px_0_rgba(69,26,3,0.6)]">{name}</h1>
          <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-start">
            <Ribbon tone="leaf">🧑‍🌾 {level ? level.title : 'Gardener'}</Ribbon>
            {masteryPercent >= GOLDEN_BLOOM_PERCENT && <Ribbon tone="gold">✨ Golden garden</Ribbon>}
            {coins !== undefined && coins !== null && (
              <span
                title="1 gold coin the first time you master a statement (5/5)"
                className="inline-flex items-center gap-1.5 rounded-full border-[3px] border-[#8a4a0c] bg-gradient-to-b from-[#fff7ae] via-[#fcd34d] to-[#f59e0b] py-0.5 pr-3 pl-1 font-game text-base font-extrabold text-[#5a2a02] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_3px_0_#5a2a0c]"
              >
                <GameIcon name="coin" className="size-6" />
                <span className="tabular-nums">{coins.toLocaleString('en-US')}</span>
                <span className="text-sm">gold</span>
              </span>
            )}
          </div>
          {level && (
            <GameProgressBar
              value={level.xpIntoLevel}
              max={level.xpForNextLevel}
              tone="gold"
              size="lg"
              label={`Level ${level.level} experience`}
              caption={`Lv ${level.level} · ${level.xpIntoLevel} / ${level.xpForNextLevel} XP`}
              className="mt-4 border-amber-950/40"
            />
          )}
          <dl className="mt-3 flex flex-col items-center gap-1 text-sm text-amber-100/80 sm:flex-row sm:gap-5">
            <div className="flex min-w-0 items-center gap-1.5">
              <dt>
                <Mail className="size-4" aria-label="Email" />
              </dt>
              <dd className="truncate">{gardener.email}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>
                <CalendarDays className="size-4" aria-label="Joined" />
              </dt>
              <dd>{formatJoined(gardener.joinedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </GamePanel>
  )
}

export { GardenerCard }

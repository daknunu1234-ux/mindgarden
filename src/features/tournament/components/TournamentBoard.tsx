'use client'

import type { ReactNode } from 'react'
import { GameTabs, GameTabsContent, GameTabsList, GameTabsTrigger } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { formatPracticeDays, rankBadge } from '../lib/scoring'
import type { ActiveBoardRow, HallOfFameRow, TournamentStanding } from '../types'

type TournamentBoardProps = {
  active: ActiveBoardRow[]
  hallOfFame: HallOfFameRow[]
  // The signed-in viewer (highlighted on the boards), if any.
  viewerId?: string | null
  standing?: TournamentStanding | null
  // Rows per board (the boards hold up to 50 learners and every graduate).
  limit?: number
}

const percent = (value: number | null) => `${(value ?? 0).toFixed(value !== null && Number.isInteger(value) ? 0 : 1)}%`

// Two wooden tabs: "📜 Bia Trạng Nguyên" (graduates: fewest practice days, then first to finish)
// and "🌱 Đang Rèn Luyện" (learners: mastery %, then fewer days). Opens on the Hall of Fame when it
// has names, else on the learners.
function TournamentBoard({ active, hallOfFame, viewerId = null, standing = null, limit = 10 }: TournamentBoardProps) {
  return (
    <div className="space-y-3">
      {standing && (
        <p className="rounded-[16px] border-2 border-amber-900/15 bg-amber-50 px-3 py-2 text-center font-game text-sm font-bold text-amber-950">
          {standing.isGraduated
            ? `🎓 You mastered this tree in ${formatPracticeDays(standing.daysCount)}.`
            : `Your run: ${percent(standing.masteryPercentage)} mastery · ${formatPracticeDays(standing.daysCount)}`}
        </p>
      )}
      <GameTabs defaultValue={hallOfFame.length > 0 ? 'fame' : 'active'}>
        <GameTabsList>
          <GameTabsTrigger value="fame">
            📜 Bia Trạng Nguyên
            <span className="rounded-full bg-black/15 px-1.5 text-xs tabular-nums">{hallOfFame.length}</span>
          </GameTabsTrigger>
          <GameTabsTrigger value="active">
            🌱 Đang Rèn Luyện
            <span className="rounded-full bg-black/15 px-1.5 text-xs tabular-nums">{active.length}</span>
          </GameTabsTrigger>
        </GameTabsList>

        <GameTabsContent value="fame">
          {hallOfFame.length === 0 ? (
            <Empty>No one has mastered every statement yet. The first graduate is engraved here forever 🎓</Empty>
          ) : (
            <ol className="space-y-2">
              {hallOfFame.slice(0, limit).map((row) => (
                <Row key={row.userId} rank={row.rank} name={row.name} highlight={row.userId === viewerId} golden>
                  <span className="font-bold">100%</span>
                  <span>{formatPracticeDays(row.daysCount)}</span>
                </Row>
              ))}
            </ol>
          )}
        </GameTabsContent>

        <GameTabsContent value="active">
          {active.length === 0 ? (
            <Empty>No learners yet. Join the tournament and take the first spot 🌱</Empty>
          ) : (
            <ol className="space-y-2">
              {active.slice(0, limit).map((row) => (
                <Row key={row.userId} rank={row.rank} name={row.name} highlight={row.userId === viewerId}>
                  <span className="font-bold">{percent(row.masteryPercentage)}</span>
                  <span>{formatPracticeDays(row.daysCount)}</span>
                </Row>
              ))}
            </ol>
          )}
        </GameTabsContent>
      </GameTabs>
    </div>
  )
}

function Row({
  rank,
  name,
  highlight,
  golden = false,
  children,
}: {
  rank: number
  name: string
  highlight: boolean
  golden?: boolean
  children: ReactNode
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-[16px] border-2 px-3 py-2 font-game text-amber-950',
        golden ? 'border-[#e0a818] bg-gradient-to-b from-[#fffdf0] to-[#ffeaa0]' : 'border-amber-900/15 bg-white/80',
        highlight && 'ring-4 ring-emerald-400/70',
      )}
    >
      <span className="w-9 shrink-0 text-center text-lg font-extrabold tabular-nums" aria-label={`Rank ${rank}`}>
        {rankBadge(rank)}
      </span>
      <span className="min-w-0 flex-1 truncate font-extrabold">
        {name}
        {highlight && <span className="ml-1 text-xs font-bold text-emerald-700">(you)</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-amber-900/75 tabular-nums sm:flex-row sm:gap-3 sm:text-sm">
        {children}
      </span>
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-6 text-center font-game text-sm font-bold text-amber-900/65">{children}</p>
}

export { TournamentBoard }

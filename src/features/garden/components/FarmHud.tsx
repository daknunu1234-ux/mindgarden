'use client'

import Link from 'next/link'
import { LayoutGrid, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import type { FarmHudView } from '../types'

// Game HUD pieces, floated in the farm's corners. Each panel re-enables pointer events;
// the overlay around them lets drags and clicks through to the world.
const PANEL = 'pointer-events-auto rounded-2xl border-2 border-amber-900/25 bg-amber-50/90 shadow-lg backdrop-blur-sm'
const ROUND =
  'pointer-events-auto flex items-center justify-center rounded-full border-2 border-amber-900/25 bg-amber-50/95 text-amber-950 shadow-md transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:scale-95 disabled:opacity-40 disabled:hover:scale-100'

// Top-left: level medallion + XP bar. Signed out: a gentle sign-in invite.
function LevelBadge({ level }: { level: FarmHudView['level'] }) {
  const { open } = useLoginDialog()
  if (!level) {
    return (
      <button type="button" onClick={open} className={cn(PANEL, 'px-3 py-2 text-left text-xs font-semibold text-emerald-900 hover:bg-white')}>
        🧑‍🌾 Sign in to start farming
      </button>
    )
  }
  const pct = Math.round(level.progress * 100)
  return (
    <div className={cn(PANEL, 'flex items-center gap-2.5 py-1.5 pr-3 pl-1.5')}>
      <div
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full border-[3px] border-yellow-500 bg-gradient-to-b from-yellow-200 to-amber-400 text-base font-black text-amber-900 shadow-inner"
      >
        {level.level}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-amber-950">{level.title}</p>
        <div
          className="mt-1 h-2.5 w-28 overflow-hidden rounded-full border border-amber-900/20 bg-amber-900/10 sm:w-40"
          role="progressbar"
          aria-label={`Level ${level.level} experience`}
          aria-valuemin={0}
          aria-valuemax={level.xpForNextLevel}
          aria-valuenow={level.xpIntoLevel}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-500 transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-0.5 text-[10px] font-medium tabular-nums text-amber-900/70">
          Lv {level.level} · {level.xpIntoLevel}/{level.xpForNextLevel} XP
        </p>
      </div>
    </div>
  )
}

type CounterProps = { icon: string; value: number | string; label: string; hint: string; tone: string }

function Counter({ icon, value, label, hint, tone }: CounterProps) {
  return (
    <span className={cn('flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5', tone)} title={hint}>
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      <span className="sr-only">{label}:</span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

// Top-right: streak flame, coins, gems.
function Counters({ hud }: { hud: FarmHudView }) {
  const streak = hud.streak
  return (
    <div className={cn(PANEL, 'flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold')}>
      <Counter
        icon={streak?.practicedToday ? '🔥' : '🌱'}
        value={streak?.current ?? 0}
        label="Daily streak"
        hint={
          streak
            ? streak.practicedToday
              ? 'Watered today: your streak is growing'
              : 'Practise today to keep your streak'
            : 'Sign in to keep a streak'
        }
        tone={streak?.practicedToday ? 'text-orange-700' : 'text-emerald-800'}
      />
      <Counter icon="🪙" value={hud.coins ?? 0} label="Coins" hint="5 coins for every mastery step you earn" tone="text-amber-700" />
      <Counter
        icon="💎"
        value={hud.gems}
        label="Gems"
        hint="One gem per Mighty Root (all statements at 3/3) on this island"
        tone="text-sky-700"
      />
    </div>
  )
}

type ZoomControlsProps = {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}

// Bottom-left: zoom out / level / zoom in / fit.
function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, canZoomIn, canZoomOut }: ZoomControlsProps) {
  const button = cn(ROUND, 'size-8 border-0 shadow-none')
  return (
    <div role="toolbar" aria-label="Camera" className={cn(PANEL, 'flex items-center gap-1 p-1')}>
      <button type="button" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out" className={button}>
        <Minus className="size-4" />
      </button>
      <span className="w-10 text-center text-xs font-semibold tabular-nums text-amber-950" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" className={button}>
        <Plus className="size-4" />
      </button>
      <button type="button" onClick={onReset} aria-label="Fit the whole farm" title="Fit the whole farm" className={button}>
        <Maximize className="size-4" />
      </button>
    </div>
  )
}

// Bottom-right: the seed sack, i.e. plant a new deck.
function SeedSack() {
  return (
    <Link
      href="/deck/new"
      aria-label="Plant New Seed"
      title="Plant New Seed"
      className={cn(ROUND, 'group size-16 flex-col border-amber-900/40 bg-gradient-to-b from-amber-200 to-amber-400 sm:size-[72px]')}
    >
      {/* Burlap sack with a sprout peeking out. */}
      <svg aria-hidden viewBox="0 0 40 40" className="size-9 overflow-visible sm:size-10">
        <path d="M 20 6 q 2 -5 7 -5 q -2 5 -7 5 z" fill="#22c55e" />
        <path d="M 20 6 q -2 -4 -6 -4 q 1 4 6 4 z" fill="#4ade80" />
        <path d="M 12 12 q 8 -6 16 0 l -1 3 q -7 -3 -14 0 z" fill="#a16207" />
        <path d="M 11 14 q 9 -4 18 0 q 5 8 3 18 q -12 5 -24 0 q -2 -10 3 -18 z" fill="#d6b58c" stroke="#a16207" strokeWidth="1.5" />
        <path d="M 13 14.5 q 7 3 14 0" stroke="#78350f" strokeWidth="2" fill="none" />
        <text x="20" y="29" fontSize="9" textAnchor="middle" fontWeight="700" fill="#78350f">
          SEED
        </text>
      </svg>
      <span className="text-[9px] leading-none font-bold text-amber-950 group-hover:underline">Plant</span>
    </Link>
  )
}

type ViewToggleProps = { view: 'farm' | 'grid'; farmHref: string; gridHref: string; className?: string }

// Farm World ⇄ Classic Grid (URL-driven, so it survives a refresh).
function ViewToggle({ view, farmHref, gridHref, className }: ViewToggleProps) {
  const item = (active: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
      'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
      active ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-900 hover:bg-emerald-100',
    )
  return (
    <nav
      aria-label="Garden view"
      className={cn('pointer-events-auto inline-flex rounded-full border border-emerald-200 bg-white/90 p-0.5 shadow-sm', className)}
    >
      <Link href={farmHref} className={item(view === 'farm')} aria-current={view === 'farm' ? 'page' : undefined}>
        <MapIcon className="size-3.5" aria-hidden /> Farm
      </Link>
      <Link href={gridHref} className={item(view === 'grid')} aria-current={view === 'grid' ? 'page' : undefined}>
        <LayoutGrid className="size-3.5" aria-hidden /> Grid
      </Link>
    </nav>
  )
}

export { Counters, LevelBadge, SeedSack, ViewToggle, ZoomControls }

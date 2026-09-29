'use client'

import Link from 'next/link'
import { LayoutGrid, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { ActionDock, DOCK_BUTTON, DockOrb, GameButton, GameIcon, LevelCrest, ResourcePill } from '@/shared/components/game'
import { freshestCoins, useCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import type { FarmHudView } from '../types'

// Floating game HUD for the farm. The overlay around these pieces is pointer-events-none so drags
// and clicks reach the world; every piece re-enables pointer events.

// Top-left: level crest + XP capsule. Signed out: a gentle sign-in invite.
function LevelBadge({ level }: { level: FarmHudView['level'] }) {
  const { open } = useLoginDialog()
  if (!level) {
    return (
      <GameButton tone="cream" size="md" onClick={open} className="pointer-events-auto">
        🧑‍🌾 Sign in to start farming
      </GameButton>
    )
  }
  return <LevelCrest level={level.level} title={level.title} xpIntoLevel={level.xpIntoLevel} xpForNextLevel={level.xpForNextLevel} />
}

// Top-right: streak flame, gold coins, gems.
function Counters({ hud }: { hud: FarmHudView }) {
  const streak = hud.streak
  // Balance from the latest drill answer this visit, if newer than the server's figure.
  const { coins: liveCoins } = useCoins()
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <ResourcePill
        icon={streak?.practicedToday ? 'flame' : 'sprout'}
        tone={streak?.practicedToday ? 'fire' : 'leaf'}
        value={streak?.current ?? 0}
        label="Daily streak"
        hint={
          streak
            ? streak.practicedToday
              ? 'Watered today: your streak is growing'
              : 'Practise today to keep your streak'
            : 'Sign in to keep a streak'
        }
      />
      <ResourcePill
        icon="coin"
        tone="gold"
        value={freshestCoins(hud.coins, liveCoins) ?? 0}
        label="Gold coins"
        hint="1 gold coin the first time you master a statement (5/5)"
      />
      <ResourcePill icon="gem" tone="gem" value={hud.gems} label="Gems" hint="One gem per Mighty Root (all statements at 5/5) on this island" />
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

// Bottom-left: a stack of small round camera buttons.
function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, canZoomIn, canZoomOut }: ZoomControlsProps) {
  return (
    <div role="toolbar" aria-label="Camera" className="pointer-events-auto flex flex-col items-center gap-2">
      <GameButton tone="cream" size="icon-sm" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
        <Plus strokeWidth={3} />
      </GameButton>
      <span className="rounded-full bg-slate-900/70 px-2 py-0.5 font-game text-[11px] font-bold text-white tabular-nums" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <GameButton tone="cream" size="icon-sm" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out">
        <Minus strokeWidth={3} />
      </GameButton>
      <GameButton tone="cream" size="icon-sm" onClick={onReset} aria-label="Fit the whole farm" title="Fit the whole farm">
        <Maximize strokeWidth={2.5} />
      </GameButton>
    </div>
  )
}

// Burlap sack with a sprout peeking out.
function SeedSackIcon() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="size-10 overflow-visible sm:size-11">
      <path d="M 20 6 q 2 -5 7 -5 q -2 5 -7 5 z" fill="#16a34a" />
      <path d="M 20 6 q -2 -4 -6 -4 q 1 4 6 4 z" fill="#22c55e" />
      <path d="M 12 12 q 8 -6 16 0 l -1 3 q -7 -3 -14 0 z" fill="#a16207" />
      <path d="M 11 14 q 9 -4 18 0 q 5 8 3 18 q -12 5 -24 0 q -2 -10 3 -18 z" fill="#f5deb3" stroke="#a16207" strokeWidth="1.5" />
      <path d="M 13 14.5 q 7 3 14 0" stroke="#78350f" strokeWidth="2" fill="none" />
      <text x="20" y="29" fontSize="9" textAnchor="middle" fontWeight="800" fill="#78350f">
        SEED
      </text>
    </svg>
  )
}

type FarmDockProps = {
  gridHref: string
  onQuests: () => void
  // Thirsty trees today (red badge on Daily Quests).
  quests: number
}

// Bottom-centre dock: Daily Quests · Seed Sack (hero) · switch to the grid view.
function FarmDock({ gridHref, onQuests, quests }: FarmDockProps) {
  return (
    <ActionDock label="Farm actions">
      <button type="button" onClick={onQuests} className={DOCK_BUTTON} aria-label={`Daily Quests${quests > 0 ? `: ${quests} thirsty` : ''}`}>
        <DockOrb tone="sky" badge={quests > 0 ? quests : undefined}>
          <GameIcon name="drop" className="size-8" />
        </DockOrb>
        Quests
      </button>
      <Link href="/deck/new" className={cn(DOCK_BUTTON, '-mt-6')} aria-label="Seed Sack: plant a new tree">
        <DockOrb tone="sun" big>
          <SeedSackIcon />
        </DockOrb>
        Plant
      </Link>
      <Link href={gridHref} className={DOCK_BUTTON} aria-label="Switch to the classic grid view">
        <DockOrb tone="leaf">
          <LayoutGrid className="size-6 text-white drop-shadow" strokeWidth={2.5} />
        </DockOrb>
        Grid
      </Link>
    </ActionDock>
  )
}

type ViewToggleProps = { view: 'farm' | 'grid'; farmHref: string; gridHref: string; className?: string }

// Farm World ⇄ Classic Grid (URL-driven, so it survives a refresh). A two-slot wooden switch.
function ViewToggle({ view, farmHref, gridHref, className }: ViewToggleProps) {
  const item = (active: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-1.5 rounded-full px-4 font-game text-sm font-bold transition-[transform,background] duration-150',
      'focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
      active
        ? 'bg-gradient-to-b from-lime-300 to-emerald-500 text-white shadow-[0_3px_0_#065f46] [text-shadow:0_1px_0_rgba(6,78,59,0.5)]'
        : 'text-amber-100 hover:-translate-y-px hover:bg-amber-700/60',
    )
  return (
    <nav
      aria-label="Garden view"
      className={cn(
        'pointer-events-auto inline-flex gap-1 rounded-full border-[3px] border-amber-950/60 bg-gradient-to-b from-amber-700 to-amber-800 p-1 shadow-[inset_0_2px_0_rgba(255,255,255,0.15),0_4px_0_#451a03]',
        className,
      )}
    >
      <Link href={farmHref} className={item(view === 'farm')} aria-current={view === 'farm' ? 'page' : undefined}>
        <MapIcon className="size-4" aria-hidden /> Farm
      </Link>
      <Link href={gridHref} className={item(view === 'grid')} aria-current={view === 'grid' ? 'page' : undefined}>
        <LayoutGrid className="size-4" aria-hidden /> Grid
      </Link>
    </nav>
  )
}

export { Counters, FarmDock, LevelBadge, ViewToggle, ZoomControls }

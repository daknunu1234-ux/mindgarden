'use client'

import Link from 'next/link'
import { LayoutGrid, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { ActionDock, DOCK_BUTTON, DockOrb, GameButton, GameIcon, LevelCrest, ResourcePill } from '@/shared/components/game'
import { SEED_PRICE_COINS } from '@/shared/lib/economy'
import { useCoinShop } from '@/shared/stores/CoinShopProvider'
import { useDisplayedCoins } from '@/shared/stores/CoinsProvider'
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

// Top-right: streak flame and gold coins (coins are the only currency).
function Counters({ hud }: { hud: FarmHudView }) {
  const streak = hud.streak
  // The newer of the server's balance and the latest one an action reported this visit.
  const coins = useDisplayedCoins(hud.coins, hud.coinsAsOf)
  const { open: openShop } = useCoinShop()
  const signedIn = hud.level !== null
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
        value={coins ?? 0}
        label="Gold coins"
        hint={`A tree seed costs ${SEED_PRICE_COINS} coins. Earn 1 the first time you master a statement (5/5)`}
        onAdd={signedIn ? openShop : undefined}
        addLabel="Open the Coin Shop"
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

type FarmDockProps = {
  gridHref: string
  onQuests: () => void
  // Thirsty trees today (red badge on Daily Quests).
  quests: number
  onShop: () => void
  // Own trees waiting in the Shop's Trees tab (badge on the Shop).
  unplaced: number
}

// Bottom-centre dock: Daily Quests · 🏪 Shop (hero: trees to plant, structures, landscape,
// decorations, animals) · switch to the grid view.
function FarmDock({ gridHref, onQuests, quests, onShop, unplaced }: FarmDockProps) {
  return (
    <ActionDock label="Farm actions">
      <button type="button" onClick={onQuests} className={DOCK_BUTTON} aria-label={`Daily Quests${quests > 0 ? `: ${quests} thirsty` : ''}`}>
        <DockOrb tone="sky" badge={quests > 0 ? quests : undefined}>
          <GameIcon name="drop" className="size-8" />
        </DockOrb>
        Quests
      </button>
      <button type="button" onClick={onShop} className={cn(DOCK_BUTTON, '-mt-6')} aria-label={`Shop${unplaced > 0 ? `: ${unplaced} ${unplaced === 1 ? 'tree' : 'trees'} to plant` : ''}`}>
        <DockOrb tone="sun" big badge={unplaced > 0 ? unplaced : undefined}>
          <span aria-hidden className="text-[34px] leading-none sm:text-[38px]">
            🏪
          </span>
        </DockOrb>
        Shop
      </button>
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

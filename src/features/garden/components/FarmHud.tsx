'use client'

import Link from 'next/link'
import { LayoutGrid, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import { ActionDock, DOCK_BUTTON, DockOrb, GameButton, GameIcon, LevelCrest, PodShadow, ResourcePill } from '@/shared/components/game'
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
      <button type="button" onClick={onShop} className={cn(DOCK_BUTTON, '-mt-9')} aria-label={`Shop${unplaced > 0 ? `: ${unplaced} ${unplaced === 1 ? 'tree' : 'trees'} to plant` : ''}`}>
        {/* Hero: hops for attention every few seconds, a light sweep across its gloss. */}
        <span className="mg-hop block">
          <DockOrb tone="sun" big sheen badge={unplaced > 0 ? unplaced : undefined}>
            <span aria-hidden className="text-[34px] leading-none sm:text-[40px]">
              🏪
            </span>
          </DockOrb>
        </span>
        <span className="-mt-3 rounded-full border-[2.5px] border-[#8a1033] bg-gradient-to-b from-[#fda4af] via-[#fb7185] to-[#e11d48] px-2.5 py-1 text-[13px] tracking-wider uppercase shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_3px_0_#8a1033] [text-shadow:0_2px_0_#8a1033,1px_0_0_#8a1033,-1px_0_0_#8a1033]">
          Shop
        </span>
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

export type FarmBuffSummary = { stream: number; house: number; woodshop: boolean }

// Top-centre: the island's name on a glossy wooden banner with golden trim and rivets.
function GardenBanner({ name }: { name: string }) {
  return (
    <div className="relative flex items-center pb-1">
      <PodShadow className="w-[85%]" />
      <span
        className={cn(
          'relative flex max-w-[min(78vw,340px)] items-center gap-2 rounded-[16px] border-[3px] border-[#3b1f0e] px-4 py-1.5',
          '[background-image:repeating-linear-gradient(180deg,rgba(0,0,0,0.06)_0_3px,transparent_3px_14px),linear-gradient(to_bottom,#f0a55c,#c96f2c_60%,#a2521c)]',
          'shadow-[inset_0_0_0_2px_rgba(255,214,102,0.8),inset_0_3px_0_rgba(255,255,255,0.4),0_5px_0_#3b1f0e,0_10px_16px_rgba(0,0,0,0.25)]',
        )}
      >
        <span aria-hidden className="absolute top-1.5 left-1.5 size-1.5 rounded-full bg-[#ffd23f] shadow-[0_1px_0_#3b1f0e]" />
        <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#ffd23f] shadow-[0_1px_0_#3b1f0e]" />
        <span aria-hidden className="text-lg leading-none">
          🏝️
        </span>
        <span className="truncate font-game text-base leading-tight font-extrabold text-white [text-shadow:0_2px_0_#3b1f0e,1.5px_1px_0_#3b1f0e,-1.5px_1px_0_#3b1f0e,0_-1.5px_0_#3b1f0e] sm:text-lg">
          {name}
        </span>
      </span>
    </div>
  )
}

// Under the banner: the farm's active coin buffs as glossy pills (how many trees each boosts),
// or a hint for owners who have none yet.
function BuffPills({ summary, hint }: { summary: FarmBuffSummary; hint: boolean }) {
  const pills = [
    summary.stream > 0 && { key: 'stream', icon: '🌊', text: `+20% · ${summary.stream} ${summary.stream === 1 ? 'tree' : 'trees'}`, tone: 'stream' as const },
    summary.house > 0 && { key: 'house', icon: '🏡', text: `+50% · ${summary.house} ${summary.house === 1 ? 'tree' : 'trees'}`, tone: 'house' as const },
    summary.woodshop && { key: 'woodshop', icon: '🪚', text: 'Chop refund', tone: 'wood' as const },
  ].filter((p) => p !== false)
  if (pills.length === 0) {
    if (!hint) return null
    return (
      <span className="rounded-full border-2 border-white/70 bg-[#064e6e]/55 px-3 py-1 font-game text-[11px] font-bold text-white backdrop-blur-sm">
        💡 Streams and houses next to trees boost 🪙
      </span>
    )
  }
  return (
    <ul aria-label="Active farm buffs" className="flex flex-wrap justify-center gap-1.5">
      {pills.map((p) => (
        <li
          key={p.key}
          className={cn(
            'relative inline-flex items-center gap-1 overflow-hidden rounded-full border-[2.5px] px-2.5 py-1 font-game text-xs leading-none font-extrabold whitespace-nowrap text-white tabular-nums',
            'shadow-[inset_0_2px_0_rgba(255,255,255,0.5),0_3px_0_var(--pill-edge)] [text-shadow:0_1.5px_0_var(--pill-edge),1px_0_0_var(--pill-edge),-1px_0_0_var(--pill-edge)]',
            p.tone === 'stream' && 'border-[#075e73] bg-gradient-to-b from-[#7ff5f0] via-[#22c9e0] to-[#0891b2] [--pill-edge:#075e73]',
            p.tone === 'house' && 'border-[#8a4a0c] bg-gradient-to-b from-[#fff3a3] via-[#fbbf24] to-[#f97316] [--pill-edge:#8a4a0c]',
            p.tone === 'wood' && 'border-[#5a2a0c] bg-gradient-to-b from-[#f0b574] via-[#c9793e] to-[#9a4a17] [--pill-edge:#5a2a0c]',
          )}
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-1.5 top-0.5 h-[40%] rounded-full bg-white/35" />
          <span aria-hidden className="relative">
            {p.icon}
          </span>
          <span className="relative">{p.text}</span>
        </li>
      ))}
    </ul>
  )
}

export { BuffPills, Counters, FarmDock, GardenBanner, LevelBadge, ViewToggle, ZoomControls }

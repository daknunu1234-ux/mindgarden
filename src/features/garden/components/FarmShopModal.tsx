'use client'

import Link from 'next/link'
import { GameButton, GameDialog, GameDialogContent, GameIcon, GameTabs, GameTabsContent, GameTabsList, GameTabsTrigger } from '@/shared/components/game'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { FARM_CATALOG, SHOP_TABS, type CatalogItem, type ShopTab } from '../lib/farmCatalog'
import type { FarmPlotView } from '../types'
import { ItemPreview } from './FarmStructures'
import { TreeStageSvg } from './TreeStageSvg'

type FarmShopModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The player's purse (null = unknown / signed out: nothing can be bought).
  coins: number | null
  // Own trees not on the farm yet (the Trees tab).
  unplacedTrees: readonly FarmPlotView[]
  // Close the shop and enter placement mode for this tree (free) or item (charged when placed).
  onPlantTree: (tree: FarmPlotView) => void
  onBuy: (item: CatalogItem) => void
  initialTab?: ShopTab
}

type PerkTone = 'stream' | 'house' | 'wood' | 'decor' | 'animal'

// What each item is good for, as a tag on its card (the numbers are the buffs in lib/farmBuffs.ts).
const PERKS: Record<CatalogItem['id'], { label: string; tone: PerkTone }> = {
  farmer_house: { label: '+50% 🪙 aura', tone: 'house' },
  woodshop: { label: '25% chop refund', tone: 'wood' },
  stream: { label: '+20% 🪙 beside', tone: 'stream' },
  fence: { label: 'Auto-joins', tone: 'decor' },
  rockery: { label: 'Decoration', tone: 'decor' },
  cow: { label: 'Wanders', tone: 'animal' },
  pig: { label: 'Snuffles', tone: 'animal' },
}

const PERK_TONES: Record<PerkTone, string> = {
  stream: 'border-[#075e73] from-[#7ff5f0] via-[#22c9e0] to-[#0891b2] [--edge:#075e73]',
  house: 'border-[#8a4a0c] from-[#fff3a3] via-[#fbbf24] to-[#f97316] [--edge:#8a4a0c]',
  wood: 'border-[#5a2a0c] from-[#f0b574] via-[#c9793e] to-[#9a4a17] [--edge:#5a2a0c]',
  decor: 'border-[#6b21a8] from-[#e9d5ff] via-[#c084fc] to-[#9333ea] [--edge:#6b21a8]',
  animal: 'border-[#9f1239] from-[#fecdd3] via-[#fb7185] to-[#e11d48] [--edge:#9f1239]',
}

// Card header colour per shop tab.
const HEADERS: Record<Exclude<ShopTab, 'trees'>, string> = {
  structures: 'from-[#fb923c] to-[#c2410c] [--edge:#7c2d12]',
  landscape: 'from-[#22d3ee] to-[#0e7490] [--edge:#164e63]',
  decorations: 'from-[#a3e635] to-[#4d7c0f] [--edge:#365314]',
  animals: 'from-[#fb7185] to-[#be123c] [--edge:#881337]',
}

const OUTLINE = '[text-shadow:0_2px_0_var(--edge),1.5px_1px_0_var(--edge),-1.5px_1px_0_var(--edge),0_-1.5px_0_var(--edge)]'

// "🏪 Shop": everything for the farm in one place, framed like a wooden market stall. Trees (your
// knowledge trees waiting to be planted, and a new seed), Structures, Landscape, Decorations and
// Animals as trading cards on 3D pedestals. Choosing something closes the shop and starts placement
// mode; coins are only spent when the item is put down.
function FarmShopModal({ open, onOpenChange, coins, unplacedTrees, onPlantTree, onBuy, initialTab = 'trees' }: FarmShopModalProps) {
  return (
    <GameDialog open={open} onOpenChange={onOpenChange}>
      <GameDialogContent title="🏪 Shop" ribbon="gold" tone="wood" size="lg">
        {coins !== null && (
          <p className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[3px] border-[#8a4a0c] bg-gradient-to-b from-[#fffbe0] to-[#ffd76a] py-1 pr-3.5 pl-1.5 font-game text-base font-extrabold text-[#5a2a02] tabular-nums shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_4px_0_#8a4a0c]">
              <GameIcon name="coin" className="size-6" />
              <span className="sr-only">Your purse: </span>
              {coins}
            </span>
          </p>
        )}
        <GameTabs defaultValue={initialTab}>
          <GameTabsList className="flex-wrap gap-1.5 rounded-t-[22px] px-2 pt-2">
            {SHOP_TABS.map((t) => (
              <GameTabsTrigger key={t.id} value={t.id} className="min-h-11 basis-[30%] rounded-[14px] border-2 border-transparent text-[13px] data-[state=active]:rounded-b-none data-[state=active]:border-[#e8c48a] sm:basis-0 sm:text-sm">
                {t.label}
                {t.id === 'trees' && unplacedTrees.length > 0 && (
                  <span className="rounded-full border-2 border-white bg-gradient-to-b from-[#fb7185] to-[#e11d48] px-1.5 text-xs text-white tabular-nums">{unplacedTrees.length}</span>
                )}
              </GameTabsTrigger>
            ))}
          </GameTabsList>

          <GameTabsContent value="trees" className="space-y-3 bg-[linear-gradient(180deg,#fff8e8,#f7e2bd)]">
            {unplacedTrees.length === 0 ? (
              <p className="py-2 text-center text-sm font-semibold text-amber-900/70">Every tree you own is planted on your farm. 🌳</p>
            ) : (
              <ul className="grid max-h-[50vh] gap-3 overflow-y-auto p-1 sm:grid-cols-2">
                {unplacedTrees.map((tree) => (
                  <li key={tree.id}>
                    <UnplacedTree tree={tree} onPlant={() => onPlantTree(tree)} />
                  </li>
                ))}
              </ul>
            )}
            <GameButton asChild tone="sun" className="w-full">
              <Link href="/deck/new">+ Plant New Seed</Link>
            </GameButton>
          </GameTabsContent>

          {SHOP_TABS.filter((t): t is { id: Exclude<ShopTab, 'trees'>; label: string } => t.id !== 'trees').map((t) => (
            <GameTabsContent key={t.id} value={t.id} className="bg-[linear-gradient(180deg,#fff8e8,#f7e2bd)]">
              <ul className="grid gap-3 p-1 sm:grid-cols-2">
                {FARM_CATALOG.filter((item) => item.tab === t.id).map((item) => (
                  <li key={item.id}>
                    <ShopCard item={item} header={HEADERS[t.id]} coins={coins} onBuy={() => onBuy(item)} />
                  </li>
                ))}
              </ul>
            </GameTabsContent>
          ))}
        </GameTabs>
      </GameDialogContent>
    </GameDialog>
  )
}

// A chunky card frame: thick ink border, cream body, bevel underneath.
const CARD =
  'relative flex h-full flex-col overflow-hidden rounded-[22px] border-[3px] border-[#3b1f0e] bg-gradient-to-b from-white to-[#fff3dc] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_5px_0_#3b1f0e,0_10px_16px_rgba(59,31,14,0.2)] transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] hover:-translate-y-1'

// Sky-to-lagoon glow the pedestal stands in.
const STAGE_BG = 'bg-[radial-gradient(ellipse_at_50%_70%,#b8fff3_0%,#6fdcf0_45%,#2bb3d9_100%)]'

function UnplacedTree({ tree, onPlant }: { tree: FarmPlotView; onPlant: () => void }) {
  const stage = getTreeStage(tree.masteryPercent)
  const size = getTreeSizeTier(tree.itemCount)
  return (
    <article className={CARD}>
      <header className={cn('bg-gradient-to-b from-[#4ade80] to-[#15803d] px-3 py-1.5 [--edge:#14532d]', OUTLINE)}>
        <h3 className="truncate font-game text-base font-extrabold text-white">{tree.title}</h3>
      </header>
      <div className={cn('relative flex h-28 items-end justify-center', STAGE_BG)}>
        <span aria-hidden className="absolute bottom-3 h-5 w-24 rounded-[50%] border-[3px] border-[#3b1f0e] bg-gradient-to-b from-[#f0955a] to-[#c9622b]" />
        <TreeStageSvg stage={stage} treeType={tree.treeType} label="" ground={false} className="relative mb-4 size-24" />
        <span className="absolute top-2 right-2 rounded-full border-2 border-[#3b1f0e] bg-white/90 px-2 py-0.5 font-game text-[11px] font-extrabold text-[#3b1f0e]">
          {TREE_STAGES[stage].emoji} {tree.masteryPercent}%
        </span>
      </div>
      <p className="flex-1 px-3 pt-2 text-xs font-semibold text-amber-900/75">
        {tree.itemCount} {tree.itemCount === 1 ? 'statement' : 'statements'} · {size.badge}
      </p>
      <div className="p-3 pt-2">
        <GameButton tone="leaf" size="sm" onClick={onPlant} className="w-full">
          🌱 Plant on Farm · free
        </GameButton>
      </div>
    </article>
  )
}

function ShopCard({ item, header, coins, onBuy }: { item: CatalogItem; header: string; coins: number | null; onBuy: () => void }) {
  const affordable = coins !== null && coins >= item.price
  const perk = PERKS[item.id]
  return (
    <article className={CARD}>
      <header className={cn('bg-gradient-to-b py-1.5 pr-14 pl-3', header, OUTLINE)}>
        <h3 className="truncate font-game text-base font-extrabold text-white">{item.name}</h3>
      </header>
      {/* Price: a fat gold coin badge on the corner. */}
      <span
        className="absolute top-1 right-1.5 z-10 flex size-12 flex-col items-center justify-center rounded-full border-[3px] border-[#8a4a0c] bg-[radial-gradient(circle_at_35%_30%,#fffbe0,#ffd23f_45%,#f59e0b)] font-game leading-none font-extrabold text-[#5a2a02] shadow-[inset_0_-3px_0_rgba(180,83,9,0.35),0_3px_0_#8a4a0c]"
      >
        <span className="sr-only">Price: </span>
        <span className="text-base tabular-nums">{item.price}</span>
        <span className="sr-only"> coins</span>
        <span aria-hidden className="text-[9px]">
          🪙
        </span>
      </span>
      <div className={cn('relative flex h-32 items-center justify-center', STAGE_BG)}>
        <ItemPreview item={item} className="h-full w-auto max-w-full drop-shadow-[0_6px_4px_rgba(6,78,110,0.25)]" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
        <span
          className={cn(
            'relative inline-flex items-center overflow-hidden rounded-full border-[2.5px] bg-gradient-to-b px-2 py-0.5 font-game text-[11px] leading-tight font-extrabold text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.5),0_2px_0_var(--edge)]',
            PERK_TONES[perk.tone],
            OUTLINE,
          )}
        >
          {perk.label}
        </span>
        <span className="rounded-full border-2 border-[#d9b88a] bg-white px-2 py-0.5 font-game text-[11px] font-bold text-amber-900/80">
          {item.width}×{item.height} tile{item.width * item.height > 1 ? 's' : ''}
        </span>
      </div>
      <p className="flex-1 px-3 pt-1.5 text-sm text-amber-900/80">{item.description}</p>
      <div className="p-3 pt-2">
        <GameButton
          tone="leaf"
          size="sm"
          onClick={onBuy}
          disabled={!affordable}
          className="w-full"
          title={affordable ? undefined : coins === null ? 'Sign in to buy' : `You need ${item.price - coins} more 🪙`}
        >
          {affordable ? `Buy & Place · ${item.price} 🪙` : coins === null ? 'Sign in to buy' : `Need ${item.price - coins} more 🪙`}
        </GameButton>
      </div>
    </article>
  )
}

export { FarmShopModal }

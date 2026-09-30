'use client'

import Link from 'next/link'
import { GameButton, GameDialog, GameDialogContent, GameSlab, GameTabs, GameTabsContent, GameTabsList, GameTabsTrigger } from '@/shared/components/game'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { FARM_CATALOG, SHOP_TABS, type CatalogItem, type ShopTab } from '../lib/farmCatalog'
import type { FarmPlotView } from '../types'
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

// "🏪 Shop": everything for the farm in one place. Trees (your knowledge trees waiting to be planted,
// and a new seed), Structures, Landscape, Decorations and Animals. Choosing something closes the
// shop and starts placement mode; coins are only spent when the item is put down.
function FarmShopModal({ open, onOpenChange, coins, unplacedTrees, onPlantTree, onBuy, initialTab = 'trees' }: FarmShopModalProps) {
  return (
    <GameDialog open={open} onOpenChange={onOpenChange}>
      <GameDialogContent title="🏪 Shop" ribbon="gold" tone="parchment" size="lg" description={coins === null ? undefined : `Your purse: ${coins} 🪙`}>
        <GameTabs defaultValue={initialTab}>
          <GameTabsList className="flex-wrap">
            {SHOP_TABS.map((t) => (
              <GameTabsTrigger key={t.id} value={t.id}>
                {t.label}
                {t.id === 'trees' && unplacedTrees.length > 0 && (
                  <span className="rounded-full bg-black/15 px-1.5 text-xs tabular-nums">{unplacedTrees.length}</span>
                )}
              </GameTabsTrigger>
            ))}
          </GameTabsList>

          <GameTabsContent value="trees" className="space-y-3">
            {unplacedTrees.length === 0 ? (
              <p className="py-2 text-center text-sm font-semibold text-amber-900/70">Every tree you own is planted on your farm. 🌳</p>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
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

          {SHOP_TABS.filter((t) => t.id !== 'trees').map((t) => (
            <GameTabsContent key={t.id} value={t.id}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {FARM_CATALOG.filter((item) => item.tab === t.id).map((item) => (
                  <li key={item.id}>
                    <ShopItem item={item} coins={coins} onBuy={() => onBuy(item)} />
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

function UnplacedTree({ tree, onPlant }: { tree: FarmPlotView; onPlant: () => void }) {
  const stage = getTreeStage(tree.masteryPercent)
  const size = getTreeSizeTier(tree.itemCount)
  return (
    <GameSlab className="flex items-center gap-3 p-2.5">
      <span className="shrink-0 rounded-xl bg-gradient-to-b from-sky-100 to-lime-100 p-0.5">
        <TreeStageSvg stage={stage} treeType={tree.treeType} label="" className="size-12" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-game text-base font-extrabold text-amber-950">{tree.title}</span>
        <span className="block text-xs font-semibold text-amber-900/70">
          {tree.itemCount} {tree.itemCount === 1 ? 'statement' : 'statements'} · {TREE_STAGES[stage].emoji} {tree.masteryPercent}% mastered · {size.badge}
        </span>
      </span>
      <GameButton tone="leaf" size="sm" onClick={onPlant} className="shrink-0">
        Plant on Farm
      </GameButton>
    </GameSlab>
  )
}

function ShopItem({ item, coins, onBuy }: { item: CatalogItem; coins: number | null; onBuy: () => void }) {
  const affordable = coins !== null && coins >= item.price
  return (
    <GameSlab className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-4xl leading-none">
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-game text-base font-extrabold text-amber-950">{item.name}</p>
          <p className="text-xs font-semibold text-amber-900/65">
            {item.width}×{item.height} tile{item.width * item.height > 1 ? 's' : ''} · {item.price} 🪙
          </p>
        </div>
      </div>
      <p className="flex-1 text-sm text-amber-900/80">{item.description}</p>
      <GameButton
        tone="sun"
        size="sm"
        onClick={onBuy}
        disabled={!affordable}
        title={affordable ? undefined : coins === null ? 'Sign in to buy' : `You need ${item.price - coins} more 🪙`}
      >
        {affordable ? `Buy & Place · ${item.price} 🪙` : coins === null ? 'Sign in to buy' : `Need ${item.price - coins} more 🪙`}
      </GameButton>
    </GameSlab>
  )
}

export { FarmShopModal }

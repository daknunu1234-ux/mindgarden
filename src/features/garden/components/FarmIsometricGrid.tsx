'use client'

import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'
import { beachPalms, FARM_WORLD } from '../lib/diorama'
import { treeBuff, type TreeBuff } from '../lib/farmBuffs'
import { catalogFor, type FarmItemType } from '../lib/farmCatalog'
import { checkPlacement, depthOf, fenceLinks, footprintCenter, screenToTile, TILE_H, type Footprint, type Placement } from '../lib/farmGrid'
import { plotSprite } from '../lib/plotSprite'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { getTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { IslandBase, OceanLayer, Palm, WorldClouds } from './FarmDiorama'
import { AnimalSprite, BuffAura, FarmerHouse, FenceSprite, GhostFootprint, RockerySprite, StreamTile, TreePad, WoodshopSprite } from './FarmStructures'
import { LABEL_LAYER, PlotButton, PlotLabels } from './FarmTree'

export { FARM_WORLD }

// Animate at most this many trees (particles, bees): keeps big farms light.
const MAX_ANIMATED = 12

export type BuildGhost = {
  footprint: Pick<Footprint, 'width' | 'height'>
  // What is being placed ('tree' for one of your trees): drives the aura preview.
  itemType: FarmItemType
  // The floating miniature, drawn around its ground point (0, 0).
  preview: ReactNode
  // The tile under the pointer (or the last tapped one); null before the first move.
  tile: { x: number; y: number } | null
}

type FarmIsometricGridProps = {
  placements: readonly Placement[]
  // The trees' data by deck id (a tree placement whose deck isn't here is skipped: e.g. private).
  plotsByDeck: ReadonlyMap<string, FarmPlotView>
  // Seeds the grass scatter so every farm keeps its own look.
  seed: string
  // Placement (build) mode: the ghost follows the pointer; items stop reacting to clicks.
  build: BuildGhost | null
  onBuildHover: (tile: { x: number; y: number }) => void
  onBuildTap: (tile: { x: number; y: number }, pointerType: string) => void
  onBuildCancel: () => void
  onOpenPlot: (plot: FarmPlotView) => void
  onOpenItem: (placement: Placement) => void
}

// The farm's 16 × 16 isometric grid on a floating tropical island (FarmDiorama), with everything
// placed on it. Screen position of tile (x, y): ((x − y) · TILE_W / 2, (x + y) · TILE_H / 2) from
// the grid origin (lib/farmGrid.ts, tested); standing things are painted back to front by their
// ground point (z-index = ground y).
function FarmIsometricGrid({ placements, plotsByDeck, seed, build, onBuildHover, onBuildTap, onBuildCancel, onOpenPlot, onOpenItem }: FarmIsometricGridProps) {
  const worldRef = useRef<HTMLDivElement>(null)
  const pointerType = useRef('mouse')
  const origin = FARM_WORLD.origin

  // Pointer → tile. The world is scaled by the camera, so measure its on-screen box.
  const tileAt = (e: ReactMouseEvent) => {
    const el = worldRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const wx = ((e.clientX - rect.left) * FARM_WORLD.w) / rect.width - origin.x
    const wy = ((e.clientY - rect.top) * FARM_WORLD.h) / rect.height - origin.y
    return screenToTile(wx, wy)
  }

  const ghost =
    build?.tile && ({ ...build.tile, width: build.footprint.width, height: build.footprint.height } satisfies Footprint)
  const ghostOk = ghost ? checkPlacement(placements, ghost) === 'ok' : false
  // A stream or Farmer's House being placed on a free spot: preview the buffs it would give.
  const auraKind = build && (build.itemType === 'stream' || build.itemType === 'farmer_house') ? build.itemType : null
  const withGhost: readonly Placement[] =
    ghost && ghostOk && auraKind
      ? [...placements, { id: 'ghost', itemType: auraKind, deckId: null, x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height, variant: null }]
      : placements

  const trees = placements.flatMap((p) => {
    const plot = p.itemType === 'tree' && p.deckId ? plotsByDeck.get(p.deckId) : undefined
    return plot ? [{ placement: p, plot }] : []
  })
  const standing = placements.filter((p) => p.itemType !== 'stream' && p.itemType !== 'tree').sort((a, b) => depthOf(a) - depthOf(b) || a.x - b.x)
  const animated = new Set(
    trees
      .filter(({ plot }) => getTreeStage(plot.masteryPercent) >= 3)
      .slice(0, MAX_ANIMATED)
      .map(({ placement }) => placement.id),
  )
  const groundOf = (f: Footprint) => {
    const c = footprintCenter(f)
    return { x: c.x + origin.x, y: c.y + origin.y }
  }

  return (
    <div
      ref={worldRef}
      role="group"
      aria-label="Farm grid"
      className="absolute inset-0"
      onPointerDown={(e) => {
        pointerType.current = e.pointerType
      }}
      onPointerMove={(e) => {
        if (!build || e.pointerType !== 'mouse') return
        const tile = tileAt(e)
        if (tile && (tile.x !== build.tile?.x || tile.y !== build.tile?.y)) onBuildHover(tile)
      }}
      onClick={(e) => {
        if (!build) return
        const tile = tileAt(e)
        if (tile) onBuildTap(tile, pointerType.current)
      }}
      onContextMenu={(e) => {
        // Right-click cancels placement mode.
        if (!build) return
        e.preventDefault()
        onBuildCancel()
      }}
    >
      <svg aria-hidden width={FARM_WORLD.w} height={FARM_WORLD.h} className="absolute inset-0 overflow-visible">
        <OceanLayer world={FARM_WORLD} origin={origin} />
        <IslandBase origin={origin} seed={seed} />
        {trees.map(({ placement }) => (
          <TreePad key={placement.id} footprint={placement} origin={origin} />
        ))}
        {placements
          .filter((p) => p.itemType === 'stream')
          .map((p) => (
            <StreamTile key={p.id} footprint={p} origin={origin} />
          ))}
        {ghost && auraKind && ghostOk && <BuffAura kind={auraKind} tile={ghost} origin={origin} />}
        {ghost && <GhostFootprint footprint={ghost} origin={origin} valid={ghostOk} />}
      </svg>

      {/* Palms on the beach, in the same painter's order as everything else. */}
      {beachPalms().map((palm, i) => (
        <svg
          key={i}
          aria-hidden
          className="pointer-events-none absolute overflow-visible"
          width={1}
          height={1}
          style={{ left: palm.x + origin.x, top: palm.y + origin.y, zIndex: Math.round(palm.y + origin.y) }}
        >
          <Palm scale={palm.scale} flip={palm.flip} />
        </svg>
      ))}

      {/* Standing things, back to front. In build mode they let clicks through to the grid. */}
      <div className={build ? 'pointer-events-none' : undefined}>
        {trees.map(({ placement, plot }) => {
          const ground = groundOf(placement)
          const current = treeBuff(placement.x, placement.y, placements)
          const next = withGhost === placements ? current : treeBuff(placement.x, placement.y, withGhost)
          return (
            <div key={placement.id}>
              <PlotButton geometry={ground} plot={plot} animate={animated.has(placement.id)} onOpen={onOpenPlot} />
              <PlotLabels geometry={ground} plot={plot} onOpen={onOpenPlot} />
              <BuffTags ground={ground} scale={getTreeSizeTier(plot.itemCount).scale} current={current} next={next} />
            </div>
          )
        })}
        {standing.map((p, i) => (
          <FarmItem key={p.id} placement={p} ground={groundOf(p)} index={i} placements={placements} onOpen={onOpenItem} />
        ))}
      </div>

      <WorldClouds world={FARM_WORLD} />

      {/* The item being placed, floating over its footprint: glowing green, or red and blocked. */}
      {ghost && build && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: groundOf(ghost).x, top: groundOf(ghost).y, zIndex: 500_000 }}
        >
          <div
            className={cn(
              'relative',
              ghostOk ? 'mg-float [filter:drop-shadow(0_0_10px_#b8ff5c)]' : 'opacity-75 [filter:drop-shadow(0_0_8px_#ff1f3d)_saturate(0.55)]',
            )}
          >
            {build.preview}
          </div>
          {!ghostOk && (
            <span className="mg-throb absolute -top-28 left-1/2 -translate-x-1/2 -rotate-6 rounded-xl border-[3px] border-[#5c0011] bg-gradient-to-b from-[#ff6b6b] to-[#d90429] px-2.5 py-1 font-game text-sm font-extrabold whitespace-nowrap text-white shadow-[0_4px_0_#5c0011] [text-shadow:0_2px_0_#5c0011]">
              ✖ Blocked!
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Floating cartoon badges over a buffed tree: "+20% 🪙" for a stream beside it, "+50% 🪙" inside a
// Farmer's House aura. While a stream / house is being placed, the badges it would add pulse in.
function BuffTags({ ground, scale, current, next }: { ground: { x: number; y: number }; scale: number; current: TreeBuff; next: TreeBuff }) {
  const tags = [
    { key: 'stream', label: '+20%', on: current.stream, soon: !current.stream && next.stream, tone: 'stream' as const },
    { key: 'house', label: '+50%', on: current.house, soon: !current.house && next.house, tone: 'house' as const },
  ].filter((t) => t.on || t.soon)
  if (tags.length === 0) return null
  const anchor = plotSprite(ground.x, ground.y, scale).badge
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ left: anchor.x + 14, top: anchor.y - 30, zIndex: LABEL_LAYER + Math.round(ground.y) + 1 }}>
      <div className="flex flex-col items-start gap-1">
        {tags.map((t) => (
          <span
            key={t.key}
            className={cn(
              'mg-bob relative inline-flex items-center gap-0.5 overflow-hidden rounded-full border-[2.5px] px-2 py-0.5 font-game text-[12px] leading-none font-extrabold whitespace-nowrap text-white tabular-nums',
              'shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_3px_0_var(--tag-edge),0_6px_8px_rgba(0,0,0,0.2)] [text-shadow:0_1.5px_0_var(--tag-edge),1px_0_0_var(--tag-edge),-1px_0_0_var(--tag-edge)]',
              t.tone === 'stream'
                ? 'border-[#075e73] bg-gradient-to-b from-[#7ff5f0] via-[#22c9e0] to-[#0891b2] [--tag-edge:#075e73]'
                : 'border-[#8a4a0c] bg-gradient-to-b from-[#fff3a3] via-[#fbbf24] to-[#f97316] [--tag-edge:#8a4a0c]',
              t.soon && 'mg-throb border-dashed',
            )}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0.5 h-[40%] rounded-full bg-white/40" />
            <span className="relative">{t.soon ? `${t.label}?` : t.label}</span>
            <span className="relative text-[11px]">🪙</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// A bought item standing on the farm: its drawing plus a button over it (name, buff, pick up).
function FarmItem({
  placement,
  ground,
  index,
  placements,
  onOpen,
}: {
  placement: Placement
  ground: { x: number; y: number }
  index: number
  placements: readonly Placement[]
  onOpen: (placement: Placement) => void
}) {
  const entry = catalogFor(placement.itemType, placement.variant)
  const big = placement.width > 1
  const box = big ? { w: 170, h: 170 } : placement.itemType === 'fence' ? { w: 56, h: 50 } : { w: 70, h: 62 }
  const z = Math.round(ground.y)
  return (
    <>
      {placement.itemType === 'animal' ? (
        <div className="pointer-events-none absolute" style={{ left: ground.x, top: ground.y, zIndex: z }}>
          <AnimalSprite variant={placement.variant} delay={(index * 1.7) % 9} />
        </div>
      ) : (
        <svg aria-hidden className="pointer-events-none absolute overflow-visible" width={1} height={1} style={{ left: ground.x, top: ground.y, zIndex: z }}>
          {placement.itemType === 'farmer_house' && <FarmerHouse />}
          {placement.itemType === 'woodshop' && <WoodshopSprite />}
          {placement.itemType === 'rockery' && <RockerySprite />}
          {placement.itemType === 'fence' && <FenceSprite links={fenceLinks(placements, placement)} />}
        </svg>
      )}
      <button
        type="button"
        onClick={() => onOpen(placement)}
        aria-label={entry?.name ?? 'Farm item'}
        className="absolute rounded-3xl transition-colors hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
        style={{ left: ground.x - box.w / 2, top: ground.y - box.h + (big ? TILE_H / 2 : 8), width: box.w, height: box.h, zIndex: z + 1 }}
      />
    </>
  )
}

export { FarmIsometricGrid }

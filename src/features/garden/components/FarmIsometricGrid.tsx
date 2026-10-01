'use client'

import { memo, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'
import { beachPalms, FARM_WORLD } from '../lib/diorama'
import { holdMs, pressOutcome, tileAtPoint } from '../lib/dragGesture'
import { treeBuff, type TreeBuff } from '../lib/farmBuffs'
import { catalogFor, type FarmItemType } from '../lib/farmCatalog'
import {
  checkMove,
  checkPlacement,
  depthOf,
  fenceLinks,
  footprintCenter,
  neighbourLinks,
  streamLinks,
  TILE_H,
  TILE_W,
  tileToScreen,
  withMoved,
  type Footprint,
  type Placement,
} from '../lib/farmGrid'
import { plotSprite } from '../lib/plotSprite'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { getTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { IslandBase, OceanLayer, Palm, WorldClouds } from './FarmDiorama'
import {
  AnimalSprite,
  BuffAura,
  FarmerHouse,
  FenceSprite,
  GhostFootprint,
  RockerySprite,
  StreamNetwork,
  TreePlots,
  WoodshopSprite,
  type LinkedTile,
} from './FarmStructures'
import { LABEL_LAYER, PlotButton, PlotLabels, treeSwayPhase } from './FarmTree'

export { FARM_WORLD }

// Animate at most this many trees (particles, bees): keeps big farms light.
const MAX_ANIMATED = 12

export type BuildGhost = {
  footprint: Pick<Footprint, 'width' | 'height'>
  // What is being placed ('tree' for one of your trees): drives the aura preview.
  itemType: FarmItemType
  // Move mode: the placement being moved (lifted at its old spot while the ghost looks for a new one).
  movingId?: string | null
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
  // Direct drag-and-drop (the owner's farm, outside build mode): hold a tree or item to pick it up
  // (lib/dragGesture.ts). onDragStart answers whether it was picked up (it enters Move mode, and the
  // ghost then follows onBuildHover); onDragEnd gets the tile under the release (null: off the island).
  dragEnabled?: boolean
  onDragStart?: (placementId: string, pointerId: number) => boolean
  onDragEnd?: (tile: { x: number; y: number } | null) => void
}

// Marks the element that stands for a placement, so a press on it can pick it up.
const PLACEMENT_ATTR = 'data-placement-id'

// The farm's 16 × 16 isometric grid on a floating tropical island (FarmDiorama), with everything
// placed on it. Screen position of tile (x, y): ((x − y) · TILE_W / 2, (x + y) · TILE_H / 2) from
// the grid origin (lib/farmGrid.ts, tested); standing things are painted back to front by their
// ground point (z-index = ground y).
// Performance: the grid is memoized (the camera re-rendering the page never reaches it), its static
// layers (ocean, island with its 256 tiles, palms, clouds) are memoized components, and every tree and
// item is a memoized tile with stable or primitive props, so planting, moving or hovering a ghost only
// re-renders what actually changed.
function FarmIsometricGridImpl({
  placements,
  plotsByDeck,
  seed,
  build,
  onBuildHover,
  onBuildTap,
  onBuildCancel,
  onOpenPlot,
  onOpenItem,
  dragEnabled = false,
  onDragStart,
  onDragEnd,
}: FarmIsometricGridProps) {
  const worldRef = useRef<HTMLDivElement>(null)
  const pointerType = useRef('mouse')
  const origin = FARM_WORLD.origin
  // The press that may become a drag, and the drag in progress (window listeners are removed by `stop`).
  const gesture = useRef<{ stop: () => void; dragging: boolean } | null>(null)
  useEffect(() => () => gesture.current?.stop(), [])

  // Pointer → tile. The world is scaled by the camera, so measure its on-screen box.
  const tileAtClient = (clientX: number, clientY: number) => {
    const el = worldRef.current
    return el ? tileAtPoint({ x: clientX, y: clientY }, el.getBoundingClientRect(), FARM_WORLD) : null
  }
  const tileAt = (e: ReactMouseEvent) => tileAtClient(e.clientX, e.clientY)

  // A press on one of your trees or items: a pan if it moves first, a pick-up if it holds still.
  const startPress = (e: ReactPointerEvent) => {
    if (!dragEnabled || build || !onDragStart || !onDragEnd || e.button !== 0 || gesture.current) return
    const target = e.target instanceof Element ? e.target.closest(`[${PLACEMENT_ATTR}]`) : null
    const placementId = target?.getAttribute(PLACEMENT_ATTR)
    if (!placementId) return
    const press = { pointerType: e.pointerType, x: e.clientX, y: e.clientY }
    const pointerId = e.pointerId
    const startedAt = performance.now()
    let last = { x: e.clientX, y: e.clientY }
    let dragging = false
    let lastTile: { x: number; y: number } | null = null

    const stop = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
      gesture.current = null
    }
    const hover = (x: number, y: number) => {
      const tile = tileAtClient(x, y)
      if (tile && (tile.x !== lastTile?.x || tile.y !== lastTile?.y)) {
        lastTile = tile
        onBuildHover(tile)
      }
    }
    const timer = setTimeout(() => {
      if (pressOutcome(press, last, performance.now() - startedAt) !== 'drag') return stop()
      if (!onDragStart(placementId, pointerId)) return stop()
      dragging = true
      if (gesture.current) gesture.current.dragging = true
      // A little buzz on phones that support it: "picked up".
      if (press.pointerType !== 'mouse') navigator.vibrate?.(12)
    }, holdMs(press.pointerType))
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      last = { x: ev.clientX, y: ev.clientY }
      if (dragging) hover(ev.clientX, ev.clientY)
      // Moved before the hold: it's a pan, the camera has it.
      else if (pressOutcome(press, last, performance.now() - startedAt) === 'pan') stop()
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const wasDragging = dragging
      stop()
      if (wasDragging) onDragEnd(tileAtClient(ev.clientX, ev.clientY))
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const wasDragging = dragging
      stop()
      if (wasDragging) onDragEnd(null)
    }
    // A long press on Android / iOS opens the context menu; during a press it means nothing here.
    const onContextMenu = (ev: Event) => ev.preventDefault()
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('contextmenu', onContextMenu, true)
    gesture.current = { stop, dragging: false }
  }

  const ghostX = build?.tile?.x ?? null
  const ghostY = build?.tile?.y ?? null
  const ghostW = build?.footprint.width ?? 1
  const ghostH = build?.footprint.height ?? 1
  const ghost: Footprint | null = ghostX !== null && ghostY !== null ? { x: ghostX, y: ghostY, width: ghostW, height: ghostH } : null
  const movingId = build?.movingId ?? null
  const ghostOk = ghost ? (movingId ? checkMove(placements, movingId, ghost) === 'ok' : checkPlacement(placements, ghost) === 'ok') : false
  // A stream or Farmer's House being placed or moved to a free spot: preview the buffs it would give.
  const auraKind = build && (build.itemType === 'stream' || build.itemType === 'farmer_house') ? build.itemType : null

  // Everything derived from the tiles, recomputed only when the farm or the ghost's spot changes.
  const scene = useMemo(() => {
    const spot = ghostX !== null && ghostY !== null ? { x: ghostX, y: ghostY, width: ghostW, height: ghostH } : null
    // Move mode: everything else stays; the moved thing has left its old tile and, on a green spot, is
    // already at the new one, so neighbouring streams, fences and tree beds retile live at both places.
    const others = movingId ? placements.filter((p) => p.id !== movingId) : placements
    const layout: readonly Placement[] = movingId && spot && ghostOk ? withMoved(placements, movingId, spot) : others
    const withGhost: readonly Placement[] = movingId
      ? layout
      : spot && ghostOk && auraKind
        ? [...placements, { id: 'ghost', itemType: auraKind, deckId: null, x: spot.x, y: spot.y, width: spot.width, height: spot.height, variant: null }]
        : placements
    const trees = placements.flatMap((p) => {
      const plot = p.itemType === 'tree' && p.deckId ? plotsByDeck.get(p.deckId) : undefined
      return plot ? [{ placement: p, plot }] : []
    })
    const animated = new Set(
      trees
        .filter(({ plot }) => getTreeStage(plot.masteryPercent) >= 3)
        .slice(0, MAX_ANIMATED)
        .map(({ placement }) => placement.id),
    )
    return {
      // Auto-tiling: tree beds join the tree beds beside them, streams the streams beside them.
      treeBeds: trees
        .filter(({ placement: p }) => p.id !== movingId)
        .map(({ placement: p }): LinkedTile => ({ key: p.id, x: p.x, y: p.y, links: neighbourLinks(layout, 'tree', p) })),
      streams: others.filter((p) => p.itemType === 'stream').map((p): LinkedTile => ({ key: p.id, x: p.x, y: p.y, links: streamLinks(layout, p) })),
      // Streams are painted as one network; each tile still gets its own (invisible) button.
      streamHits: placements.filter((p) => p.itemType === 'stream' && p.id !== movingId),
      trees: trees.map(({ placement, plot }) => {
        const current = treeBuff(placement.x, placement.y, placements)
        const next = withGhost === placements ? current : treeBuff(placement.x, placement.y, withGhost)
        return { placement, plot, animate: animated.has(placement.id), buffs: buffKey(current, next) }
      }),
      items: placements
        .filter((p) => p.itemType !== 'stream' && p.itemType !== 'tree')
        .sort((a, b) => depthOf(a) - depthOf(b) || a.x - b.x)
        .map((p) => ({ placement: p, links: p.itemType === 'fence' ? linksKey(fenceLinks(p.id === movingId ? others : layout, p)) : '' })),
    }
  }, [placements, plotsByDeck, movingId, ghostX, ghostY, ghostW, ghostH, ghostOk, auraKind])

  return (
    <div
      ref={worldRef}
      role="group"
      aria-label="Farm grid"
      className="absolute inset-0"
      onPointerDown={(e) => {
        pointerType.current = e.pointerType
        startPress(e)
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
        // Right-click cancels placement mode (but a touch long-press that started a drag doesn't).
        if (!build || gesture.current) return
        e.preventDefault()
        onBuildCancel()
      }}
    >
      <svg aria-hidden width={FARM_WORLD.w} height={FARM_WORLD.h} className="absolute inset-0 overflow-visible">
        <OceanLayer world={FARM_WORLD} origin={origin} />
        <IslandBase origin={origin} seed={seed} />
        <TreePlots trees={scene.treeBeds} origin={origin} />
        <StreamNetwork streams={scene.streams} origin={origin} />
        {ghost && auraKind && ghostOk && <BuffAura kind={auraKind} tile={ghost} origin={origin} />}
        {ghost && <GhostFootprint footprint={ghost} origin={origin} valid={ghostOk} />}
      </svg>

      <BeachPalms />

      {/* Standing things, back to front. In build mode they let clicks through to the grid. */}
      <div className={build ? 'pointer-events-none' : undefined}>
        {scene.trees.map(({ placement, plot, animate, buffs }) => (
          <TreeTile key={placement.id} placement={placement} plot={plot} animate={animate} buffs={buffs} lifted={placement.id === movingId} onOpen={onOpenPlot} />
        ))}
        {scene.items.map(({ placement, links }) => (
          <FarmItem key={placement.id} placement={placement} links={links} lifted={placement.id === movingId} onOpen={onOpenItem} />
        ))}
        {scene.streamHits.map((placement) => (
          <StreamHit key={placement.id} placement={placement} onOpen={onOpenItem} />
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
          {/* Glow: a static radial gradient behind the miniature (a filter on a floating element would
              be recomputed every frame). */}
          <span
            className={cn(
              'absolute size-40 -translate-x-1/2 -translate-y-[70%] rounded-full',
              ghostOk
                ? 'bg-[radial-gradient(closest-side,rgba(184,255,92,0.55),rgba(184,255,92,0.18)_55%,rgba(184,255,92,0)_100%)]'
                : 'bg-[radial-gradient(closest-side,rgba(255,31,61,0.5),rgba(255,31,61,0.16)_55%,rgba(255,31,61,0)_100%)]',
            )}
          />
          <div className={cn('relative', ghostOk ? 'mg-float' : 'opacity-70')}>{build.preview}</div>
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

const groundOf = (f: Footprint) => {
  const c = footprintCenter(f)
  return { x: c.x + FARM_WORLD.origin.x, y: c.y + FARM_WORLD.origin.y }
}

// Primitive keys so memoized tiles compare cheaply: a tree's buffs now / after the ghost, and a fence's
// links ("nesw" as 1 / 0).
const buffKey = (current: TreeBuff, next: TreeBuff) => `${+current.stream}${+current.house}${+next.stream}${+next.house}`
const linksKey = (l: { north: boolean; east: boolean; south: boolean; west: boolean }) => `${+l.north}${+l.east}${+l.south}${+l.west}`
const bit = (key: string, i: number) => key[i] === '1'

// Palms on the beach, in the same painter's order as everything else (static: rendered once).
const BeachPalms = memo(function BeachPalms() {
  const origin = FARM_WORLD.origin
  return (
    <>
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
    </>
  )
})

// One planted tree: the tree, its labels and buff tags; lifted (no labels) while it is being moved.
const TreeTile = memo(function TreeTile({
  placement,
  plot,
  animate,
  buffs,
  lifted,
  onOpen,
}: {
  placement: Placement
  plot: FarmPlotView
  animate: boolean
  buffs: string
  lifted: boolean
  onOpen: (plot: FarmPlotView) => void
}) {
  const ground = groundOf(placement)
  const phase = treeSwayPhase(placement.x, placement.y)
  if (lifted) {
    return (
      <Lifted z={Math.round(ground.y) + 1}>
        <PlotButton geometry={ground} plot={plot} animate={false} phase={phase} onOpen={onOpen} />
      </Lifted>
    )
  }
  const current = { multiplier: 1, stream: bit(buffs, 0), house: bit(buffs, 1) }
  const next = { multiplier: 1, stream: bit(buffs, 2), house: bit(buffs, 3) }
  return (
    <>
      {/* display: contents: no box of its own, it only marks the tree so a hold can pick it up. */}
      <div {...{ [PLACEMENT_ATTR]: placement.id }} className="contents">
        <PlotButton geometry={ground} plot={plot} animate={animate} phase={phase} onOpen={onOpen} />
      </div>
      <PlotLabels geometry={ground} plot={plot} onOpen={onOpen} />
      <BuffTags ground={ground} scale={getTreeSizeTier(plot.itemCount).scale} current={current} next={next} />
    </>
  )
})

// The thing being moved, picked up at its old spot: raised 12 px and see-through (trees keep their
// gradient shadows on the ground below).
// Its own layer at its depth (a transformed wrapper is a stacking context of its own).
function Lifted({ z, children }: { z: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 -translate-y-3 opacity-60 transition-[transform,opacity] duration-200" style={{ zIndex: z }}>
      {children}
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
// Memoized: `links` is the fence's "nesw" key, so moving something elsewhere doesn't redraw it.
// A stream tile's click target: the tile's diamond, invisible (the water is drawn by StreamNetwork).
// Opens the item popover like any Shop item, and a hold picks it up.
const StreamHit = memo(function StreamHit({ placement, onOpen }: { placement: Placement; onOpen: (placement: Placement) => void }) {
  const top = tileToScreen(placement.x, placement.y)
  const origin = FARM_WORLD.origin
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(placement)
      }}
      aria-label="Stream"
      {...{ [PLACEMENT_ATTR]: placement.id }}
      className="absolute transition-colors [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] hover:bg-white/15 focus-visible:bg-yellow-200/40 focus-visible:outline-none"
      style={{ left: origin.x + top.x - TILE_W / 2, top: origin.y + top.y, width: TILE_W, height: TILE_H, zIndex: Math.round(origin.y + top.y + TILE_H / 2) }}
    />
  )
})

const FarmItem = memo(function FarmItem({
  placement,
  links,
  lifted,
  onOpen,
}: {
  placement: Placement
  links: string
  lifted: boolean
  onOpen: (placement: Placement) => void
}) {
  const ground = groundOf(placement)
  const entry = catalogFor(placement.itemType, placement.variant)
  const big = placement.width > 1
  const box = big ? { w: 170, h: 170 } : placement.itemType === 'fence' ? { w: 56, h: 50 } : { w: 70, h: 62 }
  const z = Math.round(ground.y)
  // Animals start their idle at a point fixed by their id, so neighbours never move in step.
  const delay = [...placement.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 9
  const body = (
    <>
      {placement.itemType === 'animal' ? (
        <div className="pointer-events-none absolute" style={{ left: ground.x, top: ground.y, zIndex: z }}>
          <AnimalSprite variant={placement.variant} delay={delay} />
        </div>
      ) : (
        <svg aria-hidden className="pointer-events-none absolute overflow-visible" width={1} height={1} style={{ left: ground.x, top: ground.y, zIndex: z }}>
          {placement.itemType === 'farmer_house' && <FarmerHouse />}
          {placement.itemType === 'woodshop' && <WoodshopSprite />}
          {placement.itemType === 'rockery' && <RockerySprite />}
          {placement.itemType === 'fence' && <FenceSprite links={{ north: bit(links, 0), east: bit(links, 1), south: bit(links, 2), west: bit(links, 3) }} />}
        </svg>
      )}
      <button
        type="button"
        onClick={(e) => {
          // The item's click only: it never reaches the grid's tile-picking handler.
          e.stopPropagation()
          onOpen(placement)
        }}
        aria-label={entry?.name ?? 'Farm item'}
        {...{ [PLACEMENT_ATTR]: placement.id }}
        className="absolute rounded-3xl transition-colors hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
        style={{ left: ground.x - box.w / 2, top: ground.y - box.h + (big ? TILE_H / 2 : 8), width: box.w, height: box.h, zIndex: z + 1 }}
      />
    </>
  )
  return lifted ? <Lifted z={z + 1}>{body}</Lifted> : body
})

const FarmIsometricGrid = memo(FarmIsometricGridImpl)

export { FarmIsometricGrid }

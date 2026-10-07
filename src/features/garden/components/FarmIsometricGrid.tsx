'use client'

import { memo, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'
import { beachPalms, FARM_WORLD } from '../lib/diorama'
import { holdMs, pressOutcome, tileAtPoint } from '../lib/dragGesture'
import { treeBuff, type TreeBuff } from '../lib/farmBuffs'
import { catalogFor, type FarmItemType } from '../lib/farmCatalog'
import {
  depthOf,
  fenceLinks,
  footprintCenter,
  freeTiles,
  GRID_SIZE,
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
import { checkItemPlacement, isPowerSource, poweredMap, powerField, powerFields, requiresPower, seaportSpots } from '../lib/powerGrid'
import { getTreeSizeTier } from '@/shared/lib/treeSkins'
import { getTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { IslandBase, OceanLayer, Palm, WorldClouds } from './FarmDiorama'
import {
  AnimalSprite,
  BuffAura,
  FarmerHouse,
  FenceSprite,
  ItemDrawing,
  footprintPoints,
  GhostFootprint,
  RockerySprite,
  StreamNetwork,
  TreePlots,
  WoodshopSprite,
  type LinkedTile,
} from './FarmStructures'
import { LABEL_LAYER, PlotButton, PlotLabels, treeSwayPhase } from './FarmTree'
import { shoreOf } from './PowerBuildings'
import { RailNetwork, RunningTrain, type TrackCell } from './RailwaySprites'
import { railLink } from '../lib/railway'

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
  // Planting a tree: every open tile glows softly, so the free spots read at a glance (the one under
  // the pointer is the ghost's bright green).
  highlightFree?: boolean
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
  // Owner: harvest a ripe tree's fruit (shown as a 🍎 bubble).
  onHarvestPlot?: (plot: FarmPlotView) => void
  // Direct drag-and-drop (the owner's farm, outside build mode): hold a tree or item to pick it up
  // (lib/dragGesture.ts). onDragStart answers whether it was picked up (it enters Move mode, and the
  // ghost then follows onBuildHover); onDragEnd gets the tile under the release (null: off the island).
  dragEnabled?: boolean
  onDragStart?: (placementId: string, pointerId: number) => boolean
  onDragEnd?: (tile: { x: number; y: number } | null) => void
  // The item whose popover is open: a windmill shows its power field, a building that needs power
  // shows every field on the farm.
  inspectedId?: string | null
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
  onHarvestPlot,
  inspectedId = null,
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
  // Bounds, overlaps and, for the seaport, the coast (lib/powerGrid checkItemPlacement).
  const ghostCheck = ghost && build ? checkItemPlacement(placements, build.itemType, ghost, movingId ?? undefined) : null
  const ghostOk = ghostCheck === 'ok'
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
    const powered = poweredMap(placements)
    const trees = placements.flatMap((p) => {
      const plot = p.itemType === 'tree' && p.deckId ? plotsByDeck.get(p.deckId) : undefined
      return plot ? [{ placement: p, plot }] : []
    })
    const animated = new Set(
      trees
        // Withered trees stand still: no bees, no falling leaves.
        .filter(({ plot }) => getTreeStage(plot.masteryPercent) >= 3 && !plot.withered)
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
      // Railroad Track: drawn flat in the ground layer, joined to the tracks beside it; each tile gets
      // an invisible button like a stream's.
      tracks: layout
        .filter((p) => p.itemType === 'rail_track')
        .map((p): TrackCell => ({ key: p.id, x: p.x, y: p.y, links: neighbourLinks(layout, 'rail_track', p) })),
      trackHits: placements.filter((p) => p.itemType === 'rail_track' && p.id !== movingId),
      // A Freight Train on a line linking a Candy Factory to the Seaport runs it (lib/railway railLink).
      link: railLink(placements),
      trees: trees.map(({ placement, plot }) => {
        const current = treeBuff(placement.x, placement.y, placements)
        const next = withGhost === placements ? current : treeBuff(placement.x, placement.y, withGhost)
        return { placement, plot, animate: animated.has(placement.id), buffs: buffKey(current, next) }
      }),
      items: placements
        .filter((p) => p.itemType !== 'stream' && p.itemType !== 'tree' && p.itemType !== 'rail_track')
        .sort((a, b) => depthOf(a) - depthOf(b) || a.x - b.x)
        .map((p) => ({
          placement: p,
          links: p.itemType === 'fence' ? linksKey(fenceLinks(p.id === movingId ? others : layout, p)) : '',
          // Buildings that need power: on or off (lib/powerGrid); undefined for everything else.
          powered: powered.get(p.id),
        })),
    }
  }, [placements, plotsByDeck, movingId, ghostX, ghostY, ghostW, ghostH, ghostOk, auraKind])

  // Power fields to show: while placing (or moving) a power building, every field on the farm plus the
  // one the ghost would make; while inspecting a windmill, its own; a building that needs power, all.
  const powerView = useMemo(() => {
    const others = movingId ? placements.filter((p) => p.id !== movingId) : placements
    if (build && (isPowerSource(build.itemType) || requiresPower(build.itemType))) {
      const own = ghost && ghostOk && isPowerSource(build.itemType) ? powerField({ ...ghost, itemType: build.itemType }) : null
      return { fields: [...powerFields(others), ...(own ? [own] : [])], focus: own }
    }
    const inspected = inspectedId ? placements.find((p) => p.id === inspectedId) : undefined
    if (inspected && isPowerSource(inspected.itemType)) {
      const own = powerField(inspected)
      return { fields: own ? [own] : [], focus: own }
    }
    if (inspected && requiresPower(inspected.itemType)) return { fields: powerFields(placements), focus: null }
    return { fields: [], focus: null }
    // ghost / ghostOk derive from build and the tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, movingId, build?.itemType, ghostX, ghostY, ghostW, ghostH, ghostOk, inspectedId])

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
        <RailNetwork tracks={scene.tracks} origin={origin} />
        {ghost && auraKind && ghostOk && <BuffAura kind={auraKind} tile={ghost} origin={origin} />}
        {build?.highlightFree && <FreeTileMarks placements={placements} origin={origin} />}
        {build?.itemType === 'seaport' && <CoastMarks placements={placements} movingId={movingId} origin={origin} />}
        {powerView.fields.length > 0 && <PowerFields fields={powerView.fields} focus={powerView.focus} origin={origin} />}
        {ghost && <GhostFootprint footprint={ghost} origin={origin} valid={ghostOk} />}
      </svg>

      <BeachPalms />

      {/* Standing things, back to front. In build mode they let clicks through to the grid. */}
      <div className={build ? 'pointer-events-none' : undefined}>
        {scene.trees.map(({ placement, plot, animate, buffs }) => (
          <TreeTile key={placement.id} placement={placement} plot={plot} animate={animate} buffs={buffs} lifted={placement.id === movingId} onOpen={onOpenPlot} onHarvest={onHarvestPlot} />
        ))}
        {scene.items.map(({ placement, links, powered }) => (
          <FarmItem
            key={placement.id}
            placement={placement}
            links={links}
            powered={powered}
            // The train out on its run: the parked one isn't drawn (its button stays).
            running={!build && scene.link?.train.id === placement.id}
            lifted={placement.id === movingId}
            onOpen={onOpenItem}
          />
        ))}
        {scene.trackHits.map((placement) => (
          <StreamHit key={placement.id} placement={placement} label="Railroad Track" onOpen={onOpenItem} />
        ))}
        {!build && scene.link && <TrainRun route={scene.link.route} />}
        {scene.streamHits.map((placement) => (
          <StreamHit key={placement.id} placement={placement} onOpen={onOpenItem} />
        ))}
      </div>

      {/* Night: a navy veil over the island and everything standing on it, under the labels and
          bubbles (so those keep their own light). Fades out towards the open sea; invisible by day
          (`.mg-night-veil` in globals.css). Never a pointer target. */}
      <div
        aria-hidden
        className="mg-night-veil pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
        style={{ left: origin.x, top: origin.y + (GRID_SIZE * TILE_H) / 2 + 70, width: GRID_SIZE * TILE_W * 1.5, height: GRID_SIZE * TILE_H * 2.1, zIndex: LABEL_LAYER - 1 }}
      />

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
              {ghostCheck === 'not-coastal' ? '✖ Coast only!' : '✖ Blocked!'}
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
  onHarvest,
}: {
  placement: Placement
  plot: FarmPlotView
  animate: boolean
  buffs: string
  lifted: boolean
  onOpen: (plot: FarmPlotView) => void
  onHarvest?: (plot: FarmPlotView) => void
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
      {/* mg-plot: in hover-labels mode, hovering / focusing the tree reveals the labels that follow it (globals.css). */}
      <div {...{ [PLACEMENT_ATTR]: placement.id }} className="mg-plot contents">
        <PlotButton geometry={ground} plot={plot} animate={animate} phase={phase} onOpen={onOpen} />
      </div>
      <PlotLabels geometry={ground} plot={plot} onOpen={onOpen} onHarvest={onHarvest} />
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

// Placement preview only: while a stream / Farmer's House is being placed (or moved), the buff it
// would add to a tree pulses in over that tree ("+20%?" beside a stream, "+50%?" in a house's aura).
// Nothing shows over a tree otherwise: its buffs are in its popover, so the island stays clean.
function BuffTags({ ground, scale, current, next }: { ground: { x: number; y: number }; scale: number; current: TreeBuff; next: TreeBuff }) {
  const tags = [
    { key: 'stream', label: '+20%', soon: !current.stream && next.stream, tone: 'stream' as const },
    { key: 'house', label: '+50%', soon: !current.house && next.house, tone: 'house' as const },
  ].filter((t) => t.soon)
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
              'mg-throb border-dashed',
            )}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0.5 h-[40%] rounded-full bg-white/40" />
            <span className="relative">{`${t.label}?`}</span>
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
const StreamHit = memo(function StreamHit({ placement, label = 'Stream', onOpen }: { placement: Placement; label?: string; onOpen: (placement: Placement) => void }) {
  const top = tileToScreen(placement.x, placement.y)
  const origin = FARM_WORLD.origin
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(placement)
      }}
      aria-label={label}
      {...{ [PLACEMENT_ATTR]: placement.id }}
      className="absolute transition-colors [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] hover:bg-white/15 focus-visible:bg-yellow-200/40 focus-visible:outline-none"
      style={{ left: origin.x + top.x - TILE_W / 2, top: origin.y + top.y, width: TILE_W, height: TILE_H, zIndex: Math.round(origin.y + top.y + TILE_H / 2) }}
    />
  )
})

const FarmItem = memo(function FarmItem({
  placement,
  links,
  powered,
  running = false,
  lifted,
  onOpen,
}: {
  placement: Placement
  links: string
  // A building that needs power: whether it has it (undefined: needs none).
  powered?: boolean
  // The Freight Train out on its route (TrainRun draws it): nothing drawn here, the button stays.
  running?: boolean
  lifted: boolean
  onOpen: (placement: Placement) => void
}) {
  const ground = groundOf(placement)
  const entry = catalogFor(placement.itemType, placement.variant)
  const big = placement.width > 1
  // The click target follows the footprint: 2 × 2 buildings as before, bigger ones by their diamond.
  const span = (placement.width + placement.height) / 4
  const box =
    // The Windmill is a 2 × 2 tower: a tall target over the whole tower.
    placement.itemType === 'windmill_small'
      ? { w: 170, h: 240 }
      : placement.width > 2 || placement.height > 2
      ? { w: Math.round(span * TILE_W * 1.6), h: Math.round(span * TILE_W * 0.9) }
      : big
        ? { w: 170, h: 170 }
        : placement.itemType === 'fence'
          ? { w: 56, h: 50 }
          : { w: 70, h: 62 }
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
          {(placement.itemType === 'windmill_small' ||
            placement.itemType === 'furniture_factory' ||
            placement.itemType === 'candy_factory' ||
            placement.itemType === 'seaport' ||
            (placement.itemType === 'freight_train' && !running)) && (
            <ItemDrawing item={{ itemType: placement.itemType, variant: null }} powered={powered !== false} shore={shoreOf(placement.y)} />
          )}
        </svg>
      )}
      {/* A building without power: a red badge over it (its activity stopped). */}
      {powered === false && (
        <span
          aria-hidden
          data-no-power=""
          className="mg-throb pointer-events-none absolute -translate-x-1/2 rounded-full border-2 border-[#5c0011] bg-gradient-to-b from-[#ff6b6b] to-[#d90429] px-2 py-0.5 font-game text-[11px] font-extrabold whitespace-nowrap text-white shadow-[0_3px_0_#5c0011]"
          style={{ left: ground.x, top: ground.y - box.h * 0.75, zIndex: LABEL_LAYER + z }}
        >
          ⚡ No Power
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          // The item's click only: it never reaches the grid's tile-picking handler.
          e.stopPropagation()
          onOpen(placement)
        }}
        aria-label={powered === false ? `${entry?.name ?? 'Building'}: no power` : (entry?.name ?? 'Farm item')}
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

// The open tiles while a tree is being placed: a faint green wash with a dashed rim on each (memoized:
// redrawn only when the farm changes, never as the ghost moves). No pointer events.
const FreeTileMarks = memo(function FreeTileMarks({ placements, origin }: { placements: readonly Placement[]; origin: { x: number; y: number } }) {
  const tiles = useMemo(() => freeTiles(placements), [placements])
  return (
    <g data-free-tiles={tiles.length} className="pointer-events-none">
      {tiles.map((t) => (
        <polygon
          key={`${t.x}-${t.y}`}
          points={footprintPoints({ ...t, width: 1, height: 1 }, origin)}
          fill="rgba(190, 255, 150, 0.16)"
          stroke="rgba(240, 255, 220, 0.55)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})

// Placing a seaport: every spot on the shore where it fits glows green, and the inland rows (where it
// can never stand) are washed red. Memoized on the farm.
const CoastMarks = memo(function CoastMarks({ placements, movingId, origin }: { placements: readonly Placement[]; movingId: string | null; origin: { x: number; y: number } }) {
  const spots = useMemo(() => seaportSpots(placements, movingId ?? undefined), [placements, movingId])
  return (
    <g data-coast-marks="" className="pointer-events-none">
      <polygon points={footprintPoints({ x: 0, y: 2, width: GRID_SIZE, height: GRID_SIZE - 4 }, origin)} fill="rgba(255, 64, 64, 0.12)" stroke="rgba(179, 0, 27, 0.35)" strokeWidth={2} strokeDasharray="10 8" />
      {spots
        .filter((s) => s.ok)
        .map(({ spot }) => (
          <polygon key={`${spot.x}-${spot.y}`} points={footprintPoints(spot, origin)} fill="rgba(134, 255, 120, 0.1)" stroke="rgba(22, 163, 74, 0.55)" strokeWidth={1.5} strokeLinejoin="round" />
        ))}
    </g>
  )
})

// Power fields: a soft electric glow with a dashed rim; the one in focus (the ghost's, or the inspected
// windmill's) brighter. Fields reaching past the island are clipped to the grid.
function PowerFields({ fields, focus, origin }: { fields: readonly Footprint[]; focus: Footprint | null; origin: { x: number; y: number } }) {
  const clip = (f: Footprint): Footprint | null => {
    const x0 = Math.max(0, f.x)
    const y0 = Math.max(0, f.y)
    const x1 = Math.min(GRID_SIZE, f.x + f.width)
    const y1 = Math.min(GRID_SIZE, f.y + f.height)
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
  }
  return (
    <g data-power-fields={fields.length} className="pointer-events-none">
      {fields.flatMap((f, i) => {
        const c = clip(f)
        if (!c) return []
        const strong = focus !== null && f === focus
        return [
          <polygon
            key={i}
            points={footprintPoints(c, origin)}
            fill={strong ? 'rgba(253, 224, 71, 0.2)' : 'rgba(125, 211, 252, 0.1)'}
            stroke={strong ? '#facc15' : 'rgba(56, 189, 248, 0.7)'}
            strokeWidth={strong ? 4 : 2.5}
            strokeDasharray={strong ? '14 8' : '8 8'}
            strokeLinejoin="round"
            className={strong ? 'mg-throb' : undefined}
          />,
        ]
      })}
    </g>
  )
}

// Seconds the running train spends on each track tile (one way; it runs there and back).
const TRAIN_SECONDS_PER_TILE = 1.1

// The Freight Train on its line: a small train moving along the route's track tiles, from the Candy
// Factory's end to the Seaport's and back (CSS offset-path through the tiles' centres,
// `.mg-train-run`). Off for reduced motion (it waits at the factory end). No pointer events.
function TrainRun({ route }: { route: readonly { x: number; y: number }[] }) {
  const points = route.map((t) => groundOf({ x: t.x, y: t.y, width: 1, height: 1 }))
  // A route of one tile still needs a path: a tiny hop.
  const path = points.length > 1 ? points : [points[0], { x: points[0].x + 1, y: points[0].y }]
  const d = path.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')
  const style: CSSProperties & Record<'--mg-dur', string> = {
    offsetPath: `path('${d}')`,
    offsetRotate: '0deg',
    offsetAnchor: '50% 80%',
    '--mg-dur': `${Math.max(2, route.length * TRAIN_SECONDS_PER_TILE).toFixed(1)}s`,
    zIndex: LABEL_LAYER - 2,
  }
  return (
    <div aria-hidden data-train-run={route.length} className="mg-train-run pointer-events-none absolute top-0 left-0" style={style}>
      <RunningTrain />
    </div>
  )
}

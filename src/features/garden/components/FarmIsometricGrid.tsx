'use client'

import { useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { catalogFor } from '../lib/farmCatalog'
import {
  checkPlacement,
  depthOf,
  fenceLinks,
  footprintCenter,
  GRID_SIZE,
  screenToTile,
  TILE_H,
  TILE_W,
  type Footprint,
  type Placement,
} from '../lib/farmGrid'
import { getTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { FarmerHouseSprite } from './FarmerHouseSprite'
import { AnimalSprite, FenceSprite, GhostFootprint, GroundTiles, RockerySprite, StreamTile, WoodshopSprite } from './FarmStructures'
import { PlotButton, PlotLabels } from './FarmTree'
import { Waves } from './FarmScenery'

// World size: the 16 × 16 diamond plus water all round and sky above for tall trees.
const SIDE = 150
const HEADROOM = 250
const BOTTOM = 160
export const FARM_WORLD = {
  w: GRID_SIZE * TILE_W + SIDE * 2,
  h: GRID_SIZE * TILE_H + HEADROOM + BOTTOM,
  // Top corner of tile (0, 0).
  origin: { x: SIDE + (GRID_SIZE * TILE_W) / 2, y: HEADROOM },
} as const

// Animate at most this many trees (particles, bees): keeps big farms light.
const MAX_ANIMATED = 12

export type BuildGhost = {
  footprint: Pick<Footprint, 'width' | 'height'>
  icon: string
  // The tile under the pointer (or the last tapped one); null before the first move.
  tile: { x: number; y: number } | null
}

type FarmIsometricGridProps = {
  placements: readonly Placement[]
  // The trees' data by deck id (a tree placement whose deck isn't here is skipped: e.g. private).
  plotsByDeck: ReadonlyMap<string, FarmPlotView>
  // Placement (build) mode: the ghost follows the pointer; items stop reacting to clicks.
  build: BuildGhost | null
  onBuildHover: (tile: { x: number; y: number }) => void
  onBuildTap: (tile: { x: number; y: number }, pointerType: string) => void
  onBuildCancel: () => void
  onOpenPlot: (plot: FarmPlotView) => void
  onOpenItem: (placement: Placement) => void
}

// The farm's 16 × 16 isometric grass grid with everything placed on it, Hay Day style. Screen
// position of tile (x, y): ((x − y) · TILE_W / 2, (x + y) · TILE_H / 2) from the grid origin
// (lib/farmGrid.ts, tested); standing things are painted back to front by their ground point.
function FarmIsometricGrid({ placements, plotsByDeck, build, onBuildHover, onBuildTap, onBuildCancel, onOpenPlot, onOpenItem }: FarmIsometricGridProps) {
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
  const standing = placements.filter((p) => p.itemType !== 'stream').sort((a, b) => depthOf(a) - depthOf(b) || a.x - b.x)
  const animated = new Set(
    standing
      .filter((p) => p.itemType === 'tree' && p.deckId && getTreeStage(plotsByDeck.get(p.deckId)?.masteryPercent ?? 0) >= 4)
      .slice(0, MAX_ANIMATED)
      .map((p) => p.id),
  )

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
        <Waves width={FARM_WORLD.w} height={FARM_WORLD.h} />
        <GroundTiles origin={origin} />
        {placements
          .filter((p) => p.itemType === 'stream')
          .map((p) => (
            <StreamTile key={p.id} footprint={p} origin={origin} />
          ))}
        {ghost && <GhostFootprint footprint={ghost} origin={origin} valid={ghostOk} />}
      </svg>

      {/* Standing things, back to front. In build mode they let clicks through to the grid. */}
      <div className={build ? 'pointer-events-none' : undefined}>
        {standing.map((p, i) => {
          const c = footprintCenter(p)
          const ground = { x: c.x + origin.x, y: c.y + origin.y }
          if (p.itemType === 'tree') {
            const plot = p.deckId ? plotsByDeck.get(p.deckId) : undefined
            if (!plot) return null
            return (
              <div key={p.id}>
                <PlotButton geometry={ground} plot={plot} animate={animated.has(p.id)} onOpen={onOpenPlot} />
                <PlotLabels geometry={ground} plot={plot} onOpen={onOpenPlot} />
              </div>
            )
          }
          return <FarmItem key={p.id} placement={p} ground={ground} index={i} placements={placements} onOpen={onOpenItem} />
        })}
      </div>

      {/* Ghost of the item being placed, floating over its footprint. */}
      {ghost && build && (
        <span
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-[44px] leading-none opacity-80 drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]"
          style={{
            left: footprintCenter(ghost).x + origin.x,
            top: footprintCenter(ghost).y + origin.y,
            zIndex: 300_000,
            filter: ghostOk ? undefined : 'grayscale(0.6)',
          }}
        >
          {build.icon}
        </span>
      )}
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
  const box = big ? { w: 150, h: 150 } : placement.itemType === 'fence' ? { w: 56, h: 44 } : { w: 64, h: 56 }
  const z = Math.round(ground.y)
  return (
    <>
      {placement.itemType === 'animal' ? (
        <div className="pointer-events-none absolute" style={{ left: ground.x, top: ground.y, zIndex: z }}>
          <AnimalSprite variant={placement.variant} delay={(index * 1.7) % 9} />
        </div>
      ) : (
        <svg aria-hidden className="pointer-events-none absolute overflow-visible" width={1} height={1} style={{ left: ground.x, top: ground.y, zIndex: z }}>
          {placement.itemType === 'farmer_house' && <FarmerHouseSprite />}
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

'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GameButton } from '@/shared/components/game'
import { useCamera } from '@/shared/hooks/useCamera'
import { centreOffset, contentSize, MAX_ZOOM, MIN_ZOOM } from '@/shared/lib/camera'
import { useCoins, useDisplayedCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { useToast } from '@/shared/stores/ToastProvider'
import { moveFarmPlacement } from '../actions/moveFarmPlacement'
import { placeFarmItem } from '../actions/placeFarmItem'
import { removeFarmPlacement } from '../actions/removeFarmPlacement'
import { getTreeStage } from '../hooks/useTreeStage'
import { treeBuff } from '../lib/farmBuffs'
import { catalogFor, type CatalogItem } from '../lib/farmCatalog'
import { checkMove, checkPlacement, firstFreeTile, withMoved, type Placement } from '../lib/farmGrid'
import type { FarmHudView, FarmPlotView } from '../types'
import { DailyDeliveryDialog } from './DailyDeliveryDialog'
import { SkyClouds } from './FarmDiorama'
import { BuffPills, Counters, FarmDock, GardenBanner, LevelBadge, ZoomControls, type FarmBuffSummary } from './FarmHud'
import { FARM_WORLD, FarmIsometricGrid } from './FarmIsometricGrid'
import { FarmItemDialog } from './FarmItemDialog'
import { FarmPlotDialog } from './FarmPlotDialog'
import { FarmShopModal } from './FarmShopModal'
import { ItemDrawing } from './FarmStructures'
import { TreeStageSvg } from './TreeStageSvg'

type FarmIslandViewProps = {
  // Trees standing on the farm (by deck id, with their placement id).
  plots: FarmPlotView[]
  // Everything on the grid: trees, structures, landscape, decorations, animals.
  placements: Placement[]
  // Own trees not planted yet (the Shop's Trees tab). Empty for visitors.
  unplacedTrees?: FarmPlotView[]
  hud: FarmHudView
  // The owner's Garden Name for the top banner (visitors see the host's name instead).
  gardenName?: string
  signedIn: boolean
  gridHref: string
  // Optional top-centre content (sign-in notice, refund notice).
  topCenter?: ReactNode
  // Left-edge slot (the Visited Gardens drawer tab).
  leftEdge?: ReactNode
  // Read-only visitor mode: someone else's farm. No shop, no building, a banner with the way home.
  visitor?: { name: string; backHref: string } | null
  // Owners: the tree popover's 🪓 Chop calls this (after closing the popover). Wired in app/.
  onUproot?: (plot: FarmPlotView) => void
}

// What is being placed: one of your trees (free), a shop item (paid when put down), or something
// already on the farm being moved (free; `tree` set when it's a tree).
type BuildRequest =
  | { kind: 'tree'; tree: FarmPlotView }
  | { kind: 'item'; item: CatalogItem }
  | { kind: 'move'; placement: Placement; name: string; tree: FarmPlotView | null }

// The Farm World: a 16 × 16 isometric grid (FarmIsometricGrid) with the player's trees and
// everything bought in the 🏪 Shop. Choosing something in the shop enters placement mode: a ghost
// follows the pointer, green where it fits, red where it doesn't; clicking puts it down (and pays),
// Esc / right-click / Cancel leaves without spending. On touch screens a tap moves the ghost and a
// second tap on the same tile (or "Place here") puts it down. Move mode (↔️ Move in a tree or item
// popover) works the same way for something already placed: it lifts, the ghost shows where it can
// go, and putting it down moves it (Esc / Cancel leaves it where it was).
function FarmIslandView({ plots, placements, unplacedTrees = [], hud, gardenName, signedIn, gridHref, topCenter, leftEdge, visitor = null, onUproot }: FarmIslandViewProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { setCoins } = useCoins()
  const coins = useDisplayedCoins(hud.coins, hud.coinsAsOf)
  const { open: openLogin } = useLoginDialog()
  const isOwner = signedIn && !visitor

  const world = useMemo(() => ({ w: FARM_WORLD.w, h: FARM_WORLD.h }), [])
  const focus = useMemo(() => ({ x: FARM_WORLD.w / 2, y: FARM_WORLD.h / 2 + 40 }), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const camera = useCamera(scrollRef, world, focus)
  const { zoom, view } = camera
  const content = contentSize(view, world, zoom)
  const offset = { x: centreOffset(view.w, world.w, zoom), y: centreOffset(view.h, world.h, zoom) }

  const plotsByDeck = useMemo(() => new Map(plots.map((p) => [p.id, p])), [plots])
  const [selectedPlot, setSelectedPlot] = useState<FarmPlotView | null>(null)
  const [selectedItem, setSelectedItem] = useState<Placement | null>(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [build, setBuild] = useState<{ request: BuildRequest; tile: { x: number; y: number } | null } | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const thirsty = plots.filter((p) => p.needsWater === true && p.itemCount > 0).length

  // Moves the server has confirmed but the refreshed page hasn't brought yet: applied on top of the
  // placements so the farm (and its stream / fence tiling) updates at once. New props clear them.
  const [moves, setMoves] = useState<{ base: Placement[]; to: Record<string, { x: number; y: number }> }>({ base: placements, to: {} })
  const farm = useMemo(
    () => (moves.base === placements ? Object.entries(moves.to).reduce<Placement[]>((acc, [id, to]) => withMoved(acc, id, to), placements) : placements),
    [moves, placements],
  )

  const footprint =
    build?.request.kind === 'item'
      ? { width: build.request.item.width, height: build.request.item.height }
      : build?.request.kind === 'move'
        ? { width: build.request.placement.width, height: build.request.placement.height }
        : { width: 1, height: 1 }
  const ghostPreview = useMemo(() => (build ? buildPreview(build.request) : null), [build])
  const buffs = useMemo(() => buffSummary(farm, plotsByDeck), [farm, plotsByDeck])
  const fits = (tile: { x: number; y: number }) =>
    build?.request.kind === 'move' ? checkMove(farm, build.request.placement.id, tile) === 'ok' : checkPlacement(farm, { ...tile, ...footprint }) === 'ok'
  const ghostOk = build?.tile ? fits(build.tile) : false

  // Esc leaves placement mode (nothing is spent before the item is put down).
  useEffect(() => {
    if (!build) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuild(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build])

  const startBuild = (request: BuildRequest) => {
    setShopOpen(false)
    setSelectedPlot(null)
    setSelectedItem(null)
    setBuildError(null)
    // A move starts where the thing stands; anything new on the free spot nearest the middle, so
    // touch players see the ghost at once.
    if (request.kind === 'move') {
      setBuild({ request, tile: { x: request.placement.x, y: request.placement.y } })
      return
    }
    const size = request.kind === 'item' ? request.item : { width: 1, height: 1 }
    setBuild({ request, tile: firstFreeTile(farm, size.width, size.height) })
  }

  // Move mode for a placed tree (by its placement) or item.
  const startMove = (placement: Placement) => {
    const current = farm.find((p) => p.id === placement.id) ?? placement
    const tree = current.itemType === 'tree' && current.deckId ? (plotsByDeck.get(current.deckId) ?? null) : null
    startBuild({ kind: 'move', placement: current, tree, name: tree ? `“${tree.title}”` : (catalogFor(current.itemType, current.variant)?.name ?? 'Item') })
  }

  const place = (tile: { x: number; y: number }) => {
    if (!build || isPending) return
    if (!fits(tile)) {
      setBuildError('That spot is taken or off the farm: pick a green tile.')
      return
    }
    const request = build.request
    setBuildError(null)
    if (request.kind === 'move') {
      if (tile.x === request.placement.x && tile.y === request.placement.y) {
        setBuild(null)
        return
      }
      startTransition(async () => {
        const res = await moveFarmPlacement({ placementId: request.placement.id, x: tile.x, y: tile.y })
        if (!res.success) {
          setBuildError(`${res.error.message}.`)
          return
        }
        setMoves((m) => ({ base: placements, to: { ...(m.base === placements ? m.to : {}), [res.data.id]: { x: res.data.x, y: res.data.y } } }))
        setBuild(null)
        toast({ message: `${request.name} moved`, icon: '↔️' })
        router.refresh()
      })
      return
    }
    startTransition(async () => {
      const res = await placeFarmItem(
        request.kind === 'tree' ? { item: 'tree', deckId: request.tree.id, x: tile.x, y: tile.y } : { item: request.item.id, x: tile.x, y: tile.y },
      )
      if (!res.success) {
        setBuildError(`${res.error.message}.`)
        return
      }
      setCoins(res.data.remainingCoins)
      setBuild(null)
      toast({
        message:
          request.kind === 'tree' ? `“${request.tree.title}” is planted on your farm` : `${request.item.name} placed · −${res.data.cost} 🪙`,
        icon: request.kind === 'tree' ? '🌳' : request.item.icon,
      })
      router.refresh()
    })
  }

  const removeFromFarm = (plot: FarmPlotView) => {
    if (!plot.placementId) return
    setSelectedPlot(null)
    startTransition(async () => {
      const res = await removeFarmPlacement({ placementId: plot.placementId })
      if (!res.success) {
        toast({ message: `${res.error.message}.`, icon: '⚠️', tone: 'farewell' })
        return
      }
      toast({ message: `“${plot.title}” is back in the Shop's Trees tab`, icon: '📦' })
      router.refresh()
    })
  }

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_50%_45%,#46e3e8_0%,#18bfdc_38%,#0b93c9_75%,#0a74ab_100%)]">
      <div
        ref={scrollRef}
        className={
          build
            ? 'absolute inset-0 cursor-crosshair touch-none overflow-auto overscroll-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'absolute inset-0 cursor-grab touch-none overflow-auto overscroll-contain select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden'
        }
        {...camera.handlers}
      >
        <div className="relative" style={{ width: content.w, height: content.h }}>
          <div
            className="absolute origin-top-left"
            style={{ left: offset.x, top: offset.y, width: world.w, height: world.h, transform: `scale(${zoom})` }}
          >
            <FarmIsometricGrid
              placements={farm}
              plotsByDeck={plotsByDeck}
              seed={visitor?.name ?? gardenName ?? 'garden'}
              build={
                build
                  ? {
                      footprint,
                      itemType: build.request.kind === 'tree' ? 'tree' : build.request.kind === 'move' ? build.request.placement.itemType : build.request.item.itemType,
                      movingId: build.request.kind === 'move' ? build.request.placement.id : null,
                      preview: ghostPreview,
                      tile: build.tile,
                    }
                  : null
              }
              onBuildHover={(tile) => setBuild((b) => (b ? { ...b, tile } : b))}
              onBuildTap={(tile, pointerType) => {
                // Mouse: click places. Touch / pen: the first tap moves the ghost, the second places.
                if (pointerType === 'mouse' || (build?.tile && build.tile.x === tile.x && build.tile.y === tile.y)) place(tile)
                else setBuild((b) => (b ? { ...b, tile } : b))
              }}
              onBuildCancel={() => setBuild(null)}
              onOpenPlot={setSelectedPlot}
              onOpenItem={setSelectedItem}
            />

            {placements.length === 0 && !build && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[18px] border-[3px] border-[#4a230c] bg-gradient-to-b from-[#fffcf3] to-[#f5dcb2] px-4 py-2 text-center font-game text-base font-extrabold text-[#4a2511] shadow-[inset_0_2px_0_#fff,0_4px_0_#b07a45,0_10px_16px_rgba(47,95,22,0.3)]"
                style={{ left: world.w / 2, top: world.h / 2 + 30, zIndex: 200_000 }}
              >
                {visitor ? `${visitor.name}'s farm is still empty 🏝️` : signedIn ? 'An empty field 🏝️' : 'Your farm is waiting 🏝️'}
                <br />
                <span className="font-sans text-xs font-medium">
                  {visitor
                    ? 'Come back later, or visit another neighbour.'
                    : signedIn
                      ? 'Open the 🏪 Shop to plant your trees and build your farm.'
                      : 'Sign in to see your own trees and the gardens you have visited.'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tropical sunlight from the upper left, and clouds sailing over the sea (never block input). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_0%,rgba(255,236,150,0.5),transparent_55%)]"
      />
      <SkyClouds />

      {/* HUD top bar: a soft sea-blue wash for contrast, then level · island banner + buffs · purse. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#053b57]/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-x-2 gap-y-1 p-2 sm:flex-nowrap sm:p-4">
        <LevelBadge level={hud.level} />
        <div className="pointer-events-auto order-last flex w-full flex-col items-center gap-1.5 sm:order-none sm:w-auto sm:min-w-0">
          {visitor ? (
            <>
              <GardenBanner name={`${visitor.name}'s Garden`} />
              <span className="rounded-full border-2 border-white/70 bg-[#064e6e]/55 px-3 py-1 font-game text-[11px] font-bold text-white backdrop-blur-sm">
                👣 Visiting · read-only
              </span>
              <GameButton asChild tone="leaf" size="sm">
                <Link href={visitor.backHref}>🏡 Back to my garden</Link>
              </GameButton>
            </>
          ) : (
            <>
              <GardenBanner name={gardenName ?? 'MindGarden Island'} />
              {signedIn && <BuffPills summary={buffs} hint={placements.length > 0} />}
              {topCenter}
            </>
          )}
        </div>
        <Counters hud={hud} />
      </div>
      {leftEdge && !build && <div className="pointer-events-none absolute top-1/2 left-0 z-10 -translate-y-1/2">{leftEdge}</div>}
      <div className="pointer-events-none absolute bottom-24 left-2 sm:bottom-6 sm:left-4">
        <ZoomControls
          zoom={zoom}
          onZoomIn={camera.zoomIn}
          onZoomOut={camera.zoomOut}
          onReset={camera.resetView}
          canZoomIn={zoom < MAX_ZOOM - 1e-3}
          canZoomOut={zoom > MIN_ZOOM + 1e-3}
        />
      </div>

      {/* Bottom: the dock, or the build bar while placing. The Shop and quests are the owner's. */}
      {build ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
          <div
            role="status"
            className="pointer-events-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-[22px] border-[3px] border-[#4a230c] bg-gradient-to-b from-[#fffcf3] to-[#f5dcb2] px-4 py-2.5 text-center font-game text-sm font-extrabold text-[#4a2511] shadow-[inset_0_2px_0_#fff,0_5px_0_#b07a45]"
          >
            <span>
              {build.request.kind === 'tree'
                ? `🌳 Planting “${build.request.tree.title}” · free`
                : build.request.kind === 'move'
                  ? `↔️ Moving ${build.request.name} · free`
                  : `${build.request.item.icon} Placing ${build.request.item.name} · ${build.request.item.price} 🪙`}
              <span className="block font-sans text-xs font-semibold text-amber-900/70">
                {buildError ?? 'Click a green tile (tap twice on touch). Esc or right-click cancels.'}
              </span>
            </span>
            {build.tile && (
              <GameButton tone="leaf" size="sm" onClick={() => build.tile && place(build.tile)} disabled={!ghostOk || isPending}>
                {isPending ? (build.request.kind === 'move' ? 'Moving…' : 'Placing…') : build.request.kind === 'move' ? 'Move here' : 'Place here'}
              </GameButton>
            )}
            <GameButton tone="cream" size="sm" onClick={() => setBuild(null)} disabled={isPending}>
              Cancel
            </GameButton>
          </div>
        </div>
      ) : (
        !visitor && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
            <FarmDock
              gridHref={gridHref}
              quests={signedIn ? thirsty : 0}
              onQuests={() => setDeliveryOpen(true)}
              unplaced={unplacedTrees.length}
              onShop={() => (signedIn ? setShopOpen(true) : openLogin())}
            />
          </div>
        )
      )}

      {isOwner && (
        <FarmShopModal
          open={shopOpen}
          onOpenChange={setShopOpen}
          coins={coins}
          unplacedTrees={unplacedTrees}
          onPlantTree={(tree) => startBuild({ kind: 'tree', tree })}
          onBuy={(item) => startBuild({ kind: 'item', item })}
        />
      )}
      <FarmPlotDialog
        plot={selectedPlot}
        onOpenChange={(open) => !open && setSelectedPlot(null)}
        onRemoveFromFarm={isOwner ? removeFromFarm : undefined}
        onMove={
          isOwner
            ? (plot) => {
                const placement = farm.find((p) => p.id === plot.placementId)
                if (placement) startMove(placement)
              }
            : undefined
        }
        onUproot={
          onUproot &&
          ((plot) => {
            // One popup at a time: close the tree card, then hand over to the chop dialog.
            setSelectedPlot(null)
            onUproot(plot)
          })
        }
      />
      <FarmItemDialog placement={selectedItem} isOwner={isOwner} onClose={() => setSelectedItem(null)} onMove={isOwner ? startMove : undefined} />
      <DailyDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} plots={plots} signedIn={signedIn} />
    </div>
  )
}

// The floating miniature shown over the ghost footprint: the tree being planted or the item's drawing.
function buildPreview(request: BuildRequest): ReactNode {
  const tree = request.kind === 'tree' ? request.tree : request.kind === 'move' ? request.tree : null
  const item = request.kind === 'item' ? request.item : request.kind === 'move' && !request.tree ? catalogFor(request.placement.itemType, request.placement.variant) : undefined
  if (!tree && !item) return null
  if (tree) {
    return (
      <TreeStageSvg
        stage={getTreeStage(tree.masteryPercent)}
        treeType={tree.treeType}
        label=""
        className="absolute size-[120px] -translate-x-1/2 -translate-y-[90%]"
      />
    )
  }
  return (
    <svg aria-hidden className="absolute overflow-visible" width={1} height={1} style={{ left: 0, top: 0 }}>
      <ItemDrawing item={item!} />
    </svg>
  )
}

// How many standing trees each farm buff boosts (for the top bar's pills).
function buffSummary(placements: readonly Placement[], plotsByDeck: ReadonlyMap<string, FarmPlotView>): FarmBuffSummary {
  const summary: FarmBuffSummary = { stream: 0, house: 0, woodshop: placements.some((p) => p.itemType === 'woodshop') }
  for (const p of placements) {
    if (p.itemType !== 'tree' || !p.deckId || !plotsByDeck.has(p.deckId)) continue
    const buff = treeBuff(p.x, p.y, placements)
    if (buff.stream) summary.stream++
    if (buff.house) summary.house++
  }
  return summary
}

export { FarmIslandView }

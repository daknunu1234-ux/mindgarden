'use client'

import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { getTreeSizeTier, GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { useCamera } from '@/shared/hooks/useCamera'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { centreOffset, contentSize, MAX_ZOOM, MIN_ZOOM } from '@/shared/lib/camera'
import { HOUSE_HALF, layoutFarm, TRACTOR_HALF, type FarmPlot } from '../lib/farmLayout'
import { FARM_TREE_SIZE, plotSprite, TREE_BASE_RATIO } from '../lib/plotSprite'
import type { FarmHudView, FarmPlotView } from '../types'
import { DailyDeliveryDialog } from './DailyDeliveryDialog'
import { Bees, FallingParticles, useWateredSplash, WaterSplash } from './FarmAmbience'
import { Counters, FarmDock, LevelBadge, ZoomControls } from './FarmHud'
import { FarmPlotDialog } from './FarmPlotDialog'
import { CobblePath, DecorationShape, Dock, Farmhouse, Fence, PlotBed, Prop, Tractor, Waves } from './FarmScenery'
import { IslandTerrain } from './IslandTerrain'
import { TreeStageSvg } from './TreeStageSvg'

// Animate at most this many trees (particles, bees): keeps big farms light.
const MAX_ANIMATED = 12
// Plot labels sit above every tree and landmark (whose z-index is their ground y).
const LABEL_LAYER = 100_000

type FarmIslandViewProps = {
  plots: FarmPlotView[]
  hud: FarmHudView
  signedIn: boolean
  gridHref: string
  // Optional top-centre content (page switcher, sign-in notice).
  topCenter?: ReactNode
  // Owners: the plot popup's uproot badge calls this (after closing the popup). Wired in app/.
  onUproot?: (plot: FarmPlotView) => void
}

// The Farm World: a full-screen isometric farmstead where every deck is a tree on its own plot.
// Geometry: lib/farmLayout.ts; camera: shared/hooks/useCamera.ts + shared/lib/camera.ts (pure, tested).
function FarmIslandView({ plots, hud, signedIn, gridHref, topCenter, onUproot }: FarmIslandViewProps) {
  // Beehives go next to flowering trees (sakura / apple from stage 3). `plots` only changes when the
  // server sends new data, so the layout is computed once per page load.
  const layout = useMemo(
    () =>
      layoutFarm(plots.length, {
        flowering: plots.map((p) => (p.treeType === 'sakura' || p.treeType === 'apple') && getTreeStage(p.masteryPercent) >= 3),
      }),
    [plots],
  )
  const world = useMemo(() => ({ w: layout.width, h: layout.height }), [layout])
  const focus = useMemo(() => ({ x: layout.width / 2, y: layout.height / 2 + 40 }), [layout])

  const scrollRef = useRef<HTMLDivElement>(null)
  const camera = useCamera(scrollRef, world, focus)
  const [selected, setSelected] = useState<FarmPlotView | null>(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const { open: openLogin } = useLoginDialog()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = (name: string) => `${uid}-${name}`

  const { zoom, view } = camera
  const content = contentSize(view, world, zoom)
  const offset = { x: centreOffset(view.w, world.w, zoom), y: centreOffset(view.h, world.h, zoom) }
  const ordered = useMemo(() => [...layout.plots].sort((a, b) => a.y - b.y || a.x - b.x), [layout])
  const animated = new Set(
    ordered
      .filter((p) => getTreeStage(plots[p.index].masteryPercent) >= 4)
      .slice(0, MAX_ANIMATED)
      .map((p) => p.index),
  )
  const thirsty = plots.filter((p) => p.needsWater === true && p.itemCount > 0).length
  const sprites = useMemo(
    () =>
      [
        { kind: 'house' as const, y: layout.house.y },
        { kind: 'tractor' as const, y: layout.tractor.y },
        ...layout.props.map((prop, i) => ({ kind: 'prop' as const, y: prop.y, prop, i })),
      ].sort((a, b) => a.y - b.y),
    [layout],
  )

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden bg-[linear-gradient(180deg,#6ad8f5_0%,#27bdec_40%,#0ba2dd_100%)]">
      <div
        ref={scrollRef}
        className="absolute inset-0 cursor-grab touch-none overflow-auto overscroll-contain select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        {...camera.handlers}
      >
        <div className="relative" style={{ width: content.w, height: content.h }}>
          <div
            role="group"
            aria-label="Farm world"
            className="absolute origin-top-left"
            style={{ left: offset.x, top: offset.y, width: world.w, height: world.h, transform: `scale(${zoom})` }}
          >
            <svg aria-hidden width={world.w} height={world.h} className="absolute inset-0 overflow-visible">
              <Waves width={world.w} height={world.h} />
              <IslandTerrain layout={layout} id={id} />

              {layout.paths.map((p) => (
                <CobblePath key={`${p.from}-${p.to}`} d={p.d} />
              ))}
              <Dock x={layout.dock.x} y={layout.dock.y} />
              {layout.plots.map((p) => (
                <PlotBed key={p.index} plot={p} />
              ))}
              {layout.decorations.map((d, i) => (
                <DecorationShape key={i} decoration={d} />
              ))}
              {/* Painter's order: every standing miniature sorted by its ground point. */}
              {sprites.map((s) =>
                s.kind === 'house' ? (
                  <Farmhouse key="house" x={layout.house.x} y={layout.house.y} />
                ) : s.kind === 'tractor' ? (
                  <Tractor key="tractor" x={layout.tractor.x} y={layout.tractor.y} />
                ) : (
                  <Prop key={`${s.prop.kind}-${s.i}`} prop={s.prop} />
                ),
              )}
              {layout.fence.map((run, i) => (
                <Fence key={i} run={run} />
              ))}
            </svg>

            {/* Landmarks: real buttons over the drawings. */}
            <Landmark
              label={signedIn ? 'Farmhouse: open your Gardener Profile' : 'Farmhouse: sign in to see your profile'}
              sign="🏡 Farmhouse"
              x={layout.house.x}
              y={layout.house.y}
              w={HOUSE_HALF.w * 2.2}
              h={HOUSE_HALF.h + 130}
              href={signedIn ? '/profile' : undefined}
              onClick={signedIn ? undefined : openLogin}
            />
            <Landmark
              label={`Tractor: daily delivery${thirsty > 0 ? `, ${thirsty} thirsty ${thirsty === 1 ? 'tree' : 'trees'}` : ''}`}
              sign="🚜 Daily Delivery"
              badge={signedIn && thirsty > 0 ? `💧 ${thirsty}` : undefined}
              x={layout.tractor.x}
              y={layout.tractor.y}
              w={TRACTOR_HALF.w * 2.4}
              h={TRACTOR_HALF.h + 80}
              onClick={() => setDeliveryOpen(true)}
            />

            {ordered.map((p) => (
              <PlotButton key={plots[p.index].id} geometry={p} plot={plots[p.index]} animate={animated.has(p.index)} onOpen={setSelected} />
            ))}
            {ordered.map((p) => (
              <PlotLabels key={`label-${plots[p.index].id}`} geometry={p} plot={plots[p.index]} onOpen={setSelected} />
            ))}

            {plots.length === 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[18px] border-[3px] border-[#4a230c] bg-gradient-to-b from-[#fffcf3] to-[#f5dcb2] px-4 py-2 text-center font-game text-base font-extrabold text-[#4a2511] shadow-[inset_0_2px_0_#fff,0_4px_0_#b07a45,0_10px_16px_rgba(47,95,22,0.3)]"
                style={{ left: world.w / 2, top: world.h / 2 + 30 }}
              >
                A quiet farm 🏝️
                <br />
                <span className="font-sans text-xs font-medium">Open the seed sack to plant your first tree.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warm morning sunlight over the whole viewport from the upper left (never blocks input). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_0%,rgba(255,226,140,0.42),transparent_60%)]"
      />

      {/* HUD: corners only; the overlay itself lets everything through. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-4">
        <LevelBadge level={hud.level} />
        {topCenter && <div className="pointer-events-auto hidden lg:block">{topCenter}</div>}
        <Counters hud={hud} />
      </div>
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
        <FarmDock gridHref={gridHref} quests={signedIn ? thirsty : 0} onQuests={() => setDeliveryOpen(true)} />
      </div>

      <FarmPlotDialog
        plot={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onUproot={
          onUproot &&
          ((plot) => {
            // One popup at a time: close the plot card, then hand over to the uproot dialog.
            setSelected(null)
            onUproot(plot)
          })
        }
      />
      <DailyDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} plots={plots} signedIn={signedIn} />
    </div>
  )
}

// ── Landmarks ────────────────────────────────────────────────────────────────

type LandmarkProps = {
  label: string
  sign: string
  badge?: string
  x: number
  y: number
  w: number
  h: number
  href?: string
  onClick?: () => void
}

function Landmark({ label, sign, badge, x, y, w, h, href, onClick }: LandmarkProps) {
  const className =
    'group absolute block rounded-3xl focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none'
  const style = { left: x - w / 2, top: y + HOUSE_HALF.h * 0.2 - h, width: w, height: h, zIndex: Math.round(y) }
  const inner = (
    <>
      <span className="absolute inset-0 rounded-3xl transition-colors group-hover:bg-white/10" />
      {/* Small hanging wooden plaque (two ropes), not a banner over the drawing. */}
      <span aria-hidden className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center transition-transform group-hover:-translate-y-0.5" style={{ top: -14 }}>
        <span className="flex w-14 justify-between px-2">
          <span className="h-2 w-[2px] bg-[#4a230c]" />
          <span className="h-2 w-[2px] bg-[#4a230c]" />
        </span>
        <span className="rounded-[8px] border-[2px] border-[#4a230c] bg-gradient-to-b from-[#f0b872] to-[#c07a38] px-2 py-[2px] font-game text-[11px] font-extrabold whitespace-nowrap text-[#fff7e6] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_2px_0_#4a230c] [text-shadow:0_1px_0_rgba(69,26,3,0.7)]">
          {sign}
        </span>
      </span>
      {badge && (
        <span
          aria-hidden
          className="mg-bob absolute right-1 rounded-full border-[2.5px] border-[#1c6fa8] bg-gradient-to-b from-white to-[#dff4ff] px-1.5 font-game text-[11px] font-extrabold text-[#0c4a6e] shadow-[0_3px_0_#1c6fa8]"
          style={{ top: 18 }}
        >
          {badge}
        </span>
      )}
    </>
  )
  return href ? (
    <Link href={href} aria-label={label} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  )
}

// ── Plot: tree, ambience, badges and nameplate (HTML button over the SVG bed) ─

type PlotButtonProps = { geometry: FarmPlot; plot: FarmPlotView; animate: boolean; onOpen: (plot: FarmPlotView) => void }

function PlotButton({ geometry, plot, animate, onOpen }: PlotButtonProps) {
  const stage = getTreeStage(plot.masteryPercent)
  const stageName = TREE_STAGES[stage].name
  const mighty = plot.masteryPercent >= 100
  const thirsty = plot.needsWater === true && plot.itemCount > 0
  const splash = useWateredSplash(plot.id, plot.wateredDay)
  const size = getTreeSizeTier(plot.itemCount)
  const sprite = plotSprite(geometry.x, geometry.y, size.scale)
  const { hitbox, tree } = sprite
  const label = [
    `${plot.title}: ${stageName}, ${plot.masteryPercent}% grown`,
    `${size.name} (${plot.itemCount} ${plot.itemCount === 1 ? 'statement' : 'statements'})`,
    thirsty && 'needs watering today',
    plot.needsWater === false && 'watered today',
    mighty && 'fully mastered',
  ]
    .filter(Boolean)
    .join(', ')

  // The button's box is the soil mound only. The tree inside it is visual (pointer-events off) except
  // its painted shapes, so a Colossal crown's empty corners never steal clicks from a neighbour.
  return (
    <button
      type="button"
      onClick={() => onOpen(plot)}
      aria-label={label}
      className="group absolute rounded-[40%] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
      style={{ ...hitbox, zIndex: Math.round(geometry.y) }}
    >
      <div
        className={cn(
          'pointer-events-none absolute origin-[50%_90%] transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-[1.04] group-focus-visible:-translate-y-1',
          splash && 'scale-[1.05]',
        )}
        style={{ left: tree.left - hitbox.left, top: tree.top - hitbox.top, width: tree.width, height: tree.height }}
      >
        <TreeStageSvg
          stage={stage}
          treeType={plot.treeType}
          label=""
          ground={false}
          scale={size.scale}
          className="size-full [&>g]:pointer-events-auto"
        />
        {animate && (
          // Same bottom-centre anchor as the drawing, so leaves and bees follow the scaled crown.
          <div
            className="absolute inset-0"
            style={{ transform: `scale(${size.scale})`, transformOrigin: `${TREE_BASE_RATIO.x * 100}% ${TREE_BASE_RATIO.y * 100}%` }}
          >
            <FallingParticles seed={plot.id} stage={stage} treeType={plot.treeType} size={FARM_TREE_SIZE} />
            <Bees stage={stage} treeType={plot.treeType} size={FARM_TREE_SIZE} />
          </div>
        )}
      </div>

      {splash && <WaterSplash baseX={geometry.x - hitbox.left} baseY={geometry.y - hitbox.top} />}
    </button>
  )
}

// Everything that labels a plot: title sign, mastery badge, 💧 / ✨ bubbles. Rendered in one layer
// above every tree, so a big crown in front can never hide (or block clicks on) a neighbour's sign.
// Decorative for assistive tech (the plot button's label says it all); clicks open the plot.
function PlotLabels({ geometry, plot, onOpen }: { geometry: FarmPlot; plot: FarmPlotView; onOpen: (plot: FarmPlotView) => void }) {
  const { sign, badge, thirsty: thirstyAt, mighty: mightyAt } = plotSprite(geometry.x, geometry.y, getTreeSizeTier(plot.itemCount).scale)
  const thirsty = plot.needsWater === true && plot.itemCount > 0
  const mighty = plot.masteryPercent >= 100
  const open = () => onOpen(plot)
  const at = (p: { x: number; y: number }): CSSProperties => ({ left: p.x, top: p.y })

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: LABEL_LAYER + Math.round(geometry.y) }}>
      {/* Thought-bubble asking for water, just above the crown. */}
      {thirsty && (
        <span
          onClick={open}
          className="mg-bob pointer-events-auto absolute flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-[2.5px] border-[#1c6fa8] bg-gradient-to-b from-white to-[#dff4ff] text-base shadow-[inset_0_2px_0_#fff,0_3px_0_#1c6fa8]"
          style={at(thirstyAt)}
        >
          💧
        </span>
      )}
      {mighty && (
        <span
          onClick={open}
          className="mg-glow pointer-events-auto absolute flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-[2.5px] border-[#b7830c] bg-gradient-to-b from-[#fffbe0] to-[#ffe28a] text-base shadow-[inset_0_2px_0_#fff,0_3px_0_#b7830c]"
          style={at(mightyAt)}
        >
          ✨
        </span>
      )}
      {/* Floating wooden mastery badge by the right corner of the mound. */}
      <MasteryBadge percent={plot.masteryPercent} style={at(badge)} onClick={open} />
      {/* Rustic post sign at the front-left of the mound: the deck title, out of the tree's way. */}
      <PlotSign title={plot.title} style={at(sign)} onClick={open} />
    </div>
  )
}

// Round wooden badge with a mastery ring (green → gold from the golden-bloom threshold).
function MasteryBadge({ percent, style, onClick }: { percent: number; style: CSSProperties; onClick: () => void }) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)))
  const golden = pct >= GOLDEN_BLOOM_PERCENT
  const ring = golden ? '#f6b928' : '#4fd86b'
  return (
    <span
      onClick={onClick}
      className="pointer-events-auto absolute flex size-[38px] -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-[2.5px] border-[#4a230c] shadow-[0_3px_0_#4a230c,0_6px_8px_rgba(47,95,22,0.35)] transition-transform duration-200 hover:-translate-y-1"
      style={{ ...style, background: `conic-gradient(${ring} ${pct * 3.6}deg, #6b3d18 0deg)` }}
    >
      <span
        className={cn(
          'flex size-[27px] items-center justify-center rounded-full border-2 border-[#4a230c] font-game text-[11px] leading-none font-extrabold tabular-nums shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
          golden ? 'bg-gradient-to-b from-[#fff3a3] to-[#f6b928] text-[#5a2a02]' : 'bg-gradient-to-b from-[#e8a860] to-[#b36a2c] text-[#fff7e6] [text-shadow:0_1px_0_rgba(69,26,3,0.7)]',
        )}
      >
        {pct}
        <span className="text-[7px]">%</span>
      </span>
    </span>
  )
}

// A little wooden sign on a post: plank with the title, stake into the soil, soft ground shadow.
function PlotSign({ title, style, onClick }: { title: string; style: CSSProperties; onClick: () => void }) {
  return (
    <span onClick={onClick} className="group/sign pointer-events-auto absolute flex -translate-x-1/2 cursor-pointer flex-col items-center" style={style}>
      <span className="relative z-10 max-w-[112px] truncate rounded-[7px] border-[2px] border-[#4a230c] bg-gradient-to-b from-[#f0b872] via-[#d88f48] to-[#b8702f] px-2 py-[3px] font-game text-[11px] leading-tight font-extrabold text-[#fff7e6] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_2px_0_#4a230c] [text-shadow:0_1px_0_rgba(69,26,3,0.7)] transition-transform duration-200 group-hover/sign:-rotate-3">
        {title}
      </span>
      <span className="-mt-0.5 h-3.5 w-[5px] rounded-b-sm border-x-[1.5px] border-b-[1.5px] border-[#4a230c] bg-[#a8652c]" />
      <span className="-mt-1 h-1.5 w-5 rounded-[50%] bg-[#2f5f16]/35" />
    </span>
  )
}

export { FarmIslandView }

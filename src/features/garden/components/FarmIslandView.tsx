'use client'

import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { useFarmCamera } from '../hooks/useFarmCamera'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { centreOffset, contentSize, MAX_ZOOM, MIN_ZOOM } from '../lib/camera'
import { HOUSE_HALF, layoutFarm, PLOT_HALF_H, PLOT_HALF_W, TRACTOR_HALF, type FarmPlot } from '../lib/farmLayout'
import type { FarmHudView, FarmPlotView } from '../types'
import { DailyDeliveryDialog } from './DailyDeliveryDialog'
import { Bees, FallingParticles, useWateredSplash, WaterSplash } from './FarmAmbience'
import { Counters, LevelBadge, SeedSack, ViewToggle, ZoomControls } from './FarmHud'
import { FarmPlotDialog } from './FarmPlotDialog'
import { CobblePath, DecorationShape, Dock, Farmhouse, Fence, PlotBed, Prop, Tractor, Waves } from './FarmScenery'
import { TREE_BASE_RATIO, TreeStageSvg } from './TreeStageSvg'

const TREE_SIZE = 132
// Animate at most this many trees (particles, bees): keeps big farms light.
const MAX_ANIMATED = 12

type FarmIslandViewProps = {
  plots: FarmPlotView[]
  hud: FarmHudView
  signedIn: boolean
  farmHref: string
  gridHref: string
  // Optional top-centre content (page switcher, sign-in notice).
  topCenter?: ReactNode
}

// The Farm World: a full-screen isometric farmstead where every deck is a tree on its own plot.
// Geometry: lib/farmLayout.ts; camera math: lib/camera.ts (both pure and unit-tested).
function FarmIslandView({ plots, hud, signedIn, farmHref, gridHref, topCenter }: FarmIslandViewProps) {
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
  const camera = useFarmCamera(scrollRef, world, focus)
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

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden bg-gradient-to-b from-sky-300 via-sky-400 to-cyan-500">
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
              <defs>
                <linearGradient id={id('grass')} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#bbf7d0" />
                  <stop offset="0.55" stopColor="#86efac" />
                  <stop offset="1" stopColor="#4ade80" />
                </linearGradient>
                {/* Lush grass texture: tiny tufts tiled over the lawn. */}
                <pattern id={id('tufts')} width="46" height="34" patternUnits="userSpaceOnUse">
                  <path d="M 6 18 q 1 -5 -1 -8 M 9 18 q 0 -6 2 -9 M 30 30 q 1 -5 -1 -8 M 33 30 q 0 -6 2 -9" stroke="#16a34a" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.45" />
                  <circle cx="22" cy="8" r="1.2" fill="#fef9c3" opacity="0.7" />
                  <circle cx="40" cy="16" r="1" fill="#fbcfe8" opacity="0.7" />
                </pattern>
              </defs>

              <Waves width={world.w} height={world.h} />

              {/* Island: shadow in the water, earthen cliff, sandy beach, lawn. */}
              <path d={layout.island.path} transform="translate(0 30)" fill="#0c4a6e" opacity="0.22" />
              <path d={layout.island.path} transform="translate(0 16)" fill="#78350f" />
              <path d={layout.island.path} transform="translate(0 8)" fill="#a16207" />
              <path d={layout.island.path} fill="#fde68a" stroke="#fcd34d" strokeWidth="18" strokeLinejoin="round" />
              <path d={layout.island.grassPath} fill={`url(#${id('grass')})`} />
              <path d={layout.island.grassPath} fill={`url(#${id('tufts')})`} />

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
              {[...layout.props].sort((a, b) => a.y - b.y).map((prop, i) => (
                <Prop key={`${prop.kind}-${i}`} prop={prop} />
              ))}
              <Farmhouse x={layout.house.x} y={layout.house.y} />
              <Tractor x={layout.tractor.x} y={layout.tractor.y} />
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

            {plots.length === 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-amber-900/50 bg-amber-100/95 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow"
                style={{ left: world.w / 2, top: world.h / 2 + 30 }}
              >
                A quiet farm 🏝️
                <br />
                <span className="text-xs font-normal">Open the seed sack to plant your first tree.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HUD: corners only; the overlay itself lets everything through. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <LevelBadge level={hud.level} />
        {topCenter && <div className="pointer-events-auto hidden md:block">{topCenter}</div>}
        <Counters hud={hud} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 sm:p-3">
        <ZoomControls
          zoom={zoom}
          onZoomIn={camera.zoomIn}
          onZoomOut={camera.zoomOut}
          onReset={camera.resetView}
          canZoomIn={zoom < MAX_ZOOM - 1e-3}
          canZoomOut={zoom > MIN_ZOOM + 1e-3}
        />
        <ViewToggle view="farm" farmHref={farmHref} gridHref={gridHref} className="mb-2" />
        <SeedSack />
      </div>

      <FarmPlotDialog plot={selected} onOpenChange={(open) => !open && setSelected(null)} />
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
      <span
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 rounded-md border-2 border-amber-900/60 bg-gradient-to-b from-amber-500 to-amber-700 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-amber-50 shadow transition-transform group-hover:-translate-y-0.5"
        style={{ top: -6 }}
      >
        {sign}
      </span>
      {badge && (
        <span
          aria-hidden
          className="mg-bob absolute right-1 rounded-full border-2 border-sky-300 bg-white px-1.5 text-[11px] font-bold text-sky-700 shadow"
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
  const baseY = TREE_SIZE * TREE_BASE_RATIO.y
  const label = [
    `${plot.title}: ${stageName}, ${plot.masteryPercent}% grown`,
    thirsty && 'needs watering today',
    plot.needsWater === false && 'watered today',
    mighty && 'fully mastered',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onClick={() => onOpen(plot)}
      aria-label={label}
      className="group absolute rounded-2xl focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
      style={{
        left: geometry.x - PLOT_HALF_W,
        top: geometry.y - baseY,
        width: PLOT_HALF_W * 2,
        height: baseY + PLOT_HALF_H,
        zIndex: Math.round(geometry.y),
      }}
    >
      <div
        className={cn(
          'absolute transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-[1.04] group-focus-visible:-translate-y-1',
          splash && 'scale-[1.05]',
        )}
        style={{ left: PLOT_HALF_W - TREE_SIZE / 2, top: 0, width: TREE_SIZE, height: TREE_SIZE }}
      >
        <TreeStageSvg stage={stage} treeType={plot.treeType} label="" ground={false} className="size-full drop-shadow-sm" />
        {animate && (
          <>
            <FallingParticles seed={plot.id} stage={stage} treeType={plot.treeType} size={TREE_SIZE} />
            <Bees stage={stage} treeType={plot.treeType} size={TREE_SIZE} />
          </>
        )}
      </div>

      {splash && <WaterSplash baseX={PLOT_HALF_W} baseY={baseY} />}

      {thirsty && (
        <span
          aria-hidden
          className="mg-bob absolute flex size-8 items-center justify-center rounded-full border-2 border-sky-300 bg-white text-base shadow-md"
          style={{ left: PLOT_HALF_W + 26, top: 2 }}
        >
          💧
        </span>
      )}
      {mighty && (
        <span
          aria-hidden
          className="mg-glow absolute flex size-8 items-center justify-center rounded-full border-2 border-yellow-300 bg-yellow-50 text-base shadow-md"
          style={{ left: PLOT_HALF_W - 58, top: 4 }}
        >
          ✨
        </span>
      )}

      <span aria-hidden className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: PLOT_HALF_W, top: baseY + PLOT_HALF_H * 0.2 }}>
        <span className="max-w-[150px] truncate rounded-md border-2 border-amber-900/60 bg-gradient-to-b from-amber-500 to-amber-700 px-2 py-0.5 text-[11px] leading-tight font-semibold text-amber-50 shadow">
          {plot.title}
          <span className="ml-1 font-normal text-amber-100/90 tabular-nums">{plot.masteryPercent}%</span>
        </span>
        <span className="h-2.5 w-1 rounded-b bg-amber-900/70" />
      </span>
    </button>
  )
}

export { FarmIslandView }

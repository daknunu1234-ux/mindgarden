'use client'

import type { CSSProperties } from 'react'
import { FRUIT_COINS } from '@/shared/lib/economy'
import { getTreeSizeTier, GOLDEN_BLOOM_PERCENT, treeScale } from '@/shared/lib/treeSkins'
import { treeLook } from '@/shared/lib/treeVitality'
import { usePrefetchOnIntent } from '@/shared/hooks/usePrefetchOnIntent'
import { cn } from '@/shared/utils/cn'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { FARM_TREE_SIZE, plotSprite, TREE_BASE_RATIO } from '../lib/plotSprite'
import type { FarmPlotView } from '../types'
import { Bees, FallingParticles, useWateredSplash, WaterSplash } from './FarmAmbience'
import { TreeStageSvg } from './TreeStageSvg'

// A planted tree on the farm: the tree itself (a button over its soil) and, in a separate layer
// above everything, its sign, mastery badge and 💧 / ✨ bubbles. Placed by its ground point: the
// centre of its grid tile (FarmIsometricGrid).

// Where a tree stands, in world pixels.
export type GroundPoint = { x: number; y: number }

// Plot labels sit above every tree and building (whose z-index is their ground y).
export const LABEL_LAYER = 100_000

// A tree's label: one capsule with its name and progress (TreeLabel). With "show all tree labels" off (the farm root has
// `.mg-labels-hover`, lib/treeLabels.ts), globals.css hides these and fades them in for the tree
// that is hovered, focused or was just tapped. The 💧 / 🍎 / ✨ bubbles are prompts, not labels:
// they always show.
export const TREE_LABEL = 'mg-tree-label'

// ── Plot: tree, ambience, badges and nameplate (HTML button over the SVG bed) ─

type PlotButtonProps = {
  geometry: GroundPoint
  plot: FarmPlotView
  animate: boolean
  // Sway phase in seconds (from the tile, so neighbours never sway in unison): treeSwayPhase().
  phase?: number
  onOpen: (plot: FarmPlotView) => void
}

// How far a tree's shadows reach, by stage (a sprout barely shades the soil).
const SHADOW_REACH = [0, 0.35, 0.55, 0.8, 1, 1] as const

// Idle sway phase for the tree on tile (x, y): (x + 7y) mod 5 steps of 0.4 s, so the island's trees
// move out of step.
export const treeSwayPhase = (x: number, y: number): number => (((x + y * 7) % 5) + 5) % 5 * 0.4

export function PlotButton({ geometry, plot, animate, phase = 0, onOpen }: PlotButtonProps) {
  const stage = getTreeStage(plot.masteryPercent)
  const stageName = TREE_STAGES[stage].name
  const mighty = plot.masteryPercent >= 100
  const thirsty = plot.needsWater === true && plot.itemCount > 0
  // Withered (over 72 h without practice, below stage 4): grey and still, no bees or falling leaves.
  const look = treeLook(plot.withered === true)
  const splash = useWateredSplash(plot.id, plot.wateredDay)
  const size = getTreeSizeTier(plot.itemCount)
  // What the tree is really drawn at: the size tier × the species' presence (surreal trees are bigger).
  const drawn = treeScale(plot.treeType, plot.itemCount)
  const sprite = plotSprite(geometry.x, geometry.y, drawn)
  const { hitbox, tree } = sprite
  // Hover / focus / touch warms the tree's page and its drill (code + loading skeleton), so the
  // popover's links open instantly.
  const prefetch = usePrefetchOnIntent([`/deck/${plot.slug}`, `/deck/${plot.slug}/drill`])
  const label = [
    `${plot.title}: ${stageName}, ${plot.masteryPercent}% grown`,
    `${size.name} (${plot.itemCount} ${plot.itemCount === 1 ? 'statement' : 'statements'})`,
    thirsty && 'needs watering today',
    plot.withered && 'withered: practise it to bring it back',
    plot.fruitReady && 'fruit ready to harvest',
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
      onClick={(e) => {
        // The tree's click only: it never reaches the grid's tile-picking handler.
        e.stopPropagation()
        onOpen(plot)
      }}
      {...prefetch}
      aria-label={label}
      className="group absolute rounded-[40%] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
      style={{ ...hitbox, zIndex: Math.round(geometry.y) }}
    >
      <TreeShadows x={geometry.x - hitbox.left} y={geometry.y - hitbox.top} reach={SHADOW_REACH[stage]} scale={drawn} />
      {/* Tap / hover: a springy squash & stretch about the trunk base. The sway lives one layer in,
          so the two transforms never fight; shadows, signs, badges and buff tags stay on the ground. */}
      <div
        className={cn(
          'pointer-events-none absolute origin-[50%_90%] transition-transform duration-300 ease-[cubic-bezier(.34,1.8,.64,1)]',
          'group-hover:scale-105 group-focus-visible:scale-105 group-active:scale-x-105 group-active:scale-y-95 group-active:duration-100',
          splash && 'scale-[1.05]',
        )}
        style={{
          left: tree.left - hitbox.left,
          top: tree.top - hitbox.top,
          width: tree.width,
          height: tree.height,
          // Static (a withered tree doesn't sway), so this filter costs nothing per frame.
          filter: look.grayscale ? 'grayscale(1) saturate(0.5) brightness(0.95)' : undefined,
        }}
      >
        <div
          className={cn('absolute inset-0', look.sways ? 'mg-tree-sway' : 'mg-withered')}
          data-vitality={look.sways ? 'lively' : 'withered'}
          style={{ '--mg-sway-delay': `${-phase}s`, transformOrigin: `${TREE_BASE_RATIO.x * 100}% ${TREE_BASE_RATIO.y * 100}%` } as CSSProperties}
        >
          <TreeStageSvg
            stage={stage}
            treeType={plot.treeType}
            label=""
            ground={false}
            shadow={false}
            scale={size.scale}
            className="size-full [&>g]:pointer-events-auto"
          />
          {animate && look.ambience && (
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
      </div>

      {splash && <WaterSplash baseX={geometry.x - hitbox.left} baseY={geometry.y - hitbox.top} />}
    </button>
  )
}

// The tree's shadows on its bed: static multi-stop radial gradients that fade out softly (no blur filter,
// which would cost GPU fill-rate on every tree every frame): a dark
// contact shadow hugging the trunk, and a longer cast shadow thrown back and to the right (sun from
// the upper left), so the tree reads as standing up off the ground. Drawn outside the swaying tree.
function TreeShadows({ x, y, reach, scale }: { x: number; y: number; reach: number; scale: number }) {
  const contact = { w: 62 * scale * (0.5 + 0.5 * reach), h: 18 * scale * (0.6 + 0.4 * reach) }
  const cast = { w: 128 * scale * reach, h: 34 * scale * reach }
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-[50%] bg-[radial-gradient(closest-side,rgba(8,48,24,0.32)_0%,rgba(8,48,24,0.2)_40%,rgba(8,48,24,0.07)_75%,rgba(8,48,24,0)_100%)]"
        style={{ left: x - cast.w / 2 + 30 * scale * reach, top: y - cast.h / 2 - 12 * scale * reach, width: cast.w, height: cast.h, transform: 'rotate(-22deg)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-[50%] bg-[radial-gradient(closest-side,rgba(40,20,6,0.55)_0%,rgba(40,20,6,0.32)_45%,rgba(40,20,6,0.08)_80%,rgba(40,20,6,0)_100%)]"
        style={{ left: x - contact.w / 2 + 2, top: y - contact.h / 2 + 1, width: contact.w, height: contact.h }}
      />
    </>
  )
}

// 🪓 Chop effect where a tree stood: a dust cloud swells and fades while leaves and wood chips burst
// out (CSS `.mg-puff` / `.mg-burst`, transform and opacity only; removed by the farm after 0.9 s).
const CHIPS = [
  [-46, -70, '#6ee77a'],
  [-20, -96, '#9a5b2c'],
  [8, -104, '#4ade80'],
  [36, -84, '#c98a4b'],
  [52, -52, '#86efac'],
  [-54, -34, '#b7792f'],
  [22, -40, '#16a34a'],
] as const

export function ChopPuff({ x, y }: { x: number; y: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ left: x, top: y, zIndex: LABEL_LAYER + 50_000 }}>
      <span className="mg-puff absolute size-28 -translate-x-1/2 -translate-y-3/4 rounded-full bg-[radial-gradient(closest-side,rgba(255,250,235,0.95),rgba(236,224,200,0.7)_55%,rgba(236,224,200,0)_100%)]" />
      {CHIPS.map(([dx, dy, color], i) => (
        <span
          key={i}
          className="mg-burst absolute -translate-x-1/2 -translate-y-8 rounded-[40%]"
          style={
            {
              width: i % 2 ? 7 : 9,
              height: i % 2 ? 5 : 9,
              background: color,
              '--mg-dx': `${dx}px`,
              '--mg-dy': `${dy}px`,
              '--mg-spin': `${120 + i * 40}deg`,
              '--mg-dur': '0.85s',
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

// Everything that labels a plot: title sign, mastery badge, 💧 / ✨ bubbles. Rendered in one layer
// above every tree, so a big crown in front can never hide (or block clicks on) a neighbour's sign.
// Decorative for assistive tech (the plot button's label says it all); clicks open the plot.
export function PlotLabels({
  geometry,
  plot,
  onOpen,
  onHarvest,
}: {
  geometry: GroundPoint
  plot: FarmPlotView
  onOpen: (plot: FarmPlotView) => void
  // Owner: pick the tree's fruit (the farm credits the coins at once and confirms in the background).
  onHarvest?: (plot: FarmPlotView) => void
}) {
  const { label, thirsty: thirstyAt, mighty: mightyAt } = plotSprite(geometry.x, geometry.y, treeScale(plot.treeType, plot.itemCount))
  const thirsty = plot.needsWater === true && plot.itemCount > 0
  const mighty = plot.masteryPercent >= 100
  const open = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    onOpen(plot)
  }
  const at = (p: { x: number; y: number }): CSSProperties => ({ left: p.x, top: p.y })

  return (
    // mg-plot-labels: must directly follow the tree's `.mg-plot` wrapper (see TREE_LABEL below).
    <div aria-hidden className="mg-plot-labels pointer-events-none absolute inset-0" style={{ zIndex: LABEL_LAYER + Math.round(geometry.y) }}>
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
      {/* Ripe fruit (practised yesterday): one tap harvests it. Beside the 💧 when both show. */}
      {plot.fruitReady && onHarvest && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onHarvest(plot)
          }}
          aria-label={`Harvest the fruit of ${plot.title}: +${FRUIT_COINS} coins`}
          title={`Harvest: +${FRUIT_COINS} 🪙`}
          className="mg-bob pointer-events-auto absolute flex h-8 -translate-x-1/2 items-center gap-0.5 rounded-full border-[2.5px] border-[#b45309] bg-gradient-to-b from-[#fff7d6] to-[#ffd36b] px-1.5 font-game text-xs font-extrabold text-[#7c2d12] shadow-[inset_0_2px_0_#fff,0_3px_0_#b45309] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
          style={at({ x: thirstyAt.x + (thirsty ? 38 : 0), y: thirstyAt.y })}
        >
          <span aria-hidden className="text-base">🍎</span>+{FRUIT_COINS}
        </button>
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
      {/* One compact capsule at the tree's base: its name and how far it has grown. */}
      <TreeLabel title={plot.title} percent={plot.masteryPercent} emoji={plot.withered ? '🥀' : TREE_STAGES[getTreeStage(plot.masteryPercent)].emoji} style={at(label)} onClick={open} />
    </div>
  )
}

// The tree's label: `[ 🌿 Tree name • 75% ]` on one line, a dark see-through pill 18 px tall at the
// front edge of the tile (plotSprite `label`), under the crown and its bubbles. No backdrop blur: it
// repeats on every tile, and blurs there cost fill-rate on every frame. The percentage turns gold from
// the golden-bloom threshold.
function TreeLabel({ title, percent, emoji, style, onClick }: { title: string; percent: number; emoji: string; style: CSSProperties; onClick: (e: { stopPropagation: () => void }) => void }) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)))
  const golden = pct >= GOLDEN_BLOOM_PERCENT
  return (
    <span
      onClick={onClick}
      className={cn(
        TREE_LABEL,
        'pointer-events-auto absolute flex h-[18px] max-w-[156px] -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border bg-black/55 px-2 font-game text-[11px] leading-none font-bold whitespace-nowrap text-white',
        golden ? 'border-yellow-300/60' : 'border-white/10',
      )}
      style={style}
    >
      <span aria-hidden className="shrink-0 text-[10px]">
        {emoji}
      </span>
      <span className="truncate">{title}</span>
      <span aria-hidden className="shrink-0 text-white/45">
        •
      </span>
      <span className={cn('shrink-0 tabular-nums', golden ? 'text-yellow-300' : 'text-emerald-300')}>{pct}%</span>
    </span>
  )
}

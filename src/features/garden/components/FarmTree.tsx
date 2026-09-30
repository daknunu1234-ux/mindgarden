'use client'

import type { CSSProperties } from 'react'
import { getTreeSizeTier, GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
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

// ── Plot: tree, ambience, badges and nameplate (HTML button over the SVG bed) ─

type PlotButtonProps = { geometry: GroundPoint; plot: FarmPlotView; animate: boolean; onOpen: (plot: FarmPlotView) => void }

export function PlotButton({ geometry, plot, animate, onOpen }: PlotButtonProps) {
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
export function PlotLabels({ geometry, plot, onOpen }: { geometry: GroundPoint; plot: FarmPlotView; onOpen: (plot: FarmPlotView) => void }) {
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
      <PlotSign title={plot.title} emoji={TREE_STAGES[getTreeStage(plot.masteryPercent)].emoji} mighty={mighty} style={at(sign)} onClick={open} />
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

// A chunky wooden sign on a post: the growth stage's emoji and the title on a glossy plank (gold
// trim once fully mastered), stake into the soil, soft ground shadow. Wiggles on hover.
function PlotSign({ title, emoji, mighty, style, onClick }: { title: string; emoji: string; mighty: boolean; style: CSSProperties; onClick: () => void }) {
  return (
    <span onClick={onClick} className="group/sign pointer-events-auto absolute flex -translate-x-1/2 cursor-pointer flex-col items-center" style={style}>
      <span
        className={cn(
          'relative z-10 flex max-w-[132px] items-center gap-1 rounded-[9px] border-[2.5px] border-[#3b1f0e] bg-gradient-to-b from-[#f6c27e] via-[#dc9148] to-[#b8702f] px-2 py-[3px] font-game text-[12px] leading-tight font-extrabold text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.5),0_3px_0_#3b1f0e] [text-shadow:0_1.5px_0_#3b1f0e,1px_0_0_#3b1f0e,-1px_0_0_#3b1f0e,0_-1px_0_#3b1f0e] transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] group-hover/sign:-translate-y-0.5 group-hover/sign:-rotate-3',
          mighty && 'border-[#8a4a0c] ring-2 ring-[#ffd23f]',
        )}
      >
        <span aria-hidden className="shrink-0 text-[12px] [text-shadow:none]">
          {emoji}
        </span>
        <span className="truncate">{title}</span>
      </span>
      <span className="-mt-0.5 h-3.5 w-[5px] rounded-b-sm border-x-[1.5px] border-b-[1.5px] border-[#4a230c] bg-[#a8652c]" />
      <span className="-mt-1 h-1.5 w-5 rounded-[50%] bg-[#2f5f16]/35" />
    </span>
  )
}

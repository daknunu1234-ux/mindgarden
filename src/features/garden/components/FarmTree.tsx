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
      <TreeShadows x={geometry.x - hitbox.left} y={geometry.y - hitbox.top} reach={SHADOW_REACH[stage]} scale={size.scale} />
      {/* Tap / hover: a springy squash & stretch about the trunk base. The sway lives one layer in,
          so the two transforms never fight; shadows, signs, badges and buff tags stay on the ground. */}
      <div
        className={cn(
          'pointer-events-none absolute origin-[50%_90%] transition-transform duration-300 ease-[cubic-bezier(.34,1.8,.64,1)]',
          'group-hover:scale-105 group-focus-visible:scale-105 group-active:scale-x-105 group-active:scale-y-95 group-active:duration-100',
          splash && 'scale-[1.05]',
        )}
        style={{ left: tree.left - hitbox.left, top: tree.top - hitbox.top, width: tree.width, height: tree.height }}
      >
        <div
          className="mg-tree-sway absolute inset-0"
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

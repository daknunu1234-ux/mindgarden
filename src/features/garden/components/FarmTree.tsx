'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { FRUIT_COINS } from '@/shared/lib/economy'
import { getTreeSizeTier, treeScale } from '@/shared/lib/treeSkins'
import { treeLook } from '@/shared/lib/treeVitality'
import { usePrefetchOnIntent } from '@/shared/hooks/usePrefetchOnIntent'
import { cn } from '@/shared/utils/cn'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'
import { crownTopY } from '../lib/crownTop'
import { FARM_TREE_SIZE, plotSprite, TREE_BASE_RATIO } from '../lib/plotSprite'
import type { FarmPlotView } from '../types'
import { AppleIcon, WaterDropIcon } from './BubbleIcons'
import { Bees, FallingParticles, useWateredSplash, WaterSplash } from './FarmAmbience'
import { TreeStageSvg } from './TreeStageSvg'

// A planted tree on the farm: the tree itself (a button over its soil) and, in a separate layer
// above everything, its name capsule and its two action icons (💧 water, 🍎 harvest). Placed by its ground point: the
// centre of its grid tile (FarmIsometricGrid).

// Where a tree stands, in world pixels.
export type GroundPoint = { x: number; y: number }

// Plot labels sit above every tree and building (whose z-index is their ground y).
export const LABEL_LAYER = 100_000

// A tree's label: one capsule with its name (TreeLabel). With "show all tree labels" off (the farm root has
// `.mg-labels-hover`, lib/treeLabels.ts), globals.css hides these and fades them in for the tree
// that is hovered, focused or was just tapped. The 💧 / 🍎 icons are actions, not labels: they show
// whenever there is something to do.
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
// Their colour follows the light (`.mg-tree-contact` / `.mg-tree-cast` in globals.css): a warm deep
// green by day, a midnight blue at night.
function TreeShadows({ x, y, reach, scale }: { x: number; y: number; reach: number; scale: number }) {
  // Sized for the lush crowns: a quarter wider than the first, rounder trees needed.
  const contact = { w: 78 * scale * (0.5 + 0.5 * reach), h: 22 * scale * (0.6 + 0.4 * reach) }
  const cast = { w: 160 * scale * reach, h: 42 * scale * reach }
  return (
    <>
      <span
        aria-hidden
        className="mg-tree-cast pointer-events-none absolute rounded-[50%]"
        style={{ left: x - cast.w / 2 + 30 * scale * reach, top: y - cast.h / 2 - 12 * scale * reach, width: cast.w, height: cast.h, transform: 'rotate(-22deg)' }}
      />
      <span
        aria-hidden
        className="mg-tree-contact pointer-events-none absolute rounded-[50%]"
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

// What floats over a planted tree, in one layer above every tree (so a big crown in front can never
// hide, or block clicks on, a neighbour's): only its two actions and its name. No percentages, levels
// or buffs here (those are in the tree's popover).
//   💧 Water: the tree needs practice today (owner): a link straight to its drill round (review mode
//      when every statement is already 5/5).
//   🍎 Harvest: its fruit is ripe (owner): one tap picks it.
// Both sit side by side in one small cluster resting on the tip of the crown (its own height, for
// its species and stage: lib/crownTop.ts), bobbing gently (one animation
// for the cluster), each glowing and growing a little under the pointer. The capsule at the base
// says the tree's name (revealed on hover in hover-labels mode). Clicks never reach the grid.
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
  const { label, actions } = plotSprite(geometry.x, geometry.y, treeScale(plot.treeType, plot.itemCount), crownTopY(plot.treeType, getTreeStage(plot.masteryPercent)))
  const { water, harvest } = treeActions(plot, onHarvest !== undefined)
  const open = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    onOpen(plot)
  }
  const at = (p: { x: number; y: number }): CSSProperties => ({ left: p.x, top: p.y })

  return (
    // mg-plot-labels: must directly follow the tree's `.mg-plot` wrapper (see TREE_LABEL below).
    <div aria-hidden className="mg-plot-labels pointer-events-none absolute inset-0" style={{ zIndex: LABEL_LAYER + Math.round(geometry.y) }}>
      {(water || harvest) && (
        <div data-tree-actions className="absolute flex -translate-x-1/2 -translate-y-full items-end gap-1.5" style={at(actions)}>
          {/* Zoomed out, the icons grow back toward their size on screen (up to 3×, about 27 px at the
              farthest zoom), anchored at their bottom centre so they stay on the crown's tip. */}
          <div className={ACTION_SCALE}>
            <div className="mg-bob flex items-end gap-1">
              {water && (
                <Link
                  href={water.href}
                  onClick={(e) => e.stopPropagation()}
                  // The layer is aria-hidden; the tree's own button says it needs water. Keyboard users
                  // water from its popover.
                  tabIndex={-1}
                  title="Water this tree: practise it today"
                  className={cn(ACTION, 'border-[#1c6fa8] from-white to-[#dff4ff] shadow-[inset_0_1.5px_0_#fff,0_2px_0_#1c6fa8] hover:shadow-[inset_0_1.5px_0_#fff,0_2px_0_#1c6fa8,0_0_10px_3px_rgba(125,211,252,0.85)]')}
                >
                  <WaterDropIcon size={ICON_GLYPH} />
                </Link>
              )}
              {harvest && onHarvest && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onHarvest(plot)
                  }}
                  tabIndex={-1}
                  title={`Harvest: +${FRUIT_COINS} 🪙`}
                  className={cn(ACTION, 'border-[#b45309] from-[#fff7d6] to-[#ffd36b] shadow-[inset_0_1.5px_0_#fff,0_2px_0_#b45309] hover:shadow-[inset_0_1.5px_0_#fff,0_2px_0_#b45309,0_0_10px_3px_rgba(253,224,71,0.9)]')}
                >
                  <AppleIcon size={ICON_GLYPH} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* One compact capsule at the tree's base: its name. */}
      <TreeLabel title={plot.title} withered={plot.withered === true} style={at(label)} onClick={open} />
    </div>
  )
}

// Counter-scales with the farm camera (--mg-inv-zoom, set on the zoomed world), between 1× and 3×:
// on screen an icon is never smaller than ICON_SIZE × the zoom × 3 (≈ 27 px at MIN_ZOOM 0.35), and
// from zoom 1 / 3 up it keeps ICON_SIZE px.
export const ACTION_SCALE = 'origin-bottom [transform:scale(clamp(1,var(--mg-inv-zoom,1),3))]'

// The icons' diameter and their glyph, in farm units: compact beads; the glyph is a vector icon
// (BubbleIcons, a 24-unit view box), drawn at 15 px inside the 26 px bead with the 2 px border, so it
// stays crisp at any zoom and never touches the rim.
export const ICON_SIZE = 26
const ICON_GLYPH = 15

// One round action icon over a tree: a glossy bead that grows and glows under the pointer.
const ACTION =
  'pointer-events-auto flex size-[26px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 bg-gradient-to-b leading-none transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] hover:scale-110 active:scale-95'

// Which action icons a tree shows (pure, tested): 💧 when its owner hasn't practised it today and it
// has statements; 🍎 when its fruit is ripe and the farm can harvest it. Visitors see neither.
export function treeActions(plot: FarmPlotView, canHarvest: boolean): { water: { href: string } | null; harvest: boolean } {
  const owner = plot.isOwner
  const thirsty = owner && plot.needsWater === true && plot.itemCount > 0
  const review = plot.itemCount > 0 && plot.masteredCount >= plot.itemCount
  return {
    water: thirsty ? { href: `/deck/${plot.slug}/drill${review ? '?review=1' : ''}` } : null,
    harvest: owner && canHarvest && plot.fruitReady === true,
  }
}

// The tree's label: `[ Tree name ]` on one line, a dark see-through pill 18 px tall at the front
// edge of the tile (plotSprite `label`), under the crown and its icons; a 🥀 marks a withered tree.
// No backdrop blur: it repeats on every tile, and blurs there cost fill-rate on every frame.
function TreeLabel({ title, withered, style, onClick }: { title: string; withered: boolean; style: CSSProperties; onClick: (e: { stopPropagation: () => void }) => void }) {
  return (
    <span
      onClick={onClick}
      className={cn(
        TREE_LABEL,
        'pointer-events-auto absolute flex h-[18px] max-w-[156px] -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 font-game text-[11px] leading-none font-bold whitespace-nowrap text-white',
      )}
      style={style}
    >
      {withered && (
        <span aria-hidden className="shrink-0 text-[10px]">
          🥀
        </span>
      )}
      <span className="truncate">{title}</span>
    </span>
  )
}

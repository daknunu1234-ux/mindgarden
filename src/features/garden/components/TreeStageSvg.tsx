import { useId, type CSSProperties, type ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { getTreeSpecies, isSurrealForm, speciesScale, type TreeForm } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

import { bottomCenterScale, TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X, TREE_VIEW as VIEW, TREE_VIEW_X as VIEW_X, TREE_VIEW_Y as VIEW_Y } from '../lib/plotSprite'
import { Heap, NATURAL_FORMS, Sprout } from './NaturalTrees'
import { ContactShadow, Crown, Foliage, geo, Halo, leafRamp, Limb, Roots, trunkNodes, woodRamp, type Design, type FormProps, type Geo } from './treeKit'

// Where the trunk meets the ground, as a fraction of the drawn size. Every species, stage and size
// tier grows from this point, so a scene can line the tree up with its own ground (roots attach here).
export { TREE_BASE_RATIO } from '../lib/plotSprite'

type TreeStageSvgProps = {
  stage: TreeStage
  treeType: string
  label: string
  className?: string
  // Draw the little tilled mound under the tree. Off when the scene draws its own ground.
  ground?: boolean
  // Draw the soft contact + cast shadow. Off when the scene casts its own (the farm does, outside
  // the swaying tree, so shadows stay on the ground).
  shadow?: boolean
  // Size-tier multiplier (getTreeSizeTier(itemCount).scale). Scales about the trunk base, so the
  // base point (TREE_BASE_RATIO) never moves; the tree and its AO shadow grow up and out of the box
  // (the svg is overflow-visible). The soil mound keeps its size: it's the plot, not the tree.
  scale?: number
  // Surreal species are drawn SURREAL_SCALE bigger than the box (about the trunk base, so they rise
  // out of it). `fit` keeps the drawing inside the box instead: for small frames that clip, and for
  // scenes that already grew the box by the species' scale.
  fit?: boolean
}

// Chunky low-poly tree: thirteen species (lib treeSkins, each with its own silhouette; the last three
// are the surreal ones, drawn in light instead of leaves) × five growth stages = 65 sprites. Stage 1
// is a cut seedling with the species' seed cap, stage 2 a stout sapling with a first crown, stage 3
// the recognisable silhouette, stage 4 the full, lush crown, stage 5 a bigger crown still, in a soft
// golden halo with a pulsing aura, twinkling sparkles and the species' finest accents. Everything is
// flat facets lit by one key light from the upper left (treeKit): crowns are overlapping faceted
// volumes with deep creases between them, trunks chiselled prisms, fruit and blossoms cut solids. No
// outlines, no gradients on natural trees, no filters. The view box is wider and taller than the
// trunk's own 120 × 120 design box (plotSprite TREE_VIEW*), so the big crowns are never clipped,
// while the trunk base stays at TREE_BASE_RATIO. The crown sits in a `.mg-foliage` group that bobs a
// beat behind the tree's sway (globals.css, off for reduced motion). Pure markup, so any number
// render on one page or the server (the only hook is useId, for the surreal species' gradient ids).
function TreeStageSvg({ stage, treeType, label, className, ground = true, shadow = true, scale = 1, fit = false }: TreeStageSvgProps) {
  const species = getTreeSpecies(treeType)
  const Form = FORMS[species.form]
  const s = +((Number.isFinite(scale) && scale > 0 ? scale : 1) * (fit ? 1 : speciesScale(species.id))).toFixed(4)

  return (
    // overflow="visible" too (not only the class): sized-up tiers and the stage-5 aura draw past the box.
    <svg
      viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW} ${VIEW}`}
      role="img"
      aria-label={label}
      overflow="visible"
      data-species={species.id}
      data-stage={stage}
      className={cn('size-24 overflow-visible', className)}
    >
      {ground && <Mound />}
      <g transform={s === 1 ? undefined : bottomCenterScale(s)}>
        {stage === 5 && <GoldenAura />}
        {shadow && <GroundShadow stage={stage} form={species.form} />}
        {stage !== 1 ? (
          <Form g={geo(stage)} skin={species.skin} />
        ) : isSurrealForm(species.form) ? (
          <g>
            <Heap />
            <Form g={SPROUT_GEO} skin={species.skin} />
          </g>
        ) : (
          <Sprout form={species.form} skin={species.skin} />
        )}
        {stage === 5 && <Sparkles />}
      </g>
    </svg>
  )
}

// ── Ground ───────────────────────────────────────────────────────────────────

const NARROW: readonly TreeForm[] = ['cactus', 'palm', 'birch', 'pine']

// Soft, edge-less shadows (stacked translucent ellipses fade out like a radial blur): a contact
// shadow under the trunk and a longer cast shadow thrown back and to the right. Sized for the crowns.
function GroundShadow({ stage, form }: { stage: TreeStage; form: TreeForm }) {
  const spread = NARROW.includes(form) ? 0.72 : 1
  const w = [0, 14, 26, 38, 52, 56][stage] * spread
  const soft = [1, 0.8, 0.6, 0.4]
  return (
    <g>
      <g transform={`rotate(-20 ${TRUNK_X} ${GROUND_Y})`}>
        {soft.map((f) => (
          <ellipse key={`c${f}`} cx={TRUNK_X + w * 0.75} cy={GROUND_Y - 1} rx={w * 1.05 * f} ry={w * 0.3 * f} fill="#0b3b1f" opacity="0.06" />
        ))}
      </g>
      {soft.map((f) => (
        <ellipse key={`t${f}`} cx={TRUNK_X + 1.5} cy={GROUND_Y + 0.5} rx={w * 0.6 * f} ry={w * 0.16 * f} fill="#2b1a0b" opacity="0.1" />
      ))}
    </g>
  )
}

// A small ring of tilled soil hugging the trunk base (used when the scene draws no ground of its own):
// a soft contact shadow, a sunlit rim, the ring's inner edge and the soil.
function Mound() {
  return (
    <g>
      <ellipse cx={TRUNK_X + 1.5} cy={GROUND_Y + 2.6} rx="28" ry="8.4" fill="rgba(20, 40, 15, 0.35)" className="mg-contact" />
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 0.6} rx="24" ry="6.6" fill="#b08863" />
      <ellipse cx={TRUNK_X + 0.5} cy={GROUND_Y + 1.4} rx="21" ry="5.2" fill="#7a5537" />
      <ellipse cx={TRUNK_X + 1} cy={GROUND_Y + 2.1} rx="19.4" ry="4.3" fill="#966e4a" />
    </g>
  )
}

// ── Stage 5 dressing ─────────────────────────────────────────────────────────

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`

// A soft golden aura behind the whole crown that pulses (globals.css `.mg-aura`).
function GoldenAura() {
  return (
    <g fill="#fde68a" className="mg-aura">
      <circle cx={TRUNK_X} cy="44" r="70" opacity="0.16" />
      <circle cx={TRUNK_X} cy="44" r="56" opacity="0.2" />
      <circle cx={TRUNK_X} cy="44" r="40" opacity="0.2" />
    </g>
  )
}

function Sparkles() {
  const points: [number, number, number][] = [
    [6, 22, 6],
    [114, 16, 6.5],
    [62, -20, 5],
    [122, 70, 4.5],
    [-2, 72, 4.5],
    [98, -10, 3.5],
  ]
  return (
    <g>
      {points.map(([x, y, r], i) => (
        <g key={`${x}-${y}`} className="mg-sparkle" style={{ animationDelay: `${-i * 0.35}s` }}>
          <SparkleStar x={x} y={y} r={r} />
        </g>
      ))}
    </g>
  )
}

// A four-point sparkle with a soft glow behind it (no rim).
function SparkleStar({ x, y, r, color = '#fde047', glow = '#fbbf24' }: { x: number; y: number; r: number; color?: string; glow?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r * 0.9} fill={glow} opacity="0.3" />
      <path d={star(x, y, r)} fill={color} />
      <circle cx={x - r * 0.15} cy={y - r * 0.15} r={r * 0.22} fill="#fff" />
    </g>
  )
}

// The depth shade the surreal crowns throw: a little down and to the right (sun from the upper left).
const DEPTH = 'translate(1.4 2.4)'
const DEPTH_OPACITY = 0.62

// ── Surreal species ──────────────────────────────────────────────────────────
// Light instead of leaves, in many colours at once: a prismatic crystal, a rainbow nebula, a spectrum
// of optic threads. Their effects are a few small shapes animated with transform / opacity only
// (globals.css `.mg-core`, `.mg-mote`, `.mg-prism`, `.mg-nebula`, `.mg-fringe`, `.mg-star`, `.mg-rune`,
// `.mg-sand`, `.mg-ring`; no filters, so no hue-rotate: hues shift by cross-fading two gradients),
// still for reduced motion and for withered trees, and never a pointer target (the tree stays the
// target). Their gradients take ids from useId, so any number of trees can share a page.

type Vars = CSSProperties & Record<`--mg-${string}`, string>
const fx = (n: number) => n.toFixed(1)

// A cross-sparkle (✨): a four-point glint over a soft halo of its own colour, with a white heart.
// It pops and fades on its own beat (`.mg-star`; the halo keeps the group's box centred, so it scales
// about its middle).
function Glint({ x, y, r, color, beat }: { x: number; y: number; r: number; color: string; beat: number }) {
  return (
    <g className="mg-star" style={{ '--mg-delay': `${(-beat * 0.41).toFixed(2)}s`, '--mg-dur': `${(1.5 + ((beat * 7) % 6) * 0.35).toFixed(2)}s` } as Vars}>
      <circle cx={fx(x)} cy={fx(y)} r={fx(r * 1.15)} fill={color} opacity="0.32" />
      <path d={star(+fx(x), +fx(y), +fx(r))} fill={mix(color, '#ffffff', 0.45)} />
      <circle cx={fx(x)} cy={fx(y)} r={fx(r * 0.24)} fill="#ffffff" />
    </g>
  )
}

// The luminous backglow behind a surreal crown: one radial gradient (warm / prismatic stops fading to
// nothing), breathing slowly (`.mg-core`). Never a pointer target.
function Backglow({ id, cx, cy, r, stops }: { id: string; cx: number; cy: number; r: number; stops: readonly (readonly [number, string, number])[] }) {
  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id={id}>
          {stops.map(([offset, color, opacity]) => (
            <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
          ))}
        </radialGradient>
      </defs>
      <g className="mg-core">
        <circle cx={fx(cx)} cy={fx(cy)} r={fx(r)} fill={`url(#${id})`} />
      </g>
      {/* At night the tree glows on its own: a wider, steady halo of the same light. */}
      <circle className="mg-night-only" cx={fx(cx)} cy={fx(cy)} r={fx(r * 1.45)} fill={`url(#${id})`} />
    </g>
  )
}

// Ambient light motes drifting up round a crown (`.mg-mote`), in the species' colours.
function Motes({ g, spots, colors }: { g: Geo; spots: readonly (readonly [number, number])[]; colors: readonly string[] }) {
  return (
    <g pointerEvents="none">
      {spots.map(([dx, dy], i) => (
        <g key={`${dx}:${dy}`} className="mg-mote" opacity="0.85" style={{ '--mg-delay': `${(-i * 0.7).toFixed(1)}s`, '--mg-dur': `${3.2 + (i % 4) * 0.7}s`, '--mg-mx': `${i % 2 === 0 ? 4 : -4}px` } as Vars}>
          <circle cx={fx(g.x(dx))} cy={fx(g.y(dy))} r="3.2" fill={colors[i % colors.length]} opacity="0.4" />
          <circle cx={fx(g.x(dx))} cy={fx(g.y(dy))} r="1.4" fill={mix(colors[i % colors.length], '#ffffff', 0.55)} />
        </g>
      ))}
    </g>
  )
}

// ── Crystal Flora: translucent amethyst / cyan crystal shards round a glowing core ──

// A faceted shard growing from (bx, by) towards `deg` (−90 = up): outline, lit left facet, shaded right.
function shard(bx: number, by: number, len: number, w: number, deg: number) {
  const a = (deg * Math.PI) / 180
  const [ux, uy] = [Math.cos(a), Math.sin(a)]
  const [nx, ny] = [-uy, ux] // to the shard's right
  const at = (along: number, side: number) => `${fx(bx + ux * len * along + nx * w * side)} ${fx(by + uy * len * along + ny * w * side)}`
  const [baseL, baseR, shoulderL, shoulderR, tip, base] = [at(0, -0.35), at(0, 0.35), at(0.72, -0.5), at(0.72, 0.5), at(1, 0), at(0, 0)]
  return {
    tip: [bx + ux * len, by + uy * len] as const,
    whole: `M${baseL} L${shoulderL} L${tip} L${shoulderR} L${baseR} Z`,
    left: `M${baseL} L${shoulderL} L${tip} L${base} Z`,
    right: `M${base} L${tip} L${shoulderR} L${baseR} Z`,
    edge: `M${baseL} L${shoulderL} L${tip}`,
    spine: `M${base} L${tip}`,
  }
}

// dx, dy (where it grows from), length, width, direction. Outer shards first, the tall one last.
const SHARDS: [number, number, number, number, number][] = [
  [-8, 40, 34, 8, -152],
  [8, 40, 34, 8, -30],
  [-5, 42, 46, 9, -122],
  [5, 42, 46, 9, -60],
  [-2, 44, 40, 7, -102],
  [2, 44, 38, 7, -76],
  [0, 40, 60, 10, -90],
  [-13, 0, 15, 6, -112],
  [13, 0, 13, 6, -66],
]
// Shards are a quarter longer and thicker than first drawn, like every crown in the low-poly set.
const SHARD_GROWTH = 1.25
const MOTES: [number, number][] = [[-30, 84], [28, 92], [-12, 106], [34, 66], [-36, 60], [10, 112], [-22, 44], [40, 80], [-42, 76], [22, 50], [0, 96], [-6, 70]]

// The prism: each shard takes one jewel-tone pair (lit facet, shaded facet), so the crown is neon
// cyan, electric magenta, radiant amber gold and royal amethyst at once.
const PRISM: readonly (readonly [string, string])[] = [
  ['#22e6ff', '#0891b2'],
  ['#ff5fd2', '#c026d3'],
  ['#ffd23f', '#f59e0b'],
  ['#a78bfa', '#6d28d9'],
]
const PRISM_STOPS = ['#22e6ff', '#ff5fd2', '#ffd23f', '#7c3aed']
const PRISM_GLOW = [
  [0, '#ffffff', 0.6],
  [0.3, '#22e6ff', 0.42],
  [0.62, '#ff5fd2', 0.24],
  [1, '#7c3aed', 0],
] as const

function Crystal({ g, skin }: FormProps) {
  const id = useId()
  const picked = g.stage === 2 ? [SHARDS[4], SHARDS[5], SHARDS[6]] : g.stage === 3 ? SHARDS.slice(2, 7) : SHARDS
  const shards = picked.map(([dx, dy, len, w, deg], i) => ({ key: `${dx}:${deg}`, hue: PRISM[i % PRISM.length], ...shard(g.x(dx), g.y(dy), len * SHARD_GROWTH * g.k, g.r(w * SHARD_GROWTH), deg) }))
  const tint = (c: string) => (g.golden ? mix(c, '#fde047', 0.14) : c)
  const core: [number, number] = [g.x(0), g.y(62)]
  // Two rainbow sweeps across the crown, in opposite directions: they cross-fade (`.mg-prism`), so
  // the hues seem to flow over the facets like refracted light. Opacity only: no filter.
  const sweep = (flip: boolean) => ({ gradientUnits: 'userSpaceOnUse' as const, x1: g.x(flip ? 42 : -42), y1: g.y(104), x2: g.x(flip ? -42 : 42), y2: g.y(28) })
  return (
    <g>
      <defs>
        <linearGradient id={`${id}a`} {...sweep(false)}>
          {PRISM_STOPS.map((c, i) => (
            <stop key={c} offset={i / 3} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${id}b`} {...sweep(true)}>
          {[...PRISM_STOPS.slice(2), ...PRISM_STOPS.slice(0, 2)].map((c, i) => (
            <stop key={c} offset={i / 3} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {/* The prismatic backglow behind the crown, breathing softly. */}
      <Backglow id={`${id}g`} cx={core[0]} cy={core[1]} r={g.r(54)} stops={PRISM_GLOW} />
      <ContactShadow w={[0, 0, 11, 18, 25, 27][g.stage]} />
      {/* A cut crystal stalk instead of wood. */}
      <g opacity="0.94">
        <Limb g={g} nodes={trunkNodes(46, 5.6)} ramp={woodRamp(skin, '#f0fdff', '#3b0f73')} foot />
      </g>
      <Foliage>
        {g.golden && (
          <Halo>
            {shards.map((s) => (
              <path key={`g${s.key}`} d={s.whole} strokeWidth="8" strokeLinejoin="round" />
            ))}
          </Halo>
        )}
        <g fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={DEPTH}>
          {shards.map((s) => (
            <path key={`o${s.key}`} d={s.whole} />
          ))}
        </g>
        {shards.map((s) => (
          <g key={s.key} strokeLinejoin="round" strokeLinecap="round">
            {/* Jewel-tone facets, one hue pair per shard: vivid where the light hits, deep in the shade. */}
            <path d={s.left} fill={tint(s.hue[0])} opacity="0.96" />
            <path d={s.right} fill={tint(s.hue[1])} opacity="0.94" />
          </g>
        ))}
        {/* Prismatic refraction: the two rainbow sweeps glance over every facet and cross-fade (kept
            faint, so the jewel tones stay bold). */}
        <g fill={`url(#${id}a)`} className="mg-prism" opacity="0.16">
          {shards.map((s) => (
            <path key={`a${s.key}`} d={s.whole} />
          ))}
        </g>
        <g fill={`url(#${id}b)`} className="mg-prism" opacity="0.06" style={{ '--mg-delay': '-2.6s' } as Vars}>
          {shards.map((s) => (
            <path key={`b${s.key}`} d={s.whole} />
          ))}
        </g>
        {shards.map((s) => (
          <g key={`e${s.key}`} fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d={s.spine} stroke="#ffffff" strokeWidth="0.8" opacity="0.45" />
            <path d={s.edge} stroke={skin.rim} strokeWidth="1.2" opacity="0.8" />
          </g>
        ))}
      </Foliage>
      {/* A cross-sparkle on every facet peak, each in another hue and on its own beat. */}
      <g pointerEvents="none">
        {shards.map((s, i) => (
          <Glint key={`t${s.key}`} x={s.tip[0]} y={s.tip[1]} r={2.8 + g.k * 2} color={PRISM[(i + 1) % PRISM.length][0]} beat={i} />
        ))}
      </g>
      {/* Rainbow motes drifting up round the crown. */}
      <Motes g={g} spots={MOTES.slice(0, g.stage * 3 - 3)} colors={PRISM_STOPS} />
    </g>
  )
}

// ── Cosmic Nebula: an obsidian bonsai trunk holding a slowly turning galaxy ──

// One spiral arm in the disc's own plane (centre 0, 0), winding outwards from `phase`.
function spiralArm(radius: number, phase: number, turns = 0.95) {
  const points: string[] = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    const a = phase + t * turns * Math.PI * 2
    const r = radius * (0.2 + 0.78 * t)
    points.push(`${fx(Math.cos(a) * r)} ${fx(Math.sin(a) * r)}`)
  }
  return `M${points.join(' L')}`
}

const STARS: [number, number, number][] = [
  [-34, 96, 3], [40, 88, 2.6], [-6, 112, 2.4], [44, 62, 2.2], [-40, 66, 2.6], [22, 108, 2],
  [-22, 54, 1.8], [52, 78, 1.8], [-46, 84, 2], [30, 50, 1.8], [8, 116, 1.8], [-14, 44, 1.6],
]

// The vortex, from its blazing solar-gold core outwards: hot magenta, cosmic indigo, azure, a vivid
// emerald aurora at the rim.
const NEBULA_DISC: readonly [number, string, number][] = [
  [0, '#ffffff', 1],
  [0.14, '#ffc21a', 1],
  [0.36, '#ff2d95', 0.96],
  [0.6, '#4338ca', 0.92],
  [0.82, '#0ea5e9', 0.82],
  [1, '#10e39a', 0.4],
]
const NEBULA_ARMS = ['#ff4fb0', '#8b5cf6', '#22c7ff']
const AURORA = '#10e39a'
const STAR_DUST = ['#ffd23f', '#22e6ff', '#ff7ac8']
const NEBULA_GLOW = [
  [0, '#ffc21a', 0.42],
  [0.45, '#ff2d95', 0.24],
  [0.75, '#4338ca', 0.14],
  [1, '#10e39a', 0],
] as const
// Where the rim nodes glint, in degrees round the disc.
const RIM_NODES = [20, 110, 200, 290]

function Nebula({ g, skin }: FormProps) {
  const id = useId()
  const w = 6 + 7 * g.k
  const trunk = `M${g.x(0)} ${GROUND_Y} C${g.x(10)} ${g.y(12)} ${g.x(18)} ${g.y(22)} ${g.x(8)} ${g.y(34)} C${g.x(-2)} ${g.y(44)} ${g.x(-12)} ${g.y(46)} ${g.x(-6)} ${g.y(58)}`
  const [cx, cy] = [g.x(4), g.y(80)]
  const radius = g.r(42)
  const arms = g.stage === 2 ? 1 : g.stage === 3 ? 2 : 3
  const tint = (c: string) => (g.golden ? mix(c, '#fde047', 0.15) : c)
  // Obsidian: near-black in the shade, slate in front, a cold silver sheen on the lit face.
  const obsidian = woodRamp(skin, '#cbd5e1', '#05060d')
  return (
    <g>
      <defs>
        <radialGradient id={`${id}d`}>
          {NEBULA_DISC.map(([offset, color, opacity]) => (
            <stop key={offset} offset={offset} stopColor={tint(color)} stopOpacity={opacity} />
          ))}
        </radialGradient>
      </defs>
      {/* The radiant backglow behind the galaxy. */}
      <Backglow id={`${id}g`} cx={cx} cy={cy} r={radius * 1.55} stops={NEBULA_GLOW} />
      <ContactShadow w={[0, 0, 12, 20, 28, 30][g.stage]} />
      {g.stage >= 3 && <Limb g={g} nodes={[[6, 36, 3.6], [19, 42, 3.2], [26, 56, 2.9]]} ramp={obsidian} />}
      <Limb g={g} nodes={[[0, 0, 9.6], [9, 12, 7.2], [14, 23, 6.8], [7, 35, 6.4], [-5, 46, 6], [-6, 60, 5.6]]} ramp={obsidian} foot />
      {/* A silver vein up the obsidian. */}
      <path d={trunk} stroke={skin.rim} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" transform={`translate(${-w * 0.08} 0)`} />
      <Foliage>
        {g.golden && (
          <Halo>
            <ellipse cx={cx} cy={cy} rx={radius + 6} ry={radius * 0.62 + 6} stroke="none" transform={`rotate(-18 ${fx(cx)} ${fx(cy)})`} />
          </Halo>
        )}
        <ellipse cx={cx} cy={cy} rx={radius} ry={radius * 0.62} fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={`${DEPTH} rotate(-18 ${fx(cx)} ${fx(cy)})`} />
        {/* The galaxy: a tilted disc whose arms turn in their own plane. */}
        <g transform={`translate(${fx(cx)} ${fx(cy)}) rotate(-18) scale(1 0.62)`}>
          {/* Deep space under the gas, for contrast. */}
          <circle r={radius} fill={skin.occlusion} opacity="0.7" />
          {/* The rainbow disc: solar-gold core, hot magenta, cosmic indigo, azure, emerald at the rim. */}
          <circle r={radius} fill={`url(#${id}d)`} />
          {/* Emerald aurora fringe, drifting the other way round the rim. */}
          {g.stage >= 3 && (
            <g className="mg-fringe">
              <circle r={radius * 1.06} fill="none" />
              <circle r={radius * 0.99} fill="none" stroke={tint(AURORA)} strokeWidth={radius * 0.13} strokeDasharray={`${fx(radius * 0.7)} ${fx(radius * 0.45)}`} strokeLinecap="round" opacity="0.85" />
            </g>
          )}
          <g className="mg-nebula">
            {/* Keeps the group's box centred on the disc, so it spins about its middle. */}
            <circle r={radius} fill="none" />
            {Array.from({ length: arms }, (_, i) => {
              const d = spiralArm(radius, (i * Math.PI * 2) / arms)
              const hue = tint(NEBULA_ARMS[i % NEBULA_ARMS.length])
              return (
                <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} stroke={hue} strokeWidth={radius * 0.3} opacity="0.55" />
                  <path d={d} stroke={mix(hue, '#ffffff', 0.25)} strokeWidth={radius * 0.15} opacity="0.9" />
                  <path d={d} stroke="#ffffff" strokeWidth={Math.max(1, radius * 0.04)} opacity="0.8" />
                </g>
              )
            })}
          </g>
          <circle r={radius * 0.34} fill={tint('#ffc21a')} opacity="0.75" />
          <circle r={radius * 0.18} fill="#ffffff" />
        </g>
      </Foliage>
      {/* Star dust twinkling round the canopy, and cross-sparkles on the galaxy's rim nodes. */}
      <g pointerEvents="none">
        {STARS.slice(0, g.stage * 3 - 3).map(([dx, dy, r], i) => (
          <path key={`${dx}:${dy}`} className="mg-star" d={star(g.x(dx), g.y(dy), r)} fill={STAR_DUST[i % STAR_DUST.length]} style={{ '--mg-delay': `${-i * 0.45}s`, '--mg-dur': `${1.7 + ((i * 7) % 5) * 0.5}s` } as Vars} />
        ))}
        {RIM_NODES.slice(0, g.stage === 2 ? 2 : 4).map((deg, i) => {
          // A point on the rim of the tilted disc: scale(1 0.62), then rotate(−18°), then to (cx, cy).
          const a = (deg * Math.PI) / 180
          const [px, py] = [Math.cos(a) * radius, Math.sin(a) * radius * 0.62]
          const tilt = (-18 * Math.PI) / 180
          return (
            <Glint
              key={deg}
              x={cx + px * Math.cos(tilt) - py * Math.sin(tilt)}
              y={cy + px * Math.sin(tilt) + py * Math.cos(tilt)}
              r={2.6 + g.k * 2}
              color={[AURORA, ...STAR_DUST][i % 4]}
              beat={i + 2}
            />
          )
        })}
      </g>
    </g>
  )
}

// ── Chrono Willow: a bronze fossil trunk weeping golden threads and light-sand ──

const CHRONO_KNOT: Design[] = [[0, 92, 14], [-17, 84, 12], [17, 85, 12], [0, 80, 12]]
// Sunset copper → molten gold → luminous turquoise → celestial violet: the threads, the sand, the
// sparkles and the ripples share it.
const SPECTRUM = ['#e2622b', '#ffc21a', '#19d3c5', '#8b5cf6']
const PLATINUM = '#f8fafc'
const CHRONO_GLOW = [
  [0, '#ffc21a', 0.42],
  [0.5, '#e2622b', 0.2],
  [0.8, '#8b5cf6', 0.1],
  [1, '#19d3c5', 0],
] as const
const CHRONO_MOTES: [number, number][] = [[-44, 70], [42, 62], [-30, 96], [28, 100], [-48, 40], [46, 36], [0, 104], [-18, 28]]
const CHRONO_RUNES: [number, (x: number, y: number, s: number) => string][] = [
  [20, (x, y, s) => `M${fx(x - s)} ${fx(y - s)} L${fx(x + s)} ${fx(y)} L${fx(x - s)} ${fx(y + s)}`],
  [34, (x, y, s) => `M${fx(x)} ${fx(y - s)} L${fx(x)} ${fx(y + s)} M${fx(x - s)} ${fx(y - s * 0.3)} L${fx(x + s)} ${fx(y - s * 0.3)} M${fx(x - s * 0.6)} ${fx(y + s * 0.5)} L${fx(x + s * 0.6)} ${fx(y + s * 0.5)}`],
  [48, (x, y, s) => `M${fx(x)} ${fx(y - s)} L${fx(x + s)} ${fx(y)} L${fx(x)} ${fx(y + s)} L${fx(x - s)} ${fx(y)} Z`],
]

function Chrono({ g, skin }: FormProps) {
  const id = useId()
  const w = 7 + 8 * g.k
  const spots = g.stage === 2 ? [-20, -10, 0, 10, 20] : [-45, -37, -30, -22, -15, -7, 0, 7, 15, 22, 30, 37, 45]
  // Old bronze: verdigris-dark in the shade, warm gold on the lit face.
  const bronze = woodRamp(skin, '#ffd98a', '#16241f')
  const threads = spots.map((dx, i) => {
    const x0 = g.x(dx)
    const y0 = g.y(80 - Math.abs(dx) * 0.42)
    const y1 = g.y(12 + ((i * 5) % 4) * 6)
    const wave = 2 + (i % 2) * 1.5
    const x1 = x0 + (dx > 0 ? 1.5 : -1.5)
    return { key: dx, d: `M${fx(x0)} ${fx(y0)} C${fx(x0 - wave)} ${fx(y0 + (y1 - y0) / 3)} ${fx(x0 + wave)} ${fx(y0 + ((y1 - y0) * 2) / 3)} ${fx(x1)} ${fx(y1)}`, end: [x1, y1] as const }
  })
  // Every other thread sheds a grain of light-sand that falls to the ground and fades.
  const grains = threads.filter((_, i) => i % 2 === 0)
  const patina = '#5fb3a1'
  // Runes up the trunk: [dy, glyph]. Glyphs are a few straight strokes in a 2 × 2 box.
  const runes = (g.stage === 2 ? CHRONO_RUNES.slice(0, 1) : CHRONO_RUNES).map(([dy, glyph], i) => {
    const s = 1.6 + 1.6 * g.k
    return { key: dy, d: glyph(g.x(0.6 + i * 0.5), g.y(dy), s), delay: `${-i * 0.8}s` }
  })
  return (
    <g>
      <defs>
        {/* One spectrum down every thread: sunset copper, molten gold, turquoise, celestial violet. */}
        <linearGradient id={`${id}t`} gradientUnits="userSpaceOnUse" x1="0" y1={g.y(74)} x2="0" y2={g.y(14)}>
          {SPECTRUM.map((c, i) => (
            <stop key={c} offset={i / (SPECTRUM.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {/* The warm backglow behind the cascade. */}
      <Backglow id={`${id}g`} cx={g.x(0)} cy={g.y(56)} r={g.r(52)} stops={CHRONO_GLOW} />
      <ContactShadow w={[0, 0, 12, 21, 29, 32][g.stage]} />
      {g.stage >= 3 && <Roots g={g} hw={8.4} ramp={bronze} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[2, 56, 3.4], [-15, 74, 2.8], [-30, 78, 2.3], [-42, 70, 1.9]]} ramp={bronze} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[3, 58, 3.4], [17, 76, 2.8], [31, 79, 2.3], [42, 70, 1.9]]} ramp={bronze} />}
      <Limb g={g} nodes={trunkNodes(66, 8.4, 3)} ramp={bronze} foot />
      {/* Fossil rings and a verdigris patina on the old bronze. */}
      {[10, 22, 34, 46].map((dy, i) => (
        <path key={dy} d={`M${fx(g.x(-2 + i * 0.6) - w * 0.4)} ${fx(g.y(dy))} q${fx(w * 0.4)} ${fx(-2.4)} ${fx(w * 0.8)} 0`} stroke={shade(skin.bark, -0.32)} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.75" />
      ))}
      <path d={`M${fx(g.x(-1) - w * 0.3)} ${fx(g.y(16))} q-1 ${fx(-6 * g.k)} 0.5 ${fx(-12 * g.k)}`} stroke={patina} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.55" />
      {/* Temporal runes glowing on the trunk: platinum strokes over a gold glow, pulsing in turn. */}
      <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {runes.map((r) => (
          <g key={r.key} className="mg-rune" style={{ '--mg-delay': r.delay } as Vars}>
            <path d={r.d} stroke="#ffc21a" strokeWidth="4.6" opacity="0.4" />
            <path d={r.d} stroke="#fff3b0" strokeWidth="2.4" opacity="0.75" />
            <path d={r.d} stroke={PLATINUM} strokeWidth="1.1" />
          </g>
        ))}
      </g>
      {/* Soft golden dust settled round the base, glimmering. */}
      {g.stage >= 3 && (
        <g pointerEvents="none">
          <ellipse cx={TRUNK_X} cy={GROUND_Y + 1} rx={24 * g.k} ry={5 * g.k} fill={skin.glow} opacity="0.2" />
          <ellipse cx={TRUNK_X} cy={GROUND_Y + 1} rx={14 * g.k} ry={3 * g.k} fill={skin.flower ?? '#fff3c4'} opacity="0.3" />
          {/* Where the sand lands: prismatic rings spreading over the tile and fading. */}
          {[SPECTRUM[0], SPECTRUM[2], SPECTRUM[3]].map((c, i) => (
            <ellipse key={c} className="mg-ring" cx={TRUNK_X} cy={GROUND_Y + 1} rx={24 * g.k} ry={5.5 * g.k} fill="none" stroke={c} strokeWidth="1.3" opacity="0" style={{ '--mg-delay': `${-i * 1.1}s` } as Vars} />
          ))}
          {[[-20, 1], [-9, 4], [6, 3], [19, 0], [-2, -2]].map(([dx, dy], i) => (
            <circle key={dx} className="mg-star" cx={g.x(dx)} cy={GROUND_Y + dy} r="1.1" fill={SPECTRUM[i % SPECTRUM.length]} style={{ '--mg-delay': `${-i * 0.5}s`, '--mg-dur': '2.6s' } as Vars} />
          ))}
        </g>
      )}
      <Foliage>
        {g.golden && (
          <Halo>
            {threads.map((t) => (
              <path key={`g${t.key}`} d={t.d} strokeWidth="7" fill="none" strokeLinecap="round" />
            ))}
          </Halo>
        )}
        <g fill="none" strokeLinecap="round">
          {threads.map((t, i) => (
            <g key={t.key}>
              <path d={t.d} stroke={skin.occlusion} strokeWidth="2.6" transform={DEPTH} opacity={DEPTH_OPACITY * 0.7} />
              {/* The optic thread: the whole spectrum from its root to its tip. */}
              <path d={t.d} stroke={`url(#${id}t)`} strokeWidth="2.9" />
              {/* The lit fibre inside each thread. */}
              <path d={t.d} stroke="#ffffff" strokeWidth="0.7" opacity="0.28" />
              <circle cx={t.end[0]} cy={t.end[1]} r="3.4" fill={SPECTRUM[(i % 2) + 2]} opacity="0.5" />
              <circle cx={t.end[0]} cy={t.end[1]} r="1.7" fill={skin.rim} />
            </g>
          ))}
        </g>
      </Foliage>
      {/* The knot the threads hang from: a small faceted crown of old gold. */}
      <Crown g={g} skin={skin} volumes={CHRONO_KNOT} ramp={leafRamp(skin, { lit: '#ffe9a0', peak: '#fff7d6', deep: '#3a2206' })} />
      {/* Cross-sparkles popping at the thread ends, and light motes drifting round the cascade. */}
      <g pointerEvents="none">
        {threads
          .filter((_, i) => i % 3 === 1)
          .map((t, i) => (
            <Glint key={t.key} x={t.end[0]} y={t.end[1]} r={2.4 + g.k * 1.8} color={SPECTRUM[(i + 1) % SPECTRUM.length]} beat={i + 1} />
          ))}
      </g>
      <Motes g={g} spots={CHRONO_MOTES.slice(0, g.stage * 2)} colors={SPECTRUM} />
      {/* The hourglass: grains of light falling from the thread tips to the tile. */}
      <g pointerEvents="none">
        {grains.map((t, i) => (
          <circle
            key={t.key}
            className="mg-sand"
            cx={t.end[0]}
            cy={t.end[1]}
            r="1.3"
            fill={SPECTRUM[i % SPECTRUM.length]}
            opacity="0"
            style={{ '--mg-drop': `${fx(GROUND_Y - t.end[1])}px`, '--mg-delay': `${-((i * 0.7) % 2.6).toFixed(1)}s`, '--mg-dur': `${2.2 + (i % 3) * 0.5}s` } as Vars}
          />
        ))}
      </g>
    </g>
  )
}

// The surreal species' first shoot: the species' own drawing in miniature (one shard, a first
// swirl, a few threads) in the soil heap.
const SPROUT_SCALE = 0.3
const SPROUT_GEO: Geo = {
  stage: 2,
  k: SPROUT_SCALE,
  golden: false,
  x: (dx) => TRUNK_X + dx * SPROUT_SCALE,
  y: (dy) => GROUND_Y - dy * SPROUT_SCALE,
  r: (r) => r * (0.35 + 0.65 * SPROUT_SCALE),
}

const FORMS: Record<TreeForm, (props: FormProps) => ReactNode> = {
  ...NATURAL_FORMS,
  crystal: Crystal,
  nebula: Nebula,
  chrono: Chrono,
}

export { TreeStageSvg }

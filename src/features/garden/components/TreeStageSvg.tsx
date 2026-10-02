import { useId, type CSSProperties, type ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { getTreeSpecies, isSurrealForm, speciesScale, type TreeForm } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

import { bottomCenterScale, TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X, TREE_VIEW as VIEW, TREE_VIEW_X as VIEW_X, TREE_VIEW_Y as VIEW_Y } from '../lib/plotSprite'
import { Heap, NATURAL_FORMS, Sprout } from './NaturalTrees'
import { ContactShadow, Crown, Facet, facetedVolume, Foliage, geo, Halo, leafRamp, Limb, pointList, rampColor, Roots, trunkNodes, woodRamp, type Design, type FormProps, type Geo } from './treeKit'

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

// ── Cosmic Nebula: a galaxy mushroom with miniature planets in orbit ─────────
// A chunky obsidian stem veined with light holds a faceted violet cap over glowing gills. Little
// faceted planets circle it on two tilted orbits (one passing behind the mushroom, one in front),
// and the older the tree, the more of them: none on the sprout, then 1, 2, 4 and 6.

// The cap, shade → neon: deep space violet, cosmic magenta, purple-pink where the light hits.
const SHROOM_CAP = ['#1c0a33', '#3b1259', '#5f1d91', '#8a2be2', '#c45cff', '#ff7ae6']
// Gills under the cap, glowing from the stem outwards: cyan at the heart, pink at the rim.
const GILL_CYAN = ['#b8fbff', '#22e6ff']
const GILL_PINK = ['#ff9ad8', '#ff4fb0']
const STAR_DUST = ['#ffd23f', '#22e6ff', '#ff7ac8']
const NEBULA_GLOW = [
  [0, '#ff7ae6', 0.4],
  [0.45, '#8a2be2', 0.26],
  [0.75, '#22e6ff', 0.12],
  [1, '#3b1259', 0],
] as const

// A miniature world: its dark → light ramp, its radius (design units) and, for the gas giants, a ring.
type PlanetKind = { ramp: readonly string[]; r: number; ring?: readonly [lit: string, shade: string]; rays?: boolean }
const PLANETS = {
  azure: { ramp: ['#0b3a6b', '#1f6fb8', '#3aa0f0', '#7cc8ff', '#d6f0ff'], r: 5 },
  lava: { ramp: ['#5a0b14', '#a3172a', '#e0343c', '#ff7a4a', '#ffd08a'], r: 5.5 },
  ice: { ramp: ['#0b4a4f', '#12867f', '#2cc7b5', '#7df0dc', '#e0fff8'], r: 4.6 },
  saturn: { ramp: ['#6a3d12', '#b06a24', '#e0a04a', '#f6cf8a', '#fff0c8'], r: 8, ring: ['#ffe2a3', '#c98a3a'] },
  sun: { ramp: ['#b45309', '#f08c00', '#ffc21a', '#ffe066', '#fffbe0'], r: 6.4, rays: true },
  emerald: { ramp: ['#064e3b', '#0f8a5f', '#10e39a', '#7df0b8', '#e0fff0'], r: 6.8, ring: ['#b8fff0', '#2cc7b5'] },
  crimson: { ramp: ['#4a0a1e', '#8f1239', '#e11d48', '#fb7185', '#ffd0d8'], r: 4.6 },
} satisfies Record<string, PlanetKind>
type PlanetId = keyof typeof PLANETS

// The two orbits round the cap (design space): the back one is drawn before the mushroom, so its
// planets pass behind it; the front one after. They turn in opposite directions at different speeds.
// Wide, open ellipses (the `squash` is how deep the arc reads), as wide as the view box allows.
const ORBITS = {
  back: { dy: 84, radius: 63, tilt: 18, squash: 0.5, spin: 'mg-fringe', counter: 'mg-fringe-back' },
  front: { dy: 76, radius: 60, tilt: -14, squash: 0.42, spin: 'mg-nebula', counter: 'mg-nebula-back' },
} as const
// Which planets ride which orbit at each stage, and where on it they start (degrees).
type Riders = readonly (readonly [PlanetId, number])[]
const PLANET_PLAN: Record<2 | 3 | 4 | 5, { back: Riders; front: Riders }> = {
  2: { back: [], front: [['azure', 200]] },
  3: { back: [['ice', 320]], front: [['lava', 190]] },
  4: { back: [['sun', 215], ['lava', 20]], front: [['saturn', 205], ['azure', 340]] },
  5: { back: [['emerald', 200], ['sun', 325], ['azure', 80]], front: [['saturn', 210], ['crimson', 335], ['ice', 95]] },
}

// A faceted planet at (0, 0), radius r (view units): a cut sphere lit from the upper left, with the
// far half of its ring behind it and the near half in front; the sun-orb wears a crown of rays.
function Planet({ kind, r }: { kind: PlanetKind; r: number }) {
  const { outline, facets } = facetedVolume([0, 0, r], 3, 1)
  // Half of a tilted ring as a band: the outer arc, then the inner arc back.
  const band = (from: number) => {
    const arc = (radius: number, reverse: boolean) =>
      Array.from({ length: 7 }, (_, i) => {
        const a = ((from + (reverse ? 6 - i : i) * 30) * Math.PI) / 180
        return [Math.cos(a) * radius, Math.sin(a) * radius * 0.34] as const
      })
    return pointList([...arc(r * 1.95, false), ...arc(r * 1.45, true)])
  }
  return (
    <g>
      {kind.rays && (
        <g>
          <circle r={fx(r * 1.9)} fill={kind.ramp[2]} opacity="0.22" />
          <polygon points={pointList(Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8) * r * (i % 2 ? 1.25 : 1.7), Math.sin((i * Math.PI) / 8) * r * (i % 2 ? 1.25 : 1.7)] as const))} fill={kind.ramp[3]} />
        </g>
      )}
      {kind.ring && (
        <g transform="rotate(-20)">
          <polygon points={band(180)} fill={kind.ring[1]} />
        </g>
      )}
      <polygon points={outline} fill={kind.ramp[2]} />
      {facets.map(({ points, tone }, i) => (
        <Facet key={i} points={points} fill={rampColor(kind.ramp, tone)} />
      ))}
      <polygon points={pointList([[-r * 0.5, -r * 0.34], [-r * 0.26, -r * 0.6], [-r * 0.2, -r * 0.3]])} fill="#ffffff" opacity="0.9" />
      {kind.ring && (
        <g transform="rotate(-20)">
          <polygon points={band(0)} fill={kind.ring[0]} />
        </g>
      )}
    </g>
  )
}

// One orbit: a faint ring of dust that turns round the cap, carrying its planets. The orbit is a
// circle seen at an angle (tilted and squashed); each planet counter-turns and is un-squashed, so
// it travels the ellipse while staying upright and round. Transforms only; still for reduced motion
// and for withered trees. Never a pointer target.
function Orbit({ g, orbit, riders }: { g: Geo; orbit: (typeof ORBITS)[keyof typeof ORBITS]; riders: Riders }) {
  if (riders.length === 0) return null
  const radius = orbit.radius * g.k
  return (
    <g pointerEvents="none" transform={`translate(${fx(g.x(0))} ${fx(g.y(orbit.dy))}) rotate(${orbit.tilt}) scale(1 ${orbit.squash})`}>
      <g className={orbit.spin}>
        {/* The orbit line; it also keeps the group's box centred, so it turns about its middle. */}
        <circle r={fx(radius)} fill="none" stroke="#e9d5ff" strokeWidth="1.2" opacity="0.22" />
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={fx(Math.cos((i * 40 * Math.PI) / 180) * radius)} cy={fx(Math.sin((i * 40 * Math.PI) / 180) * radius)} r={i % 3 === 0 ? 1.6 : 1} fill={STAR_DUST[i % STAR_DUST.length]} opacity="0.85" />
        ))}
        {riders.map(([id, deg]) => {
          const kind: PlanetKind = PLANETS[id]
          const r = g.r(kind.r)
          return (
            <g key={id} data-planet={id} transform={`rotate(${deg}) translate(${fx(radius)} 0) rotate(${-deg})`}>
              <g className={orbit.counter}>
                {/* Centres the box on the planet, so it counter-turns about its own middle. */}
                <circle r={fx(r * 6)} fill="none" />
                <g transform={`scale(1 ${(1 / orbit.squash).toFixed(4)}) rotate(${-orbit.tilt})`}>
                  <Planet kind={kind} r={r} />
                </g>
              </g>
            </g>
          )
        })}
      </g>
    </g>
  )
}

// Cap geometry (design space): the rim and two rings above it, then the peak, leaning to the light.
const CAP_RIM_DY = 62
const CAP_RINGS: readonly (readonly [radius: number, rise: number])[] = [[47, 0], [39, 22], [23, 39]]
const CAP_PEAK: readonly [number, number] = [-3, 49]
// Pale spots on the cap, where the stars settle: dx, dy.
const CAP_SPOTS: readonly (readonly [number, number])[] = [[-20, 84], [14, 92], [-4, 104], [28, 74], [-34, 70], [4, 76], [-16, 98]]
// Veins of light climbing the stem: dy of each crack, alternating sides.
const STEM_VEINS = [8, 22, 36]

function Nebula({ g, skin }: FormProps) {
  const id = useId()
  // The surreal sprout is the same drawing in miniature (SPROUT_GEO): no planets yet, one spark.
  const sprout = g.k < 0.5
  const plan = sprout ? { back: [], front: [] } : PLANET_PLAN[g.stage]
  // Obsidian: near-black in the shade, slate in front, a cold silver sheen on the lit face.
  const obsidian = woodRamp(skin, '#cbd5e1', '#05060d')
  const at = (dx: number, dy: number): readonly [number, number] => [g.x(dx), g.y(dy)]
  // The front half of each ring of the cap: seven points from its left edge round to its right edge.
  const ring = ([radius, rise]: readonly [number, number]) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI + (i * Math.PI) / 6
      return at(Math.cos(a) * radius, CAP_RIM_DY + rise - Math.sin(a) * radius * -0.26)
    })
  const rings = CAP_RINGS.map(ring)
  const peak = at(CAP_PEAK[0], CAP_RIM_DY + CAP_PEAK[1])
  const heart = at(0, CAP_RIM_DY + 18)
  // A cap facet's tone: how far it faces the key light (upper left), brighter towards the peak.
  const tone = (points: readonly (readonly [number, number])[], lift: number, i: number) => {
    const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length - heart[0]
    const my = points.reduce((sum, p) => sum + p[1], 0) / points.length - heart[1]
    const facing = (mx * -0.6 + my * -0.8) / (Math.hypot(mx, my) || 1)
    return 0.4 + lift + 0.42 * facing + (i % 2 ? 0.05 : -0.04)
  }
  const cap: { points: readonly (readonly [number, number])[]; tone: number }[] = []
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i < 6; i++) {
      const upper = rings[j + 1]
      const quads = upper ? [[rings[j][i], rings[j][i + 1], upper[i]], [rings[j][i + 1], upper[i + 1], upper[i]]] : [[rings[j][i], rings[j][i + 1], peak]]
      for (const [n, points] of quads.entries()) cap.push({ points, tone: tone(points, j * 0.1, i + j + n) })
    }
  }
  const outline = pointList([...rings[0], ...rings.slice(1).map((r) => r[6]), peak, ...rings.slice(1).reverse().map((r) => r[0])])
  // Gills: a fan from the top of the stem out to the rim, cyan near the stem and pink towards the edge.
  const stemTop = at(0, 37)
  const gills = Array.from({ length: 6 }, (_, i) => {
    const edge = Math.abs(i - 2.5) > 1.5
    return { points: [stemTop, rings[0][i], rings[0][i + 1]] as const, fill: (edge ? GILL_PINK : GILL_CYAN)[i % 2] }
  })
  const veins = (g.stage === 2 ? STEM_VEINS.slice(0, 2) : STEM_VEINS).map((dy, i) => {
    const side = i % 2 ? 1 : -1
    const [x, y] = at(side * 2.4, dy)
    const s = 2 + 2.6 * g.k
    return { key: dy, d: `M${fx(x)} ${fx(y)} l${fx(side * s)} ${fx(-s * 1.1)} l${fx(-side * s * 0.9)} ${fx(-s)} l${fx(side * s * 0.8)} ${fx(-s * 1.2)}`, delay: `${-i * 0.9}s` }
  })
  const glints = sprout ? 1 : [2, 4, 5, 7][g.stage - 2]

  return (
    <g strokeLinejoin="round">
      {/* The radiant backglow behind the cap. */}
      <Backglow id={`${id}g`} cx={g.x(0)} cy={g.y(86)} r={g.r(58)} stops={NEBULA_GLOW} />
      <ContactShadow w={[0, 0, 12, 20, 28, 30][g.stage]} />
      {/* A soft glow on the ground round the base. */}
      {!sprout && (
        <g pointerEvents="none">
          <ellipse cx={TRUNK_X} cy={GROUND_Y + 1} rx={30 * g.k} ry={7.5 * g.k} fill={skin.glow} opacity="0.2" />
          <ellipse cx={TRUNK_X} cy={GROUND_Y + 1} rx={17 * g.k} ry={4.2 * g.k} fill="#22e6ff" opacity="0.22" />
        </g>
      )}
      <Orbit g={g} orbit={ORBITS.back} riders={plan.back} />
      {/* The stem: a chunky prism of obsidian, flaring at the foot and again under the cap. */}
      <Limb g={g} nodes={[[0, 0, 14], [-1, 12, 10.5], [1, 32, 9.5], [0, 52, 11.5]]} ramp={obsidian} foot />
      {/* Energy cracks up the stem, pulsing in turn: a wide glow, a bright core. */}
      <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {veins.map((v) => (
          <g key={v.key} className="mg-rune" style={{ '--mg-delay': v.delay } as Vars}>
            <path d={v.d} stroke="#ff4fb0" strokeWidth="4.9" opacity="0.42" />
            <path d={v.d} stroke="#22e6ff" strokeWidth="2.3" />
            <path d={v.d} stroke="#ffffff" strokeWidth="0.95" />
          </g>
        ))}
      </g>
      <Foliage>
        {g.golden && (
          <Halo>
            <polygon points={outline} strokeWidth="9" />
          </Halo>
        )}
        {/* The underside: glowing gills, and the shade the cap throws on the stem below them. */}
        <polygon points={pointList([rings[0][1], rings[0][5], at(8, 30), at(-8, 30)])} fill={skin.occlusion} opacity="0.6" />
        {gills.map(({ points, fill }, i) => (
          <Facet key={i} points={points} fill={fill} />
        ))}
        {/* The cap: the crease it throws down-right, then its facets from rim to peak. */}
        <polygon points={outline} fill={skin.occlusion} opacity="0.55" transform={`translate(${fx(1.8 * g.k)} ${fx(3 * g.k)})`} />
        <polygon points={outline} fill={SHROOM_CAP[2]} />
        {cap.map(({ points, tone: t }, i) => (
          <Facet key={i} points={points} fill={rampColor(SHROOM_CAP, t)} />
        ))}
        {/* A neon lip along the rim, and pale spots where the stars have settled. */}
        <polygon points={pointList([...rings[0], ...[...rings[0]].reverse().map(([x, y]) => [x, y - 2.2 * g.k] as const)])} fill="#ff4fb0" />
        {(sprout ? CAP_SPOTS.slice(0, 2) : CAP_SPOTS.slice(0, g.stage + 2)).map(([dx, dy]) => {
          const [x, y] = at(dx, dy)
          const s = g.r(3.4)
          return <polygon key={`${dx}:${dy}`} points={pointList([[x, y - s * 0.7], [x + s, y], [x, y + s * 0.7], [x - s, y]])} fill="#ffd6fb" opacity="0.92" />
        })}
        <polygon points={pointList([at(-24, 96), at(-14, 104), at(-12, 95)])} fill={skin.rim} opacity="0.85" className="mg-glint" />
      </Foliage>
      <Orbit g={g} orbit={ORBITS.front} riders={plan.front} />
      {/* Stardust: cross-sparkles round the cap, each on its own beat. */}
      <g pointerEvents="none">
        {CAP_SPOTS.slice(0, glints).map(([dx, dy], i) => (
          <Glint key={`${dx}:${dy}`} x={g.x(dx * 1.7 + (i % 2 ? 6 : -6))} y={g.y(dy * 1.12 + 6)} r={2.4 + g.k * 1.8} color={STAR_DUST[i % STAR_DUST.length]} beat={i + 2} />
        ))}
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

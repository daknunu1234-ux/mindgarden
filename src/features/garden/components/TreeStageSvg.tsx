import type { ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { getTreeSpecies, MIGHTY_GOLD, type TreeForm, type TreeSkin } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

import { bottomCenterScale, TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X, TREE_VIEW as VIEW } from '../lib/plotSprite'

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
  // Size-tier multiplier (getTreeSizeTier(itemCount).scale). Scales about the trunk base, so the
  // base point (TREE_BASE_RATIO) never moves; the tree and its AO shadow grow up and out of the box
  // (the svg is overflow-visible). The soil mound keeps its size: it's the plot, not the tree.
  scale?: number
}

// Chunky 3D-toy tree: ten species (lib treeSkins, each with its own silhouette) × five growth stages
// = 50 sprites. Stage 1 is a plump sprout with the species' seed cap / cotyledons, stage 2 a thick
// sapling with a mini crown, stage 3 the recognisable silhouette, stage 4 the full crown, stage 5 the
// same crown with a gold rim round its silhouette, a golden aura, sparkles and the species' finest
// accents. Cel-shaded like a casual mobile game: bold merged outlines, shadowed undersides, sunlit
// tops (light from the upper left), specular glints and a warm bounce light. Each species is drawn
// once at full size and grown with a per-stage scale `k` (stroke widths stay put, and small stages
// keep plumper shapes). Pure markup (no hooks, no ids), so any number render on one page or server.
function TreeStageSvg({ stage, treeType, label, className, ground = true, scale = 1 }: TreeStageSvgProps) {
  const species = getTreeSpecies(treeType)
  const Form = FORMS[species.form]
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1

  return (
    // overflow="visible" too (not only the class): sized-up tiers and the stage-5 aura draw past the box.
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
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
        <GroundShadow stage={stage} form={species.form} />
        {stage === 1 ? <Sprout form={species.form} skin={species.skin} /> : <Form g={geo(stage)} skin={species.skin} />}
        {stage === 5 && <Sparkles />}
      </g>
    </svg>
  )
}

// ── Geometry ─────────────────────────────────────────────────────────────────

// Growth scale per stage (stage 5 is stage 4's size, dressed in gold).
const GROWTH: Record<2 | 3 | 4 | 5, number> = { 2: 0.52, 3: 0.76, 4: 1, 5: 1 }

// Design space: dx right of the trunk, dy up from the ground; `x` / `y` map it into the view at scale k.
// `r` grows radii less than positions, so saplings get chunkier, cuter puffs.
type Geo = { stage: 2 | 3 | 4 | 5; k: number; golden: boolean; x: (dx: number) => number; y: (dy: number) => number; r: (r: number) => number }

function geo(stage: 2 | 3 | 4 | 5): Geo {
  const k = GROWTH[stage]
  return {
    stage,
    k,
    golden: stage === 5,
    x: (dx) => TRUNK_X + dx * k,
    y: (dy) => GROUND_Y - dy * k,
    r: (r) => r * (0.35 + 0.65 * k),
  }
}

type FormProps = { g: Geo; skin: TreeSkin }
type Clump = [number, number, number] // x, y, radius (view space)
type Design = [number, number, number] // dx, dy, radius (design space)

const place = (g: Geo, clumps: readonly Design[]): Clump[] => clumps.map(([dx, dy, r]) => [g.x(dx), g.y(dy), g.r(r)])

// ── Palette helpers ──────────────────────────────────────────────────────────

const SUNLIGHT = '#fff6c8'
const BOUNCE = '#ffb347'
const GOLD_RIM = '#fbbf24'
const outlineOf = (color: string) => shade(color, -0.58)

// ── Ground ───────────────────────────────────────────────────────────────────

const NARROW: readonly TreeForm[] = ['cactus', 'palm', 'birch', 'pine']

// Soft translucent ambient-occlusion shadow on the soil, a little to the right (sun upper-left).
function GroundShadow({ stage, form }: { stage: TreeStage; form: TreeForm }) {
  const spread = NARROW.includes(form) ? 0.72 : 1
  const w = [0, 12, 22, 32, 44, 46][stage] * spread
  return (
    <g>
      <ellipse cx={TRUNK_X + 4} cy={GROUND_Y + 1} rx={w} ry={w * 0.24} fill="#2f3d12" opacity="0.2" />
      <ellipse cx={TRUNK_X + 2} cy={GROUND_Y + 0.5} rx={w * 0.55} ry={w * 0.14} fill="#3b2410" opacity="0.28" />
    </g>
  )
}

// Little tilled soil mound (used when the scene draws no ground of its own).
function Mound() {
  return (
    <g>
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 4} rx="40" ry="8" fill="#5a3314" />
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 2} rx="38" ry="7" fill="#9a5f2e" stroke="#4a2511" strokeWidth="1.6" />
      <ellipse cx={TRUNK_X - 6} cy={GROUND_Y + 0.5} rx="24" ry="3.8" fill="#b97a43" />
      <path d="M34 110 q6 -2 12 0 M52 111.5 q6 -2 12 0 M70 110.5 q6 -2 12 0" stroke="#6b3d18" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M24 106 q1 -4 -1 -6 M27 106 q0 -5 2 -7 M92 107 q1 -4 -1 -6 M95 107 q0 -5 2 -6" stroke="#3f9a2a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  )
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`

function GoldenAura() {
  return (
    <g fill="#fde68a">
      <circle cx={TRUNK_X} cy="52" r="58" opacity="0.16" />
      <circle cx={TRUNK_X} cy="52" r="46" opacity="0.2" />
      <circle cx={TRUNK_X} cy="52" r="33" opacity="0.2" />
    </g>
  )
}

function Sparkles() {
  const points: [number, number, number][] = [
    [14, 30, 6],
    [106, 24, 6.5],
    [62, 2, 5],
    [110, 74, 4.5],
    [10, 76, 4.5],
    [90, 8, 3.5],
  ]
  return (
    <g>
      {points.map(([x, y, r]) => (
        <SparkleStar key={`${x}-${y}`} x={x} y={y} r={r} />
      ))}
    </g>
  )
}

function SparkleStar({ x, y, r, color = '#fde047', edge = '#b45309' }: { x: number; y: number; r: number; color?: string; edge?: string }) {
  return (
    <g>
      <path d={star(x, y, r + 1.4)} fill={edge} />
      <path d={star(x, y, r)} fill={color} />
      <circle cx={x - r * 0.15} cy={y - r * 0.15} r={r * 0.22} fill="#fff" />
    </g>
  )
}

// Plush cloud-like canopy: outline silhouette first (so it merges around all clumps; at stage 5 a
// gold rim outside it), then each clump back (top) to front (bottom), so lower clumps overlap the
// ones above like a real crown.
function Canopy({ clumps, skin, golden = false }: { clumps: Clump[]; skin: TreeSkin; golden?: boolean }) {
  // Stage 5: only a light warm tint (the gold rim, aura and sparkles carry the "mastered" look), so
  // violet, pink and crimson crowns stay clean instead of turning muddy.
  const dark = golden ? mix(skin.canopyDark, '#eab308', 0.08) : skin.canopyDark
  const light = golden ? mix(skin.canopyLight, '#fde047', 0.22) : skin.canopyLight
  const outline = outlineOf(skin.canopyDark)
  const underside = shade(dark, -0.22)
  // Saturated mid-tones carry most of each clump; the pale top light is a smaller cap.
  const mid = mix(dark, light, 0.38)
  const sun = mix(light, SUNLIGHT, 0.6)
  const bounce = mix(dark, BOUNCE, 0.38)
  const ordered = [...clumps].sort((a, b) => a[1] - b[1] || a[0] - b[0])

  return (
    <g>
      {golden && (
        <g fill={GOLD_RIM}>
          {ordered.map(([x, y, r]) => (
            <circle key={`g${x}-${y}`} cx={x} cy={y} r={r + 4.8} />
          ))}
        </g>
      )}
      <g fill={outline}>
        {ordered.map(([x, y, r]) => (
          <circle key={`o${x}-${y}`} cx={x} cy={y} r={r + 2.3} />
        ))}
      </g>
      {ordered.map(([x, y, r]) => (
        <g key={`c${x}-${y}`}>
          <circle cx={x} cy={y} r={r} fill={underside} stroke={outline} strokeOpacity="0.35" strokeWidth="1" />
          <circle cx={x - r * 0.05} cy={y - r * 0.1} r={r * 0.9} fill={dark} />
          {/* Warm bounce light off the sunny ground, under the clump. */}
          <ellipse cx={x - r * 0.28} cy={y + r * 0.56} rx={r * 0.42} ry={r * 0.19} fill={bounce} opacity="0.6" />
          <circle cx={x - r * 0.15} cy={y - r * 0.24} r={r * 0.68} fill={mid} />
          <circle cx={x - r * 0.3} cy={y - r * 0.42} r={r * 0.34} fill={light} />
          <ellipse cx={x - r * 0.38} cy={y - r * 0.54} rx={r * 0.2} ry={r * 0.11} fill={sun} transform={`rotate(-28 ${x - r * 0.38} ${y - r * 0.54})`} />
          <circle cx={x - r * 0.52} cy={y - r * 0.3} r={Math.max(0.8, r * 0.07)} fill="#fff" opacity="0.85" />
        </g>
      ))}
    </g>
  )
}

// A chunky rounded limb along a centreline: gold rim (stage 5), dark outline, bark, a sunlit edge.
function Limb({ d, w, skin, golden = false, color }: { d: string; w: number; skin: TreeSkin; golden?: boolean; color?: string }) {
  const bark = color ?? skin.bark
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {golden && <path d={d} stroke={GOLD_RIM} strokeWidth={w + 8} />}
      <path d={d} stroke={outlineOf(skin.barkDeep)} strokeWidth={w + 4.4} />
      <path d={d} stroke={bark} strokeWidth={w} />
      <path d={d} stroke={shade(bark, -0.18)} strokeWidth={w * 0.34} transform={`translate(${w * 0.24} 0)`} opacity="0.6" />
      <path d={d} stroke={shade(bark, 0.38)} strokeWidth={Math.max(1.4, w * 0.18)} transform={`translate(${-w * 0.26} 0)`} opacity="0.9" />
    </g>
  )
}

// A tree trunk from the ground up to `topDy`, with a gentle `lean` (design units).
const trunkPath = (g: Geo, topDy: number, lean = 0, bend = 0) =>
  `M${g.x(0)} ${GROUND_Y} C${g.x(bend)} ${g.y(topDy * 0.35)} ${g.x(lean * 0.6 - bend)} ${g.y(topDy * 0.7)} ${g.x(lean)} ${g.y(topDy)}`

// Root flare at the base of mature trunks.
function Flare({ g, skin }: { g: Geo; skin: TreeSkin }) {
  if (g.stage < 4) return null
  return <path d="M49 108 q-6 1.5 -10 0.5 M71 108 q6 1.5 10 0.5" stroke={outlineOf(skin.barkDeep)} strokeWidth="3.4" strokeLinecap="round" />
}

// Five-petal blossom with a dark rim and a golden heart.
function Blossom({ x, y, petal, center = '#facc15', r = 2.6 }: { x: number; y: number; petal: string; center?: string; r?: number }) {
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [x + Math.cos(rad) * r, y + Math.sin(rad) * r] as const
  })
  return (
    <g>
      {petals.map(([px, py]) => (
        <circle key={`o${px}`} cx={px} cy={py} r={r * 0.82 + 0.9} fill={outlineOf(petal)} opacity="0.55" />
      ))}
      {petals.map(([px, py]) => (
        <circle key={`p${px}`} cx={px} cy={py} r={r * 0.82} fill={petal} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill={center} stroke="#b45309" strokeWidth="0.6" />
      <circle cx={x - r * 0.9} cy={y - r * 0.9} r={r * 0.25} fill="#fff" />
    </g>
  )
}

// Oversized glossy fruit: outlined, a shade on the lower right, a big specular glint, stalk and leaf.
function Fruit({ x, y, color, r = 3.6 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 1.2} fill={outlineOf(color)} />
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x + r * 0.25} cy={y + r * 0.28} r={r * 0.66} fill={shade(color, -0.18)} opacity="0.7" />
      <ellipse cx={x - r * 0.36} cy={y - r * 0.38} rx={r * 0.36} ry={r * 0.25} fill="#fff" opacity="0.9" transform={`rotate(-30 ${x - r * 0.36} ${y - r * 0.38})`} />
      <path d={`M${x + r * 0.3} ${y - r * 0.95} q${r * 0.7} ${-r * 0.4} ${r * 1.1} ${r * 0.1} q${-r * 0.66} ${r * 0.34} ${-r * 1.1} ${-r * 0.1} Z`} fill="#4ade80" stroke="#166534" strokeWidth="0.7" />
    </g>
  )
}

// ── Stage 1: sprouts ─────────────────────────────────────────────────────────

// A plump two-leaf seedling in a heap of soil, wearing its seed's cap (per species), or the species'
// own first shoot: a pine tuft, a coconut sprouting, a round baby cactus, a glowing mystic bud.
function Sprout({ form, skin }: { form: TreeForm; skin: TreeSkin }) {
  const heap = <path d="M48 108 q12 -8 24 0 z" fill="#8a5228" stroke="#4a2511" strokeWidth="1.4" strokeLinejoin="round" />
  if (form === 'pine') {
    return (
      <g strokeLinecap="round">
        {heap}
        <path d={`M${TRUNK_X} ${GROUND_Y - 2} L60 90`} stroke="#1f4a14" strokeWidth="5.4" />
        <path d={`M${TRUNK_X} ${GROUND_Y - 2} L60 90`} stroke="#6fbf3a" strokeWidth="3" />
        <path d="M60 92 L49 85 M60 92 L60 78 M60 92 L71 85 M60 98 L52 93 M60 98 L68 93" stroke="#1f4a14" strokeWidth="5.6" />
        <path d="M60 92 L49 85 M60 92 L60 78 M60 92 L71 85 M60 98 L52 93 M60 98 L68 93" stroke={skin.canopyLight} strokeWidth="3.2" />
        <ellipse cx="60" cy="77" rx="3.2" ry="2.4" fill="#a86a32" stroke="#4a2511" strokeWidth="1.2" />
      </g>
    )
  }
  if (form === 'cactus') {
    const outline = outlineOf(skin.canopyDark)
    return (
      <g>
        {heap}
        <ellipse cx={TRUNK_X} cy="97" rx="12" ry="12.5" fill={outline} />
        <ellipse cx={TRUNK_X} cy="97" rx="10" ry="10.6" fill={skin.canopyLight} />
        <ellipse cx={TRUNK_X + 3.5} cy="99" rx="5" ry="7" fill={skin.canopyDark} opacity="0.45" />
        <ellipse cx={TRUNK_X - 3.5} cy="92" rx="2.8" ry="3.8" fill={mix(skin.canopyLight, SUNLIGHT, 0.6)} />
        <g fill="#fffbeb">
          <circle cx="52" cy="96" r="1" />
          <circle cx="68" cy="96" r="1" />
          <circle cx="60" cy="88" r="1" />
        </g>
        <Blossom x={TRUNK_X} y={85} petal={skin.flower ?? '#ff5fa2'} r={2.2} />
      </g>
    )
  }
  if (form === 'palm') {
    return (
      <g strokeLinejoin="round">
        <ellipse cx="60" cy="101" rx="11" ry="8.5" fill="#6b3f1c" stroke="#3b1f0e" strokeWidth="2" />
        <ellipse cx="57" cy="98" rx="4" ry="2.4" fill="#9a6232" />
        <path d="M60 94 C60 88 61 84 62 80" stroke="#1f4a14" strokeWidth="4.6" fill="none" strokeLinecap="round" />
        {[
          'M62 81 q-10 -8 -18 -2 q9 -1 18 2',
          'M62 81 q2 -12 12 -14 q-6 7 -12 14',
          'M62 81 q12 -4 16 6 q-8 -5 -16 -6',
        ].map((d, i) => (
          <path key={d} d={d} fill={i === 1 ? skin.canopyLight : skin.canopyDark} stroke="#1f4a14" strokeWidth="1.8" />
        ))}
      </g>
    )
  }
  // Two cotyledons; the seed coat still perched on top (acorn cap, winged seed, pit, …).
  const leaf = skin.canopyLight
  const leafDark = skin.canopyDark
  const outline = '#1f4a14'
  const cap = SEED_CAPS[form] ?? '#a86a32'
  return (
    <g>
      {form === 'mystic' && <circle cx="60" cy="84" r="16" fill={skin.glow} opacity="0.28" />}
      {heap}
      <path d="M60 106 C60 99 59 93 60 86" stroke={outline} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M60 106 C60 99 59 93 60 86" stroke="#5bbf3a" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M60 90 C53 93 42 91 40 80 C50 76 58 81 60 90 Z" fill={leafDark} stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 88 C67 90 79 87 81 75 C70 72 62 78 60 88 Z" fill={leaf} stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M45 81 q5 -2 9 1 M66 79 q5 -3 9 -2" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M54 86 q6 -9 12 0 z" fill={cap} stroke="#3b1f0e" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M56.5 83.5 q3.5 -3 7 0" stroke={shade(cap, 0.4)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {form === 'mystic' && [[48, 72], [74, 68], [66, 60]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.6" fill={skin.flower ?? '#f5d0fe'} />)}
      {form === 'cherry' && <Blossom x={72} y={72} petal={skin.flower ?? '#fff1f7'} center="#f472b6" r={2.2} />}
    </g>
  )
}

const SEED_CAPS: Partial<Record<TreeForm, string>> = {
  oak: '#a8702e',
  birch: '#d9b36a',
  cherry: '#8a2f3c',
  willow: '#b58d52',
  mystic: '#7c3aed',
  citrus: '#ff8a1f',
  maple: '#c2410c',
}

// ── Oak: bulbous emerald crown in soft layered volumes ───────────────────────

const OAK: Design[] = [
  [0, 84, 19], [-21, 72, 17], [21, 74, 18], [-32, 53, 15], [32, 54, 15],
  [-11, 59, 18], [12, 60, 18], [-18, 39, 14], [0, 42, 16], [18, 40, 14],
]
const ACORNS: [number, number][] = [[-24, 46], [20, 50], [-6, 36], [30, 64], [-34, 62]]

function Oak({ g, skin }: FormProps) {
  return (
    <g>
      <Limb d={trunkPath(g, 48)} w={7 + 7 * g.k} skin={skin} golden={g.golden} />
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(34)} q${-9 * g.k} ${-4 * g.k} ${-18 * g.k} ${-14 * g.k}`} w={4 + 2 * g.k} skin={skin} golden={g.golden} />}
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(38)} q${9 * g.k} ${-4 * g.k} ${18 * g.k} ${-13 * g.k}`} w={4 + 2 * g.k} skin={skin} golden={g.golden} />}
      <Flare g={g} skin={skin} />
      <Canopy clumps={place(g, g.stage === 2 ? OAK.slice(0, 5) : OAK)} skin={skin} golden={g.golden} />
      {g.stage >= 4 &&
        ACORNS.slice(0, g.golden ? 5 : 3).map(([dx, dy]) => (
          <g key={dx}>
            <ellipse cx={g.x(dx)} cy={g.y(dy)} rx="3.4" ry="4.2" fill={g.golden ? '#f59e0b' : '#b7792f'} stroke="#3b1f0e" strokeWidth="1.3" />
            <path d={`M${g.x(dx) - 3.8} ${g.y(dy) - 1.5} q3.8 -5 7.6 0 z`} fill="#6b4423" stroke="#3b1f0e" strokeWidth="1.2" />
          </g>
        ))}
    </g>
  )
}

// ── Pine: chunky tiered conifer of rounded foliage cakes ─────────────────────

type Tier = [number, number, number] // top y, half width, height

const PINE_TIERS: Tier[] = [
  [76, 33, 25],
  [61, 27, 22],
  [47, 21, 20],
  [33, 15, 18],
]

// A soft rounded tier: apex at the top, a scalloped skirt of little puffs along the bottom.
function tierPath([top, half, h]: Tier) {
  const bottom = top + h
  return `M${TRUNK_X} ${top} C${TRUNK_X + half * 0.35} ${top + h * 0.35} ${TRUNK_X + half * 0.8} ${top + h * 0.7} ${TRUNK_X + half} ${bottom} L${TRUNK_X - half} ${bottom} C${TRUNK_X - half * 0.8} ${top + h * 0.7} ${TRUNK_X - half * 0.35} ${top + h * 0.35} ${TRUNK_X} ${top} Z`
}
const tierPuffs = ([top, half, h]: Tier): Clump[] => {
  const n = Math.max(3, Math.round(half / 6))
  return Array.from({ length: n }, (_, i) => [TRUNK_X - half + ((i + 0.5) * half * 2) / n, top + h - 0.5, (half / n) * 1.1])
}

function Pine({ g, skin }: FormProps) {
  // Fewer, smaller tiers while young; all four at full size.
  const count = g.stage === 2 ? 2 : g.stage === 3 ? 3 : 4
  const tiers: Tier[] = PINE_TIERS.slice(PINE_TIERS.length - count).map(([top, half, h]) => [g.y(GROUND_Y - top), g.r(half), g.r(h)])
  const dark = g.golden ? mix(skin.canopyDark, '#eab308', 0.2) : skin.canopyDark
  const light = g.golden ? mix(skin.canopyLight, '#fde047', 0.35) : skin.canopyLight
  const outline = outlineOf(skin.canopyDark)
  const underside = shade(dark, -0.25)
  const mid = mix(dark, light, 0.55)
  const trunkTop = tiers[0][0] + tiers[0][2] - 2

  return (
    <g>
      <Limb d={`M${TRUNK_X} ${GROUND_Y} L${TRUNK_X} ${trunkTop}`} w={6 + 6 * g.k} skin={skin} golden={g.golden} />
      {/* Bottom tier first: each tier's scalloped skirt drapes over the one below. */}
      {tiers.map((tier) => {
        const [top, half, h] = tier
        const puffs = tierPuffs(tier)
        return (
          <g key={top}>
            {g.golden && (
              <g fill={GOLD_RIM}>
                <path d={tierPath(tier)} stroke={GOLD_RIM} strokeWidth="9.6" strokeLinejoin="round" />
                {puffs.map(([x, y, r]) => (
                  <circle key={`g${x}`} cx={x} cy={y} r={r + 4.8} />
                ))}
              </g>
            )}
            <path d={tierPath(tier)} fill={outline} stroke={outline} strokeWidth="4.6" strokeLinejoin="round" />
            {puffs.map(([x, y, r]) => (
              <circle key={`o${x}`} cx={x} cy={y} r={r + 2.3} fill={outline} />
            ))}
            <path d={tierPath(tier)} fill={dark} />
            {puffs.map(([x, y, r]) => (
              <g key={`p${x}`}>
                <circle cx={x} cy={y} r={r} fill={underside} />
                <circle cx={x - r * 0.1} cy={y - r * 0.18} r={r * 0.78} fill={dark} />
                <circle cx={x - r * 0.3} cy={y - r * 0.38} r={r * 0.3} fill={mid} />
              </g>
            ))}
            {/* Sunlit left face and a glint near the apex. */}
            <path
              d={`M${TRUNK_X} ${top + 1} C${TRUNK_X - half * 0.35} ${top + h * 0.35} ${TRUNK_X - half * 0.75} ${top + h * 0.7} ${TRUNK_X - half * 0.9} ${top + h - 2} L${TRUNK_X - half * 0.1} ${top + h - 3} Z`}
              fill={mid}
            />
            <path
              d={`M${TRUNK_X - 1} ${top + 3} C${TRUNK_X - half * 0.25} ${top + h * 0.3} ${TRUNK_X - half * 0.45} ${top + h * 0.5} ${TRUNK_X - half * 0.55} ${top + h * 0.62}`}
              stroke={light}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path d={`M${TRUNK_X + half * 0.1} ${top + h - 2.5} q${half * 0.4} -0.5 ${half * 0.75} 1`} stroke={mix(dark, BOUNCE, 0.4)} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7" />
          </g>
        )
      })}
      {g.stage >= 4 &&
        [[44, 92], [76, 90], [52, 76], [70, 74]].map(([x, y]) => (
          <g key={`cone${x}`}>
            <ellipse cx={x} cy={y} rx="3.4" ry="4.6" fill={outlineOf(skin.barkDeep)} />
            <ellipse cx={x} cy={y} rx="2.4" ry="3.5" fill={g.golden ? '#f59e0b' : skin.bark} />
            <path d={`M${x - 1.8} ${y - 1} h3.6 M${x - 1.8} ${y + 1.2} h3.6`} stroke={skin.barkDeep} strokeWidth="0.8" />
          </g>
        ))}
      {g.golden && <SparkleStar x={TRUNK_X} y={tiers.at(-1)![0] - 2} r={7} color={MIGHTY_GOLD} />}
    </g>
  )
}

// ── Birch: white bark with dark marks and sunny golden leaves ────────────────

const BIRCH: Design[] = [
  [0, 94, 14], [-15, 84, 13], [15, 86, 13], [0, 80, 13], [-22, 68, 12],
  [22, 69, 12], [-8, 70, 14], [10, 60, 12], [-13, 54, 11], [15, 50, 10],
]

function Birch({ g, skin }: FormProps) {
  const w = 5 + 5 * g.k
  const top = 88
  // Dark lenticel dashes and knots, alternating sides, up the white trunk.
  const marks = [14, 26, 38, 50, 62, 74].filter((dy) => dy < top - 10)
  return (
    <g>
      <Limb d={trunkPath(g, top, 3, -2)} w={w} skin={skin} golden={g.golden} />
      {g.stage >= 3 && <Limb d={`M${g.x(1)} ${g.y(52)} q${10 * g.k} ${-6 * g.k} ${16 * g.k} ${-16 * g.k}`} w={3 + 2 * g.k} skin={skin} golden={g.golden} />}
      {marks.map((dy, i) => (
        <path
          key={dy}
          d={`M${g.x(i % 2 === 0 ? -w / (2 * g.k) + 0.6 : 0.4)} ${g.y(dy)} h${w * 0.42}`}
          stroke="#2b2622"
          strokeWidth={i % 3 === 0 ? 2.2 : 1.5}
          strokeLinecap="round"
        />
      ))}
      <Canopy clumps={place(g, g.stage === 2 ? BIRCH.slice(0, 5) : BIRCH)} skin={skin} golden={g.golden} />
      {g.stage >= 4 &&
        [[-24, 58], [26, 76], [4, 100]].map(([dx, dy]) => (
          <path key={dx} d={`M${g.x(dx)} ${g.y(dy)} q3 -4 6 0 q-3 4 -6 0 z`} fill="#fff7c2" stroke="#b7791f" strokeWidth="0.9" />
        ))}
    </g>
  )
}

// ── Cherry: puffy cotton-candy sakura crown with blossoms and petal sparkles ──

const CHERRY: Design[] = [
  [0, 70, 18], [-22, 66, 16], [22, 67, 16], [-38, 54, 13], [38, 55, 13],
  [-12, 82, 15], [12, 83, 15], [-26, 46, 12], [26, 47, 12], [0, 50, 15], [0, 92, 12],
]
const CHERRY_BLOSSOMS: [number, number][] = [
  [-30, 58], [-12, 76], [8, 90], [28, 62], [0, 64], [-20, 46], [22, 48], [-40, 50], [40, 52], [12, 72], [-4, 44], [16, 84],
]

function Cherry({ g, skin }: FormProps) {
  const blossoms = g.stage === 2 ? 1 : g.stage === 3 ? 4 : g.stage === 4 ? 8 : 12
  return (
    <g>
      <Limb d={`M${g.x(0)} ${GROUND_Y} C${g.x(1)} ${g.y(18)} ${g.x(-6)} ${g.y(30)} ${g.x(-12)} ${g.y(50)}`} w={5 + 6 * g.k} skin={skin} golden={g.golden} />
      <Limb d={`M${g.x(-1)} ${g.y(26)} C${g.x(6)} ${g.y(34)} ${g.x(12)} ${g.y(40)} ${g.x(16)} ${g.y(52)}`} w={4 + 4 * g.k} skin={skin} golden={g.golden} />
      <Flare g={g} skin={skin} />
      <Canopy clumps={place(g, g.stage === 2 ? CHERRY.slice(0, 5) : CHERRY)} skin={skin} golden={g.golden} />
      {CHERRY_BLOSSOMS.slice(0, blossoms).map(([dx, dy]) => (
        <Blossom key={`${dx}-${dy}`} x={g.x(dx)} y={g.y(dy)} petal={skin.flower ?? '#fff1f7'} center="#f472b6" r={2.4 + g.k * 0.6} />
      ))}
      {g.stage >= 4 &&
        [[-44, 70], [44, 76], [-8, 100]].map(([dx, dy]) => <SparkleStar key={dx} x={g.x(dx)} y={g.y(dy)} r={3} color="#fff" edge="#f472b6" />)}
    </g>
  )
}

// ── Willow: a rounded dome with chunky yarn-like weeping tendrils ────────────

const WILLOW_DOME: Design[] = [[0, 84, 16], [-18, 78, 14], [18, 79, 14], [-8, 92, 12], [10, 92, 12], [0, 72, 14]]

function Willow({ g, skin }: FormProps) {
  const outline = outlineOf(skin.canopyDark)
  const spots = g.stage === 2 ? [-18, -6, 6, 18] : [-36, -27, -18, -9, 0, 9, 18, 27, 36]
  const tendrils = spots.map((dx, i) => {
    const top = 78 - Math.abs(dx) * 0.3
    const bottom = 14 + ((i * 7) % 3) * 6
    const x0 = g.x(dx)
    const y0 = g.y(top)
    const y1 = g.y(bottom)
    const wave = 3 + (i % 2) * 2
    return { key: dx, d: `M${x0} ${y0} C${x0 - wave} ${y0 + (y1 - y0) / 3} ${x0 + wave} ${y0 + ((y1 - y0) * 2) / 3} ${x0 + (dx > 0 ? 2 : -2)} ${y1}`, front: i % 2 === 1, end: [x0 + (dx > 0 ? 2 : -2), y1] as const }
  })
  const strand = (t: (typeof tendrils)[number], fill: string) => (
    <g key={t.key} fill="none" strokeLinecap="round">
      {g.golden && <path d={t.d} stroke={GOLD_RIM} strokeWidth="13" />}
      <path d={t.d} stroke={outline} strokeWidth="9.6" />
      <path d={t.d} stroke={fill} strokeWidth="6.2" />
      <path d={t.d} stroke={mix(fill, SUNLIGHT, 0.55)} strokeWidth="1.8" transform="translate(-1.4 0)" opacity="0.8" />
      <circle cx={t.end[0]} cy={t.end[1]} r="4.2" fill={fill} stroke={outline} strokeWidth="2" />
    </g>
  )
  return (
    <g>
      <Limb d={trunkPath(g, 64, -2, 3)} w={7 + 8 * g.k} skin={skin} golden={g.golden} />
      <Flare g={g} skin={skin} />
      {tendrils.filter((t) => !t.front).map((t) => strand(t, skin.canopyDark))}
      <Canopy clumps={place(g, WILLOW_DOME)} skin={skin} golden={g.golden} />
      {tendrils.filter((t) => t.front).map((t) => strand(t, mix(skin.canopyDark, skin.canopyLight, 0.55)))}
    </g>
  )
}

// ── Mystic: twisted bonsai trunk with bioluminescent violet foliage pads ─────

// Cloud pads at the branch tips, bonsai style: wide, flat-bottomed clusters (top pad first).
const MYSTIC_PADS: Design[][] = [
  [[-12, 96, 14], [6, 98, 15], [20, 94, 12], [-4, 106, 12], [-22, 92, 11]],
  [[12, 78, 14], [28, 76, 13], [40, 72, 10], [22, 86, 12]],
  [[-44, 60, 11], [-32, 62, 14], [-18, 60, 11], [-30, 70, 12]],
]
const SPORES: [number, number][] = [[-44, 80], [34, 94], [-16, 100], [36, 66], [-40, 54], [4, 76], [24, 104], [-22, 86]]

function Mystic({ g, skin }: FormProps) {
  const w = 6 + 7 * g.k
  const pads = g.stage === 2 ? [MYSTIC_PADS[0]] : g.stage === 3 ? MYSTIC_PADS.slice(0, 2) : MYSTIC_PADS
  const trunk = `M${g.x(0)} ${GROUND_Y} C${g.x(-10)} ${g.y(14)} ${g.x(-22)} ${g.y(26)} ${g.x(-14)} ${g.y(40)} C${g.x(-6)} ${g.y(52)} ${g.x(14)} ${g.y(52)} ${g.x(12)} ${g.y(66)} C${g.x(10)} ${g.y(78)} ${g.x(2)} ${g.y(82)} ${g.x(4)} ${g.y(90)}`
  return (
    <g>
      {/* Bioluminescent halo behind each pad. */}
      {pads.map((pad) => {
        const [cx, cy] = [g.x(pad[1][0]), g.y(pad[1][1])]
        return (
          <g key={`h${cx}`} fill={skin.glow}>
            <circle cx={cx} cy={cy} r={g.r(26)} opacity="0.16" />
            <circle cx={cx} cy={cy} r={g.r(18)} opacity="0.22" />
          </g>
        )
      })}
      <Limb d={trunk} w={w} skin={skin} golden={g.golden} />
      {g.stage >= 3 && <Limb d={`M${g.x(12)} ${g.y(64)} Q${g.x(24)} ${g.y(66)} ${g.x(26)} ${g.y(76)}`} w={w * 0.55} skin={skin} golden={g.golden} />}
      {g.stage >= 4 && <Limb d={`M${g.x(-13)} ${g.y(42)} Q${g.x(-28)} ${g.y(48)} ${g.x(-32)} ${g.y(60)}`} w={w * 0.55} skin={skin} golden={g.golden} />}
      {pads.map((pad, i) => (
        <Canopy key={i} clumps={place(g, pad)} skin={skin} golden={g.golden} />
      ))}
      {/* Glowing spores drifting round the crown. */}
      {SPORES.slice(0, g.stage * 2 - 2).map(([dx, dy]) => (
        <g key={`${dx}-${dy}`}>
          <circle cx={g.x(dx)} cy={g.y(dy)} r="3.4" fill={skin.glow} opacity="0.35" />
          <circle cx={g.x(dx)} cy={g.y(dy)} r="1.5" fill={skin.flower ?? '#f5d0fe'} />
        </g>
      ))}
    </g>
  )
}

// ── Palm: thick segmented trunk and broad, plump fan fronds ──────────────────

// Point on a cubic Bézier.
const bezier = (p: readonly [number, number][], t: number): [number, number] => {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]]
}

const FRONDS = [-168, -140, -112, -80, -52, -22, 8, 196] // degrees; 0 = right, −90 = up

function Palm({ g, skin }: FormProps) {
  const w = 8 + 6 * g.k
  const curve: [number, number][] = [
    [g.x(0), GROUND_Y],
    [g.x(-4), g.y(30)],
    [g.x(10), g.y(60)],
    [g.x(12), g.y(84)],
  ]
  const trunk = `M${curve[0][0]} ${curve[0][1]} C${curve[1][0]} ${curve[1][1]} ${curve[2][0]} ${curve[2][1]} ${curve[3][0]} ${curve[3][1]}`
  const rings = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((t) => bezier(curve, t))
  const [cx, cy] = curve[3]
  const len = 16 + 26 * g.k
  const fronds = (g.stage === 2 ? FRONDS.filter((_, i) => i % 2 === 0) : FRONDS).map((deg, i) => {
    const a = (deg * Math.PI) / 180
    const tip: [number, number] = [cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.8 + len * 0.3]
    // Perpendicular for the frond's plump width, and a droop in the middle.
    const nx = -Math.sin(a)
    const ny = Math.cos(a)
    const mid: [number, number] = [(cx + tip[0]) / 2, (cy + tip[1]) / 2 - len * 0.12]
    const half = 5 + 3 * g.k
    const d = `M${cx} ${cy} Q${mid[0] + nx * half} ${mid[1] + ny * half} ${tip[0]} ${tip[1]} Q${mid[0] - nx * half} ${mid[1] - ny * half} ${cx} ${cy} Z`
    return { key: deg, d, mid, tip, fill: i % 2 === 0 ? skin.canopyDark : skin.canopyLight }
  })
  const outline = outlineOf(skin.canopyDark)
  const nuts = g.stage === 2 ? 0 : g.stage === 3 ? 2 : 3
  return (
    <g>
      <Limb d={trunk} w={w} skin={skin} golden={g.golden} />
      {rings.map(([x, y]) => (
        <path key={y} d={`M${x - w / 2} ${y} q${w / 2} 3 ${w} 0`} stroke={shade(skin.bark, -0.35)} strokeWidth="2" fill="none" strokeLinecap="round" />
      ))}
      {[[-4, 5], [4, 6], [0, 10]].slice(0, nuts).map(([dx, dy]) => (
        <g key={dx}>
          <circle cx={cx + dx} cy={cy + dy} r="4.6" fill={g.golden ? '#d97706' : (skin.fruit ?? '#8a4f22')} stroke="#3b1f0e" strokeWidth="1.8" />
          <circle cx={cx + dx - 1.4} cy={cy + dy - 1.6} r="1.2" fill="#fff" opacity="0.6" />
        </g>
      ))}
      {fronds.map((f) => (
        <g key={f.key} strokeLinejoin="round" strokeLinecap="round">
          {g.golden && <path d={f.d} fill={GOLD_RIM} stroke={GOLD_RIM} strokeWidth="8" />}
          <path d={f.d} fill={outline} stroke={outline} strokeWidth="4.4" />
          <path d={f.d} fill={g.golden ? mix(f.fill, '#fde047', 0.2) : f.fill} />
          <path d={`M${cx} ${cy} Q${f.mid[0]} ${f.mid[1]} ${f.tip[0]} ${f.tip[1]}`} stroke={mix(f.fill, SUNLIGHT, 0.55)} strokeWidth="1.8" fill="none" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r="4" fill={skin.canopyDark} stroke={outline} strokeWidth="2" />
    </g>
  )
}

// ── Citrus: a spherical green crown with oversized glossy oranges ────────────

const CITRUS: Design[] = [
  [0, 86, 17], [-20, 78, 17], [20, 79, 17], [-28, 60, 15], [28, 61, 15],
  [0, 70, 19], [-12, 56, 16], [13, 56, 16], [0, 46, 14],
]
const ORANGES: [number, number][] = [[-18, 64], [16, 72], [0, 88], [26, 56], [-28, 52], [6, 50], [-8, 76], [22, 88], [-22, 84]]

function Citrus({ g, skin }: FormProps) {
  const fruit = g.stage === 2 ? 0 : g.stage === 3 ? 3 : g.stage === 4 ? 6 : 9
  return (
    <g>
      <Limb d={trunkPath(g, 44)} w={7 + 7 * g.k} skin={skin} golden={g.golden} />
      <Flare g={g} skin={skin} />
      <Canopy clumps={place(g, g.stage === 2 ? CITRUS.slice(0, 6) : CITRUS)} skin={skin} golden={g.golden} />
      {ORANGES.slice(0, fruit).map(([dx, dy]) => (
        <Fruit key={`${dx}-${dy}`} x={g.x(dx)} y={g.y(dy)} r={4 + 2 * g.k} color={g.golden ? '#ffa31a' : (skin.fruit ?? '#ff8a1f')} />
      ))}
      {g.golden && [[-30, 72], [30, 70], [-4, 100]].map(([dx, dy]) => <Blossom key={dx} x={g.x(dx)} y={g.y(dy)} petal={skin.flower ?? '#fff'} r={2.6} />)}
    </g>
  )
}

// ── Maple: bold, cut-out autumn leaves in coral and crimson ──────────────────

const MAPLE: Design[] = [
  [0, 44, 15], [-22, 42, 13], [22, 43, 13], [-12, 60, 19], [12, 60, 19],
  [-32, 56, 16], [32, 57, 16], [-22, 76, 18], [22, 77, 18], [0, 86, 20],
]

// A five-pointed maple leaf with round-ish tips and deep notches.
function mapleLeaf(x: number, y: number, r: number, rot: number) {
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.52
    points.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M${points.join(' L')} Z`
}

function Maple({ g, skin }: FormProps) {
  const leaves = place(g, g.stage === 2 ? MAPLE.slice(3, 7) : MAPLE)
    .map(([x, y, r], i) => ({ x, y, r: r * 1.12, rot: ((i * 23) % 40) - 20, fill: i % 3 === 0 ? skin.canopyDark : i % 3 === 1 ? skin.canopyLight : mix(skin.canopyDark, skin.canopyLight, 0.5) }))
    .sort((a, b) => a.y - b.y)
  const outline = outlineOf(skin.canopyDark)
  return (
    <g>
      <Limb d={trunkPath(g, 46)} w={6 + 7 * g.k} skin={skin} golden={g.golden} />
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(36)} q${-10 * g.k} ${-6 * g.k} ${-20 * g.k} ${-18 * g.k}`} w={3.5 + 2 * g.k} skin={skin} golden={g.golden} />}
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(40)} q${10 * g.k} ${-5 * g.k} ${20 * g.k} ${-17 * g.k}`} w={3.5 + 2 * g.k} skin={skin} golden={g.golden} />}
      <Flare g={g} skin={skin} />
      {g.golden && leaves.map((l) => <path key={`g${l.x}-${l.y}`} d={mapleLeaf(l.x, l.y, l.r, l.rot)} fill={GOLD_RIM} stroke={GOLD_RIM} strokeWidth="9" strokeLinejoin="round" />)}
      {leaves.map((l) => (
        <path key={`o${l.x}-${l.y}`} d={mapleLeaf(l.x, l.y, l.r, l.rot)} fill={outline} stroke={outline} strokeWidth="4.6" strokeLinejoin="round" />
      ))}
      {leaves.map((l) => (
        <g key={`l${l.x}-${l.y}`} strokeLinejoin="round">
          <path d={mapleLeaf(l.x, l.y, l.r, l.rot)} fill={g.golden ? mix(l.fill, '#fbbf24', 0.2) : l.fill} />
          <path d={mapleLeaf(l.x - l.r * 0.12, l.y - l.r * 0.16, l.r * 0.55, l.rot)} fill={mix(l.fill, SUNLIGHT, 0.4)} opacity="0.75" />
          <path d={`M${l.x} ${l.y + l.r * 0.4} L${l.x} ${l.y - l.r * 0.5} M${l.x} ${l.y} l${-l.r * 0.4} ${-l.r * 0.25} M${l.x} ${l.y} l${l.r * 0.4} ${-l.r * 0.25}`} stroke={shade(l.fill, -0.3)} strokeWidth="1.3" strokeLinecap="round" />
        </g>
      ))}
    </g>
  )
}

// ── Cactus: plump saguaro with rounded arms and blooming tips ────────────────

type Arm = { d: string; w: number; tip: [number, number] }

const CACTUS: Record<2 | 3 | 4, { top: number; w: number; arms: Arm[] }> = {
  2: { top: 80, w: 18, arms: [] },
  3: { top: 60, w: 21, arms: [{ d: 'M60 88 H78 V68', w: 13, tip: [78, 68] }] },
  4: {
    top: 40,
    w: 24,
    arms: [
      { d: 'M60 84 H37 V60', w: 15, tip: [37, 60] },
      { d: 'M60 72 H83 V49', w: 15, tip: [83, 49] },
    ],
  },
}

function Cactus({ g, skin }: FormProps) {
  const outline = outlineOf(skin.canopyDark)
  const body = g.golden ? mix(skin.canopyLight, '#fde047', 0.22) : skin.canopyLight
  const shadeSide = mix(body, skin.canopyDark, 0.6)
  const sun = mix(body, SUNLIGHT, 0.55)
  const { top, w, arms } = CACTUS[g.stage === 5 ? 4 : g.stage]
  const tips: [number, number][] = [[TRUNK_X, top], ...arms.map((a) => a.tip)]
  const flower = skin.flower ?? '#ff5fa2'

  return (
    <g>
      {/* Gold rim (stage 5), then outline for arms and body, then fills: one piece. */}
      {g.golden && (
        <g>
          {arms.map((arm) => (
            <path key={`g${arm.d}`} d={arm.d} stroke={GOLD_RIM} strokeWidth={arm.w + 9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <rect x={TRUNK_X - w / 2 - 4.6} y={top - 4.6} width={w + 9.2} height={GROUND_Y - top + 4.6} rx={w / 2 + 4.6} fill={GOLD_RIM} />
        </g>
      )}
      {arms.map((arm) => (
        <path key={`o${arm.d}`} d={arm.d} stroke={outline} strokeWidth={arm.w + 4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <rect x={TRUNK_X - w / 2 - 2.2} y={top - 2.2} width={w + 4.4} height={GROUND_Y - top + 2.2} rx={w / 2 + 2.2} fill={outline} />
      {arms.map((arm) => (
        <g key={arm.d}>
          <path d={arm.d} stroke={body} strokeWidth={arm.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={arm.d} stroke={shadeSide} strokeWidth={arm.w * 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${arm.w * 0.22} ${arm.w * 0.1})`} opacity="0.55" />
        </g>
      ))}
      <rect x={TRUNK_X - w / 2} y={top} width={w} height={GROUND_Y - top} rx={w / 2} fill={body} />
      <rect x={TRUNK_X + w * 0.08} y={top + 3} width={w * 0.38} height={GROUND_Y - top - 5} rx={w * 0.19} fill={shadeSide} opacity="0.65" />
      <rect x={TRUNK_X - w * 0.36} y={top + 4} width={w * 0.16} height={GROUND_Y - top - 12} rx={w * 0.08} fill={sun} />
      {[-w / 4, w / 4].map((dx) => (
        <path key={dx} d={`M${TRUNK_X + dx} ${top + 6} V${GROUND_Y - 3}`} stroke={outline} strokeWidth="1" opacity="0.35" />
      ))}
      {/* Spines. */}
      <g fill="#fffbeb">
        {[top + 12, top + 26, top + 40, top + 54].filter((y) => y < GROUND_Y - 5).map((y) => (
          <g key={y}>
            <circle cx={TRUNK_X - w / 2 + 1.8} cy={y} r="1.1" />
            <circle cx={TRUNK_X + w / 2 - 1.8} cy={y + 5} r="1.1" />
            <circle cx={TRUNK_X} cy={y + 7} r="0.9" />
          </g>
        ))}
      </g>
      {g.stage === 3 && <Blossom x={TRUNK_X} y={top} petal={flower} r={2.6} />}
      {g.stage === 4 && tips.map(([x, y]) => <Blossom key={`${x}-${y}`} x={x} y={y - 1} petal={flower} r={3.2} />)}
      {g.golden && tips.map(([x, y]) => <Blossom key={`${x}-${y}`} x={x} y={y - 2} petal={flower} center="#fde047" r={4} />)}
    </g>
  )
}

const FORMS: Record<TreeForm, (props: FormProps) => ReactNode> = {
  oak: Oak,
  pine: Pine,
  birch: Birch,
  cherry: Cherry,
  willow: Willow,
  mystic: Mystic,
  palm: Palm,
  citrus: Citrus,
  maple: Maple,
  cactus: Cactus,
}

export { TreeStageSvg }

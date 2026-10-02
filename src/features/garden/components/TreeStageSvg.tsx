import { useId, type CSSProperties, type ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { getTreeSpecies, isSurrealForm, MIGHTY_GOLD, speciesScale, type TreeForm, type TreeSkin } from '@/shared/lib/treeSkins'
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

// Chunky 3D-toy tree: thirteen species (lib treeSkins, each with its own silhouette; the last three
// are the surreal ones, drawn in light instead of leaves) × five growth stages = 65 sprites. Stage 1 is a plump sprout with the species' seed cap / cotyledons, stage 2 a thick
// sapling with a mini crown, stage 3 the recognisable silhouette, stage 4 the full crown, stage 5 the
// same crown in a soft golden halo with a pulsing aura, twinkling sparkles and the species' finest
// accents. No outlines: trees stand out from the ground through light alone. Every foliage cluster
// has a rich, saturated ambient-occlusion shade under and behind it (deep jungle green, plum, ochre…
// per species), a sun-kissed rim light along its upper contour, a bright top and a warm bounce light.
// Each species is drawn once at full size and grown with a per-stage scale `k`. The crown sits in a
// `.mg-foliage` group that bobs a beat behind the tree's sway (globals.css, off for reduced motion).
// Pure markup, so any number render on one page or the server (the only hook is useId, for the
// surreal species' gradient ids).
function TreeStageSvg({ stage, treeType, label, className, ground = true, shadow = true, scale = 1, fit = false }: TreeStageSvgProps) {
  const species = getTreeSpecies(treeType)
  const Form = FORMS[species.form]
  const s = +((Number.isFinite(scale) && scale > 0 ? scale : 1) * (fit ? 1 : speciesScale(species.id))).toFixed(4)

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
        {shadow && <GroundShadow stage={stage} form={species.form} />}
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

// ── Lighting ─────────────────────────────────────────────────────────────────

const SUNLIGHT = '#fff6c8'
const BOUNCE = '#ffb347'
const GOLD_HALO = '#fbbf24'
// The depth shade sits a little down and to the right of each shape (sun from the upper left).
const DEPTH = 'translate(1.4 2.4)'
const DEPTH_OPACITY = 0.62

// The halo is one translucent group, so overlapping shapes merge into a single soft glow.
const Halo = ({ children }: { children: ReactNode }) => (
  <g opacity="0.5" fill={GOLD_HALO} stroke={GOLD_HALO}>
    {children}
  </g>
)

// Crown group that bobs a beat behind the tree's sway (globals.css `.mg-foliage`).
const Foliage = ({ children }: { children: ReactNode }) => <g className="mg-foliage">{children}</g>

// Sun-kissed rim light along the upper-left contour of a round cluster.
function rimArc(x: number, y: number, r: number, from = 196, to = 300) {
  const a = (from * Math.PI) / 180
  const b = (to * Math.PI) / 180
  const rr = r * 0.9
  return `M${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)} A${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${(x + Math.cos(b) * rr).toFixed(2)} ${(y + Math.sin(b) * rr).toFixed(2)}`
}

// ── Ground ───────────────────────────────────────────────────────────────────

const NARROW: readonly TreeForm[] = ['cactus', 'palm', 'birch', 'pine']

// Soft, edge-less shadows (stacked translucent ellipses fade out like a radial blur): a contact
// shadow under the trunk and a longer cast shadow thrown back and to the right.
function GroundShadow({ stage, form }: { stage: TreeStage; form: TreeForm }) {
  const spread = NARROW.includes(form) ? 0.72 : 1
  const w = [0, 12, 22, 32, 44, 46][stage] * spread
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

// Little tilled soil mound (used when the scene draws no ground of its own).
function Mound() {
  return (
    <g>
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 4} rx="40" ry="8" fill="#5a3314" />
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 2} rx="38" ry="7" fill="#9a5f2e" />
      <ellipse cx={TRUNK_X - 6} cy={GROUND_Y + 0.5} rx="24" ry="3.8" fill="#b97a43" />
      <path d="M34 110 q6 -2 12 0 M52 111.5 q6 -2 12 0 M70 110.5 q6 -2 12 0" stroke="#6b3d18" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M24 106 q1 -4 -1 -6 M27 106 q0 -5 2 -7 M92 107 q1 -4 -1 -6 M95 107 q0 -5 2 -6" stroke="#3f9a2a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  )
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`

// Stage 5: a soft golden aura that pulses (globals.css `.mg-aura`).
function GoldenAura() {
  return (
    <g fill="#fde68a" className="mg-aura">
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

// Plush cloud-like canopy, lit instead of outlined: a saturated occlusion silhouette offset down-right
// (depth under and behind the crown), then each clump back (top) to front (bottom) with a shaded
// underside, bright mid-tones, a sunlit cap, a rim light on its upper contour and a glint. Stage 5
// adds a soft golden halo round the whole crown.
function Canopy({ clumps, skin, golden = false }: { clumps: Clump[]; skin: TreeSkin; golden?: boolean }) {
  // Stage 5: only a light warm tint (the halo, aura and sparkles carry the "mastered" look), so
  // violet, pink and crimson crowns stay clean instead of turning muddy.
  const dark = golden ? mix(skin.canopyDark, '#eab308', 0.08) : skin.canopyDark
  const light = mix(golden ? mix(skin.canopyLight, '#fde047', 0.22) : skin.canopyLight, '#ffffff', 0.12)
  const underside = mix(dark, skin.occlusion, 0.55)
  const mid = mix(dark, light, 0.45)
  const sun = mix(light, SUNLIGHT, 0.65)
  const bounce = mix(dark, BOUNCE, 0.38)
  const ordered = [...clumps].sort((a, b) => a[1] - b[1] || a[0] - b[0])

  return (
    <Foliage>
      {golden && (
        <Halo>
          {ordered.map(([x, y, r]) => (
            <circle key={`g${x}-${y}`} cx={x} cy={y} r={r + 5.5} stroke="none" />
          ))}
        </Halo>
      )}
      <g fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={DEPTH}>
        {ordered.map(([x, y, r]) => (
          <circle key={`o${x}-${y}`} cx={x} cy={y} r={r + 0.8} />
        ))}
      </g>
      {ordered.map(([x, y, r]) => (
        <g key={`c${x}-${y}`}>
          <circle cx={x} cy={y} r={r} fill={underside} />
          <circle cx={x - r * 0.05} cy={y - r * 0.1} r={r * 0.9} fill={dark} />
          {/* Warm bounce light off the sunny ground, under the clump. */}
          <ellipse cx={x - r * 0.28} cy={y + r * 0.56} rx={r * 0.42} ry={r * 0.19} fill={bounce} opacity="0.6" />
          <circle cx={x - r * 0.15} cy={y - r * 0.24} r={r * 0.68} fill={mid} />
          <circle cx={x - r * 0.3} cy={y - r * 0.42} r={r * 0.34} fill={light} />
          <path d={rimArc(x, y, r)} stroke={skin.rim} strokeWidth={Math.max(1.4, r * 0.17)} fill="none" strokeLinecap="round" opacity="0.85" />
          <ellipse cx={x - r * 0.38} cy={y - r * 0.54} rx={r * 0.2} ry={r * 0.11} fill={sun} transform={`rotate(-28 ${x - r * 0.38} ${y - r * 0.54})`} />
          <circle cx={x - r * 0.52} cy={y - r * 0.3} r={Math.max(0.8, r * 0.07)} fill="#fff" opacity="0.9" />
        </g>
      ))}
    </Foliage>
  )
}

// A chunky rounded limb along a centreline, lit rather than outlined: a soft halo (stage 5), a
// shaded right side, the bark, and a sunlit left edge.
function Limb({ d, w, skin, golden = false, color }: { d: string; w: number; skin: TreeSkin; golden?: boolean; color?: string }) {
  const bark = color ?? skin.bark
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {golden && (
        <Halo>
          <path d={d} strokeWidth={w + 8} fill="none" />
        </Halo>
      )}
      <path d={d} stroke={mix(skin.barkDeep, skin.occlusion, 0.3)} strokeWidth={w} transform={DEPTH} opacity="0.5" />
      <path d={d} stroke={bark} strokeWidth={w} />
      <path d={d} stroke={shade(bark, -0.22)} strokeWidth={w * 0.38} transform={`translate(${w * 0.24} 0)`} opacity="0.7" />
      <path d={d} stroke={shade(bark, 0.42)} strokeWidth={Math.max(1.4, w * 0.2)} transform={`translate(${-w * 0.26} 0)`} opacity="0.95" />
    </g>
  )
}

// A tree trunk from the ground up to `topDy`, with a gentle `lean` (design units).
const trunkPath = (g: Geo, topDy: number, lean = 0, bend = 0) =>
  `M${g.x(0)} ${GROUND_Y} C${g.x(bend)} ${g.y(topDy * 0.35)} ${g.x(lean * 0.6 - bend)} ${g.y(topDy * 0.7)} ${g.x(lean)} ${g.y(topDy)}`

// Root flare at the base of mature trunks.
function Flare({ g, skin }: { g: Geo; skin: TreeSkin }) {
  if (g.stage < 4) return null
  return <path d="M49 108 q-6 1.5 -10 0.5 M71 108 q6 1.5 10 0.5" stroke={shade(skin.bark, -0.2)} strokeWidth="3.4" strokeLinecap="round" />
}

// Five-petal blossom: a soft shade under the petals, a golden heart, a glint.
function Blossom({ x, y, petal, center = '#facc15', r = 2.6 }: { x: number; y: number; petal: string; center?: string; r?: number }) {
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [x + Math.cos(rad) * r, y + Math.sin(rad) * r] as const
  })
  return (
    <g>
      <g fill={shade(petal, -0.3)} opacity="0.45" transform="translate(0.6 1)">
        {petals.map(([px, py]) => (
          <circle key={`o${px}`} cx={px} cy={py} r={r * 0.82} />
        ))}
      </g>
      {petals.map(([px, py]) => (
        <circle key={`p${px}`} cx={px} cy={py} r={r * 0.82} fill={petal} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill={center} />
      <circle cx={x - r * 0.9} cy={y - r * 0.9} r={r * 0.25} fill="#fff" />
    </g>
  )
}

// Oversized glossy fruit: a soft shadow below, a shade on the lower right, a big specular glint, leaf.
function Fruit({ x, y, color, r = 3.6 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <g>
      <circle cx={x + 0.8} cy={y + 1.2} r={r + 0.4} fill={shade(color, -0.45)} opacity="0.5" />
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x + r * 0.25} cy={y + r * 0.28} r={r * 0.66} fill={shade(color, -0.18)} opacity="0.7" />
      <path d={rimArc(x, y, r)} stroke="#fff3c4" strokeWidth={Math.max(1, r * 0.2)} fill="none" strokeLinecap="round" opacity="0.8" />
      <ellipse cx={x - r * 0.36} cy={y - r * 0.38} rx={r * 0.36} ry={r * 0.25} fill="#fff" opacity="0.9" transform={`rotate(-30 ${x - r * 0.36} ${y - r * 0.38})`} />
      <path d={`M${x + r * 0.3} ${y - r * 0.95} q${r * 0.7} ${-r * 0.4} ${r * 1.1} ${r * 0.1} q${-r * 0.66} ${r * 0.34} ${-r * 1.1} ${-r * 0.1} Z`} fill="#4ade80" />
    </g>
  )
}

// ── Stage 1: sprouts ─────────────────────────────────────────────────────────

// A plump two-leaf seedling in a heap of soil, wearing its seed's cap (per species), or the species'
// own first shoot: a pine tuft, a coconut sprouting, a round baby cactus, a glowing mystic bud.
function Sprout({ form, skin }: { form: TreeForm; skin: TreeSkin }) {
  const heap = (
    <g>
      <path d="M48 108 q12 -8 24 0 z" fill="#6f3f1c" transform="translate(0.8 0.6)" />
      <path d="M48 108 q12 -8 24 0 z" fill="#9a5f2e" />
      <path d="M53 104.5 q7 -3 12 -1" stroke="#c98a4b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  )
  const stem = (d: string, w = 3.6) => (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={skin.occlusion} strokeWidth={w} transform="translate(0.8 1)" opacity="0.5" />
      <path d={d} stroke="#4fb536" strokeWidth={w} />
      <path d={d} stroke="#a6ec7c" strokeWidth={w * 0.35} transform={`translate(${-w * 0.25} 0)`} />
    </g>
  )
  if (isSurrealForm(form)) {
    const Form = FORMS[form]
    return (
      <g>
        {heap}
        <Form g={SPROUT_GEO} skin={skin} />
      </g>
    )
  }
  if (form === 'pine') {
    const needles = 'M60 92 L49 85 M60 92 L60 78 M60 92 L71 85 M60 98 L52 93 M60 98 L68 93'
    return (
      <g strokeLinecap="round" fill="none">
        {heap}
        {stem(`M${TRUNK_X} ${GROUND_Y - 2} L60 90`, 3.4)}
        <path d={needles} stroke={skin.occlusion} strokeWidth="3.4" transform="translate(0.8 1.2)" opacity="0.5" />
        <path d={needles} stroke={skin.canopyDark} strokeWidth="3.6" />
        <path d={needles} stroke={skin.canopyLight} strokeWidth="1.6" transform="translate(-0.5 -0.6)" />
        <ellipse cx="60" cy="77" rx="3.2" ry="2.4" fill="#a86a32" />
        <ellipse cx="59" cy="76.2" rx="1.4" ry="0.8" fill="#e0a86a" />
      </g>
    )
  }
  if (form === 'cactus') {
    return (
      <g>
        {heap}
        <ellipse cx={TRUNK_X + 1.2} cy="99" rx="10" ry="10.6" fill={skin.occlusion} opacity="0.5" />
        <ellipse cx={TRUNK_X} cy="97" rx="10" ry="10.6" fill={skin.canopyLight} />
        <ellipse cx={TRUNK_X + 3.5} cy="99" rx="5" ry="7" fill={mix(skin.canopyDark, skin.occlusion, 0.4)} opacity="0.5" />
        <path d={rimArc(TRUNK_X, 97, 10)} stroke={skin.rim} strokeWidth="2" fill="none" strokeLinecap="round" />
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
    const fronds = ['M62 81 q-10 -8 -18 -2 q9 -1 18 2', 'M62 81 q2 -12 12 -14 q-6 7 -12 14', 'M62 81 q12 -4 16 6 q-8 -5 -16 -6']
    return (
      <g>
        <ellipse cx="61" cy="102" rx="11" ry="8.5" fill="#3f2410" opacity="0.5" />
        <ellipse cx="60" cy="101" rx="11" ry="8.5" fill="#6b3f1c" />
        <path d={rimArc(60, 101, 10)} stroke="#c98a4b" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="57" cy="98" rx="4" ry="2.4" fill="#9a6232" />
        {stem('M60 94 C60 88 61 84 62 80', 3.4)}
        <g fill={skin.occlusion} opacity="0.45" transform="translate(0.8 1.2)">
          {fronds.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {fronds.map((d, i) => (
          <path key={d} d={d} fill={i === 1 ? skin.canopyLight : skin.canopyDark} />
        ))}
      </g>
    )
  }
  // Two cotyledons; the seed coat still perched on top (acorn cap, winged seed, pit, …).
  const cap = SEED_CAPS[form] ?? '#a86a32'
  const leaves = ['M60 90 C53 93 42 91 40 80 C50 76 58 81 60 90 Z', 'M60 88 C67 90 79 87 81 75 C70 72 62 78 60 88 Z']
  return (
    <g>
      {form === 'mystic' && <circle cx="60" cy="84" r="16" fill={skin.glow} opacity="0.28" />}
      {heap}
      {stem('M60 106 C60 99 59 93 60 86')}
      <g fill={skin.occlusion} opacity="0.5" transform="translate(0.9 1.4)">
        {leaves.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={leaves[0]} fill={skin.canopyDark} />
      <path d={leaves[1]} fill={mix(skin.canopyLight, '#ffffff', 0.1)} />
      <path d="M44 80 q5 -3 10 0 M65 78 q6 -4 12 -3" stroke={skin.rim} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9" />
      <path d="M54 86 q6 -9 12 0 z" fill={shade(cap, -0.35)} transform="translate(0.6 0.9)" opacity="0.6" />
      <path d="M54 86 q6 -9 12 0 z" fill={cap} />
      <path d="M56.5 83.5 q3.5 -3 7 0" stroke={shade(cap, 0.45)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
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
  if (g.stage === 2) return <OakStage2 g={g} skin={skin} />
  if (g.stage === 3) return <OakStage3 g={g} skin={skin} />
  if (g.stage === 5) return <OakStage5 g={g} skin={skin} />
  // Stage 4: the soft crown (the low-poly trial has not reached it yet).
  return (
    <g>
      <Limb d={trunkPath(g, 48)} w={7 + 7 * g.k} skin={skin} />
      <Limb d={`M${g.x(0)} ${g.y(34)} q${-9 * g.k} ${-4 * g.k} ${-18 * g.k} ${-14 * g.k}`} w={4 + 2 * g.k} skin={skin} />
      <Limb d={`M${g.x(0)} ${g.y(38)} q${9 * g.k} ${-4 * g.k} ${18 * g.k} ${-13 * g.k}`} w={4 + 2 * g.k} skin={skin} />
      <Flare g={g} skin={skin} />
      <Canopy clumps={place(g, OAK)} skin={skin} />
      {ACORNS.slice(0, 3).map(([dx, dy]) => {
          const [x, y] = [g.x(dx), g.y(dy)]
          const nut = '#c98a3a'
          return (
            <g key={dx}>
              <ellipse cx={x + 0.7} cy={y + 1} rx="3.4" ry="4.2" fill={skin.occlusion} opacity="0.45" />
              <ellipse cx={x} cy={y} rx="3.4" ry="4.2" fill={nut} />
              <ellipse cx={x - 1.1} cy={y + 0.2} rx="1" ry="1.8" fill={shade(nut, 0.45)} />
              <path d={`M${x - 3.8} ${y - 1.5} q3.8 -5 7.6 0 z`} fill="#6b4423" />
              <path d={`M${x - 2.6} ${y - 2.6} q2.6 -2.4 5.2 0`} stroke="#a8763f" strokeWidth="1" fill="none" strokeLinecap="round" />
            </g>
          )
        })}
    </g>
  )
}

// ── Oak, stages 2, 3 and 5: chunky low-poly trial (flat facets, one key light) ──
// An experiment on the oak before other species follow (stage 4 still has the soft crown): the crown
// is overlapping faceted volumes and the trunk a chiselled prism, every plane a flat fill picked by
// how much it faces the sun (upper left). No gradients on the facets, no filters. Same view box, trunk
// base and crown extent as the soft oak of each stage, so the farm's anchors, bubbles and labels fit.

// Unit vector towards the sun in screen space (up and to the left).
const KEY_LIGHT: readonly [number, number] = [-0.6, -0.8]
// Uneven ring radii, so a volume reads as a cut gem rather than a ball.
const FACET_JITTER = [1, 0.9, 1.04, 0.93, 1.02, 0.88, 1, 0.95]
const FACET_SIDES = FACET_JITTER.length

type Point = readonly [number, number]
type Facet = { points: string; tone: number }
// A trunk cross-section at height dy: left edge, the two front ridges, right edge (design space).
type Ring = readonly [dy: number, left: number, frontLeft: number, frontRight: number, right: number]
// A flat plane and how much it faces the sun (0 away, 1 straight at it).
type Plane = { tone: number; points: Point[] }
type LowPolyOakDesign = {
  // Crown volumes, back to front.
  volumes: Design[]
  // From the root flare up into the crown.
  rings: Ring[]
  // Roots and branches, drawn under the trunk faces.
  limbs: Plane[]
  // Chisel marks on the front face.
  chips: Plane[]
  // Half-width of the contact shadow (view units).
  shadow: number
  acorns: number
  // Stage 5: the trunk's outline, for the golden halo.
  halo?: Point[]
}

const LOW_POLY_OAK: Record<2 | 3 | 5, LowPolyOakDesign> = {
  // Sapling: a stout baby trunk under two small puffs, the lit one in front.
  2: {
    volumes: [[8, 76, 24], [-9, 62, 22]],
    rings: [[0, -13, -6, 5, 12], [20, -9, -4, 4, 9], [48, -8, -3, 4, 9]],
    limbs: [],
    chips: [{ tone: 0.85, points: [[-3, 8], [0, 13], [-3, 18]] }],
    shadow: 11,
    acorns: 0,
  },
  // Young tree: a thicker prism with its first roots, and three masses creasing into each other.
  3: {
    volumes: [[0, 80, 24], [-22, 60, 20], [20, 58, 21]],
    rings: [[0, -12, -5.5, 4.5, 11], [14, -8, -3.5, 4, 8], [30, -7, -2.5, 4.5, 8.5], [48, -8, -3, 4, 9]],
    limbs: [
      { tone: 0.8, points: [[-8, 9], [-18, -0.5], [-11, -1.5]] },
      { tone: 0, points: [[8, 9], [17, -0.5], [10, -1.5]] },
    ],
    chips: [
      { tone: 0.85, points: [[-2.5, 10], [0.5, 14], [-2, 19]] },
      { tone: 0.05, points: [[4, 4], [6, 9], [3.5, 10.5]] },
    ],
    shadow: 17,
    acorns: 0,
  },
  5: {
    volumes: [[0, 79, 24], [-25, 60, 21], [25, 62, 22], [0, 52, 22]],
    rings: [[0, -11, -5, 4, 10], [14, -7, -3, 3.5, 7], [28, -6, -2, 4.5, 8], [46, -8, -2.5, 4, 9]],
    limbs: [
      // Roots: a lit wedge on the left, a shaded one on the right.
      { tone: 0.8, points: [[-7, 9], [-18, -0.5], [-10, -1.5]] },
      { tone: 0.6, points: [[-7, 9], [-10, -1.5], [-5, -2]] },
      { tone: 0, points: [[7, 9], [17, -0.5], [9, -1.5]] },
      { tone: 0.3, points: [[7, 9], [9, -1.5], [4, -2]] },
      // Branches: a top plane and the underside it shades.
      { tone: 1, points: [[-6, 28], [-2, 34], [-20, 50], [-23, 45]] },
      { tone: 0.3, points: [[-6, 28], [-23, 45], [-22, 41], [-5, 23]] },
      { tone: 0.6, points: [[8, 30], [4, 36], [20, 50], [24, 46]] },
      { tone: 0, points: [[8, 30], [24, 46], [24, 42], [8, 25]] },
    ],
    chips: [
      { tone: 0.85, points: [[-2.5, 12], [1, 16], [-2, 21]] },
      { tone: 0.05, points: [[4, 5], [6.5, 10], [3.5, 12]] },
    ],
    shadow: 23,
    acorns: ACORNS.length,
    halo: [
      [-18, -0.5], [-10, -1.5], [-5, -2], [4, -2], [9, -1.5], [17, -0.5], [7, 9], [7, 14], [8, 28], [24, 42], [24, 46],
      [20, 50], [9, 46], [-8, 46], [-20, 50], [-23, 45], [-6, 28], [-7, 14], [-7, 9],
    ],
  },
}

const pointList = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

// A colour on a dark → light ramp; `t` 0 faces away from the sun, 1 straight at it.
function rampColor(ramp: readonly string[], t: number) {
  const at = Math.min(1, Math.max(0, t)) * (ramp.length - 1)
  const low = Math.floor(at)
  return mix(ramp[low], ramp[Math.min(ramp.length - 1, low + 1)], at - low)
}

// One faceted volume: an outer ring, an inner ring pushed towards the sun and a peak, joined by
// triangles. A facet's tone is how far its centre lies towards the light; the cap is brighter, the
// underside darkest, and neighbours alternate a little so every plane stays readable.
function facetedVolume([cx, cy, r]: Clump, turn: number): { outline: string; facets: Facet[] } {
  const ring = (radius: number, ox: number, oy: number, phase: number): Point[] =>
    FACET_JITTER.map((_, i) => {
      const a = (((i * 360) / FACET_SIDES + phase) * Math.PI) / 180
      const rr = radius * FACET_JITTER[(i + turn) % FACET_SIDES]
      return [cx + ox + Math.cos(a) * rr, cy + oy + Math.sin(a) * rr * 0.92]
    })
  const outer = ring(r, 0, 0, turn * 17)
  const inner = ring(r * 0.56, -r * 0.14, -r * 0.2, turn * 17 + 180 / FACET_SIDES)
  const peak: Point = [cx - r * 0.18, cy - r * 0.3]

  const facet = (points: Point[], base: number, gain: number, i: number): Facet => {
    const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length - cx
    const my = points.reduce((sum, p) => sum + p[1], 0) / points.length - cy
    const facing = (mx * KEY_LIGHT[0] + my * KEY_LIGHT[1]) / (Math.hypot(mx, my) || 1)
    return { points: pointList(points), tone: base + gain * facing + (i % 2 ? 0.05 : -0.05) }
  }

  const facets: Facet[] = []
  for (let i = 0; i < FACET_SIDES; i++) {
    const j = (i + 1) % FACET_SIDES
    facets.push(facet([outer[i], outer[j], inner[i]], 0.42, 0.42, i))
    facets.push(facet([inner[i], outer[j], inner[j]], 0.5, 0.38, i + 1))
    facets.push(facet([inner[i], inner[j], peak], 0.74, 0.2, i))
  }
  return { outline: pointList(outer), facets }
}

const OakStage2 = (props: FormProps) => <LowPolyOak {...props} design={LOW_POLY_OAK[2]} />
const OakStage3 = (props: FormProps) => <LowPolyOak {...props} design={LOW_POLY_OAK[3]} />
const OakStage5 = (props: FormProps) => <LowPolyOak {...props} design={LOW_POLY_OAK[5]} />

function LowPolyOak({ g, skin, design }: FormProps & { design: LowPolyOakDesign }) {
  const at =(points: readonly Point[]) => pointList(points.map(([dx, dy]) => [g.x(dx), g.y(dy)] as const))

  // Leaves: cool deep forest green in the creases → balanced emerald → warm lime in the sun.
  const leaf = [
    mix(skin.occlusion, '#06343a', 0.4),
    mix(skin.canopyDark, skin.occlusion, 0.55),
    mix(skin.canopyDark, skin.canopyLight, 0.22),
    mix(skin.canopyLight, '#b6f23c', 0.5),
    mix('#d6f545', SUNLIGHT, 0.3),
  ]
  // Wood: warm amber on the lit face, core bark in front, espresso on the shaded face.
  const woodLit = mix(skin.bark, '#f2b566', 0.55)
  const woodShade = mix(skin.barkDeep, '#2a1a2e', 0.35)
  const wood = (t: number) => rampColor([woodShade, skin.bark, woodLit], t)

  const { rings } = design
  const trunk = rings.slice(1).flatMap(([dy, l, fl, fr, r], i) => {
    const [dy0, l0, fl0, fr0, r0] = rings[i]
    const bump = i % 2 ? -0.08 : 0.06
    // The front ridges dip below the edges at the ground: the base is seen from above.
    const y0 = i === 0 ? dy0 - 2 : dy0
    return [
      { points: at([[l0, dy0], [fl0, y0], [fl, dy], [l, dy]]), fill: wood(0.92 + bump) },
      { points: at([[fl0, y0], [fr0, y0], [fr, dy], [fl, dy]]), fill: wood(0.52 + bump) },
      { points: at([[fr0, y0], [r0, dy0], [r, dy], [fr, dy]]), fill: wood(0.1 + bump) },
    ]
  })
  const plane = ({ tone, points }: Plane) => ({ points: at(points), fill: wood(tone) })
  const volumes = place(g, design.volumes).map((clump, i) => facetedVolume(clump, i))
  // Contact shadow: two flat octagons hugging the base, a touch to the right of the trunk.
  const contact = (rx: number, ry: number) =>
    pointList(FACET_JITTER.map((_, i) => {
      const a = ((i + 0.5) * 2 * Math.PI) / FACET_SIDES
      return [TRUNK_X + 2.5 + Math.cos(a) * rx, GROUND_Y + 1 + Math.sin(a) * ry] as const
    }))

  return (
    <g strokeLinejoin="round">
      <polygon points={contact(design.shadow, design.shadow * 0.29)} fill="#0a2e1a" opacity="0.2" />
      <polygon points={contact(design.shadow * 0.63, design.shadow * 0.18)} fill="#0a2e1a" opacity="0.3" />

      {design.halo && (
        <Halo>
          <polygon points={at(design.halo)} strokeWidth="7" />
        </Halo>
      )}
      {/* Facets carry a hairline of their own colour, so no seam shows between neighbours. */}
      {[...design.limbs.map(plane), ...trunk, ...design.chips.map(plane)].map(({ points, fill }) => (
        <polygon key={points} points={points} fill={fill} stroke={fill} strokeWidth="0.5" />
      ))}

      <Foliage>
        {design.halo && (
          <Halo>
            {volumes.map(({ outline }) => (
              <polygon key={outline} points={outline} strokeWidth="9" />
            ))}
          </Halo>
        )}
        {volumes.map(({ outline, facets }) => (
          <g key={outline}>
            {/* The crease this volume carves into the ones behind it. */}
            <polygon points={outline} fill={leaf[0]} opacity="0.75" transform={`translate(${(1.8 * g.k).toFixed(2)} ${(3.2 * g.k).toFixed(2)})`} />
            <polygon points={outline} fill={leaf[2]} />
            {facets.map(({ points, tone }) => {
              const fill = rampColor(leaf, tone)
              return <polygon key={points} points={points} fill={fill} stroke={fill} strokeWidth="0.5" />
            })}
          </g>
        ))}
        {ACORNS.slice(0, design.acorns).map(([dx, dy]) => {
          const [x, y] = [g.x(dx), g.y(dy)]
          const p =(points: Point[]) => pointList(points.map(([ox, oy]) => [x + ox, y + oy] as const))
          return (
            <g key={dx}>
              <polygon points={p([[0, -2], [3.4, -1], [3, 2.6], [0, 4.6]])} fill="#b45309" />
              <polygon points={p([[0, -2], [-3.4, -1], [-3, 2.6], [0, 4.6]])} fill="#fbbf24" />
              <polygon points={p([[-4, -1], [-2.4, -4], [0, -4.8], [0, -1.6]])} fill="#a8763f" />
              <polygon points={p([[4, -1], [2.4, -4], [0, -4.8], [0, -1.6]])} fill="#6b4423" />
            </g>
          )
        })}
      </Foliage>
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
  const dark = g.golden ? mix(skin.canopyDark, '#eab308', 0.08) : skin.canopyDark
  const light = mix(g.golden ? mix(skin.canopyLight, '#fde047', 0.22) : skin.canopyLight, '#ffffff', 0.12)
  const underside = mix(dark, skin.occlusion, 0.55)
  const mid = mix(dark, light, 0.55)
  const trunkTop = tiers[0][0] + tiers[0][2] - 2

  return (
    <g>
      <Limb d={`M${TRUNK_X} ${GROUND_Y} L${TRUNK_X} ${trunkTop}`} w={6 + 6 * g.k} skin={skin} golden={g.golden} />
      <Foliage>
        {/* Bottom tier first: each tier's scalloped skirt drapes over the one below. */}
        {tiers.map((tier) => {
          const [top, half, h] = tier
          const puffs = tierPuffs(tier)
          return (
            <g key={top}>
              {g.golden && (
                <Halo>
                  <path d={tierPath(tier)} strokeWidth="10" strokeLinejoin="round" />
                  {puffs.map(([x, y, r]) => (
                    <circle key={`g${x}`} cx={x} cy={y} r={r + 5} stroke="none" />
                  ))}
                </Halo>
              )}
              {/* Depth: the tier's occlusion shade thrown down-right onto the tier below. */}
              <g fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={DEPTH}>
                <path d={tierPath(tier)} />
                {puffs.map(([x, y, r]) => (
                  <circle key={`o${x}`} cx={x} cy={y} r={r + 0.6} />
                ))}
              </g>
              <path d={tierPath(tier)} fill={dark} />
              {puffs.map(([x, y, r]) => (
                <g key={`p${x}`}>
                  <circle cx={x} cy={y} r={r} fill={underside} />
                  <circle cx={x - r * 0.1} cy={y - r * 0.18} r={r * 0.78} fill={dark} />
                  <circle cx={x - r * 0.3} cy={y - r * 0.38} r={r * 0.3} fill={mid} />
                </g>
              ))}
              {/* Sunlit left face, a rim light down the left edge and a glint near the apex. */}
              <path
                d={`M${TRUNK_X} ${top + 1} C${TRUNK_X - half * 0.35} ${top + h * 0.35} ${TRUNK_X - half * 0.75} ${top + h * 0.7} ${TRUNK_X - half * 0.9} ${top + h - 2} L${TRUNK_X - half * 0.1} ${top + h - 3} Z`}
                fill={mid}
              />
              <path
                d={`M${TRUNK_X - 0.5} ${top + 1.5} C${TRUNK_X - half * 0.33} ${top + h * 0.36} ${TRUNK_X - half * 0.72} ${top + h * 0.68} ${TRUNK_X - half * 0.86} ${top + h - 3}`}
                stroke={skin.rim}
                strokeWidth="2.2"
                fill="none"
                strokeLinecap="round"
                opacity="0.9"
              />
              <path
                d={`M${TRUNK_X - 1} ${top + 4} C${TRUNK_X - half * 0.22} ${top + h * 0.3} ${TRUNK_X - half * 0.4} ${top + h * 0.5} ${TRUNK_X - half * 0.5} ${top + h * 0.62}`}
                stroke={light}
                strokeWidth="2.6"
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
              <ellipse cx={x + 0.8} cy={y + 1.2} rx="2.6" ry="3.8" fill={skin.occlusion} opacity="0.5" />
              <ellipse cx={x} cy={y} rx="2.6" ry="3.8" fill={g.golden ? '#f59e0b' : skin.bark} />
              <path d={`M${x - 1.8} ${y - 1} h3.6 M${x - 1.8} ${y + 1.2} h3.6`} stroke={skin.barkDeep} strokeWidth="0.8" />
              <path d={`M${x - 1.2} ${y - 2.6} v4`} stroke={shade(skin.bark, 0.45)} strokeWidth="0.9" strokeLinecap="round" />
            </g>
          ))}
        {g.golden && <SparkleStar x={TRUNK_X} y={tiers.at(-1)![0] - 2} r={7} color={MIGHTY_GOLD} />}
      </Foliage>
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
          <path key={dx} d={`M${g.x(dx)} ${g.y(dy)} q3 -4 6 0 q-3 4 -6 0 z`} fill="#fff7c2" />
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
      <Foliage>
        {CHERRY_BLOSSOMS.slice(0, blossoms).map(([dx, dy]) => (
          <Blossom key={`${dx}-${dy}`} x={g.x(dx)} y={g.y(dy)} petal={skin.flower ?? '#fff1f7'} center="#f472b6" r={2.4 + g.k * 0.6} />
        ))}
        {g.stage >= 4 &&
          [[-44, 70], [44, 76], [-8, 100]].map(([dx, dy]) => <SparkleStar key={dx} x={g.x(dx)} y={g.y(dy)} r={3} color="#fff" glow="#f9a8d4" />)}
      </Foliage>
    </g>
  )
}

// ── Willow: a rounded dome with chunky yarn-like weeping tendrils ────────────

const WILLOW_DOME: Design[] = [[0, 84, 16], [-18, 78, 14], [18, 79, 14], [-8, 92, 12], [10, 92, 12], [0, 72, 14]]

function Willow({ g, skin }: FormProps) {
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
      {g.golden && (
        <Halo>
          <path d={t.d} strokeWidth="13" fill="none" />
        </Halo>
      )}
      <path d={t.d} stroke={skin.occlusion} strokeWidth="6.6" transform={DEPTH} opacity={DEPTH_OPACITY} />
      <path d={t.d} stroke={fill} strokeWidth="6.6" />
      <path d={t.d} stroke={skin.rim} strokeWidth="1.8" transform="translate(-1.6 0)" opacity="0.85" />
      <circle cx={t.end[0] + 1} cy={t.end[1] + 1.6} r="4" fill={skin.occlusion} opacity="0.5" />
      <circle cx={t.end[0]} cy={t.end[1]} r="4" fill={fill} />
      <circle cx={t.end[0] - 1.2} cy={t.end[1] - 1.2} r="1.3" fill={skin.rim} />
    </g>
  )
  return (
    <g>
      <Limb d={trunkPath(g, 64, -2, 3)} w={7 + 8 * g.k} skin={skin} golden={g.golden} />
      <Flare g={g} skin={skin} />
      <Foliage>
        {tendrils.filter((t) => !t.front).map((t) => strand(t, mix(skin.canopyDark, skin.occlusion, 0.2)))}
      </Foliage>
      <Canopy clumps={place(g, WILLOW_DOME)} skin={skin} golden={g.golden} />
      <Foliage>{tendrils.filter((t) => t.front).map((t) => strand(t, mix(skin.canopyDark, skin.canopyLight, 0.6)))}</Foliage>
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
      <Foliage>
        {SPORES.slice(0, g.stage * 2 - 2).map(([dx, dy]) => (
          <g key={`${dx}-${dy}`}>
            <circle cx={g.x(dx)} cy={g.y(dy)} r="3.4" fill={skin.glow} opacity="0.35" />
            <circle cx={g.x(dx)} cy={g.y(dy)} r="1.5" fill={skin.flower ?? '#f5d0fe'} />
          </g>
        ))}
      </Foliage>
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
    // The upper edge of the frond catches the sun.
    const up = ny < 0 ? 1 : -1
    const rim = `M${cx} ${cy} Q${mid[0] + nx * half * up * 0.8} ${mid[1] + ny * half * up * 0.8} ${tip[0]} ${tip[1]}`
    return { key: deg, d, rim, mid, tip, fill: mix(i % 2 === 0 ? skin.canopyDark : skin.canopyLight, '#ffffff', i % 2 === 0 ? 0 : 0.08) }
  })
  const nuts = g.stage === 2 ? 0 : g.stage === 3 ? 2 : 3
  const nut = g.golden ? '#d97706' : (skin.fruit ?? '#8a4f22')
  return (
    <g>
      <Limb d={trunk} w={w} skin={skin} golden={g.golden} />
      {rings.map(([x, y]) => (
        <path key={y} d={`M${x - w / 2} ${y} q${w / 2} 3 ${w} 0`} stroke={shade(skin.bark, -0.3)} strokeWidth="2" fill="none" strokeLinecap="round" />
      ))}
      <Foliage>
        {[[-4, 5], [4, 6], [0, 10]].slice(0, nuts).map(([dx, dy]) => (
          <g key={dx}>
            <circle cx={cx + dx + 0.8} cy={cy + dy + 1.2} r="4.6" fill={skin.occlusion} opacity="0.5" />
            <circle cx={cx + dx} cy={cy + dy} r="4.6" fill={nut} />
            <path d={rimArc(cx + dx, cy + dy, 4.6)} stroke={shade(nut, 0.45)} strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <circle cx={cx + dx - 1.4} cy={cy + dy - 1.6} r="1.2" fill="#fff" opacity="0.6" />
          </g>
        ))}
        {fronds.map((f) => (
          <g key={f.key} strokeLinejoin="round" strokeLinecap="round">
            {g.golden && (
              <Halo>
                <path d={f.d} strokeWidth="8" />
              </Halo>
            )}
            <path d={f.d} fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={DEPTH} />
            <path d={f.d} fill={g.golden ? mix(f.fill, '#fde047', 0.15) : f.fill} />
            <path d={f.rim} stroke={skin.rim} strokeWidth="1.8" fill="none" opacity="0.85" />
            <path d={`M${cx} ${cy} Q${f.mid[0]} ${f.mid[1]} ${f.tip[0]} ${f.tip[1]}`} stroke={shade(f.fill, -0.25)} strokeWidth="1.2" fill="none" />
          </g>
        ))}
        <circle cx={cx} cy={cy} r="4" fill={mix(skin.canopyDark, skin.occlusion, 0.4)} />
      </Foliage>
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
      <Foliage>
        {ORANGES.slice(0, fruit).map(([dx, dy]) => (
          <Fruit key={`${dx}-${dy}`} x={g.x(dx)} y={g.y(dy)} r={4 + 2 * g.k} color={g.golden ? '#ffa31a' : (skin.fruit ?? '#ff8a1f')} />
        ))}
        {g.golden && [[-30, 72], [30, 70], [-4, 100]].map(([dx, dy]) => <Blossom key={dx} x={g.x(dx)} y={g.y(dy)} petal={skin.flower ?? '#fff'} r={2.6} />)}
      </Foliage>
    </g>
  )
}

// ── Maple: bold, cut-out autumn leaves in coral and crimson ──────────────────

const MAPLE: Design[] = [
  [0, 44, 15], [-22, 42, 13], [22, 43, 13], [-12, 60, 19], [12, 60, 19],
  [-32, 56, 16], [32, 57, 16], [-22, 76, 18], [22, 77, 18], [0, 86, 20],
]

// A five-pointed maple leaf with deep notches.
function mapleLeaf(x: number, y: number, r: number, rot: number) {
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.52
    points.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M${points.join(' L')} Z`
}

// The leaf's two upper-left points' edges, where the sun catches it.
function mapleRim(x: number, y: number, r: number, rot: number) {
  const pt = (i: number) => {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.52
    return `${(x + Math.cos(a) * rr * 0.92).toFixed(1)} ${(y + Math.sin(a) * rr * 0.92).toFixed(1)}`
  }
  return `M${pt(6)} L${pt(7)} L${pt(8)} L${pt(9)} L${pt(0)}`
}

function Maple({ g, skin }: FormProps) {
  const leaves = place(g, g.stage === 2 ? MAPLE.slice(3, 7) : MAPLE)
    .map(([x, y, r], i) => ({ x, y, r: r * 1.12, rot: ((i * 23) % 40) - 20, fill: i % 3 === 0 ? skin.canopyDark : i % 3 === 1 ? skin.canopyLight : mix(skin.canopyDark, skin.canopyLight, 0.5) }))
    .sort((a, b) => a.y - b.y)
  return (
    <g>
      <Limb d={trunkPath(g, 46)} w={6 + 7 * g.k} skin={skin} golden={g.golden} />
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(36)} q${-10 * g.k} ${-6 * g.k} ${-20 * g.k} ${-18 * g.k}`} w={3.5 + 2 * g.k} skin={skin} golden={g.golden} />}
      {g.stage >= 3 && <Limb d={`M${g.x(0)} ${g.y(40)} q${10 * g.k} ${-5 * g.k} ${20 * g.k} ${-17 * g.k}`} w={3.5 + 2 * g.k} skin={skin} golden={g.golden} />}
      <Flare g={g} skin={skin} />
      <Foliage>
        {g.golden && (
          <Halo>
            {leaves.map((l) => (
              <path key={`g${l.x}-${l.y}`} d={mapleLeaf(l.x, l.y, l.r, l.rot)} strokeWidth="9" strokeLinejoin="round" />
            ))}
          </Halo>
        )}
        <g fill={skin.occlusion} opacity={DEPTH_OPACITY} transform={DEPTH}>
          {leaves.map((l) => (
            <path key={`o${l.x}-${l.y}`} d={mapleLeaf(l.x, l.y, l.r, l.rot)} />
          ))}
        </g>
        {leaves.map((l) => (
          <g key={`l${l.x}-${l.y}`} strokeLinejoin="round" strokeLinecap="round">
            <path d={mapleLeaf(l.x, l.y, l.r, l.rot)} fill={g.golden ? mix(l.fill, '#fbbf24', 0.15) : l.fill} />
            <path d={mapleLeaf(l.x + l.r * 0.1, l.y + l.r * 0.14, l.r * 0.5, l.rot)} fill={mix(l.fill, skin.occlusion, 0.35)} opacity="0.5" />
            <path d={mapleLeaf(l.x - l.r * 0.12, l.y - l.r * 0.16, l.r * 0.55, l.rot)} fill={mix(l.fill, SUNLIGHT, 0.45)} opacity="0.75" />
            <path d={mapleRim(l.x, l.y, l.r, l.rot)} stroke={skin.rim} strokeWidth="1.6" fill="none" opacity="0.85" />
            <path d={`M${l.x} ${l.y + l.r * 0.4} L${l.x} ${l.y - l.r * 0.5} M${l.x} ${l.y} l${-l.r * 0.4} ${-l.r * 0.25} M${l.x} ${l.y} l${l.r * 0.4} ${-l.r * 0.25}`} stroke={shade(l.fill, -0.3)} strokeWidth="1.3" />
          </g>
        ))}
      </Foliage>
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
  const body = mix(g.golden ? mix(skin.canopyLight, '#fde047', 0.18) : skin.canopyLight, '#ffffff', 0.08)
  const shadeSide = mix(mix(body, skin.canopyDark, 0.6), skin.occlusion, 0.25)
  const sun = mix(body, SUNLIGHT, 0.55)
  const { top, w, arms } = CACTUS[g.stage === 5 ? 4 : g.stage]
  const tips: [number, number][] = [[TRUNK_X, top], ...arms.map((a) => a.tip)]
  const flower = skin.flower ?? '#ff5fa2'
  const bodyPath = `M${TRUNK_X - w / 2} ${GROUND_Y} V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${TRUNK_X + w / 2} ${top + w / 2} V${GROUND_Y} Z`

  return (
    <Foliage>
      {/* Golden halo (stage 5), then a depth shade thrown down-right, then the lit body and arms. */}
      {g.golden && (
        <Halo>
          {arms.map((arm) => (
            <path key={`g${arm.d}`} d={arm.d} strokeWidth={arm.w + 10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <rect x={TRUNK_X - w / 2 - 5} y={top - 5} width={w + 10} height={GROUND_Y - top + 5} rx={w / 2 + 5} stroke="none" />
        </Halo>
      )}
      <g opacity={DEPTH_OPACITY} transform={DEPTH}>
        {arms.map((arm) => (
          <path key={`o${arm.d}`} d={arm.d} stroke={skin.occlusion} strokeWidth={arm.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <path d={bodyPath} fill={skin.occlusion} />
      </g>
      {arms.map((arm) => (
        <g key={arm.d}>
          <path d={arm.d} stroke={body} strokeWidth={arm.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={arm.d} stroke={shadeSide} strokeWidth={arm.w * 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${arm.w * 0.22} ${arm.w * 0.1})`} opacity="0.55" />
          <path d={arm.d} stroke={skin.rim} strokeWidth={Math.max(1.4, arm.w * 0.14)} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${-arm.w * 0.3} ${-arm.w * 0.2})`} opacity="0.8" />
        </g>
      ))}
      <path d={bodyPath} fill={body} />
      <rect x={TRUNK_X + w * 0.08} y={top + 3} width={w * 0.38} height={GROUND_Y - top - 5} rx={w * 0.19} fill={shadeSide} opacity="0.65" />
      <rect x={TRUNK_X - w * 0.36} y={top + 4} width={w * 0.16} height={GROUND_Y - top - 12} rx={w * 0.08} fill={sun} />
      <path d={rimArc(TRUNK_X, top + w / 2, w / 2, 190, 320)} stroke={skin.rim} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.9" />
      {[-w / 4, w / 4].map((dx) => (
        <path key={dx} d={`M${TRUNK_X + dx} ${top + 6} V${GROUND_Y - 3}`} stroke={shade(body, -0.28)} strokeWidth="1.1" opacity="0.5" />
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
    </Foliage>
  )
}

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
  const shards = picked.map(([dx, dy, len, w, deg], i) => ({ key: `${dx}:${deg}`, hue: PRISM[i % PRISM.length], ...shard(g.x(dx), g.y(dy), len * g.k, g.r(w), deg) }))
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
      <Backglow id={`${id}g`} cx={core[0]} cy={core[1]} r={g.r(44)} stops={PRISM_GLOW} />
      {/* A crystal stalk instead of wood. */}
      <g opacity="0.94">
        <Limb d={trunkPath(g, 42)} w={5 + 5 * g.k} skin={skin} golden={g.golden} />
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
  const radius = g.r(34)
  const arms = g.stage === 2 ? 1 : g.stage === 3 ? 2 : 3
  const tint = (c: string) => (g.golden ? mix(c, '#fde047', 0.15) : c)
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
      <Limb d={trunk} w={w} skin={skin} golden={g.golden} />
      {/* A silver vein up the obsidian. */}
      <path d={trunk} stroke={skin.rim} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" transform={`translate(${-w * 0.08} 0)`} />
      {g.stage >= 3 && <Limb d={`M${g.x(6)} ${g.y(36)} Q${g.x(22)} ${g.y(40)} ${g.x(26)} ${g.y(54)}`} w={w * 0.5} skin={skin} golden={g.golden} />}
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

const CHRONO_KNOT: Design[] = [[0, 86, 10], [-13, 80, 9], [13, 81, 9]]
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
  const spots = g.stage === 2 ? [-18, -9, 0, 9, 18] : [-36, -30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30, 36]
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
      <Limb d={trunkPath(g, 62, 3, -4)} w={w} skin={skin} golden={g.golden} />
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
      {g.stage >= 3 && <Limb d={`M${g.x(2)} ${g.y(56)} Q${g.x(-16)} ${g.y(76)} ${g.x(-34)} ${g.y(68)}`} w={3 + 2.5 * g.k} skin={skin} golden={g.golden} />}
      {g.stage >= 3 && <Limb d={`M${g.x(3)} ${g.y(58)} Q${g.x(18)} ${g.y(78)} ${g.x(34)} ${g.y(68)}`} w={3 + 2.5 * g.k} skin={skin} golden={g.golden} />}
      <Flare g={g} skin={skin} />
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
      <Canopy clumps={place(g, CHRONO_KNOT)} skin={skin} golden={g.golden} />
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
  crystal: Crystal,
  nebula: Nebula,
  chrono: Chrono,
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

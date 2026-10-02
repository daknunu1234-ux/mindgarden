// Low-poly tree kit: the shared pieces every tree sprite is built from. Crowns are overlapping
// faceted volumes, trunks and limbs chiselled prisms, fruit and flowers small cut solids. Every plane
// is a flat fill picked by how much it faces one key light (upper left): no gradients, no filters.
// Pure markup and pure maths (no hooks), so any number render on one page or on the server.
import type { ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import type { TreeSkin } from '@/shared/lib/treeSkins'
import { TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X } from '../lib/plotSprite'

// ── Geometry ─────────────────────────────────────────────────────────────────

export type GrownStage = 2 | 3 | 4 | 5

// Growth scale per stage (stage 5 is stage 4's size, with a fuller crown dressed in gold).
const GROWTH: Record<GrownStage, number> = { 2: 0.52, 3: 0.76, 4: 1, 5: 1 }

// Design space: dx right of the trunk, dy up from the ground; `x` / `y` map it into the view at scale k.
// `r` grows radii less than positions, so saplings get chunkier, cuter shapes.
export type Geo = { stage: GrownStage; k: number; golden: boolean; x: (dx: number) => number; y: (dy: number) => number; r: (r: number) => number }

export function geo(stage: GrownStage): Geo {
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

export type FormProps = { g: Geo; skin: TreeSkin }
export type Point = readonly [number, number]
export type Clump = readonly [x: number, y: number, radius: number] // view space
export type Design = readonly [dx: number, dy: number, radius: number] // design space

export const place = (g: Geo, clumps: readonly Design[]): Clump[] => clumps.map(([dx, dy, r]) => [g.x(dx), g.y(dy), g.r(r)])

export const pointList = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

// ── Light ────────────────────────────────────────────────────────────────────

export const SUNLIGHT = '#fff6c8'
export const GOLD_HALO = '#fbbf24'
// Unit vector towards the sun in screen space (up and to the left).
export const KEY_LIGHT: Point = [-0.6, -0.8]
// The contact shadow's daylight tint: the deep grass tone the farm grounds everything with. On the
// farm its colour follows the light (`.mg-contact-soft` in globals.css: midnight blue at night).
const CONTACT = '#14280f'

// A colour on a dark → light ramp; `t` 0 faces away from the sun, 1 straight at it.
export function rampColor(ramp: readonly string[], t: number) {
  const at = Math.min(1, Math.max(0, t)) * (ramp.length - 1)
  const low = Math.floor(at)
  return mix(ramp[low], ramp[Math.min(ramp.length - 1, low + 1)], at - low)
}

// The two sunlit tones of a crown (lit facet, brightest facet) and the cool tone of its creases.
export type Sun = { lit: string; peak: string; deep: string }
// Green leaves: chartreuse / golden-lime in the sun, so they stand out from the meadow turf.
export const GREEN_SUN: Sun = { lit: '#b6f23c', peak: '#d6f545', deep: '#06343a' }

// Leaves, crease → sun: cool deep tone, shaded, core colour, sunlit, brightest.
export const leafRamp = (skin: TreeSkin, sun: Sun = GREEN_SUN): string[] => [
  mix(skin.occlusion, sun.deep, 0.4),
  mix(skin.canopyDark, skin.occlusion, 0.55),
  mix(skin.canopyDark, skin.canopyLight, 0.22),
  mix(skin.canopyLight, sun.lit, 0.5),
  mix(sun.peak, SUNLIGHT, 0.3),
]

// Wood: espresso on the shaded face, core bark in front, warm amber on the lit face.
export const woodRamp = (skin: TreeSkin, lit = '#f2b566', deep = '#2a1a2e'): string[] => [mix(skin.barkDeep, deep, 0.35), skin.bark, mix(skin.bark, lit, 0.55)]

// The stage-5 halo is one translucent group, so overlapping shapes merge into a single soft glow.
export const Halo = ({ children }: { children: ReactNode }) => (
  <g opacity="0.5" fill={GOLD_HALO} stroke={GOLD_HALO}>
    {children}
  </g>
)

// Crown group that bobs a beat behind the tree's sway (globals.css `.mg-foliage`).
export const Foliage = ({ children }: { children: ReactNode }) => <g className="mg-foliage">{children}</g>

// A flat facet. It carries a hairline of its own colour, so no seam shows between neighbours.
export const Facet = ({ points, fill }: { points: readonly Point[] | string; fill: string }) => (
  <polygon points={typeof points === 'string' ? points : pointList(points)} fill={fill} stroke={fill} strokeWidth="0.5" />
)

// ── Ground ───────────────────────────────────────────────────────────────────

// Contact shadow: two flat octagons hugging the base, a touch to the right of the trunk (sun from the
// left). `w` = its half-width in view units; it grows with the crown.
export function ContactShadow({ w }: { w: number }) {
  const ring = (rx: number, ry: number) =>
    pointList(
      Array.from({ length: 8 }, (_, i) => {
        const a = ((i + 0.5) * Math.PI) / 4
        return [TRUNK_X + w * 0.1 + Math.cos(a) * rx, GROUND_Y + 1 + Math.sin(a) * ry] as const
      }),
    )
  return (
    <g>
      <polygon points={ring(w, w * 0.29)} fill={CONTACT} opacity="0.2" className="mg-contact-soft" />
      <polygon points={ring(w * 0.63, w * 0.18)} fill={CONTACT} opacity="0.3" className="mg-contact-soft" />
    </g>
  )
}

// ── Crown volumes ────────────────────────────────────────────────────────────

// Uneven ring radii, so a volume reads as a cut stone rather than a ball.
const FACET_JITTER = [1, 0.9, 1.04, 0.93, 1.02, 0.88, 1, 0.95]

type Tone = { points: string; tone: number }
type Volume = { outline: string; facets: Tone[]; glint: string }

// One faceted volume: an outer ring, an inner ring pushed towards the sun and a peak, joined by
// triangles. A facet's tone is how far its centre lies towards the light; the cap is brighter, the
// underside darkest, and neighbours alternate a little so every plane stays readable. Small volumes
// take six sides, big ones eight. `squash` flattens it (bonsai pads).
export function facetedVolume([cx, cy, r]: Clump, turn: number, squash = 0.92): Volume {
  const sides = r >= 15 ? 8 : 6
  const ring = (radius: number, ox: number, oy: number, phase: number): Point[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = (((i * 360) / sides + phase) * Math.PI) / 180
      const rr = radius * FACET_JITTER[(i + turn) % FACET_JITTER.length]
      return [cx + ox + Math.cos(a) * rr, cy + oy + Math.sin(a) * rr * squash]
    })
  const outer = ring(r, 0, 0, turn * 17)
  const inner = ring(r * 0.56, -r * 0.14, -r * 0.2 * squash, turn * 17 + 180 / sides)
  const peak: Point = [cx - r * 0.18, cy - r * 0.3 * squash]

  const facet = (points: Point[], base: number, gain: number, i: number): Tone => {
    const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length - cx
    const my = points.reduce((sum, p) => sum + p[1], 0) / points.length - cy
    const facing = (mx * KEY_LIGHT[0] + my * KEY_LIGHT[1]) / (Math.hypot(mx, my) || 1)
    return { points: pointList(points), tone: base + gain * facing + (i % 2 ? 0.05 : -0.05) }
  }

  const facets: Tone[] = []
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    facets.push(facet([outer[i], outer[j], inner[i]], 0.42, 0.42, i))
    facets.push(facet([inner[i], outer[j], inner[j]], 0.5, 0.38, i + 1))
    facets.push(facet([inner[i], inner[j], peak], 0.74, 0.2, i))
  }
  // A small specular chip on the sunny shoulder.
  const glint = pointList([
    [cx - r * 0.46, cy - r * 0.36 * squash],
    [cx - r * 0.26, cy - r * 0.56 * squash],
    [cx - r * 0.22, cy - r * 0.34 * squash],
  ])
  return { outline: pointList(outer), facets, glint }
}

// A crown: faceted volumes drawn back to front. Each casts a crease (the species' occlusion shade,
// thrown down-right) onto the ones behind it and carries a rim-light chip; stage 5 wraps the whole
// crown in a soft golden halo. `children` (fruit, blossoms…) ride in the same swaying group.
export function Crown({ g, skin, volumes, ramp, squash, children }: FormProps & { volumes: readonly Design[]; ramp: readonly string[]; squash?: number; children?: ReactNode }) {
  const built = place(g, volumes).map((clump, i) => facetedVolume(clump, i, squash))
  const crease = `translate(${(1.8 * g.k).toFixed(2)} ${(3.2 * g.k).toFixed(2)})`
  return (
    <Foliage>
      {g.golden && (
        <Halo>
          {built.map(({ outline }, i) => (
            <polygon key={i} points={outline} strokeWidth="9" />
          ))}
        </Halo>
      )}
      {built.map(({ outline, facets, glint }, i) => (
        <g key={i}>
          <polygon points={outline} fill={skin.occlusion} opacity="0.72" transform={crease} />
          <polygon points={outline} fill={ramp[2]} />
          {facets.map(({ points, tone }, j) => (
            <Facet key={j} points={points} fill={rampColor(ramp, tone)} />
          ))}
          <polygon points={glint} fill={skin.rim} opacity="0.85" className="mg-glint" />
        </g>
      ))}
      {children}
    </Foliage>
  )
}

// A full crown for a stage: its own volumes, or at stage 5 the mature crown swollen a little with
// extra masses behind it (they show above and beside it), so the mastered tree is the biggest.
export type CrownPlan = { 2: readonly Design[]; 3: readonly Design[]; 4: readonly Design[]; extra: readonly Design[] }
export const crownFor = (plan: CrownPlan, stage: GrownStage): readonly Design[] =>
  stage === 5 ? [...plan.extra, ...plan[4].map(([dx, dy, r]) => [dx, dy, r * 1.07] as const)] : plan[stage]

// ── Prisms: trunks, limbs, strands ───────────────────────────────────────────

// A point along a limb's centreline with its half-width there (design space).
export type LimbNode = readonly [dx: number, dy: number, halfWidth: number]

type Vec = { x: number; y: number }

// A chiselled prism along a centreline: per segment a lit face, a front face and a shaded face, with
// sharp ridges between them. The lit side is the one facing the key light where the limb starts and
// stays on that side all the way up, so a bending limb never twists. `foot` dips the front ridges
// under the ground line (the base is seen from above); `cap` closes the far end with a low pyramid.
export function prism(g: Geo, nodes: readonly LimbNode[], { foot = false, cap = false }: { foot?: boolean; cap?: boolean } = {}) {
  const c = nodes.map(([dx, dy, hw]) => ({ x: g.x(dx), y: g.y(dy), hw: g.r(hw) }))
  const normals: Vec[] = []
  c.forEach((p, i) => {
    const a = c[Math.max(0, i - 1)]
    const b = c[Math.min(c.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    let n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
    const facing = i === 0 ? n.x * KEY_LIGHT[0] + n.y * KEY_LIGHT[1] : n.x * normals[i - 1].x + n.y * normals[i - 1].y
    if (facing < 0) n = { x: -n.x, y: -n.y }
    normals.push(n)
  })
  // Across the limb at node i: −1 = the shaded edge … +1 = the lit edge.
  const at = (i: number, side: number, drop = 0): Point => [c[i].x + normals[i].x * c[i].hw * side, c[i].y + normals[i].y * c[i].hw * side + drop]
  const faces: { points: Point[]; tone: number }[] = []
  for (let i = 0; i < c.length - 1; i++) {
    const dip = foot && i === 0 ? 2 * g.k : 0
    const bump = i % 2 ? -0.08 : 0.06
    faces.push({ points: [at(i, 1), at(i, 0.4, dip), at(i + 1, 0.4), at(i + 1, 1)], tone: 0.92 + bump })
    faces.push({ points: [at(i, 0.4, dip), at(i, -0.45, dip), at(i + 1, -0.45), at(i + 1, 0.4)], tone: 0.52 + bump })
    faces.push({ points: [at(i, -0.45, dip), at(i, -1), at(i + 1, -1), at(i + 1, -0.45)], tone: 0.1 + bump })
  }
  const last = c.length - 1
  const outline: Point[] = [...c.map((_, i) => at(i, 1)), ...c.map((_, i) => at(last - i, -1))]
  let tip: Point = [c[last].x, c[last].y]
  if (cap) {
    const a = c[last - 1]
    const len = Math.hypot(c[last].x - a.x, c[last].y - a.y) || 1
    tip = [c[last].x + ((c[last].x - a.x) / len) * c[last].hw * 0.85, c[last].y + ((c[last].y - a.y) / len) * c[last].hw * 0.85]
    faces.push({ points: [at(last, 1), at(last, 0.4), tip], tone: 1 })
    faces.push({ points: [at(last, 0.4), at(last, -0.45), tip], tone: 0.62 })
    faces.push({ points: [at(last, -0.45), at(last, -1), tip], tone: 0.18 })
    outline.splice(c.length, 0, tip)
  }
  return { faces, outline, tip }
}

// A trunk, branch or strand as a prism in the tones of `ramp`; stage 5 adds the halo behind it.
export function Limb({ g, nodes, ramp, foot, cap, dim = 1 }: { g: Geo; nodes: readonly LimbNode[]; ramp: readonly string[]; foot?: boolean; cap?: boolean; dim?: number }) {
  const { faces, outline } = prism(g, nodes, { foot, cap })
  return (
    <g>
      {g.golden && (
        <Halo>
          <polygon points={pointList(outline)} strokeWidth="7" />
        </Halo>
      )}
      {faces.map(({ points, tone }, i) => (
        <Facet key={i} points={points} fill={rampColor(ramp, tone * dim)} />
      ))}
    </g>
  )
}

// A straight-ish trunk from the ground up to `top`, flaring at the root and again under the crown.
export const trunkNodes = (top: number, hw: number, lean = 0): LimbNode[] => [
  [0, 0, hw * 1.45],
  [lean * 0.2, top * 0.3, hw],
  [lean * 0.7, top * 0.64, hw * 0.94],
  [lean, top, hw * 1.15],
]

// Root wedges at the base of a trunk of half-width `hw` (design units): lit on the left, shaded on
// the right, with a lit chisel chip and a cut on the trunk's front face.
export function Roots({ g, hw, ramp }: { g: Geo; hw: number; ramp: readonly string[] }) {
  const w = g.r(hw)
  const p = (points: Point[]) => points.map(([x, y]) => [TRUNK_X + x * w, GROUND_Y - y * g.k] as const)
  return (
    <g>
      {g.golden && (
        <Halo>
          <polygon points={pointList(p([[-2.3, -0.5], [-0.9, 9], [0.9, 9], [2.3, -0.5]]))} strokeWidth="7" />
        </Halo>
      )}
      <Facet points={p([[-0.9, 9], [-2.3, -0.5], [-1.3, -1.5]])} fill={rampColor(ramp, 0.8)} />
      <Facet points={p([[-0.9, 9], [-1.3, -1.5], [-0.6, -2]])} fill={rampColor(ramp, 0.6)} />
      <Facet points={p([[0.9, 9], [2.3, -0.5], [1.3, -1.5]])} fill={rampColor(ramp, 0)} />
      <Facet points={p([[0.9, 9], [1.3, -1.5], [0.6, -2]])} fill={rampColor(ramp, 0.3)} />
    </g>
  )
}

// Chisel marks on a trunk's front face: one lit chip and one cut.
export function Chips({ g, hw, ramp }: { g: Geo; hw: number; ramp: readonly string[] }) {
  const w = g.r(hw)
  const p = (points: Point[]) => points.map(([x, y]) => [TRUNK_X + x * w, GROUND_Y - y * g.k] as const)
  return (
    <g>
      <Facet points={p([[-0.32, 12], [0.12, 16], [-0.26, 21]])} fill={rampColor(ramp, 0.85)} />
      <Facet points={p([[0.5, 5], [0.82, 10], [0.44, 12]])} fill={rampColor(ramp, 0.05)} />
    </g>
  )
}

// ── Cut solids: fruit, nuts, flowers ─────────────────────────────────────────

// A faceted solid (fruit, nut, cone, bead): a hexagon cut into six planes round an off-centre peak,
// bright towards the sun and deep away from it, with a small white chip. `occlusion` is the shade it
// drops onto the leaves behind it.
export function Solid({ x, y, rx, ry = rx, color, occlusion }: { x: number; y: number; rx: number; ry?: number; color: string; occlusion?: string }) {
  const rim: Point[] = [
    [x, y - ry],
    [x + rx * 0.87, y - ry * 0.46],
    [x + rx * 0.87, y + ry * 0.46],
    [x, y + ry],
    [x - rx * 0.87, y + ry * 0.46],
    [x - rx * 0.87, y - ry * 0.46],
  ]
  const peak: Point = [x - rx * 0.16, y - ry * 0.18]
  const tones = [shade(color, 0.16), shade(color, -0.2), shade(color, -0.4), shade(color, -0.28), color, mix(color, SUNLIGHT, 0.62)]
  return (
    <g>
      {occlusion && <polygon points={pointList(rim.map(([px, py]) => [px + rx * 0.2, py + ry * 0.32] as const))} fill={occlusion} opacity="0.5" />}
      {rim.map((p, i) => (
        <Facet key={i} points={[p, rim[(i + 1) % rim.length], peak]} fill={tones[i]} />
      ))}
      <polygon points={pointList([[x - rx * 0.5, y - ry * 0.36], [x - rx * 0.24, y - ry * 0.6], [x - rx * 0.2, y - ry * 0.3]])} fill="#ffffff" opacity="0.85" />
    </g>
  )
}

// A five-petal blossom of kite-shaped facets round a cut heart; petals facing the sun are brighter.
export function Blossom({ x, y, r, petal, center = '#facc15' }: { x: number; y: number; r: number; petal: string; center?: string }) {
  const at = (deg: number, radius: number): Point => [x + Math.cos((deg * Math.PI) / 180) * radius, y + Math.sin((deg * Math.PI) / 180) * radius]
  return (
    <g>
      {[0, 72, 144, 216, 288].map((step) => {
        const deg = step - 90
        const [px, py] = at(deg, 1)
        const facing = (px - x) * KEY_LIGHT[0] + (py - y) * KEY_LIGHT[1]
        return <Facet key={step} points={[[x, y], at(deg - 30, r * 0.8), at(deg, r * 1.3), at(deg + 30, r * 0.8)]} fill={facing > 0.2 ? mix(petal, '#ffffff', 0.35) : facing > -0.4 ? petal : shade(petal, -0.16)} />
      })}
      <Facet points={[at(-90, r * 0.42), at(-18, r * 0.42), at(54, r * 0.42), at(126, r * 0.42), at(198, r * 0.42)]} fill={center} />
    </g>
  )
}

// A flat diamond chip (sparkle, spore, spine, fleck).
export const Chip = ({ x, y, r, color, opacity }: { x: number; y: number; r: number; color: string; opacity?: number }) => (
  <polygon points={pointList([[x, y - r], [x + r * 0.7, y], [x, y + r], [x - r * 0.7, y]])} fill={color} opacity={opacity} />
)

// A leaf blade (palm frond, sprout leaf, needle) from `from` to `to`, `half` wide at its belly: the
// upper plane catches the sun, the lower one is in shade. `lift` bows it upwards.
export function Blade({ from, to, half, light, dark, occlusion, lift = 0.12 }: { from: Point; to: Point; half: number; light: string; dark: string; occlusion?: string; lift?: number }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  let n: Point = [-(to[1] - from[1]) / len, (to[0] - from[0]) / len]
  if (n[1] > 0) n = [-n[0], -n[1]]
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - len * lift]
  const up: Point = [mid[0] + n[0] * half, mid[1] + n[1] * half]
  const down: Point = [mid[0] - n[0] * half, mid[1] - n[1] * half]
  return (
    <g>
      {occlusion && <polygon points={pointList([from, up, to, down])} fill={occlusion} opacity="0.6" transform="translate(1.4 2.4)" />}
      <Facet points={[from, up, to, mid]} fill={light} />
      <Facet points={[from, mid, to, down]} fill={dark} />
    </g>
  )
}

export const bladeOutline = (from: Point, to: Point, half: number, lift = 0.12): string => {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  const n: Point = [-(to[1] - from[1]) / len, (to[0] - from[0]) / len]
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - len * lift]
  return pointList([from, [mid[0] + n[0] * half, mid[1] + n[1] * half], to, [mid[0] - n[0] * half, mid[1] - n[1] * half]])
}

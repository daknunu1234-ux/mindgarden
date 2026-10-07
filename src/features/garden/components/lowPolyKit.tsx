// Faceted low-poly solids for the island's buildings (pure markup, no hooks). One key light from the
// upper left, as for the trees and the props: every plane is a flat fill whose tone depends on which
// way it faces (lit left faces, shaded right faces, brightest tops). No outlines, no gradients, no
// filters, so hundreds of planes stay cheap to paint. Coordinates are screen pixels around a
// building's ground point; "up" is −y.
import type { ReactNode } from 'react'
import { shade } from '@/shared/lib/color'

export type Pt = [number, number]

export const pts = (...points: Pt[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

// One flat plane. It carries a hairline of its own colour, so no seam shows between planes.
export const Face = ({ at, fill, opacity, className }: { at: Pt[]; fill: string; opacity?: number; className?: string }) => (
  <polygon points={pts(...at)} fill={fill} stroke={fill} strokeWidth={0.6} strokeLinejoin="round" opacity={opacity} className={className} />
)

// A soft contact shadow under a building (its colour follows the farm's light: `.mg-contact`).
export const Contact = ({ rx, ry, dx = 6 }: { rx: number; ry: number; dx?: number }) => (
  <ellipse cx={dx} cy={4} rx={rx} ry={ry} fill="rgba(20, 40, 15, 0.35)" className="mg-contact" />
)

// The tone a plane takes from the key light: `facing` is −1 (towards the light, upper left) … 1 (away).
export const lit = (base: string, facing: number) => shade(base, facing <= 0 ? -facing * 0.32 : -facing * 0.36)

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const up = (p: Pt, h: number): Pt => [p[0], p[1] - h]

// An isometric block: footprint half-extents `a` (along x, down-right) and `b` (along y, down-left)
// in screen pixels at the iso ratio, `h` tall, its base centred on `at`. Left face lit, right shaded.
// The four ground corners of an iso block (north, east, south, west), iso 2:1: along x = (a, a/2),
// along y = (−b, b/2). Pure, tested.
export function isoCorners(at: Pt, a: number, b: number): [Pt, Pt, Pt, Pt] {
  return [add(at, [-a + b, -(a + b) / 2]), add(at, [a + b, (a - b) / 2]), add(at, [a - b, (a + b) / 2]), add(at, [-a - b, (b - a) / 2])]
}

export function IsoBox({ at = [0, 0], a, b, h, color, top }: { at?: Pt; a: number; b: number; h: number; color: string; top?: string }) {
  const [n, e, s, w] = isoCorners(at, a, b)
  return (
    <g>
      <Face at={[w, s, up(s, h), up(w, h)]} fill={lit(color, -0.6)} />
      <Face at={[s, e, up(e, h), up(s, h)]} fill={lit(color, 0.7)} />
      <Face at={[up(n, h), up(e, h), up(s, h), up(w, h)]} fill={top ?? lit(color, -1)} />
    </g>
  )
}

// The points round an ellipse (rx, ry) centred on `c`, starting at the right and going clockwise on
// screen (down first), `n` of them.
const ring = (c: Pt, rx: number, ry: number, n: number, phase = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = phase + (i / n) * Math.PI * 2
    return [c[0] + rx * Math.cos(t), c[1] + ry * Math.sin(t)] as Pt
  })

// A faceted cylinder (or a tapering tower: `taper` < 1 narrows the top): `facets` flat sides, only the
// ones facing the viewer drawn, each lit by how far it turns from the light; a flat top cap.
export function Cylinder({
  at = [0, 0],
  rx,
  ry,
  h,
  taper = 1,
  facets = 8,
  color,
  cap,
  bands = [],
}: {
  at?: Pt
  rx: number
  ry: number
  h: number
  taper?: number
  facets?: number
  color: string
  cap?: string
  // Rings drawn round it (e.g. gold boiler bands): heights 0..1 up the side, with their colour.
  bands?: { t: number; color: string; width?: number }[]
}) {
  const phase = Math.PI / facets
  const base = ring(at, rx, ry, facets, phase)
  const topC = up(at, h)
  const top = ring(topC, rx * taper, ry * taper, facets, phase)
  const sides: ReactNode[] = []
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets
    const mid = phase + ((i + 0.5) / facets) * Math.PI * 2
    // Facing the viewer: the lower half of the ellipse.
    if (Math.sin(mid) <= 0) continue
    sides.push(<Face key={i} at={[base[i], base[j], top[j], top[i]]} fill={lit(color, Math.cos(mid))} />)
    for (const band of bands) {
      const k = band.t
      const w = band.width ?? 0.06
      const lo = (p: Pt, q: Pt): Pt => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
      const hi = (p: Pt, q: Pt): Pt => [p[0] + (q[0] - p[0]) * (k + w), p[1] + (q[1] - p[1]) * (k + w)]
      sides.push(<Face key={`${i}-${k}`} at={[lo(base[i], top[i]), lo(base[j], top[j]), hi(base[j], top[j]), hi(base[i], top[i])]} fill={lit(band.color, Math.cos(mid))} />)
    }
  }
  return (
    <g>
      {sides}
      <Face at={top} fill={cap ?? lit(color, -0.9)} />
    </g>
  )
}

// A faceted cone (a tower roof): its base ellipse at `at`, its tip `h` above; front facets only.
export function Cone({ at = [0, 0], rx, ry, h, facets = 8, color }: { at?: Pt; rx: number; ry: number; h: number; facets?: number; color: string }) {
  const phase = Math.PI / facets
  const base = ring(at, rx, ry, facets, phase)
  const tip = up(at, h)
  // The back facets show too where the cone is wide (behind the tip): drawn first, darker; then the
  // front ones over them.
  const faces = Array.from({ length: facets }, (_, i) => {
    const j = (i + 1) % facets
    const mid = phase + ((i + 0.5) / facets) * Math.PI * 2
    const front = Math.sin(mid) > 0
    return { front, node: <Face key={i} at={[base[i], base[j], tip]} fill={lit(color, front ? Math.cos(mid) : 0.2 - Math.cos(mid) * 0.3)} /> }
  })
  return (
    <g>
      {faces.filter((f) => !f.front).map((f) => f.node)}
      {faces.filter((f) => f.front).map((f) => f.node)}
    </g>
  )
}

// A gable roof over an iso block (ridge along x): two slopes, lit left / shaded right, and the
// triangular gable end facing the viewer. `at` is the top of the block's walls, centred.
export function GableRoof({ at, a, b, rise, color, overhang = 6 }: { at: Pt; a: number; b: number; rise: number; color: string; overhang?: number }) {
  const A = a + overhang
  const B = b + overhang
  const n: Pt = add(at, [-A + B, -(A + B) / 2])
  const e: Pt = add(at, [A + B, (A - B) / 2])
  const s: Pt = add(at, [A - B, (A + B) / 2])
  const w: Pt = add(at, [-A - B, (B - A) / 2])
  // The ridge runs between the middles of the two short (y) ends.
  const r0: Pt = up([(n[0] + w[0]) / 2, (n[1] + w[1]) / 2], rise)
  const r1: Pt = up([(e[0] + s[0]) / 2, (e[1] + s[1]) / 2], rise)
  return (
    <g>
      <Face at={[n, e, r1, r0]} fill={lit(color, 0.2)} />
      <Face at={[w, s, r1, r0]} fill={lit(color, -0.7)} />
      <Face at={[s, e, r1]} fill={lit(color, 0.8)} />
    </g>
  )
}

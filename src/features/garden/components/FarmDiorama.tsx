// The farm as a floating tropical island diorama: turquoise ocean with a glowing lagoon and swelling
// rings, the island's sandy beach, saturated grass grid, layered cliff (grass lip, terracotta
// topsoil, deep soil, stone) and rocky underside, palms, distant islets and drifting clouds.
// Pure SVG / HTML markup, no hooks; geometry from lib/diorama.ts (tested). Animations are the
// `.mg-*` classes in globals.css (off for reduced motion).
import { memo, type CSSProperties } from 'react'
import { shade } from '@/shared/lib/color'
import { seededRandom } from '@/shared/utils/seededRandom'
import {
  BEACH_TILES,
  cliffFaces,
  distantIslets,
  distantKarsts,
  grassDetails,
  islandCorners,
  KARST_HEIGHT,
  undersidePoints,
  type CliffBandId,
  type KarstKind,
  type Pt,
} from '../lib/diorama'
import { GRID_SIZE } from '../lib/farmGrid'
import { footprintPoints } from './FarmStructures'
import { Waves } from './FarmScenery'
import { Blade, Blossom, Solid } from './treeKit'

// Tropical palette (lit left face / shaded right face). The turf is a warm, fresh meadow green
// checkerboard, low in contrast (the pattern is a hint, the turf reads as one lawn), so trees and everything placed on it still stand out.
export const TROPIC = {
  ink: '#3b1f0e',
  grassA: '#82cb52',
  grassB: '#74bb47',
  grassEdge: '#44802c',
  // Hairline between tiles: keeps the grid readable without competing with what stands on it.
  grassSeam: 'rgba(45, 85, 25, 0.08)',
  // Warm golden sand: the dry beach inland, the damper strip at the waterline.
  sandDry: '#f4d06f',
  sandWet: '#e0b850',
  foam: '#ffffff',
  lagoon: '#7ff0e6',
} as const

// The island's foundation, cut from rock: a pale bevel under the beach rim, then stone darkening
// with depth. The left face catches the sun (warm slate greys); the right face is in shade (cool
// charcoal browns), so the island reads as raised above the sea without pulling the eye from the farm.
const BANDS: Record<CliffBandId, { left: string; right: string }> = {
  lip: { left: '#c2b9a8', right: '#8a8275' },
  topsoil: { left: '#958c80', right: '#5e564f' },
  soil: { left: '#80776d', right: '#4c4540' },
  stone: { left: '#6b645d', right: '#3c3633' },
}
// The rock under the cliff, tapering to the keel: lit and shaded planes, darkest at the bottom.
const UNDERSIDE = { left: ['#5a534e', '#4a4440'], right: ['#3a3431', '#2e2927'] } as const

type Vars = CSSProperties & Record<`--mg-${string}`, string>

const pts = (points: readonly Pt[], o: Pt) => points.map((p) => `${(p.x + o.x).toFixed(1)},${(p.y + o.y).toFixed(1)}`).join(' ')

const between = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

// A flat plane of terrain. It carries a hairline of its own colour, so no seam shows between planes.
const Plane = ({ at, origin, fill }: { at: readonly Pt[]; origin: Pt; fill: string }) => <polygon points={pts(at, origin)} fill={fill} stroke={fill} strokeWidth={0.7} />

// How many facets each cliff face and each side of the beach is cut into along its length.
const CLIFF_CUTS = 14
const BEACH_CUTS = 8

// The cliff, chiselled: every stratum of both front faces is cut into triangles whose shared corners
// zigzag from one stratum to the next, so the rock breaks into angular planes. Each plane is a little
// lighter or darker than its neighbours. The rim under the beach and the edge above the underside
// stay straight, so they meet the sand and the keel exactly.
function CliffFacets({ origin }: { origin: Pt }) {
  const faces = cliffFaces()
  return (
    <g>
      {(['left', 'right'] as const).map((side) => {
        const bands = faces.filter((f) => f.side === side)
        // Boundary lines, top to bottom: [start, end] of the rim, then of each stratum's lower edge.
        const lines: [Pt, Pt][] = [[bands[0].points[0], bands[0].points[1]], ...bands.map((f): [Pt, Pt] => [f.points[3], f.points[2]])]
        const corner = (level: number, i: number): Pt => {
          const straight = level === 0 || level === lines.length - 1 || i === 0 || i === CLIFF_CUTS
          const shift = straight ? 0 : (i + level) % 2 ? 0.3 : -0.3
          return between(lines[level][0], lines[level][1], (i + shift) / CLIFF_CUTS)
        }
        return bands.map((f, level) =>
          Array.from({ length: CLIFF_CUTS }, (_, i) => {
            const [a, b, c, d] = [corner(level, i), corner(level, i + 1), corner(level + 1, i + 1), corner(level + 1, i)]
            const base = BANDS[f.band][side]
            const vary = (((i * 7 + level * 3) % 3) - 1) * 0.045
            const flip = (i + level) % 2 === 0
            return (
              <g key={`${side}-${f.band}-${i}`}>
                <Plane at={flip ? [a, b, d] : [a, b, c]} origin={origin} fill={shade(base, 0.07 + vary)} />
                <Plane at={flip ? [b, c, d] : [a, c, d]} origin={origin} fill={shade(base, -0.08 + vary)} />
              </g>
            )
          }),
        )
      })}
    </g>
  )
}

// The beach as planes of golden sand: a damp strip sloping to the waterline and the dry sand inland,
// each of the island's four sides cut into facets that alternate a little in tone. No outline: the
// sand meets the water at its own edge.
function BeachFacets({ origin }: { origin: Pt }) {
  const ring = (k: number) => {
    const c = islandCorners(k)
    return [c.top, c.right, c.bottom, c.left]
  }
  const [outer, mid, inner] = [ring(BEACH_TILES), ring(BEACH_TILES * 0.72), ring(0)]
  // Per side (back right, front right, front left, back left): how much light the slope catches.
  const light = [-0.03, -0.09, 0.02, 0.08]
  return (
    <g>
      {[0, 1, 2, 3].map((side) => {
        const next = (side + 1) % 4
        return Array.from({ length: BEACH_CUTS }, (_, i) => {
          const [t0, t1] = [i / BEACH_CUTS, (i + 1) / BEACH_CUTS]
          const strip = (from: Pt[], to: Pt[]) => [between(from[side], from[next], t0), between(from[side], from[next], t1), between(to[side], to[next], t1), between(to[side], to[next], t0)]
          const vary = light[side] + (i % 2 ? 0.035 : -0.02)
          return (
            <g key={`${side}-${i}`}>
              <Plane at={strip(outer, mid)} origin={origin} fill={shade(TROPIC.sandWet, vary)} />
              <Plane at={strip(mid, inner)} origin={origin} fill={shade(TROPIC.sandDry, vary)} />
            </g>
          )
        })
      })}
    </g>
  )
}

// ── Ocean ────────────────────────────────────────────────────────────────────

// Under the island: the lagoon glow, swell rings rolling out from the shore, sun glints, the
// island's shadow on the water and the distant islets. Drawn first (world SVG).
function OceanLayerImpl({ world, origin }: { world: { w: number; h: number }; origin: Pt }) {
  const beach = islandCorners(BEACH_TILES)
  const grown = (k: number) => {
    const c = islandCorners(k)
    return [c.top, c.right, c.bottom, c.left]
  }
  return (
    <g>
      <defs>
        <radialGradient id="mg-lagoon" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor={TROPIC.lagoon} stopOpacity="0.95" />
          <stop offset="70%" stopColor="#3fdbe0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#12b5d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Farthest first: the karsts stand behind the lagoon's glow. */}
      <DistantKarsts world={world} />
      {/* Shallow lagoon: a soft bright halo round the island. */}
      <polygon points={pts(grown(BEACH_TILES + 3.2), origin)} fill="url(#mg-lagoon)" strokeLinejoin="round" className="mg-lagoon" />
      <Waves width={world.w} height={world.h} />
      {/* Swell rings rolling away from the shore. */}
      {[0, 1.7, 3.4].map((delay) => (
        <polygon
          key={delay}
          points={pts(grown(BEACH_TILES + 0.9), origin)}
          fill="none"
          stroke="#ffffff"
          strokeWidth={5}
          strokeLinejoin="round"
          opacity={0.5}
          className="mg-swell"
          style={{ '--mg-delay': `${-delay}s` } as Vars}
        />
      ))}
      {/* The floating island's shadow on the water, below and ahead of it. */}
      <ellipse
        cx={origin.x}
        cy={origin.y + beach.bottom.y + 150}
        rx={(beach.right.x - beach.left.x) * 0.38}
        ry={70}
        fill="#064e6e"
        opacity={0.28}
      />
      {distantIslets(world).map((islet, i) => (
        <g key={i} transform={`translate(${islet.x} ${islet.y}) scale(${islet.scale})`} opacity={0.92}>
          <g className="mg-islet" style={{ '--mg-delay': `${islet.delay}s` } as Vars}>
            <Islet />
          </g>
        </g>
      ))}
    </g>
  )
}

// A tiny floating islet (local (0, 0) = its grass centre): grass cap, beach, cliff, keel, one palm.
function Islet() {
  const W = 110
  const H = 55
  const diamond = (w: number, h: number, dy = 0) => `${-w},${dy} 0,${-h + dy} ${w},${dy} 0,${h + dy}`
  return (
    <g strokeLinejoin="round">
      <ellipse cx={0} cy={H + 120} rx={W * 0.8} ry={22} fill="#064e6e" opacity={0.22} />
      {/* Cliff: a lit and a shaded face, each cut in two planes, over a keel of dark rock. */}
      <polygon points={`${-W - 12},0 0,${H + 6} ${-W * 0.35},${H + 44}`} fill={BANDS.topsoil.left} />
      <polygon points={`0,${H + 6} 0,${H + 60} ${-W * 0.35},${H + 44}`} fill={BANDS.soil.left} />
      <polygon points={`0,${H + 6} ${W + 12},0 ${W * 0.35},${H + 44}`} fill={BANDS.topsoil.right} />
      <polygon points={`0,${H + 6} ${W * 0.35},${H + 44} 0,${H + 60}`} fill={BANDS.soil.right} />
      <polygon points={`${-W * 0.35},${H + 44} 0,${H + 60} 0,${H + 105}`} fill={UNDERSIDE.left[1]} />
      <polygon points={`0,${H + 60} ${W * 0.35},${H + 44} 0,${H + 105}`} fill={UNDERSIDE.right[1]} />
      <polygon points={diamond(W + 12, H + 6)} fill={TROPIC.sandWet} />
      <polygon points={diamond(W + 4, H + 2, -1)} fill={TROPIC.sandDry} />
      <polygon points={diamond(W - 14, H - 7, 1)} fill={TROPIC.grassEdge} />
      <polygon points={diamond(W - 14, H - 7, -2)} fill={TROPIC.grassA} />
      <g transform="translate(-20 -6)">
        <Palm scale={0.9} flip={false} />
      </g>
      <Solid x={34} y={4} rx={9} color="#ff6b6b" />
      <Solid x={46} y={-4} rx={6} color="#ffd23f" />
    </g>
  )
}

// ── Distant karsts ───────────────────────────────────────────────────────────

// Soft, hazy palette: no ink outlines and less contrast than the farm island, so they read as far away.
const KARST = {
  lit: '#a9bfc6',
  shade: '#6c8a9a',
  strata: '#557585',
  moss: '#5fae7c',
  mossLight: '#93d6a0',
  palm: '#2f7d68',
  haze: '#d3f6f7',
} as const

type KarstShape = {
  half: number // half the width at the waterline
  body: string
  shade: string // the right (shaded) faces, clipped to the body
  strata: string[]
  caps: [cx: number, cy: number, rx: number, ry: number][]
  palms: [x: number, y: number, scale: number][]
  fall?: { x: number; top: number } // a waterfall from a ledge down to the sea
  mist: [cx: number, cy: number, rx: number][]
}

// Local (0, 0) = the centre of the waterline; the rock rises towards −y.
const KARSTS: Record<KarstKind, KarstShape> = {
  twin: {
    half: 130,
    body: 'M -130 0 C -128 -40 -118 -70 -104 -110 C -96 -150 -80 -188 -58 -200 C -36 -208 -22 -186 -14 -150 C -8 -128 2 -118 14 -122 C 26 -150 40 -168 58 -166 C 80 -160 92 -128 100 -92 C 110 -56 124 -30 130 0 Q 0 14 -130 0 Z',
    shade: 'M -56 -215 L -46 -130 L -56 -70 L -38 10 L 6 10 L 10 -215 Z M 60 -180 L 70 -110 L 62 -50 L 76 10 L 140 10 L 140 -180 Z',
    strata: ['M -122 -40 q 40 -9 84 -1', 'M -104 -104 q 30 -7 56 0', 'M 22 -70 q 34 -8 74 0', 'M 34 -128 q 20 -5 46 1'],
    caps: [[-58, -194, 34, 17], [58, -161, 30, 14], [-102, -102, 16, 8], [98, -88, 14, 7]],
    palms: [[-66, -206, 1], [-44, -202, 0.8], [62, -172, 0.9]],
    fall: { x: 6, top: -116 },
    mist: [[-30, -120, 84], [50, -52, 70]],
  },
  tower: {
    half: 90,
    body: 'M -90 0 C -88 -30 -80 -60 -70 -84 C -62 -100 -50 -104 -40 -110 C -34 -150 -26 -200 -4 -224 C 14 -236 30 -214 36 -180 C 42 -150 46 -128 56 -112 C 70 -96 80 -60 90 0 Q 0 12 -90 0 Z',
    shade: 'M 0 -240 L 10 -150 L 2 -80 L 16 10 L 100 10 L 100 -240 Z',
    strata: ['M -82 -36 q 36 -8 80 0', 'M -30 -150 q 24 -6 50 0', 'M 18 -74 q 26 -6 58 0'],
    caps: [[2, -219, 26, 13], [-58, -101, 20, 9], [62, -105, 14, 7]],
    palms: [[-8, -229, 1], [14, -224, 0.8], [-66, -107, 0.8]],
    fall: { x: -52, top: -94 },
    mist: [[-6, -146, 68], [28, -58, 62]],
  },
  far: {
    half: 110,
    body: 'M -110 0 C -104 -30 -92 -70 -74 -84 C -58 -92 -48 -70 -38 -64 C -28 -100 -14 -132 6 -136 C 24 -134 32 -104 40 -80 C 50 -84 62 -96 76 -90 C 94 -78 104 -36 110 0 Q 0 10 -110 0 Z',
    shade: 'M 8 -145 L 16 -80 L 10 -40 L 22 10 L 120 10 L 120 -145 Z',
    strata: ['M -98 -34 q 40 -8 90 0', 'M 30 -50 q 30 -6 66 0'],
    caps: [[-72, -81, 20, 9], [6, -131, 22, 10], [76, -88, 18, 8]],
    palms: [[2, -140, 0.9]],
    mist: [[0, -74, 96]],
  },
}

// A palm reduced to a silhouette: a bent trunk and four fronds.
function TinyPalm({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={KARST.palm} strokeWidth={2.4} strokeLinecap="round" fill="none">
      <path d="M 0 0 q 1 -11 6 -18" />
      <path d="M 6 -18 q -8 -5 -14 1 M 6 -18 q -4 -9 -11 -9 M 6 -18 q 6 -8 13 -5 M 6 -18 q 8 -2 12 6" />
    </g>
  )
}

// One karst: mirrored shore foam and a soft reflection, the lit and shaded rock, strata, mossy
// summits with palm silhouettes, a thin waterfall, sea haze climbing its foot and mist drifting
// across its ridges. Its still parts fade with `haze`; only small pieces move (transform / opacity).
function Karst({ kind, haze, delay }: { kind: KarstKind; haze: number; delay: number }) {
  const k = KARSTS[kind]
  const clip = `mg-karst-clip-${kind}`
  return (
    <g>
      <g opacity={haze}>
        <ellipse cx={0} cy={10} rx={k.half * 1.05} ry={16} fill="#064e6e" opacity={0.16} />
        <ellipse cx={0} cy={3} rx={k.half + 9} ry={11} fill={TROPIC.foam} opacity={0.5} />
        <clipPath id={clip}>
          <path d={k.body} />
        </clipPath>
        <path d={k.body} fill={KARST.lit} />
        <g clipPath={`url(#${clip})`}>
          <path d={k.shade} fill={KARST.shade} opacity={0.7} />
          <g stroke={KARST.strata} strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.4}>
            {k.strata.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          {/* Sea haze: the foot of the rock dissolves into the bright water. */}
          <rect x={-k.half} y={-KARST_HEIGHT} width={k.half * 2} height={KARST_HEIGHT + 14} fill="url(#mg-karst-haze)" />
        </g>
        {k.palms.map(([x, y, s]) => (
          <TinyPalm key={`${x}:${y}`} x={x} y={y} scale={s} />
        ))}
        {k.caps.map(([cx, cy, rx, ry]) => (
          <g key={`${cx}:${cy}`}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={KARST.moss} />
            <ellipse cx={cx - rx * 0.2} cy={cy - ry * 0.3} rx={rx * 0.6} ry={ry * 0.5} fill={KARST.mossLight} opacity={0.8} />
          </g>
        ))}
        {k.fall && (
          <path
            d={`M ${k.fall.x - 2.5} ${k.fall.top} L ${k.fall.x + 2.5} ${k.fall.top} L ${k.fall.x + 5} 2 L ${k.fall.x - 5} 2 Z`}
            fill={TROPIC.foam}
            opacity={0.75}
          />
        )}
      </g>
      {k.fall &&
        [0, 1, 2].map((i) => (
          <rect
            key={i}
            x={k.fall!.x - 1.5 + (i - 1) * 2}
            y={k.fall!.top}
            width={2.5}
            height={16}
            rx={1.25}
            fill={TROPIC.foam}
            opacity={0}
            className="mg-cascade"
            style={{ '--mg-drop': `${-k.fall!.top - 14}px`, '--mg-delay': `${delay - i * 0.6}s` } as Vars}
          />
        ))}
      {k.fall && (
        <ellipse cx={k.fall.x} cy={2} rx={15} ry={5} fill={TROPIC.foam} opacity={haze * 0.8} className="mg-shorefoam" style={{ '--mg-delay': `${delay}s` } as Vars} />
      )}
      {/* Foam rippling out from the rock's foot. */}
      {[0, 2.6].map((d) => (
        <ellipse
          key={d}
          cx={0}
          cy={4}
          rx={k.half + 6}
          ry={10}
          fill="none"
          stroke={TROPIC.foam}
          strokeWidth={3}
          opacity={0}
          className="mg-shorefoam"
          style={{ '--mg-delay': `${delay - d}s` } as Vars}
        />
      ))}
      {k.mist.map(([cx, cy, rx], i) => (
        <ellipse
          key={i}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={rx * 0.2}
          fill="url(#mg-karst-mist)"
          opacity={0.55}
          className="mg-mist"
          style={{ '--mg-dur': `${22 + i * 9}s`, '--mg-delay': `${delay - i * 7}s` } as Vars}
        />
      ))}
    </g>
  )
}

// The karsts behind the island. Decorative only: never a pointer target.
function DistantKarsts({ world }: { world: { w: number; h: number } }) {
  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id="mg-karst-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stopColor={KARST.haze} stopOpacity="0" />
          <stop offset="100%" stopColor={KARST.haze} stopOpacity="0.85" />
        </linearGradient>
        {/* Mist is a soft gradient, not a blur filter: it moves, and a filter would repaint each frame. */}
        <radialGradient id="mg-karst-mist">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {distantKarsts(world).map((karst) => (
        <g key={karst.kind} transform={`translate(${karst.x.toFixed(1)} ${karst.y.toFixed(1)}) scale(${karst.scale})`}>
          <Karst kind={karst.kind} haze={karst.haze} delay={karst.delay} />
        </g>
      ))}
    </g>
  )
}

// ── Island ───────────────────────────────────────────────────────────────────

// The island itself, under everything that stands on it: underside, cliff strata, beach, grass
// tiles and the scattered tufts / flowers (`seed` = the farm, so every farm keeps its own).
function IslandBaseImpl({ origin, seed }: { origin: Pt; seed: string }) {
  const beach = islandCorners(BEACH_TILES)
  const grass = islandCorners(0)
  const under = undersidePoints()
  const down = (p: Pt, d: number): Pt => ({ x: p.x, y: p.y + d })
  const random = seededRandom(`cliff:${seed}`)
  const face = (side: 'left' | 'right', t: number, depth: number): Pt => {
    const a = side === 'left' ? beach.left : beach.bottom
    const b = side === 'left' ? beach.bottom : beach.right
    return { x: a.x + (b.x - a.x) * t + origin.x, y: a.y + (b.y - a.y) * t + origin.y + depth }
  }
  const pebbles = Array.from({ length: 26 }, () => ({
    side: random() < 0.5 ? ('left' as const) : ('right' as const),
    t: 0.04 + random() * 0.92,
    d: 58 + random() * 16,
    r: 3 + random() * 4,
  }))
  const vines = Array.from({ length: 14 }, () => ({ side: random() < 0.5 ? ('left' as const) : ('right' as const), t: 0.05 + random() * 0.9, len: 10 + random() * 16 }))
  const tiles = []
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      tiles.push(<polygon key={`${x}-${y}`} points={footprintPoints({ x, y, width: 1, height: 1 }, origin)} fill={(x + y) % 2 === 0 ? TROPIC.grassA : TROPIC.grassB} stroke={TROPIC.grassSeam} strokeWidth={1.2} />)
    }
  }

  return (
    <g strokeLinejoin="round">
      {/* Rocky underside tapering to a keel: two planes a side (edge, edge, keel / lobe). */}
      <Plane at={[under.left[0], under.left[1], under.left[3]]} origin={origin} fill={UNDERSIDE.left[0]} />
      <Plane at={[under.left[1], under.left[2], under.left[3]]} origin={origin} fill={UNDERSIDE.left[1]} />
      <Plane at={[under.right[0], under.right[1], under.right[2]]} origin={origin} fill={UNDERSIDE.right[0]} />
      <Plane at={[under.right[0], under.right[2], under.right[3]]} origin={origin} fill={UNDERSIDE.right[1]} />
      {/* Cliff strata, chiselled into facets. */}
      <CliffFacets origin={origin} />
      {pebbles.map((p, i) => {
        const c = face(p.side, p.t, p.d)
        // A cut stone set in the cliff: a lit upper plane over a shaded lower one.
        const [w, h] = [p.r * 1.4, p.r]
        return (
          <g key={`pb${i}`}>
            <polygon points={pts([{ x: c.x - w, y: c.y }, { x: c.x - w * 0.4, y: c.y - h }, { x: c.x + w * 0.6, y: c.y - h * 0.8 }, { x: c.x + w, y: c.y + h * 0.1 }, { x: c.x + w * 0.3, y: c.y + h }, { x: c.x - w * 0.6, y: c.y + h * 0.8 }], { x: 0, y: 0 })} fill={p.side === 'left' ? '#6f6c73' : '#55535b'} />
            <polygon points={pts([{ x: c.x - w, y: c.y }, { x: c.x - w * 0.4, y: c.y - h }, { x: c.x + w * 0.6, y: c.y - h * 0.8 }, { x: c.x, y: c.y - h * 0.1 }], { x: 0, y: 0 })} fill={p.side === 'left' ? '#b3b0b8' : '#8d8a90'} />
          </g>
        )
      })}
      {/* Hanging vines from the grass lip. */}
      {vines.map((v, i) => {
        const a = face(v.side, v.t, 6)
        return (
          <g key={`v${i}`} stroke={TROPIC.grassB} strokeLinecap="round" fill="none">
            <path d={`M ${a.x} ${a.y} q 3 ${v.len / 2} 0 ${v.len}`} strokeWidth={4} />
            <circle cx={a.x} cy={a.y + v.len} r={3.2} fill={TROPIC.grassA} strokeWidth={0} />
          </g>
        )
      })}
      {/* Beach: faceted golden sand (damp at the waterline, dry inland) and a bright foam rim. */}
      <BeachFacets origin={origin} />
      <polygon points={pts([beach.top, beach.right, beach.bottom, beach.left], origin)} fill="none" stroke={TROPIC.foam} strokeWidth={6} opacity={0.75} className="mg-foam" />
      {/* Grass: a crisp bevel on its two front edges (lit left, shaded right), then the checkered tiles. */}
      <Plane at={[grass.left, grass.bottom, down(grass.bottom, 6), down(grass.left, 6)]} origin={origin} fill="#5a9a3a" />
      <Plane at={[grass.bottom, grass.right, down(grass.right, 6), down(grass.bottom, 6)]} origin={origin} fill={TROPIC.grassEdge} />
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill={TROPIC.grassA} />
      {tiles}
      {/* Light falling across the field from the upper left, so the turf is never uniformly flat: a
          warm pool of sun by day (`.mg-sun-pool`), a pale silver pool of moonlight by night
          (`.mg-moon-pool`); globals.css cross-fades them. Both dim towards the lower right. */}
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill="url(#mg-sun-pool)" className="mg-sun-pool" />
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill="url(#mg-moon-pool)" className="mg-moon-pool" />
      <defs>
        <linearGradient id="mg-sun-pool" x1="0.05" y1="0.2" x2="0.95" y2="0.85">
          <stop offset="0%" stopColor="#fff5c8" stopOpacity="0.36" />
          <stop offset="30%" stopColor="#fff5c8" stopOpacity="0.18" />
          <stop offset="62%" stopColor="#fff5c8" stopOpacity="0" />
          <stop offset="100%" stopColor="#14280f" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="mg-moon-pool" x1="0.05" y1="0.2" x2="0.95" y2="0.85">
          <stop offset="0%" stopColor="#e0f4ff" stopOpacity="0.3" />
          <stop offset="32%" stopColor="#b4e4ff" stopOpacity="0.14" />
          <stop offset="62%" stopColor="#b4e4ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#060c1c" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <GrassDetails origin={origin} seed={seed} />
    </g>
  )
}

function GrassDetails({ origin, seed }: { origin: Pt; seed: string }) {
  return (
    <g strokeLinecap="round">
      {grassDetails(seed).map((d, i) => {
        const x = d.x + origin.x
        const y = d.y + origin.y
        const s = d.scale
        if (d.kind === 'tuft') {
          // Three cut blades: each a sunlit left plane and a shaded right one.
          return (
            <g key={i}>
              {[
                [-5, -3, -8],
                [0, 0, -11],
                [5, 3.4, -8],
              ].map(([base, lean, tip]) => (
                <g key={base}>
                  <polygon points={`${x + (base - 1.8) * s},${y} ${x + base * s},${y} ${x + lean * s},${y + tip * s}`} fill="#8fd35a" />
                  <polygon points={`${x + base * s},${y} ${x + (base + 1.8) * s},${y} ${x + lean * s},${y + tip * s}`} fill={d.color} />
                </g>
              ))}
            </g>
          )
        }
        return (
          <g key={i}>
            <ellipse cx={x + 1} cy={y + 0.6} rx={4 * s} ry={1.5 * s} fill="rgba(20, 40, 15, 0.35)" className="mg-contact" />
            <polygon points={`${x - 0.9},${y} ${x + 0.9},${y} ${x + 0.9},${y - 7} ${x - 0.9},${y - 7}`} fill={TROPIC.grassEdge} />
            <Blossom x={x} y={y - 8} r={3 * s} petal={d.color} center="#ffb703" />
          </g>
        )
      })}
    </g>
  )
}

// ── Standing scenery ─────────────────────────────────────────────────────────

// A chunky low-poly palm (local (0, 0) = its foot): a bent trunk of ringed segments (lit left face,
// shaded right face), cut coconuts and two-plane fronds that sway from the crown.
const PALM_TRUNK: [x: number, y: number, half: number][] = [[0, 0, 7.5], [1, -20, 6.2], [4, -42, 5.8], [9, -64, 5.4], [16, -85, 5.2]]
const PALM_FRONDS: [number, number][] = [[-52, 4], [-44, -26], [30, -38], [54, 2], [40, 24], [-38, 26]]
export function Palm({ scale = 1, flip = false }: { scale?: number; flip?: boolean }) {
  return (
    <g transform={`scale(${flip ? -scale : scale} ${scale})`} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={2} rx={26} ry={9} fill="rgba(20, 40, 15, 0.35)" className="mg-contact" />
      {PALM_TRUNK.slice(0, -1).map(([x, y, w], i) => {
        const [nx, ny, nw] = PALM_TRUNK[i + 1]
        const ridge = (cx: number, half: number) => cx - half * 0.15
        return (
          <g key={y}>
            <polygon points={`${x - w},${y} ${ridge(x, w)},${y + 2} ${ridge(nx, nw)},${ny + 2} ${nx - nw},${ny}`} fill={i % 2 ? '#e8b074' : '#f2c088'} />
            <polygon points={`${ridge(x, w)},${y + 2} ${x + w},${y} ${nx + nw},${ny} ${ridge(nx, nw)},${ny + 2}`} fill={i % 2 ? '#a36a34' : '#b77a40'} />
          </g>
        )
      })}
      <g transform="translate(18 -84)">
        <g className="mg-sway" style={{ '--mg-delay': `${-scale * 3}s` } as Vars}>
          {PALM_FRONDS.map((tip, i) => (
            <Blade key={i} from={[0, 0]} to={tip} half={10} light={i % 2 ? '#b6f23c' : '#8fdc5a'} dark={i % 2 ? '#2f9140' : '#1f6b2a'} occlusion="#0b5d2a" />
          ))}
          <Solid x={-5} y={4} rx={6} color="#8a4f22" />
          <Solid x={5} y={5} rx={6} color="#a0612b" />
          <Solid x={0} y={11} rx={5.5} color="#8a4f22" />
        </g>
      </g>
    </g>
  )
}

// ── Sky ──────────────────────────────────────────────────────────────────────

// One puffy cartoon cloud (flat, shaded underside, a baked soft shadow below), in a 160 × 78 box.
// No CSS drop-shadow: clouds are always moving, and a filter would be recomputed every frame.
export function Cloud({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 160 78" className={className} style={style} aria-hidden>
      {[1, 0.8, 0.6].map((f) => (
        <ellipse key={f} cx={82} cy={70} rx={66 * f} ry={6 * f} fill="#06506e" opacity={0.06} />
      ))}
      <path d="M 18 58 q -16 0 -14 -14 q 2 -14 20 -12 q 2 -18 24 -18 q 10 -14 30 -8 q 16 -12 34 2 q 22 -4 26 16 q 18 2 16 18 q -2 16 -20 16 z" fill="#d6f1fb" />
      <path d="M 18 52 q -14 0 -12 -12 q 2 -12 18 -10 q 2 -16 22 -16 q 10 -13 28 -7 q 15 -11 32 2 q 20 -4 24 14 q 16 2 14 16 q -2 13 -18 13 z" fill="#ffffff" />
      <ellipse cx={58} cy={24} rx={14} ry={5} fill="#ffffff" opacity={0.9} />
    </svg>
  )
}

// Clouds in the world's sky corners, drifting gently (they move with the camera).
function WorldCloudsImpl({ world }: { world: { w: number; h: number } }) {
  const clouds = [
    { x: world.w * 0.04, y: 26, w: 190, dur: 30, delay: 0 },
    { x: world.w * 0.72, y: 60, w: 230, dur: 36, delay: -12 },
    { x: world.w * 0.3, y: world.h - 150, w: 170, dur: 28, delay: -6 },
  ]
  return (
    <>
      {clouds.map((c, i) => (
        <div key={i} aria-hidden className="pointer-events-none absolute" style={{ left: c.x, top: c.y, width: c.w, zIndex: 400_000 }}>
          <div className="mg-drift" style={{ '--mg-dur': `${c.dur}s`, '--mg-delay': `${c.delay}s` } as Vars}>
            <Cloud className="w-full opacity-90" />
          </div>
        </div>
      ))}
    </>
  )
}

// Clouds sailing across the viewport over the world (screen space: a far, slow layer and a near,
// faster one for parallax). Never block input.
function SkyCloudsImpl() {
  const clouds = [
    { top: '8%', w: 120, dur: 170, delay: -20, opacity: 0.55 },
    { top: '22%', w: 90, dur: 150, delay: -95, opacity: 0.5 },
    { top: '4%', w: 210, dur: 95, delay: -40, opacity: 0.75 },
    { top: '64%', w: 180, dur: 110, delay: -75, opacity: 0.55 },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {clouds.map((c, i) => (
        <div
          key={i}
          className="mg-cloud absolute left-0"
          style={{ top: c.top, width: c.w, opacity: c.opacity, '--mg-dur': `${c.dur}s`, '--mg-delay': `${c.delay}s` } as Vars}
        >
          <Cloud className="w-full" />
        </div>
      ))}
    </div>
  )
}

// Memoized: static layers render once; beds and streams only when their tiles change.
export const OceanLayer = memo(OceanLayerImpl)
export const IslandBase = memo(IslandBaseImpl)
export const WorldClouds = memo(WorldCloudsImpl)
export const SkyClouds = memo(SkyCloudsImpl)

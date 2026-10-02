// The farm as a floating tropical island diorama: turquoise ocean with a glowing lagoon and swelling
// rings, the island's sandy beach, saturated grass grid, layered cliff (grass lip, terracotta
// topsoil, deep soil, stone) and rocky underside, palms, distant islets and drifting clouds.
// Pure SVG / HTML markup, no hooks; geometry from lib/diorama.ts (tested). Animations are the
// `.mg-*` classes in globals.css (off for reduced motion).
import { memo, type CSSProperties } from 'react'
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

// Tropical palette (lit left face / shaded right face). The turf is a warm, rich meadow green
// checkerboard (lively without being neon), so trees and everything placed on it still stand out.
export const TROPIC = {
  ink: '#3b1f0e',
  grassA: '#65b035',
  grassB: '#4d9326',
  grassEdge: '#2f6b1a',
  // Hairline between tiles: keeps the grid readable without competing with what stands on it.
  grassSeam: 'rgba(35, 75, 18, 0.25)',
  sandDry: '#ffe8a3',
  sandWet: '#f3c56e',
  foam: '#ffffff',
  lagoon: '#7ff0e6',
} as const

// The island's foundation: a warm stone bevel at the top edge, then muted brown earth darkening to
// slate, so the island reads as raised above the sea without pulling the eye from the farm.
const BANDS: Record<CliffBandId, { left: string; right: string }> = {
  lip: { left: '#a59c8d', right: '#877f73' },
  topsoil: { left: '#6f5b4b', right: '#58473b' },
  soil: { left: '#54443c', right: '#41342e' },
  stone: { left: '#4a4a53', right: '#383840' },
}

type Vars = CSSProperties & Record<`--mg-${string}`, string>

const pts = (points: readonly Pt[], o: Pt) => points.map((p) => `${(p.x + o.x).toFixed(1)},${(p.y + o.y).toFixed(1)}`).join(' ')

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
        <linearGradient id="mg-underside" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f4d58" />
          <stop offset="100%" stopColor="#33313b" />
        </linearGradient>
      </defs>
      {/* Farthest first: the karsts stand behind the lagoon's glow. */}
      <DistantKarsts world={world} />
      {/* Shallow lagoon: a soft bright halo round the island. */}
      <polygon points={pts(grown(BEACH_TILES + 3.2), origin)} fill="url(#mg-lagoon)" strokeLinejoin="round" />
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
      <polygon points={`${-W - 12},0 0,${H + 6} 0,${H + 60} ${-W * 0.35},${H + 44}`} fill={BANDS.topsoil.left} stroke={TROPIC.ink} strokeWidth={3} />
      <polygon points={`0,${H + 6} ${W + 12},0 ${W * 0.35},${H + 44} 0,${H + 60}`} fill={BANDS.topsoil.right} stroke={TROPIC.ink} strokeWidth={3} />
      <polygon points={`${-W * 0.35},${H + 44} 0,${H + 60} ${W * 0.35},${H + 44} 0,${H + 105}`} fill="url(#mg-underside)" stroke={TROPIC.ink} strokeWidth={3} />
      <polygon points={diamond(W + 12, H + 6)} fill={TROPIC.sandDry} stroke={TROPIC.ink} strokeWidth={3} />
      <polygon points={diamond(W - 14, H - 7, -2)} fill={TROPIC.grassA} stroke={TROPIC.grassEdge} strokeWidth={2.5} />
      <g transform="translate(-20 -6)">
        <Palm scale={0.9} flip={false} />
      </g>
      <circle cx={34} cy={4} r={9} fill="#ff6b6b" stroke={TROPIC.ink} strokeWidth={2} />
      <circle cx={46} cy={-4} r={6} fill="#ffd23f" stroke={TROPIC.ink} strokeWidth={2} />
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
  const wet = islandCorners(BEACH_TILES * 0.72)
  const grass = islandCorners(0)
  const under = undersidePoints()
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
      {/* Rocky underside tapering to a keel. */}
      <polygon points={pts(under.left, origin)} fill="url(#mg-underside)" stroke={TROPIC.ink} strokeWidth={4} />
      <polygon points={pts(under.right, origin)} fill="#3a3842" stroke={TROPIC.ink} strokeWidth={4} />
      {/* Cliff strata. */}
      {cliffFaces().map((f) => (
        <polygon key={`${f.band}-${f.side}`} points={pts(f.points, origin)} fill={BANDS[f.band][f.side]} stroke={TROPIC.ink} strokeWidth={2.5} />
      ))}
      {pebbles.map((p, i) => {
        const c = face(p.side, p.t, p.d)
        return <ellipse key={`pb${i}`} cx={c.x} cy={c.y} rx={p.r * 1.4} ry={p.r} fill={p.side === 'left' ? '#8d8a90' : '#6f6c73'} stroke={TROPIC.ink} strokeWidth={1.5} />
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
      {/* Beach: wet sand at the waterline, dry sand inland, a bright foam rim. */}
      <polygon points={pts([beach.top, beach.right, beach.bottom, beach.left], origin)} fill={TROPIC.sandWet} stroke={TROPIC.ink} strokeWidth={4} />
      <polygon points={pts([beach.top, beach.right, beach.bottom, beach.left], origin)} fill="none" stroke={TROPIC.foam} strokeWidth={10} opacity={0.75} className="mg-foam" />
      <polygon points={pts([wet.top, wet.right, wet.bottom, wet.left], origin)} fill={TROPIC.sandDry} />
      {/* Grass: a raised lip, then the checkered tiles. */}
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill={TROPIC.grassEdge} transform="translate(0 5)" />
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill={TROPIC.grassA} stroke={TROPIC.grassEdge} strokeWidth={4} />
      {tiles}
      {/* Soft top-left sheen across the field. */}
      <polygon points={pts([grass.top, grass.right, grass.bottom, grass.left], origin)} fill="url(#mg-grass-sheen)" />
      <defs>
        <linearGradient id="mg-grass-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#142d0f" stopOpacity="0.14" />
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
        if (d.kind === 'tuft') {
          return (
            <path
              key={i}
              d={`M ${x - 5 * d.scale} ${y} l ${2 * d.scale} ${-8 * d.scale} M ${x} ${y} l 0 ${-10 * d.scale} M ${x + 5 * d.scale} ${y} l ${-2 * d.scale} ${-8 * d.scale}`}
              stroke={d.color}
              strokeWidth={2.6}
              fill="none"
            />
          )
        }
        return (
          <g key={i}>
            <path d={`M ${x} ${y} l 0 -7`} stroke={TROPIC.grassEdge} strokeWidth={2} />
            <circle cx={x} cy={y - 8} r={3.6 * d.scale} fill={d.color} stroke={TROPIC.ink} strokeWidth={1.2} />
            <circle cx={x} cy={y - 8} r={1.3 * d.scale} fill="#ffb703" />
          </g>
        )
      })}
    </g>
  )
}

// ── Standing scenery ─────────────────────────────────────────────────────────

// A chunky cartoon palm (local (0, 0) = its foot): ringed curved trunk, coconuts, glossy fronds
// that sway from the crown.
export function Palm({ scale = 1, flip = false }: { scale?: number; flip?: boolean }) {
  const fronds = [
    'M 0 0 q -26 -14 -52 4 q 24 -6 52 -4',
    'M 0 0 q -20 -26 -44 -26 q 22 8 44 26',
    'M 0 0 q 6 -30 30 -38 q -14 18 -30 38',
    'M 0 0 q 28 -14 54 2 q -26 -4 -54 -2',
    'M 0 0 q 24 4 40 24 q -20 -12 -40 -24',
    'M 0 0 q -22 4 -38 26 q 16 -16 38 -26',
  ]
  return (
    <g transform={`scale(${flip ? -scale : scale} ${scale})`} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={2} rx={26} ry={9} fill="#0b5d2a" opacity={0.22} />
      <path d="M -4 0 q -2 -40 16 -84 l 10 3 q -16 42 -14 81 z" fill="#c98a4b" stroke={TROPIC.ink} strokeWidth={3} />
      {[14, 30, 46, 62].map((y) => (
        <path key={y} d={`M ${-3 + y * 0.18} ${-y} l 11 2`} stroke="#8a5a2b" strokeWidth={2.5} />
      ))}
      <g transform="translate(18 -84)">
        <g className="mg-sway" style={{ '--mg-delay': `${-scale * 3}s` } as Vars}>
          {fronds.map((d, i) => (
            <path key={i} d={d} fill={i % 2 === 0 ? '#2fb84a' : '#4fd35a'} stroke="#1c6b2c" strokeWidth={2.5} />
          ))}
          <circle cx={-5} cy={4} r={6} fill="#8a4f22" stroke={TROPIC.ink} strokeWidth={2} />
          <circle cx={5} cy={5} r={6} fill="#a0612b" stroke={TROPIC.ink} strokeWidth={2} />
          <circle cx={0} cy={11} r={5.5} fill="#8a4f22" stroke={TROPIC.ink} strokeWidth={2} />
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

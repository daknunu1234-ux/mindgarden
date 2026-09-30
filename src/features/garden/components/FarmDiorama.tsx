// The farm as a floating tropical island diorama: turquoise ocean with a glowing lagoon and swelling
// rings, the island's sandy beach, saturated grass grid, layered cliff (grass lip, terracotta
// topsoil, deep soil, stone) and rocky underside, palms, distant islets and drifting clouds.
// Pure SVG / HTML markup, no hooks; geometry from lib/diorama.ts (tested). Animations are the
// `.mg-*` classes in globals.css (off for reduced motion).
import type { CSSProperties } from 'react'
import { seededRandom } from '@/shared/utils/seededRandom'
import {
  BEACH_TILES,
  cliffFaces,
  distantIslets,
  grassDetails,
  islandCorners,
  undersidePoints,
  type CliffBandId,
  type Pt,
} from '../lib/diorama'
import { GRID_SIZE } from '../lib/farmGrid'
import { footprintPoints } from './FarmStructures'
import { Waves } from './FarmScenery'

// Tropical palette (lit left face / shaded right face).
export const TROPIC = {
  ink: '#3b1f0e',
  grassA: '#74de4c',
  grassB: '#5fd044',
  grassEdge: '#2e9e3a',
  sandDry: '#ffe8a3',
  sandWet: '#f3c56e',
  foam: '#ffffff',
  lagoon: '#7ff0e6',
} as const

const BANDS: Record<CliffBandId, { left: string; right: string }> = {
  lip: { left: '#46c24a', right: '#32a13b' },
  topsoil: { left: '#ea8043', right: '#c9622b' },
  soil: { left: '#ad5a2e', right: '#8c4420' },
  stone: { left: '#9a95a8', right: '#7b7689' },
}

type Vars = CSSProperties & Record<`--mg-${string}`, string>

const pts = (points: readonly Pt[], o: Pt) => points.map((p) => `${(p.x + o.x).toFixed(1)},${(p.y + o.y).toFixed(1)}`).join(' ')

// ── Ocean ────────────────────────────────────────────────────────────────────

// Under the island: the lagoon glow, swell rings rolling out from the shore, sun glints, the
// island's shadow on the water and the distant islets. Drawn first (world SVG).
export function OceanLayer({ world, origin }: { world: { w: number; h: number }; origin: Pt }) {
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
          <stop offset="0%" stopColor="#8f89a3" />
          <stop offset="100%" stopColor="#5b566b" />
        </linearGradient>
      </defs>
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

// ── Island ───────────────────────────────────────────────────────────────────

// The island itself, under everything that stands on it: underside, cliff strata, beach, grass
// tiles and the scattered tufts / flowers (`seed` = the farm, so every farm keeps its own).
export function IslandBase({ origin, seed }: { origin: Pt; seed: string }) {
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
      tiles.push(<polygon key={`${x}-${y}`} points={footprintPoints({ x, y, width: 1, height: 1 }, origin)} fill={(x + y) % 2 === 0 ? TROPIC.grassA : TROPIC.grassB} />)
    }
  }

  return (
    <g strokeLinejoin="round">
      {/* Rocky underside tapering to a keel. */}
      <polygon points={pts(under.left, origin)} fill="url(#mg-underside)" stroke={TROPIC.ink} strokeWidth={4} />
      <polygon points={pts(under.right, origin)} fill="#6a6479" stroke={TROPIC.ink} strokeWidth={4} />
      {/* Cliff strata. */}
      {cliffFaces().map((f) => (
        <polygon key={`${f.band}-${f.side}`} points={pts(f.points, origin)} fill={BANDS[f.band][f.side]} stroke={TROPIC.ink} strokeWidth={2.5} />
      ))}
      {pebbles.map((p, i) => {
        const c = face(p.side, p.t, p.d)
        return <ellipse key={`pb${i}`} cx={c.x} cy={c.y} rx={p.r * 1.4} ry={p.r} fill={p.side === 'left' ? '#b9b4c6' : '#96919f'} stroke={TROPIC.ink} strokeWidth={1.5} />
      })}
      {/* Hanging vines from the grass lip. */}
      {vines.map((v, i) => {
        const a = face(v.side, v.t, 6)
        return (
          <g key={`v${i}`} stroke="#2e9e3a" strokeLinecap="round" fill="none">
            <path d={`M ${a.x} ${a.y} q 3 ${v.len / 2} 0 ${v.len}`} strokeWidth={4} />
            <circle cx={a.x} cy={a.y + v.len} r={3.2} fill="#46c24a" strokeWidth={0} />
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
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#0b5d2a" stopOpacity="0.12" />
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
            <path d={`M ${x} ${y} l 0 -7`} stroke="#2e9e3a" strokeWidth={2} />
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

// One puffy cartoon cloud (flat, shaded underside), drawn in a 160 × 70 box.
export function Cloud({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 160 70" className={className} style={style} aria-hidden>
      <path d="M 18 58 q -16 0 -14 -14 q 2 -14 20 -12 q 2 -18 24 -18 q 10 -14 30 -8 q 16 -12 34 2 q 22 -4 26 16 q 18 2 16 18 q -2 16 -20 16 z" fill="#d6f1fb" />
      <path d="M 18 52 q -14 0 -12 -12 q 2 -12 18 -10 q 2 -16 22 -16 q 10 -13 28 -7 q 15 -11 32 2 q 20 -4 24 14 q 16 2 14 16 q -2 13 -18 13 z" fill="#ffffff" />
      <ellipse cx={58} cy={24} rx={14} ry={5} fill="#ffffff" opacity={0.9} />
    </svg>
  )
}

// Clouds in the world's sky corners, drifting gently (they move with the camera).
export function WorldClouds({ world }: { world: { w: number; h: number } }) {
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
            <Cloud className="w-full opacity-90 drop-shadow-[0_10px_8px_rgba(6,78,110,0.18)]" />
          </div>
        </div>
      ))}
    </>
  )
}

// Clouds sailing across the viewport over the world (screen space: a far, slow layer and a near,
// faster one for parallax). Never block input.
export function SkyClouds() {
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
          <Cloud className="w-full drop-shadow-[0_12px_10px_rgba(6,78,110,0.15)]" />
        </div>
      ))}
    </div>
  )
}

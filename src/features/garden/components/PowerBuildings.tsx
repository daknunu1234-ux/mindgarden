// The power-grid buildings as vivid 3D low-poly miniatures (lowPolyKit: faceted solids lit from the
// upper left, saturated flat fills, warm highlights, deep indigo shadows, bevel highlights, no
// outlines), drawn around their ground point (0, 0), the centre of the footprint's diamond. Pure
// markup, no hooks; animations are `.mg-*` classes in globals.css (off for reduced motion, paused
// with the farm: `.mg-paused`).
// (The farm draws the Windmill, both factories and the Seaport from rendered sprites now:
// BuildingImages.tsx. These vector drawings remain for the factories and the seaport.)
//   Furniture Factory: cedar-sided sawmill, cobalt corrugated tin roof, amber lumber, a silver saw on
//     a safety-striped bench (`.mg-spin-slow` and sawdust sparks `.mg-spark` while powered), smoking pipes.
//   Candy Factory: mint workshop, hot-pink roof with glowing gumdrops and a lollipop, a candy-cane
//     chimney (white smoke while powered), magenta candies on a conveyor (`.mg-conveyor` while powered).
//   Seaport: a wharf on navy pilings over azure ripples, black-and-yellow diagonal curbs, a hazard-yellow
//     lattice crane, vermilion / royal blue / emerald containers; while powered a cargo freighter with a
//     white bridge and a red hull stripe sails in, docks and sails away, trailing a wake (`.mg-ship`).
import type { CSSProperties } from 'react'
import { TILE_H, TILE_W } from '../lib/farmGrid'
import { Bevel, Cone, Contact, Cylinder, Face, FootprintShadow, GableRoof, IsoBox, isoCorners, lit, type Pt } from './lowPolyKit'

type Vars = CSSProperties & Record<`--mg-${string}`, string>

// The four corners of a w × h footprint's diamond, around its centre: top, right, bottom, left.
export function diamond(w: number, h: number): [Pt, Pt, Pt, Pt] {
  const top: Pt = [(-(w - h) * TILE_W) / 4, (-(w + h) * TILE_H) / 4]
  return [top, [top[0] + (w * TILE_W) / 2, top[1] + (w * TILE_H) / 2], [top[0] + ((w - h) * TILE_W) / 2, top[1] + ((w + h) * TILE_H) / 2], [top[0] - (h * TILE_W) / 2, top[1] + (h * TILE_H) / 2]]
}

// The ground blocks the 2 × 2 buildings stand on (iso half-extents): inside their tile diamond, so
// they never spill onto a neighbour's tiles and depth sorting by ground point holds (tested).
export const BASES = {
  factory: { a: 46, b: 40 },
} as const

// The building palette: saturated casual-game colours (the kit's lighting adds warmth and depth).
export const PALETTE = {
  amberGlow: '#ffb627',
  canvasRed: '#ec1c2e',
  cedar: '#c8582a',
  cobalt: '#1f4fe0',
  lumber: '#f7a21b',
  safety: '#ffd21a',
  steel: '#e5ebf3',
  mint: '#16d6b4',
  candyPink: '#ff3d8f',
  magenta: '#e5179b',
  lime: '#8ee82a',
  citrus: '#ffae0f',
  hazard: '#facc15',
  hazardDark: '#1b1f2a',
  navy: '#1a2560',
  azure: '#2fb6ff',
  vermilion: '#ff4320',
  royalBlue: '#2350e6',
  emerald: '#0fbf7c',
} as const

const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]
const spin: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' }

// Voluminous cartoon smoke: puffs, each a cluster of round blobs with a sunlit highlight, rising one
// after another (`.mg-smoke`).
export const smoke = (key: string, at: Pt, color: string, delays: number[], size = 1) => (
  <g key={key} transform={`translate(${at[0]} ${at[1]})`}>
    {delays.map((delay, i) => (
      <g key={delay} className="mg-smoke" style={{ ...spin, animationDelay: `${delay}s` }}>
        <circle cx={i * 2 - 4 * size} cy={-5} r={(4.6 - i * 0.5) * size} fill={color} />
        <circle cx={i * 2 + 4 * size} cy={-5} r={(4.2 - i * 0.5) * size} fill={color} />
        <circle cx={i * 2} cy={-9 * size} r={(6.4 - i * 0.6) * size} fill={color} />
        <circle cx={i * 2 - 2 * size} cy={-11 * size} r={2.4 * size} fill="#ffffff" opacity={0.85} />
      </g>
    ))}
  </g>
)

// A warm light: a soft halo behind a bright core (no filters).
const Glow = ({ at, r, color }: { at: Pt; r: number; color: string }) => (
  <g data-part="glow">
    <circle cx={at[0]} cy={at[1]} r={r * 2.4} fill={color} opacity={0.22} />
    <circle cx={at[0]} cy={at[1]} r={r} fill={color} />
  </g>
)

// Black-and-yellow safety stripes along an edge from a to b: slanted bands `height` tall.
function HazardStripes({ a, b, height, count, skew = 4, yellow = PALETTE.hazard }: { a: Pt; b: Pt; height: number; count: number; skew?: number; yellow?: string }) {
  return (
    <g data-part="hazard-stripes">
      {Array.from({ length: count }, (_, i) => {
        const p0 = mix(a, b, i / count)
        const p1 = mix(a, b, (i + 1) / count)
        return <Face key={i} at={[p0, p1, add(p1, [skew, -height]), add(p0, [skew, -height])]} fill={i % 2 ? PALETTE.hazardDark : yellow} />
      })}
    </g>
  )
}

// ── Factories ─────────────────────────────────────────────────────────────────

// The Furniture Factory: a cedar-sided sawmill under a cobalt corrugated tin roof, amber lumber stacked
// outside, a silver circular saw on a safety-striped bench (it turns and throws sawdust sparks while
// powered) and extraction pipes (smoking while powered).
// The Candy Factory: a mint workshop with a hot-pink roof, glowing gumdrops and a lollipop on the
// ridge, a gloss candy-cane chimney (white smoke while powered) and a conveyor of magenta candies.
export function FactorySprite({ powered = true, kind = 'furniture' }: { powered?: boolean; kind?: 'furniture' | 'candy' }) {
  return kind === 'candy' ? <CandyFactory powered={powered} /> : <Sawmill powered={powered} />
}

// The factory block's lit (left) wall: from its west corner to its south corner.
const FACTORY = isoCorners([0, 0], BASES.factory.a, BASES.factory.b)
const LEFT_W = FACTORY[3]
const LEFT_S = FACTORY[2]

function Sawmill({ powered }: { powered: boolean }) {
  const wall = 46
  return (
    <g strokeLinejoin="round" data-building="furniture_factory" data-powered={powered}>
      <FootprintShadow w={2} h={2} />
      <Contact rx={96} ry={42} />
      <IsoBox {...BASES.factory} h={wall} color={PALETTE.cedar} />
      {/* Cedar siding: plank lines along both walls. */}
      <g data-part="cedar-siding">
        {[1, 2, 3, 4, 5, 6, 7].map((k) => {
          const y = -(wall * k) / 8
          return (
            <g key={k}>
              <line x1={LEFT_W[0]} y1={LEFT_W[1] + y} x2={LEFT_S[0]} y2={LEFT_S[1] + y} stroke={lit(PALETTE.cedar, 0.5)} strokeWidth={0.9} opacity={0.6} />
              <line x1={LEFT_S[0]} y1={LEFT_S[1] + y} x2={FACTORY[1][0]} y2={FACTORY[1][1] + y} stroke={lit(PALETTE.cedar, 1)} strokeWidth={0.9} opacity={0.5} />
            </g>
          )
        })}
      </g>
      {/* Timber framing: dark posts on the lit wall. */}
      {[0.15, 0.5, 0.85].map((t) => {
        const [x, y] = mix(LEFT_W, LEFT_S, t)
        return <Face key={t} at={[[x - 2, y], [x + 2, y + 2], [x + 2, y - wall + 2], [x - 2, y - wall]]} fill="#5e2408" />
      })}
      {/* Windows: warm light while working. */}
      <Face at={[[-70, -16], [-56, -9], [-56, -24], [-70, -31]]} fill={powered ? PALETTE.amberGlow : '#33304a'} />
      <Face at={[[-40, -1], [-26, 6], [-26, -9], [-40, -16]]} fill={powered ? PALETTE.amberGlow : '#33304a'} />
      {/* Cobalt corrugated tin roof: slopes with ribs. */}
      <GableRoof at={[0, -wall]} a={46} b={40} rise={34} color={PALETTE.cobalt} />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <Face key={t} at={[[-92 + t * 92, -wall - 3 + t * 46], [-90 + t * 92, -wall - 2 + t * 46], [-44 + t * 92, -wall - 46 + t * 46], [-46 + t * 92, -wall - 47 + t * 46]]} fill={lit(PALETTE.cobalt, 0.7)} opacity={0.55} />
      ))}
      {/* Extraction pipes over the roof, smoking while it works. */}
      <Cylinder at={[34, -wall - 18]} rx={6} ry={3} h={46} facets={8} color="#b8c4d6" bands={[{ t: 0.85, color: PALETTE.safety, width: 0.08 }]} />
      <Cylinder at={[52, -wall - 8]} rx={5} ry={2.5} h={34} facets={8} color="#b8c4d6" />
      {powered && smoke('pipe', [34, -wall - 66], '#f4f6fb', [0, 1.1, 2.2])}
      {/* Amber lumber: a stack of planks and a pile of logs in front of the lit wall. */}
      <IsoBox at={[-64, 24]} a={20} b={10} h={8} color={PALETTE.lumber} />
      <IsoBox at={[-64, 16]} a={18} b={9} h={8} color="#ffbe3d" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx={-22 + i * 9} cy={40 - i * 1.5} rx={4.5} ry={4.5} fill="#ffcf7a" />
          <circle cx={-22 + i * 9} cy={40 - i * 1.5} r={1.6} fill="#b5650f" />
        </g>
      ))}
      {/* The saw bench, its front in yellow safety stripes, and the silver circular saw. */}
      <IsoBox at={[54, 20]} a={14} b={10} h={14} color="#5c6577" />
      <HazardStripes a={add([54, 20], [-24, -2])} b={add([54, 20], [-4, 12])} height={5} count={6} skew={2} yellow={PALETTE.safety} />
      <g transform="translate(56 -2)">
        <g className={powered ? 'mg-spin-slow' : undefined} style={spin} data-part="saw">
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30})`}>
              <Face at={[[0, -13], [3, -10], [-3, -10]]} fill="#ffffff" />
            </g>
          ))}
          <circle r={10} fill={PALETTE.steel} />
          <circle r={7} fill="#c3cfde" />
          <circle cx={-3} cy={-3} r={2.4} fill="#ffffff" opacity={0.9} />
          <circle r={2.6} fill="#2b3446" />
        </g>
        {powered && (
          <g data-part="sawdust">
            {[
              [-16, -10, 0],
              [-12, -16, 0.25],
              [-20, -4, 0.5],
              [-8, -18, 0.75],
              [-18, -14, 1],
              [-14, -6, 1.25],
            ].map(([dx, dy, delay], i) => (
              <circle key={i} cx={-6} cy={-6} r={i % 2 ? 1.3 : 1.8} fill={['#ffe28a', '#ffb547', '#fff6d5'][i % 3]} className="mg-spark" style={{ '--mg-dx': `${dx}px`, '--mg-dy': `${dy}px`, animationDelay: `${delay}s` } as Vars} />
            ))}
          </g>
        )}
      </g>
    </g>
  )
}

// A glossy gumdrop: a sugared dome with a highlight; it glows while the factory runs.
function Gumdrop({ at, color, glow }: { at: Pt; color: string; glow: boolean }) {
  const [x, y] = at
  return (
    <g data-part="gumdrop">
      {glow && <circle cx={x} cy={y - 5} r={13} fill={color} opacity={0.25} />}
      <path d={`M ${x - 7} ${y} Q ${x - 7} ${y - 12} ${x} ${y - 12} Q ${x + 7} ${y - 12} ${x + 7} ${y} Z`} fill={color} />
      <path d={`M ${x + 1} ${y} Q ${x + 7} ${y - 1} ${x + 7} ${y - 5} Q ${x + 6} ${y} ${x + 1} ${y} Z`} fill="#2a1150" opacity={0.18} />
      <ellipse cx={x - 2.6} cy={y - 8} rx={2.2} ry={1.4} fill="#ffffff" opacity={0.85} />
    </g>
  )
}

function CandyFactory({ powered }: { powered: boolean }) {
  const wall = 44
  // The conveyor runs out of the lit wall towards the viewer (down-left along y).
  const belt0: Pt = [-30, 22]
  const belt1: Pt = [-74, 44]
  const beltVars: Vars = { '--mg-cx': `${(belt1[0] - belt0[0]).toFixed(1)}px`, '--mg-cy': `${(belt1[1] - belt0[1]).toFixed(1)}px` }
  // The roof ridge (GableRoof with its default overhang): from its back end r0 to its front end r1.
  const r0: Pt = [-52, -wall - 56]
  const r1: Pt = [52, -wall - 4]
  const ridge = (t: number) => mix(r0, r1, t)
  return (
    <g strokeLinejoin="round" data-building="candy_factory" data-powered={powered}>
      <FootprintShadow w={2} h={2} />
      <Contact rx={96} ry={42} />
      <IsoBox {...BASES.factory} h={wall} color={PALETTE.mint} />
      {/* White trim and round-topped windows (glowing while making candy). */}
      <Face at={[add(LEFT_W, [0, -wall + 4]), add(LEFT_S, [0, -wall + 4]), add(LEFT_S, [0, -wall + 8]), add(LEFT_W, [0, -wall + 8])]} fill="#ffffff" opacity={0.9} />
      <Face at={[add(LEFT_W, [0, -4]), add(LEFT_S, [0, -4]), LEFT_S, LEFT_W]} fill={PALETTE.candyPink} opacity={0.9} />
      {[0.25, 0.62].map((t) => {
        const [x, y] = mix(LEFT_W, LEFT_S, t)
        return (
          <g key={t}>
            {powered && <circle cx={x + 6} cy={y - 16} r={14} fill="#fff3a3" opacity={0.3} />}
            <Face at={[[x, y - 10], [x + 12, y - 4], [x + 12, y - 22], [x + 6, y - 27], [x, y - 25]]} fill={powered ? '#fff3a3' : '#2e3f58'} />
          </g>
        )
      })}
      <GableRoof at={[0, -wall]} a={46} b={40} rise={30} color={PALETTE.candyPink} />
      {/* A gloss candy-cane chimney with a striped cap, white smoke while powered. */}
      <Cylinder
        at={[36, -wall - 20]}
        rx={9}
        ry={4.5}
        h={44}
        facets={10}
        color="#ffffff"
        bands={[0.1, 0.32, 0.54, 0.76].map((t) => ({ t, color: '#f0132f', width: 0.11 }))}
      />
      <line x1={30} y1={-wall - 24} x2={30} y2={-wall - 60} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />
      <Cone at={[36, -wall - 64]} rx={11} ry={5.5} h={10} facets={10} color={PALETTE.citrus} />
      {powered && smoke('steam', [36, -wall - 76], '#ffffff', [0, 1.1, 2.2], 1.15)}
      {/* Ridge props: gumdrops (pink, lime), a citrus lollipop and a giant wrapped candy. */}
      <Gumdrop at={ridge(0.08)} color={PALETTE.candyPink} glow={powered} />
      <g transform={`translate(${ridge(0.27)[0]} ${ridge(0.27)[1] + 3})`}>
        <Face at={[[-22, -6], [-12, 0], [-22, 6]]} fill={lit(PALETTE.magenta, -0.4)} />
        <Face at={[[22, -6], [12, 0], [22, 6]]} fill={lit(PALETTE.magenta, 0.4)} />
        <ellipse cx={0} cy={0} rx={14} ry={9} fill={PALETTE.magenta} />
        <ellipse cx={-4} cy={-3} rx={6} ry={3} fill="#ff9fd6" />
      </g>
      <Gumdrop at={ridge(0.47)} color={PALETTE.lime} glow={powered} />
      <g data-part="lollipop">
        <line x1={ridge(0.64)[0]} y1={ridge(0.64)[1]} x2={ridge(0.64)[0]} y2={ridge(0.64)[1] - 16} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        {powered && <circle cx={ridge(0.64)[0]} cy={ridge(0.64)[1] - 22} r={14} fill={PALETTE.citrus} opacity={0.25} />}
        <circle cx={ridge(0.64)[0]} cy={ridge(0.64)[1] - 22} r={7.5} fill={PALETTE.citrus} />
        <circle cx={ridge(0.64)[0]} cy={ridge(0.64)[1] - 22} r={4.6} fill="none" stroke="#ffffff" strokeWidth={1.6} opacity={0.9} />
        <circle cx={ridge(0.64)[0] - 2.6} cy={ridge(0.64)[1] - 25} r={1.6} fill="#ffffff" />
      </g>
      {/* The conveyor: a dark belt on legs, magenta wrapped candies riding it. */}
      <Face at={[add(belt0, [-6, -4]), add(belt0, [6, 2]), add(belt1, [6, 2]), add(belt1, [-6, -4])]} fill="#2b3550" />
      <Face at={[add(belt0, [6, 2]), add(belt0, [6, 6]), add(belt1, [6, 6]), add(belt1, [6, 2])]} fill="#161c30" />
      <Bevel from={add(belt0, [-6, -4])} to={add(belt1, [-6, -4])} width={1} opacity={0.5} />
      {[0.3, 0.7].map((t) => {
        const q = mix(belt0, belt1, t)
        return <Face key={t} at={[add(q, [4, 4]), add(q, [6, 4]), add(q, [6, 16]), add(q, [4, 16])]} fill="#3b4766" />
      })}
      <g className={powered ? 'mg-conveyor' : undefined} style={beltVars} data-conveyor={powered ? 'moving' : 'still'}>
        {[0.15, 0.5, 0.85].map((t, i) => {
          const q = add(mix(belt0, belt1, t), [0, -4])
          const wrap = [PALETTE.magenta, '#ff5fc0', PALETTE.magenta][i]
          return (
            <g key={t} transform={`translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`} data-part="candy">
              <Face at={[[-9, -3], [-5, 0], [-9, 3]]} fill={lit(wrap, -0.3)} />
              <Face at={[[9, -3], [5, 0], [9, 3]]} fill={lit(wrap, 0.4)} />
              <ellipse rx={5.5} ry={4} fill={wrap} />
              <ellipse cx={-1.6} cy={-1.4} rx={2} ry={1.1} fill="#ffffff" opacity={0.8} />
            </g>
          )
        })}
      </g>
    </g>
  )
}

// ── Seaport ─────────────────────────────────────────────────────────────────

// Which shore the seaport faces: its row decides (lib/powerGrid isCoastalSpot). 'front' = the last
// rows (south-west shore, facing the viewer), 'back' = the first rows (north-east shore).
export type Shore = 'front' | 'back'
export const shoreOf = (gridY: number): Shore => (gridY === 0 ? 'back' : 'front')

// One tile's step out to sea, perpendicular to the shore, on screen.
const SEAWARD: Record<Shore, Pt> = { front: [-TILE_W / 2, TILE_H / 2], back: [TILE_W / 2, -TILE_H / 2] }
// One tile's step along the shore (the seaport's long side), on screen.
const ALONG: Pt = [TILE_W / 2, TILE_H / 2]

// Azure water ripples round the pilings: flat rings swelling and fading (`.mg-wave`).
function Ripples({ points }: { points: Pt[] }) {
  return (
    <g data-part="ripples">
      {points.map((q, i) => (
        <ellipse key={i} cx={q[0] + 2.5} cy={q[1] + 22} rx={9} ry={3.6} fill="none" stroke={PALETTE.azure} strokeWidth={1.6} className="mg-wave" style={{ ...spin, animationDelay: `${(i % 3) * 0.9}s` }} />
      ))}
    </g>
  )
}

// A 6 × 2 wharf: concrete and timber decking on navy pilings over azure ripples, a jetty reaching out
// to sea, black-and-yellow diagonal curbs and bollards on the waterline, pallets of cargo, container
// stacks and a hazard-yellow lattice jib crane. While powered, a cargo freighter loops: it sails in,
// docks alongside, loads, and sails away.
export function SeaportSprite({ shore = 'front', powered = true }: { shore?: Shore; powered?: boolean }) {
  const [top, right, bottom, left] = diamond(6, 2)
  const [c0, c1] = shore === 'front' ? [left, bottom] : [top, right]
  const [i0, i1] = shore === 'front' ? [top, right] : [left, bottom]
  const out = SEAWARD[shore]
  const j0 = mix(c0, c1, 1 / 6)
  const j1 = mix(c0, c1, 5 / 6)
  const jo0 = add(j0, out, 1.4)
  const jo1 = add(j1, out, 1.4)
  const deck: Pt = [0, -10]
  const shipVars: Vars = {
    '--mg-ox': `${out[0].toFixed(1)}px`,
    '--mg-oy': `${out[1].toFixed(1)}px`,
    '--mg-ax': `${ALONG[0].toFixed(1)}px`,
    '--mg-ay': `${ALONG[1].toFixed(1)}px`,
  }
  const berth = add(mix(jo0, jo1, 0.5), out, 0.95)
  const inland = (t: number, k = 0.5): Pt => mix(mix(i0, c0, k), mix(i1, c1, k), t)
  const pilings = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => mix(jo0, jo1, t))
  const concrete = '#b9b4c9'
  return (
    <g strokeLinejoin="round" data-building="seaport" data-shore={shore} data-powered={powered}>
      {powered && shore === 'back' && <Freighter at={berth} vars={shipVars} />}
      <Ripples points={pilings} />
      {/* Dark navy pilings under the jetty. */}
      {pilings.map((q, i) => (
        <g key={i}>
          <Face at={[q, add(q, [5, 2.5]), add(q, [5, 24]), add(q, [0, 21])]} fill={PALETTE.navy} />
          <Face at={[q, add(q, [2, 1]), add(q, [2, 22]), add(q, [0, 21])]} fill={lit(PALETTE.navy, -0.8)} />
        </g>
      ))}
      {/* The jetty deck over the water. */}
      <Face at={[add(j0, deck), add(j1, deck), add(jo1, deck), add(jo0, deck)]} fill="#d0893f" />
      <Face at={[add(jo0, deck), add(jo1, deck), jo1, jo0]} fill="#6e300c" />
      <Bevel from={add(jo0, deck)} to={add(jo1, deck)} width={1.2} opacity={0.7} />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <Face key={t} at={[add(mix(j0, jo0, t), deck), add(mix(j1, jo1, t), deck), add(mix(j1, jo1, t + 0.04), deck), add(mix(j0, jo0, t + 0.04), deck)]} fill="#a85f22" />
      ))}
      {/* The wharf: concrete sides, timber planks, a concrete strip along the inland edge. */}
      <Face at={[left, bottom, add(bottom, [0, 12]), add(left, [0, 12])]} fill={lit(concrete, -0.5)} />
      <Face at={[bottom, right, add(right, [0, 12]), add(bottom, [0, 12])]} fill={lit(concrete, 0.6)} />
      <Face at={[add(top, deck), add(right, deck), add(bottom, deck), add(left, deck)]} fill="#dda05c" />
      {[1, 2, 3, 4, 5].map((i) => {
        const t = i / 6
        return <Face key={i} at={[add(mix(top, right, t), deck), add(mix(left, bottom, t), deck), add(mix(left, bottom, t + 0.012), deck), add(mix(top, right, t + 0.012), deck)]} fill="#b4733a" />
      })}
      <Face at={[add(i0, deck), add(i1, deck), add(mix(i1, c1, 0.18), deck), add(mix(i0, c0, 0.18), deck)]} fill="#e4e0ee" />
      {/* Black-and-yellow diagonal hazard curb along the waterline. */}
      <HazardStripes a={add(c0, deck)} b={add(c1, deck)} height={4} count={16} skew={4} />
      <Bevel from={add(c0, [4, -14])} to={add(c1, [4, -14])} width={1} opacity={0.6} />
      {/* Bollards. */}
      {[0.1, 0.35, 0.65, 0.9].map((t) => {
        const q = add(mix(c0, c1, t), [0, -14])
        return <Cylinder key={t} at={q} rx={4} ry={2} h={8} facets={6} color={PALETTE.hazardDark} cap={PALETTE.hazard} />
      })}
      {/* Pallets of cargo and two container stacks inland. */}
      {[0.12, 0.3].map((t) => (
        <g key={t}>
          <IsoBox at={add(inland(t, 0.45), deck)} a={10} b={10} h={3} color="#b5651d" />
          <IsoBox at={add(inland(t, 0.45), [0, -13])} a={8} b={8} h={10} color={PALETTE.lumber} />
        </g>
      ))}
      <ContainerStack at={add(inland(0.58, 0.4), deck)} colors={[PALETTE.vermilion, PALETTE.royalBlue, PALETTE.emerald]} />
      <ContainerStack at={add(inland(0.8, 0.4), deck)} colors={[PALETTE.royalBlue, PALETTE.emerald]} />
      {/* The hazard-yellow jib crane on the waterline, its jib over the water. */}
      <JibCrane base={add(mix(c0, c1, 0.42), deck)} out={out} powered={powered} />
      {/* Lamps: lit when powered. */}
      {[0.03, 0.97].map((t) => {
        const q = add(mix(c0, c1, t), deck)
        return (
          <g key={t}>
            <Face at={[add(q, [-1.5, 0]), add(q, [1.5, 0]), add(q, [1.5, -36]), add(q, [-1.5, -36])]} fill="#2b3446" />
            {powered ? <Glow at={[q[0], q[1] - 38]} r={4} color="#ffe28a" /> : <circle cx={q[0]} cy={q[1] - 38} r={4} fill="#6d6a80" />}
          </g>
        )
      })}
      {powered && shore === 'front' && <Freighter at={berth} vars={shipVars} />}
    </g>
  )
}

// Shipping containers stacked: each a long ribbed box, lit left, shaded right, with a bright rim.
function ContainerStack({ at, colors }: { at: Pt; colors: string[] }) {
  return (
    <g data-part="containers">
      {colors.map((color, i) => (
        <g key={i}>
          <IsoBox at={[at[0] + (i % 2) * 3, at[1] - i * 13]} a={24} b={10} h={13} color={color} />
          {[0.25, 0.5, 0.75].map((t) => (
            <Face
              key={t}
              at={[
                [at[0] + (i % 2) * 3 - 34 + t * 48, at[1] - i * 13 - 7 + t * 24],
                [at[0] + (i % 2) * 3 - 33 + t * 48, at[1] - i * 13 - 6.5 + t * 24],
                [at[0] + (i % 2) * 3 - 33 + t * 48, at[1] - i * 13 - 18.5 + t * 24],
                [at[0] + (i % 2) * 3 - 34 + t * 48, at[1] - i * 13 - 19 + t * 24],
              ]}
              fill={lit(color, 0.6)}
              opacity={0.6}
            />
          ))}
        </g>
      ))}
    </g>
  )
}

// A hazard-yellow steel-truss jib crane: a lattice tower, a cab, a jib reaching out over the water with
// a counter-jib behind, and a hook with a spreader that bobs while powered.
function JibCrane({ base, out, powered }: { base: Pt; out: Pt; powered: boolean }) {
  const h = 96
  const topP = add(base, [0, -h])
  const tip = add(topP, out, 1.6)
  const tail = add(topP, out, -0.55)
  const yellow = '#ffc61a'
  return (
    <g data-crane="">
      {/* Tower: two legs with cross bracing. */}
      <Face at={[add(base, [-9, 0]), add(base, [-5, 0]), add(topP, [-3, 0]), add(topP, [-6, 0])]} fill={lit(yellow, -0.6)} />
      <Face at={[add(base, [5, 0]), add(base, [9, 0]), add(topP, [6, 0]), add(topP, [3, 0])]} fill={lit(yellow, 0.6)} />
      {[0, 1, 2, 3].map((i) => {
        const y0 = -i * (h / 4)
        const y1 = -(i + 1) * (h / 4)
        return (
          <g key={i}>
            <line x1={base[0] - 7 + i * 0.5} y1={base[1] + y0} x2={base[0] + 7 - i * 0.5} y2={base[1] + y1} stroke={lit(yellow, 0.25)} strokeWidth={1.6} />
            <line x1={base[0] + 7 - i * 0.5} y1={base[1] + y0} x2={base[0] - 7 + i * 0.5} y2={base[1] + y1} stroke={lit(yellow, 0.5)} strokeWidth={1.1} />
          </g>
        )
      })}
      {/* Cab and machinery box. */}
      <IsoBox at={add(topP, [0, 4])} a={8} b={8} h={12} color={yellow} />
      <Face at={[add(topP, [-14, -4]), add(topP, [-6, 0]), add(topP, [-6, -6]), add(topP, [-14, -10])]} fill="#2fb6ff" opacity={0.9} />
      {/* Jib and counter-jib, trussed. */}
      <Face at={[add(topP, [-2, -10]), add(topP, [2, -12]), add(tip, [2, -2]), add(tip, [0, 0])]} fill={yellow} />
      <Bevel from={add(topP, [-2, -10])} to={add(tip, [0, 0])} width={1} opacity={0.75} />
      <line x1={topP[0]} y1={topP[1] - 4} x2={tip[0]} y2={tip[1] + 4} stroke={lit(yellow, 0.4)} strokeWidth={1.4} />
      {[0.25, 0.5, 0.75].map((t) => {
        const q = mix(add(topP, [0, -11]), tip, t)
        return <line key={t} x1={q[0]} y1={q[1]} x2={q[0] + 4} y2={q[1] + 10} stroke={lit(yellow, 0.4)} strokeWidth={1.2} />
      })}
      <Face at={[add(topP, [-2, -10]), add(topP, [2, -12]), add(tail, [2, -2]), add(tail, [-2, 0])]} fill={lit(yellow, 0.3)} />
      <IsoBox at={add(tail, [0, 6])} a={6} b={6} h={8} color="#5c6577" />
      <g className={powered ? 'mg-bob' : undefined}>
        <line x1={tip[0]} y1={tip[1]} x2={tip[0]} y2={tip[1] + 34} stroke={PALETTE.hazardDark} strokeWidth={1.2} />
        <Face at={[add(tip, [-8, 34]), add(tip, [8, 34]), add(tip, [8, 38]), add(tip, [-8, 38])]} fill={PALETTE.hazardDark} />
        <Face at={[add(tip, [-8, 34]), add(tip, [-4, 34]), add(tip, [-4, 38]), add(tip, [-8, 38])]} fill={PALETTE.hazard} />
      </g>
    </g>
  )
}

// The cargo freighter: a navy hull with a red stripe and waterline, colourful containers on deck, a
// white wheelhouse bridge with a window band, a funnel, and a foaming wake (`.mg-wake`). It loops
// (`.mg-ship`, globals.css: sail in from far out, dock, sail away) along --mg-ox/--mg-oy (out to sea)
// and --mg-ax/--mg-ay (along the shore). `at` is its berth.
function Freighter({ at, vars }: { at: Pt; vars: Vars }) {
  return (
    <g transform={`translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`}>
      <g className="mg-ship" style={vars} data-ship="">
        <ellipse cx={0} cy={12} rx={84} ry={17} fill="#0a6fb8" opacity={0.4} />
        {/* The wake: foam rings off the bow and stern, swelling and fading. */}
        <g data-part="wake">
          {[
            [-84, 8, 0],
            [-92, 14, 0.6],
            [84, 6, 0.3],
            [92, 12, 0.9],
            [0, 22, 0.45],
          ].map(([x, y, delay], i) => (
            <ellipse key={i} cx={x} cy={y} rx={12} ry={3.4} fill="none" stroke="#ffffff" strokeWidth={1.8} className="mg-wake" style={{ ...spin, animationDelay: `${delay}s` }} />
          ))}
        </g>
        {/* Hull: navy above a red waterline, a red stripe, a raked bow. */}
        <Face at={[[-78, -6], [-60, 12], [66, 12], [82, -8], [74, -16], [-72, -16]]} fill={PALETTE.navy} />
        <Face at={[[-76, -9], [78, -11], [80, -8], [-74, -5]]} fill={PALETTE.canvasRed} />
        <Face at={[[-60, 12], [66, 12], [62, 18], [-54, 18]]} fill={PALETTE.canvasRed} />
        <Face at={[[-72, -16], [74, -16], [70, -21], [-68, -21]]} fill="#ffffff" />
        <Bevel from={[-72, -16]} to={[74, -16]} width={1} opacity={0.8} />
        {/* Containers on deck. */}
        {[-56, -36, -16, 4, 24].map((x, i) => (
          <g key={x}>
            <Face at={[[x, -21], [x + 18, -21], [x + 18, -37], [x, -37]]} fill={[PALETTE.vermilion, PALETTE.royalBlue, PALETTE.emerald, PALETTE.hazard, PALETTE.vermilion][i]} />
            <Face at={[[x, -37], [x + 18, -37], [x + 22, -41], [x + 4, -41]]} fill="#ffffff" opacity={0.35} />
            {i % 2 === 0 && <Face at={[[x + 2, -37], [x + 16, -37], [x + 16, -49], [x + 2, -49]]} fill={[PALETTE.royalBlue, PALETTE.emerald, PALETTE.vermilion][i / 2]} />}
          </g>
        ))}
        {/* White wheelhouse bridge and funnel at the stern. */}
        <Face at={[[46, -21], [66, -21], [66, -52], [46, -52]]} fill="#ffffff" />
        <Face at={[[46, -52], [66, -52], [70, -56], [50, -56]]} fill="#dfe6f2" />
        <Face at={[[48, -46], [64, -46], [64, -41], [48, -41]]} fill={PALETTE.navy} />
        <Face at={[[54, -56], [62, -56], [62, -70], [54, -70]]} fill={PALETTE.canvasRed} />
        <Face at={[[54, -66], [62, -66], [62, -63], [54, -63]]} fill={PALETTE.hazardDark} />
      </g>
    </g>
  )
}

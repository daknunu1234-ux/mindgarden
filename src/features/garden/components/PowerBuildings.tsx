// The power-grid buildings as 3D low-poly miniatures (lowPolyKit: faceted solids lit from the upper
// left, flat fills, no outlines), drawn around their ground point (0, 0), the centre of the footprint's
// diamond. Pure markup, no hooks; animations are `.mg-*` classes in globals.css (off for reduced
// motion, paused with the farm: `.mg-paused`).
//   Windmill (Small): white stucco tower, timber balcony, terracotta cone, lattice sails (`.mg-spin`).
//   Grand Windmill: stone masonry tower, two timber decks, brass gear housing, crimson dome, wide sails.
//   Furniture Factory: timber-frame sawmill, corrugated roof, lumber stacks, a circular saw
//     (`.mg-spin-slow` while powered), extraction pipes with smoke while powered.
//   Candy Factory: pastel-teal workshop, coral roof, candy-swirl chimney (sweet steam while powered),
//     a conveyor of wrapped candies (`.mg-conveyor` while powered).
//   Seaport: a wharf on pilings with hazard curbs, bollards, pallets, a yellow lattice jib crane and
//     container stacks; while powered a cargo freighter sails in, docks and sails away (`.mg-ship`).
import type { CSSProperties } from 'react'
import { TILE_H, TILE_W } from '../lib/farmGrid'
import { Cone, Contact, Cylinder, Face, GableRoof, IsoBox, lit, type Pt } from './lowPolyKit'

type Vars = CSSProperties & Record<`--mg-${string}`, string>

// The four corners of a w × h footprint's diamond, around its centre: top, right, bottom, left.
export function diamond(w: number, h: number): [Pt, Pt, Pt, Pt] {
  const top: Pt = [(-(w - h) * TILE_W) / 4, (-(w + h) * TILE_H) / 4]
  return [top, [top[0] + (w * TILE_W) / 2, top[1] + (w * TILE_H) / 2], [top[0] + ((w - h) * TILE_W) / 2, top[1] + ((w + h) * TILE_H) / 2], [top[0] - (h * TILE_W) / 2, top[1] + (h * TILE_H) / 2]]
}

// The ground blocks the 2 × 2 buildings stand on (iso half-extents): inside their tile diamond, so
// they never spill onto a neighbour's tiles and depth sorting by ground point holds (tested).
export const BASES = {
  windmillSmall: { a: 34, b: 34 },
  windmillLarge: { a: 40, b: 40 },
  factory: { a: 46, b: 40 },
} as const

const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]
const smoke = (key: string, at: Pt, color: string, delays: number[]) => (
  <g key={key} transform={`translate(${at[0]} ${at[1]})`}>
    {delays.map((delay, i) => (
      <circle key={delay} cx={i * 2} cy={-6} r={6 - i} fill={color} className="mg-smoke" style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }} />
    ))}
  </g>
)

// ── Windmills ────────────────────────────────────────────────────────────────

// One sail: a timber spar from the hub with a lattice frame of laths on one side.
function Sail({ length, width, frame, lath }: { length: number; width: number; frame: string; lath: string }) {
  const rungs = Array.from({ length: 6 }, (_, i) => 0.25 + i * 0.13)
  return (
    <g>
      <Face at={[[-2.5, 0], [2.5, 0], [3, -length], [-2, -length]]} fill="#6b3d1a" />
      <Face at={[[3, -length * 0.18], [3 + width, -length * 0.2], [3 + width, -length], [3, -length]]} fill={frame} opacity={0.35} />
      {/* The frame's two long rails and its laths across. */}
      <Face at={[[3 + width - 2, -length * 0.2], [3 + width, -length * 0.2], [3 + width, -length], [3 + width - 2, -length]]} fill={frame} />
      {rungs.map((t) => (
        <Face key={t} at={[[3, -length * t], [3 + width, -length * t - 0.6], [3 + width, -length * t + 1.2], [3, -length * t + 1.8]]} fill={lath} />
      ))}
      {[0.33, 0.66].map((t) => (
        <Face key={t} at={[[3 + width * t, -length * 0.2], [3 + width * t + 1.4, -length * 0.2], [3 + width * t + 1.4, -length], [3 + width * t, -length]]} fill={lath} />
      ))}
    </g>
  )
}

// Four sails turning about the hub (the group's box is centred on the hub).
function Sails({ at, length, width, frame, lath, hub }: { at: Pt; length: number; width: number; frame: string; lath: string; hub: string }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`}>
      <g className="mg-spin" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <Sail length={length} width={width} frame={frame} lath={lath} />
          </g>
        ))}
        <circle r={length * 0.1} fill={hub} />
        <circle r={length * 0.04} fill="#fde68a" />
      </g>
    </g>
  )
}

// A ring deck round a tower: a thin faceted disc with posts and a rail.
function Deck({ at, rx, ry, color }: { at: Pt; rx: number; ry: number; color: string }) {
  return (
    <g>
      <Cylinder at={at} rx={rx} ry={ry} h={4} facets={12} color={color} />
      {Array.from({ length: 7 }, (_, i) => {
        const t = Math.PI * (0.08 + (i / 6) * 0.84)
        const x = at[0] + rx * Math.cos(t)
        const y = at[1] + ry * Math.sin(t) - 4
        return <Face key={i} at={[[x - 1, y], [x + 1, y], [x + 1, y - 9], [x - 1, y - 9]]} fill={lit(color, Math.cos(t))} />
      })}
      <Face at={[[at[0] - rx, at[1] - 12], [at[0] + rx, at[1] - 12], [at[0] + rx, at[1] - 10.5], [at[0] - rx, at[1] - 10.5]]} fill={lit(color, 0.3)} opacity={0.9} />
    </g>
  )
}

export function WindmillSprite({ size = 'small' }: { size?: 'small' | 'large' }) {
  if (size === 'large') return <GrandWindmill />
  return (
    <g strokeLinejoin="round" data-building="windmill_small">
      <Contact rx={72} ry={30} />
      {/* Stone plinth, then the white stucco tower narrowing upwards. */}
      <IsoBox {...BASES.windmillSmall} h={10} color="#cfcbdc" />
      <Cylinder at={[0, -10]} rx={32} ry={16} h={112} taper={0.7} facets={10} color="#f6f0e3" />
      {/* Door and two windows on the lit side. */}
      <Face at={[[-22, -8], [-10, -3], [-10, -36], [-22, -41]]} fill="#7a4a22" />
      <Face at={[[-18, -64], [-10, -61], [-10, -50], [-18, -53]]} fill="#3d6a8a" />
      <Face at={[[6, -86], [12, -88], [12, -77], [6, -75]]} fill="#2c4e66" />
      {/* Timber balcony half way up. */}
      <Deck at={[0, -74]} rx={30} ry={15} color="#c98a4b" />
      {/* Terracotta cone roof. */}
      <Cone at={[0, -122]} rx={27} ry={13.5} h={46} facets={10} color="#e0603a" />
      <Sails at={[10, -116]} length={76} width={18} frame="#f0d9b5" lath="#a0703f" hub="#5a3415" />
    </g>
  )
}

// The Grand Windmill: heavier and taller, in coursed stone, with two decks and a brass gear housing
// under a crimson dome, and wide framed sails.
function GrandWindmill() {
  return (
    <g strokeLinejoin="round" data-building="windmill_large">
      <Contact rx={86} ry={36} />
      <IsoBox {...BASES.windmillLarge} h={14} color="#a8a29e" />
      {/* Stone masonry: courses as darker bands up the tower. */}
      <Cylinder
        at={[0, -14]}
        rx={38}
        ry={19}
        h={150}
        taper={0.74}
        facets={12}
        color="#d6d0c4"
        bands={[0.12, 0.27, 0.42, 0.57, 0.72, 0.87].map((t) => ({ t, color: '#a8a091', width: 0.025 }))}
      />
      <Face at={[[-26, -12], [-12, -6], [-12, -46], [-26, -52]]} fill="#5a3415" />
      <Face at={[[-22, -88], [-12, -84], [-12, -70], [-22, -74]]} fill="#3d6a8a" />
      {/* Two observation decks. */}
      <Deck at={[0, -66]} rx={38} ry={19} color="#b5793c" />
      <Deck at={[0, -118]} rx={33} ry={16.5} color="#c98a4b" />
      {/* Brass gear housing and the crimson dome. */}
      <Cylinder at={[0, -164]} rx={30} ry={15} h={16} facets={12} color="#c9a227" bands={[{ t: 0.4, color: '#8a6d12', width: 0.2 }]} />
      <Cone at={[0, -180]} rx={32} ry={16} h={40} facets={12} color="#b91c1c" />
      <Cylinder at={[0, -216]} rx={4} ry={2} h={10} facets={6} color="#c9a227" />
      <Sails at={[14, -172]} length={104} width={28} frame="#f4e3c3" lath="#8a5a2b" hub="#4a2a10" />
    </g>
  )
}

// ── Factories ─────────────────────────────────────────────────────────────────

// The Furniture Factory: a timber-frame sawmill under a corrugated roof, lumber stacked outside, a
// circular saw under a hood (it turns while powered) and extraction pipes (smoking while powered).
// The Candy Factory: a pastel-teal workshop with a coral roof, a candy-swirl chimney, a giant wrapped
// candy on the ridge and a conveyor of candies rolling out (moving while powered).
export function FactorySprite({ powered = true, kind = 'furniture' }: { powered?: boolean; kind?: 'furniture' | 'candy' }) {
  return kind === 'candy' ? <CandyFactory powered={powered} /> : <Sawmill powered={powered} />
}

function Sawmill({ powered }: { powered: boolean }) {
  const wall = 46
  return (
    <g strokeLinejoin="round" data-building="furniture_factory" data-powered={powered}>
      <Contact rx={96} ry={42} />
      <IsoBox {...BASES.factory} h={wall} color="#d9a066" />
      {/* Timber framing: dark posts and a rail across the lit wall. */}
      {[0.15, 0.5, 0.85].map((t) => {
        const x = -86 + t * 80
        const y = -3 + t * 40
        return <Face key={t} at={[[x - 2, y + 2], [x + 2, y + 4], [x + 2, y - wall + 4], [x - 2, y - wall + 2]]} fill="#6b3d1a" />
      })}
      <Face at={[[-86, -wall + 18], [-6, 43 - wall + 18], [-6, 43 - wall + 22], [-86, -wall + 22]]} fill="#6b3d1a" />
      {/* Windows: warm light while working. */}
      <Face at={[[-70, -16], [-56, -9], [-56, -24], [-70, -31]]} fill={powered ? '#ffd166' : '#3d3a4a'} />
      <Face at={[[-40, -1], [-26, 6], [-26, -9], [-40, -16]]} fill={powered ? '#ffd166' : '#3d3a4a'} />
      {/* Corrugated roof: slopes with ribs. */}
      <GableRoof at={[0, -wall]} a={46} b={40} rise={34} color="#94a3b8" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <Face key={t} at={[[-92 + t * 92, -wall - 3 + t * 46], [-90 + t * 92, -wall - 2 + t * 46], [-44 + t * 92, -wall - 46 + t * 46], [-46 + t * 92, -wall - 47 + t * 46]]} fill="#64748b" opacity={0.55} />
      ))}
      {/* Extraction pipes over the roof, smoking while it works. */}
      <Cylinder at={[34, -wall - 18]} rx={6} ry={3} h={46} facets={8} color="#9ca3af" />
      <Cylinder at={[52, -wall - 8]} rx={5} ry={2.5} h={34} facets={8} color="#9ca3af" />
      {powered && smoke('pipe', [34, -wall - 66], '#e5e7eb', [0, 1.1, 2.2])}
      {/* Lumber: a stack of planks and a pile of logs in front of the lit wall. */}
      <IsoBox at={[-64, 24]} a={20} b={10} h={8} color="#e3b778" />
      <IsoBox at={[-64, 16]} a={18} b={9} h={8} color="#d9a066" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx={-22 + i * 9} cy={40 - i * 1.5} rx={4.5} ry={4.5} fill="#f0c48a" />
          <circle cx={-22 + i * 9} cy={40 - i * 1.5} r={1.6} fill="#a0703f" />
        </g>
      ))}
      {/* The circular saw under its hood on the shaded side. */}
      <IsoBox at={[54, 20]} a={14} b={10} h={14} color="#78716c" />
      <g transform="translate(56 -2)">
        <g className={powered ? 'mg-spin-slow' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30})`}>
              <Face at={[[0, -13], [3, -10], [-3, -10]]} fill="#e5e7eb" />
            </g>
          ))}
          <circle r={10} fill="#cbd5e1" />
          <circle r={3} fill="#475569" />
        </g>
      </g>
    </g>
  )
}

function CandyFactory({ powered }: { powered: boolean }) {
  const wall = 44
  // The conveyor runs out of the lit wall towards the viewer (down-left along y).
  const belt0: Pt = [-30, 22]
  const belt1: Pt = [-74, 44]
  const beltVars: Vars = { '--mg-cx': `${(belt1[0] - belt0[0]).toFixed(1)}px`, '--mg-cy': `${(belt1[1] - belt0[1]).toFixed(1)}px` }
  return (
    <g strokeLinejoin="round" data-building="candy_factory" data-powered={powered}>
      <Contact rx={96} ry={42} />
      <IsoBox {...BASES.factory} h={wall} color="#7dd3c8" />
      {/* Pastel trim and round-topped windows (lit while making candy). */}
      <Face at={[[-86, -wall + 4], [-6, 43 - wall + 4], [-6, 43 - wall + 8], [-86, -wall + 8]]} fill="#f9fafb" opacity={0.85} />
      {[0.25, 0.62].map((t) => {
        const x = -86 + t * 80
        const y = -3 + t * 40
        return <Face key={t} at={[[x, y - 10], [x + 12, y - 4], [x + 12, y - 22], [x + 6, y - 27], [x, y - 25]]} fill={powered ? '#fff3b0' : '#3d4a5a'} />
      })}
      <GableRoof at={[0, -wall]} a={46} b={40} rise={30} color="#fb7185" />
      {/* Candy-swirl chimney with a striped cap, sweet steam while powered. */}
      <Cylinder
        at={[36, -wall - 20]}
        rx={9}
        ry={4.5}
        h={44}
        facets={10}
        color="#ffffff"
        bands={[0.1, 0.32, 0.54, 0.76].map((t) => ({ t, color: '#f43f5e', width: 0.11 }))}
      />
      <Cone at={[36, -wall - 64]} rx={11} ry={5.5} h={10} facets={10} color="#fde047" />
      {powered && smoke('steam', [36, -wall - 76], '#fce7f3', [0, 1.1, 2.2])}
      {/* A giant wrapped candy on the ridge. */}
      <g transform={`translate(-30 ${-wall - 34})`}>
        <Face at={[[-22, -6], [-12, 0], [-22, 6]]} fill="#facc15" />
        <Face at={[[22, -6], [12, 0], [22, 6]]} fill="#eab308" />
        <ellipse cx={0} cy={0} rx={14} ry={9} fill="#ec4899" />
        <ellipse cx={-4} cy={-3} rx={6} ry={3} fill="#f9a8d4" />
      </g>
      {/* The conveyor: a dark belt on legs, wrapped candies riding it. */}
      <Face at={[add(belt0, [-6, -4]), add(belt0, [6, 2]), add(belt1, [6, 2]), add(belt1, [-6, -4])]} fill="#334155" />
      <Face at={[add(belt0, [6, 2]), add(belt0, [6, 6]), add(belt1, [6, 6]), add(belt1, [6, 2])]} fill="#1e293b" />
      {[0.3, 0.7].map((t) => {
        const q = mix(belt0, belt1, t)
        return <Face key={t} at={[add(q, [4, 4]), add(q, [6, 4]), add(q, [6, 16]), add(q, [4, 16])]} fill="#475569" />
      })}
      <g className={powered ? 'mg-conveyor' : undefined} style={beltVars} data-conveyor={powered ? 'moving' : 'still'}>
        {[0.15, 0.5, 0.85].map((t, i) => {
          const q = add(mix(belt0, belt1, t), [0, -4])
          const colors = ['#f472b6', '#a78bfa', '#facc15']
          return (
            <g key={t} transform={`translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`}>
              <Face at={[[-9, -3], [-5, 0], [-9, 3]]} fill={colors[i]} opacity={0.8} />
              <Face at={[[9, -3], [5, 0], [9, 3]]} fill={colors[i]} opacity={0.8} />
              <ellipse rx={5.5} ry={4} fill={colors[i]} />
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

// A 6 × 2 wharf: concrete and timber decking on pilings, a jetty reaching out to sea, yellow hazard
// curbs and bollards on the waterline, pallets of cargo, container stacks and a yellow lattice jib
// crane. While powered, a cargo freighter loops: it sails in, docks alongside, loads, and sails away.
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
  return (
    <g strokeLinejoin="round" data-building="seaport" data-shore={shore} data-powered={powered}>
      {powered && shore === 'back' && <Freighter at={berth} vars={shipVars} />}
      {/* Pilings under the jetty. */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
        const q = mix(jo0, jo1, t)
        return <Face key={t} at={[q, add(q, [5, 2.5]), add(q, [5, 24]), add(q, [0, 21])]} fill="#4a2a10" />
      })}
      {/* The jetty deck over the water. */}
      <Face at={[add(j0, deck), add(j1, deck), add(jo1, deck), add(jo0, deck)]} fill="#b9814a" />
      <Face at={[add(jo0, deck), add(jo1, deck), jo1, jo0]} fill="#6b3d1a" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <Face key={t} at={[add(mix(j0, jo0, t), deck), add(mix(j1, jo1, t), deck), add(mix(j1, jo1, t + 0.04), deck), add(mix(j0, jo0, t + 0.04), deck)]} fill="#9a6435" />
      ))}
      {/* The wharf: concrete sides, timber planks, a concrete strip along the inland edge. */}
      <Face at={[left, bottom, add(bottom, [0, 12]), add(left, [0, 12])]} fill={lit('#a8a29e', -0.5)} />
      <Face at={[bottom, right, add(right, [0, 12]), add(bottom, [0, 12])]} fill={lit('#a8a29e', 0.6)} />
      <Face at={[add(top, deck), add(right, deck), add(bottom, deck), add(left, deck)]} fill="#c99862" />
      {[1, 2, 3, 4, 5].map((i) => {
        const t = i / 6
        return <Face key={i} at={[add(mix(top, right, t), deck), add(mix(left, bottom, t), deck), add(mix(left, bottom, t + 0.012), deck), add(mix(top, right, t + 0.012), deck)]} fill="#a77a48" />
      })}
      <Face at={[add(i0, deck), add(i1, deck), add(mix(i1, c1, 0.18), deck), add(mix(i0, c0, 0.18), deck)]} fill="#d6d3d1" />
      {/* Yellow hazard curb along the waterline: yellow and dark stripes. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = mix(c0, c1, i / 12)
        const b = mix(c0, c1, (i + 1) / 12)
        return <Face key={i} at={[add(a, deck), add(b, deck), add(b, [0, -14]), add(a, [0, -14])]} fill={i % 2 ? '#1f2937' : '#facc15'} />
      })}
      {/* Bollards. */}
      {[0.1, 0.35, 0.65, 0.9].map((t) => {
        const q = add(mix(c0, c1, t), [0, -14])
        return <Cylinder key={t} at={q} rx={4} ry={2} h={8} facets={6} color="#1f2937" cap="#facc15" />
      })}
      {/* Pallets of cargo and two container stacks inland. */}
      {[0.12, 0.3].map((t) => (
        <g key={t}>
          <IsoBox at={add(inland(t, 0.45), deck)} a={10} b={10} h={3} color="#a0703f" />
          <IsoBox at={add(inland(t, 0.45), [0, -13])} a={8} b={8} h={10} color="#d9a066" />
        </g>
      ))}
      <ContainerStack at={add(inland(0.58, 0.4), deck)} colors={['#dc2626', '#2563eb', '#facc15']} />
      <ContainerStack at={add(inland(0.8, 0.4), deck)} colors={['#2563eb', '#facc15']} />
      {/* The yellow jib crane on the waterline, its jib over the water. */}
      <JibCrane base={add(mix(c0, c1, 0.42), deck)} out={out} powered={powered} />
      {/* Lamps: lit when powered. */}
      {[0.03, 0.97].map((t) => {
        const q = add(mix(c0, c1, t), deck)
        return (
          <g key={t}>
            <Face at={[add(q, [-1.5, 0]), add(q, [1.5, 0]), add(q, [1.5, -36]), add(q, [-1.5, -36])]} fill="#374151" />
            <circle cx={q[0]} cy={q[1] - 38} r={4} fill={powered ? '#ffe28a' : '#6d6a80'} />
            {powered && <circle cx={q[0]} cy={q[1] - 38} r={10} fill="#ffe28a" opacity={0.3} />}
          </g>
        )
      })}
      {powered && shore === 'front' && <Freighter at={berth} vars={shipVars} />}
    </g>
  )
}

// Shipping containers stacked: each a long ribbed box, lit left, shaded right.
function ContainerStack({ at, colors }: { at: Pt; colors: string[] }) {
  return (
    <g>
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

// A yellow steel-truss jib crane: a lattice tower, a cab, a jib reaching out over the water with a
// counter-jib behind, and a hook with a spreader that bobs while powered.
function JibCrane({ base, out, powered }: { base: Pt; out: Pt; powered: boolean }) {
  const h = 96
  const topP = add(base, [0, -h])
  const tip = add(topP, out, 1.6)
  const tail = add(topP, out, -0.55)
  const yellow = '#f2b84b'
  return (
    <g data-crane="">
      {/* Tower: two legs with cross bracing. */}
      <Face at={[add(base, [-9, 0]), add(base, [-5, 0]), add(topP, [-3, 0]), add(topP, [-6, 0])]} fill={lit(yellow, -0.6)} />
      <Face at={[add(base, [5, 0]), add(base, [9, 0]), add(topP, [6, 0]), add(topP, [3, 0])]} fill={lit(yellow, 0.6)} />
      {[0, 1, 2, 3].map((i) => {
        const y0 = -i * (h / 4)
        const y1 = -(i + 1) * (h / 4)
        return <line key={i} x1={base[0] - 7 + i * 0.5} y1={base[1] + y0} x2={base[0] + 7 - i * 0.5} y2={base[1] + y1} stroke={lit(yellow, 0.2)} strokeWidth={1.6} />
      })}
      {/* Cab and machinery box. */}
      <IsoBox at={add(topP, [0, 4])} a={8} b={8} h={12} color="#facc15" />
      {/* Jib and counter-jib, trussed. */}
      <Face at={[add(topP, [-2, -10]), add(topP, [2, -12]), add(tip, [2, -2]), add(tip, [0, 0])]} fill={yellow} />
      <line x1={topP[0]} y1={topP[1] - 4} x2={tip[0]} y2={tip[1] + 4} stroke={lit(yellow, 0.4)} strokeWidth={1.4} />
      {[0.25, 0.5, 0.75].map((t) => {
        const q = mix(add(topP, [0, -11]), tip, t)
        return <line key={t} x1={q[0]} y1={q[1]} x2={q[0] + 4} y2={q[1] + 10} stroke={lit(yellow, 0.4)} strokeWidth={1.2} />
      })}
      <Face at={[add(topP, [-2, -10]), add(topP, [2, -12]), add(tail, [2, -2]), add(tail, [-2, 0])]} fill={lit(yellow, 0.3)} />
      <IsoBox at={add(tail, [0, 6])} a={6} b={6} h={8} color="#78716c" />
      <g className={powered ? 'mg-bob' : undefined}>
        <line x1={tip[0]} y1={tip[1]} x2={tip[0]} y2={tip[1] + 34} stroke="#1f2937" strokeWidth={1.2} />
        <Face at={[add(tip, [-8, 34]), add(tip, [8, 34]), add(tip, [8, 38]), add(tip, [-8, 38])]} fill="#1f2937" />
      </g>
    </g>
  )
}

// The cargo freighter: a faceted hull, colourful containers on deck, a white wheelhouse bridge with a
// window band, and a funnel. It loops (`.mg-ship`, globals.css: sail in from far out, dock, sail
// away) along --mg-ox/--mg-oy (out to sea) and --mg-ax/--mg-ay (along the shore). `at` is its berth.
function Freighter({ at, vars }: { at: Pt; vars: Vars }) {
  return (
    <g transform={`translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`}>
      <g className="mg-ship" style={vars} data-ship="">
        <ellipse cx={0} cy={12} rx={84} ry={17} fill="#0b6f9a" opacity={0.35} />
        {/* Hull: dark navy above a red waterline, a raked bow. */}
        <Face at={[[-78, -6], [-60, 12], [66, 12], [82, -8], [74, -16], [-72, -16]]} fill="#1e3a5f" />
        <Face at={[[-60, 12], [66, 12], [62, 18], [-54, 18]]} fill="#b91c1c" />
        <Face at={[[-72, -16], [74, -16], [70, -21], [-68, -21]]} fill="#e2e8f0" />
        {/* Containers on deck. */}
        {[-56, -36, -16, 4, 24].map((x, i) => (
          <g key={x}>
            <Face at={[[x, -21], [x + 18, -21], [x + 18, -37], [x, -37]]} fill={['#dc2626', '#2563eb', '#facc15', '#16a34a', '#dc2626'][i]} />
            <Face at={[[x, -37], [x + 18, -37], [x + 22, -41], [x + 4, -41]]} fill="#ffffff" opacity={0.3} />
            {i % 2 === 0 && <Face at={[[x + 2, -37], [x + 16, -37], [x + 16, -49], [x + 2, -49]]} fill={['#2563eb', '#facc15', '#dc2626'][i / 2]} />}
          </g>
        ))}
        {/* Wheelhouse bridge and funnel at the stern. */}
        <Face at={[[46, -21], [66, -21], [66, -52], [46, -52]]} fill="#f8fafc" />
        <Face at={[[46, -52], [66, -52], [70, -56], [50, -56]]} fill="#cbd5e1" />
        <Face at={[[48, -46], [64, -46], [64, -41], [48, -41]]} fill="#1e3a5f" />
        <Face at={[[54, -56], [62, -56], [62, -70], [54, -70]]} fill="#b91c1c" />
        <Face at={[[54, -66], [62, -66], [62, -63], [54, -63]]} fill="#1f2937" />
      </g>
    </g>
  )
}

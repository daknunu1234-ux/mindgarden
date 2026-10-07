// The railway as 3D low-poly miniatures (lowPolyKit; pure markup, no hooks): track tiles in the ground
// layer (gravel ballast, timber ties, steel rails) that join the tracks beside them in straights,
// curves and junctions; the Freight Train standing on its three tiles (a retro steam locomotive with a
// dark boiler, gold bands, a red cab and a cowcatcher, puffing smoke, and hopper wagons of covered
// candy crates); and the small train that runs a linked route (FarmIsometricGrid TrainRun).
import { memo } from 'react'
import { TILE_H, TILE_W, tileToScreen, type Links } from '../lib/farmGrid'
import { Contact, Cylinder, Face, IsoBox, lit, type Pt } from './lowPolyKit'

// Half a tile towards each side, on screen (north = y − 1, east = x + 1, south = y + 1, west = x − 1).
const ARM: Record<keyof Links, Pt> = {
  north: [TILE_W / 4, -TILE_H / 4],
  east: [TILE_W / 4, TILE_H / 4],
  south: [-TILE_W / 4, TILE_H / 4],
  west: [-TILE_W / 4, -TILE_H / 4],
}
const OPPOSITE: Record<keyof Links, keyof Links> = { north: 'south', south: 'north', east: 'west', west: 'east' }
const GAUGE = 7 // half the distance between the rails, px

// Which arms a track tile draws: the sides it joins; a lone tile or a dead end runs straight through.
export function trackArms(links: Links): (keyof Links)[] {
  const joined = (Object.keys(ARM) as (keyof Links)[]).filter((k) => links[k])
  if (joined.length === 0) return ['east', 'west']
  if (joined.length === 1) return [joined[0], OPPOSITE[joined[0]]]
  return joined
}

// The shape a tile's track takes: a straight, a curve (two arms at a right angle) or a junction.
export function trackShape(arms: readonly (keyof Links)[]): 'straight' | 'curve' | 'junction' {
  if (arms.length > 2) return 'junction'
  return OPPOSITE[arms[0]] === arms[1] ? 'straight' : 'curve'
}

const unit = ([x, y]: Pt): Pt => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}
// Across a direction, on the ground (perpendicular on the iso diamond: rotate in grid space).
const across = (arm: keyof Links): Pt => unit(ARM[arm === 'north' || arm === 'south' ? 'east' : 'north'])

const Tie = ({ at, dir }: { at: Pt; dir: Pt }) => {
  const [ax, ay] = dir
  const w = GAUGE + 4
  const t = 2.6
  return (
    <Face
      at={[
        [at[0] - ax * w - ay * t, at[1] - ay * w + ax * t],
        [at[0] + ax * w - ay * t, at[1] + ay * w + ax * t],
        [at[0] + ax * w + ay * t, at[1] + ay * w - ax * t],
        [at[0] - ax * w + ay * t, at[1] - ay * w - ax * t],
      ]}
      fill="#7a4a22"
    />
  )
}

// One rail: a dark web with a bright running surface.
const Rail = ({ d }: { d: string }) => (
  <g>
    <path d={d} fill="none" stroke="#475569" strokeWidth={2.6} strokeLinecap="round" />
    <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={1.1} strokeLinecap="round" transform="translate(0 -0.8)" />
  </g>
)

// One track tile around its centre (0, 0): gravel ballast, then the ties and the two rails, as a
// straight, a curve or the arms of a junction.
export function TrackTile({ links }: { links: Links }) {
  const arms = trackArms(links)
  const shape = trackShape(arms)
  return (
    <g data-track-arms={arms.join(' ')} data-track-shape={shape}>
      {/* Ballast: a slim gravel bed with a lighter crown and a few stones. */}
      <Face at={[[0, -TILE_H / 2 + 7], [TILE_W / 2 - 12, 0], [0, TILE_H / 2 - 7], [-TILE_W / 2 + 12, 0]]} fill="#9c958c" opacity={0.9} />
      <Face at={[[0, -TILE_H / 2 + 12], [TILE_W / 2 - 22, 0], [0, TILE_H / 2 - 12], [-TILE_W / 2 + 22, 0]]} fill="#b8b1a7" opacity={0.85} />
      {[
        [-14, -3],
        [10, 6],
        [18, -4],
        [-6, 9],
        [4, -10],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.3} fill={i % 2 ? '#78716c' : '#d6d3d1'} />
      ))}
      {shape === 'curve' ? <Curve a={arms[0]} b={arms[1]} /> : arms.map((arm) => <StraightArm key={arm} arm={arm} />)}
    </g>
  )
}

function StraightArm({ arm }: { arm: keyof Links }) {
  const [dx, dy] = ARM[arm]
  const n = across(arm)
  return (
    <g>
      {[0.2, 0.55, 0.9].map((t) => (
        <Tie key={t} at={[dx * t, dy * t]} dir={n} />
      ))}
      {[-1, 1].map((side) => (
        <Rail key={side} d={`M ${(n[0] * GAUGE * side).toFixed(1)} ${(n[1] * GAUGE * side).toFixed(1)} L ${(dx + n[0] * GAUGE * side).toFixed(1)} ${(dy + n[1] * GAUGE * side).toFixed(1)}`} />
      ))}
    </g>
  )
}

// Two arms at a right angle: the rails sweep round in quarter curves, the ties fanned along them.
function Curve({ a, b }: { a: keyof Links; b: keyof Links }) {
  const A = ARM[a]
  const B = ARM[b]
  // Each arm's "across" pointing towards the other arm: +1 = the inner rail, −1 = the outer.
  const na = across(a)
  const nb = across(b)
  const sa = na[0] * B[0] + na[1] * B[1] > 0 ? 1 : -1
  const sb = nb[0] * A[0] + nb[1] * A[1] > 0 ? 1 : -1
  const rail = (side: number) => {
    const p0: Pt = [A[0] + na[0] * GAUGE * side * sa, A[1] + na[1] * GAUGE * side * sa]
    const p1: Pt = [B[0] + nb[0] * GAUGE * side * sb, B[1] + nb[1] * GAUGE * side * sb]
    const c: Pt = [(na[0] * sa + nb[0] * sb) * GAUGE * side, (na[1] * sa + nb[1] * sb) * GAUGE * side]
    return `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`
  }
  // Ties along the centre curve (A → centre → B), each across its tangent.
  const point = (t: number): Pt => [(1 - t) * (1 - t) * A[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + t * t * B[1]]
  const tangent = (t: number): Pt => unit([2 * t * B[0] - 2 * (1 - t) * A[0], 2 * t * B[1] - 2 * (1 - t) * A[1]])
  return (
    <g>
      {[0.08, 0.3, 0.5, 0.7, 0.92].map((t) => {
        const [tx, ty] = tangent(t)
        return <Tie key={t} at={point(t)} dir={[-ty, tx]} />
      })}
      <Rail d={rail(1)} />
      <Rail d={rail(-1)} />
    </g>
  )
}

export type TrackCell = { key: string; x: number; y: number; links: Links }

// Every track tile of the farm, in the ground layer (under everything standing).
function RailNetworkImpl({ tracks, origin }: { tracks: readonly TrackCell[]; origin: { x: number; y: number } }) {
  return (
    <g data-rail-network={tracks.length} className="pointer-events-none">
      {tracks.map((t) => {
        const top = tileToScreen(t.x, t.y)
        return (
          <g key={t.key} transform={`translate(${(origin.x + top.x).toFixed(1)} ${(origin.y + top.y + TILE_H / 2).toFixed(1)})`}>
            <TrackTile links={t.links} />
          </g>
        )
      })}
    </g>
  )
}
export const RailNetwork = memo(RailNetworkImpl)

// ── The train ────────────────────────────────────────────────────────────────

// Steps along the train (its 1 × 3 footprint runs along y: down-left on screen).
const STEP: Pt = [-TILE_W / 2, TILE_H / 2]
const along = (k: number, at: Pt = [0, 0]): Pt => [at[0] + STEP[0] * k, at[1] + STEP[1] * k]

// Faceted puffy smoke over a stack (`.mg-smoke` puffs, off for reduced motion).
function Smoke({ at }: { at: Pt }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} data-train-smoke="">
      {[0, 0.9, 1.8].map((delay, i) => (
        <polygon
          key={delay}
          points="-6,0 -3,-5 3,-6 7,-1 4,5 -3,5"
          fill={i === 1 ? '#f1f5f9' : '#e2e8f0'}
          className="mg-smoke"
          transform={`translate(${i * 3} ${-i * 4})`}
          style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}
    </g>
  )
}

// The locomotive around `at`, nose towards the viewer (+y): a dark boiler with gold bands, a
// smokestack, a red cab at the back, a cowcatcher at the front and red driving wheels.
function Locomotive({ at, scale = 1 }: { at: Pt; scale?: number }) {
  const s = scale
  const nose = along(0.42 * s, at)
  const back = along(-0.3 * s, at)
  return (
    <g data-locomotive="">
      {/* Driving wheels along the long (shaded) side. */}
      {[-0.25, 0.05, 0.3].map((k) => {
        const w = add(along(k * s, at), [9 * s, 6 * s])
        return (
          <g key={k}>
            <circle cx={w[0]} cy={w[1]} r={6 * s} fill="#991b1b" />
            <circle cx={w[0]} cy={w[1]} r={2.2 * s} fill="#fbbf24" />
          </g>
        )
      })}
      {/* Running board, boiler and its gold bands. */}
      <IsoBox at={at} a={10 * s} b={30 * s} h={6 * s} color="#1f2937" />
      <IsoBox at={add(along(0.12 * s, at), [0, -6 * s])} a={8 * s} b={20 * s} h={13 * s} color="#2b2f36" />
      {[-0.08, 0.12, 0.32].map((k) => (
        <IsoBox key={k} at={add(along(k * s, at), [0, -6 * s])} a={8.6 * s} b={1.4 * s} h={13.6 * s} color="#d4a017" />
      ))}
      {/* Smokestack and dome. */}
      <Cylinder at={add(along(0.3 * s, at), [0, -19 * s])} rx={3.6 * s} ry={1.8 * s} h={11 * s} facets={8} color="#111827" />
      <Cylinder at={add(along(0.3 * s, at), [0, -30 * s])} rx={5.4 * s} ry={2.7 * s} h={3 * s} facets={8} color="#d4a017" />
      <Cylinder at={add(along(0.05 * s, at), [0, -19 * s])} rx={3.4 * s} ry={1.7 * s} h={4 * s} facets={8} color="#d4a017" />
      {/* Red cab with a dark roof and a window. */}
      <IsoBox at={add(back, [0, -6 * s])} a={10 * s} b={9 * s} h={20 * s} color="#b91c1c" />
      <IsoBox at={add(back, [0, -26 * s])} a={11.5 * s} b={10.5 * s} h={3 * s} color="#111827" />
      <Face at={[add(back, [4 * s, -20 * s]), add(back, [12 * s, -16 * s]), add(back, [12 * s, -10 * s]), add(back, [4 * s, -14 * s])]} fill="#fde68a" />
      {/* Cowcatcher: a gold-and-red wedge at the nose. */}
      <Face at={[add(nose, [-10 * s, -2 * s]), add(nose, [10 * s, 8 * s]), add(nose, [-6 * s, 12 * s])]} fill="#b91c1c" />
      <Face at={[add(nose, [-10 * s, -2 * s]), add(nose, [-6 * s, 12 * s]), add(nose, [-14 * s, 6 * s])]} fill={lit('#d4a017', -0.5)} />
      <Smoke at={add(along(0.3 * s, at), [0, -36 * s])} />
    </g>
  )
}

// An open hopper wagon of covered candy crates around `at`.
function Wagon({ at, scale = 1 }: { at: Pt; scale?: number }) {
  const s = scale
  return (
    <g data-wagon="">
      {[-0.22, 0.22].map((k) => {
        const w = add(along(k * s, at), [9 * s, 6 * s])
        return <circle key={k} cx={w[0]} cy={w[1]} r={5 * s} fill="#1f2937" />
      })}
      <IsoBox at={at} a={10 * s} b={26 * s} h={12 * s} color="#6b4423" top="#3b2412" />
      {/* Covered candy crates: pink with a white ribbon. */}
      {[-0.13, 0.13].map((k) => (
        <g key={k}>
          <IsoBox at={add(along(k * s, at), [0, -12 * s])} a={7 * s} b={9 * s} h={8 * s} color="#f472b6" />
          <IsoBox at={add(along(k * s, at), [0, -12 * s])} a={7.4 * s} b={1.2 * s} h={8.4 * s} color="#ffffff" />
        </g>
      ))}
    </g>
  )
}

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]

// The Freight Train standing on its 1 × 3 footprint (along y), around the footprint's centre: the
// locomotive at the near end (towards the viewer), two hopper wagons behind it.
export function TrainSprite() {
  return (
    <g data-building="freight_train" strokeLinejoin="round">
      <Contact rx={96} ry={22} dx={0} />
      <Wagon at={along(-1)} />
      <Wagon at={along(0)} />
      <Locomotive at={along(1)} />
    </g>
  )
}

// The small train running a linked route: a locomotive and a wagon of candy, drawn around (0, 0) (it
// moves along the route's path; it doesn't turn with the track: a toy on an isometric board).
export function RunningTrain() {
  return (
    <svg aria-hidden width={80} height={64} viewBox="-40 -52 80 64" className="overflow-visible" data-running-train="">
      <Wagon at={along(-0.32)} scale={0.55} />
      <Locomotive at={along(0.18)} scale={0.55} />
      <text x={-18} y={-30} fontSize={10} aria-hidden>
        🍬
      </text>
    </svg>
  )
}

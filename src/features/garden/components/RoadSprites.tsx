// The island's roads and delivery trucks. Road tiles are drawn procedurally as low-poly slabs in the
// ground layer (dark asphalt, a thin side face, light concrete curbs on the sides that don't join
// another road, white dashed centre lines), joined to the roads beside them as straights, curves,
// T-junctions and crossings (lib/roads roadArms / roadShape). The Delivery Truck is the rendered sprite
// (public/assets/sprites/truck.webp, made by scripts/prepare-building-sprites.mjs from
// raw-assets/structures/truck.png); TruckRun drives it along a road route from a factory to the Seaport
// dock, stops to unload, and drives back. Pure markup apart from the generated keyframes.
import { memo, type CSSProperties } from 'react'
import { TILE_H, TILE_W, tileToScreen, type Links } from '../lib/farmGrid'
import { headingOf, roadArms, roadShape, type Side, type Tile } from '../lib/roads'
import type { Pt } from './lowPolyKit'

// The road palette.
export const ROAD_COLORS = {
  asphalt: '#3e4149',
  side: '#24262c',
  curb: '#d3d7df',
  curbShade: '#8d939e',
  marking: '#f6f2e4',
} as const

// The tile diamond around its centre, and each side's edge (from corner to corner) and middle.
const N: Pt = [0, -TILE_H / 2]
const E: Pt = [TILE_W / 2, 0]
const S: Pt = [0, TILE_H / 2]
const W: Pt = [-TILE_W / 2, 0]
const EDGE: Record<Side, [Pt, Pt]> = { north: [N, E], east: [E, S], south: [S, W], west: [W, N] }
const MIDDLE: Record<Side, Pt> = { north: [TILE_W / 4, -TILE_H / 4], east: [TILE_W / 4, TILE_H / 4], south: [-TILE_W / 4, TILE_H / 4], west: [-TILE_W / 4, -TILE_H / 4] }
const pts = (...p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const toward = ([x, y]: Pt, k: number): Pt => [x * k, y * k]
const THICKNESS = 3

// One road tile around its centre (0, 0).
export function RoadTile({ links }: { links: Links }) {
  const arms = roadArms(links)
  const shape = roadShape(arms)
  const joined = new Set(arms)
  const curbs = (Object.keys(EDGE) as Side[]).filter((side) => !joined.has(side))
  const dash = { fill: 'none', stroke: ROAD_COLORS.marking, strokeWidth: 1.8, strokeDasharray: '6 5', strokeLinecap: 'round' as const }
  return (
    <g data-road-arms={arms.join(' ')} data-road-shape={shape}>
      {/* The slab: its front side faces where the road ends there (none between joined tiles, so a
          network reads as one surface), then the asphalt top. */}
      {!links.east && <polygon points={pts(E, S, [S[0], S[1] + THICKNESS], [E[0], E[1] + THICKNESS])} fill={ROAD_COLORS.side} />}
      {!links.south && <polygon points={pts(S, W, [W[0], W[1] + THICKNESS], [S[0], S[1] + THICKNESS])} fill={ROAD_COLORS.side} />}
      <polygon points={pts(N, E, S, W)} fill={ROAD_COLORS.asphalt} />
      {/* A faint sheen on the upper half, lit from the upper left. */}
      <polygon points={pts(N, toward(E, 0.5), [0, 0], toward(W, 0.9))} fill="#ffffff" opacity={0.05} />
      {/* Curbs along the sides that end here. */}
      {curbs.map((side) => {
        const [a, b] = EDGE[side].map((p) => toward(p, 0.9))
        return (
          <g key={side} data-curb={side}>
            <line x1={a[0]} y1={a[1] + 1.2} x2={b[0]} y2={b[1] + 1.2} stroke={ROAD_COLORS.curbShade} strokeWidth={2.6} strokeLinecap="round" />
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={ROAD_COLORS.curb} strokeWidth={2.6} strokeLinecap="round" />
          </g>
        )
      })}
      {/* White dashed centre lines: a sweep through the bend on a curve, else one out to each side. */}
      {shape === 'curve' ? (
        <path d={`M ${MIDDLE[arms[0]][0]} ${MIDDLE[arms[0]][1]} Q 0 0 ${MIDDLE[arms[1]][0]} ${MIDDLE[arms[1]][1]}`} {...dash} />
      ) : (
        arms.map((side) => <line key={side} x1={0} y1={0} x2={MIDDLE[side][0]} y2={MIDDLE[side][1]} {...dash} />)
      )}
    </g>
  )
}

export type RoadCell = { key: string; x: number; y: number; links: Links }

// Every road tile of the farm, in the ground layer (under everything standing).
function RoadNetworkImpl({ roads, origin }: { roads: readonly RoadCell[]; origin: { x: number; y: number } }) {
  return (
    <g data-road-network={roads.length} className="pointer-events-none">
      {roads.map((r) => {
        const top = tileToScreen(r.x, r.y)
        return (
          <g key={r.key} transform={`translate(${(origin.x + top.x).toFixed(1)} ${(origin.y + top.y + TILE_H / 2).toFixed(1)})`}>
            <RoadTile links={r.links} />
          </g>
        )
      })}
    </g>
  )
}
export const RoadNetwork = memo(RoadNetworkImpl)

// ── The Delivery Truck ───────────────────────────────────────────────────────

// The truck sprite: its pixel size, the point on the road under the middle of its wheelbase (its
// ground point), and its scale to farm pixels (about a tile and a half long). The render heads south
// (down-left on screen); mirrored it heads east (down-right).
export const TRUCK_IMAGE = {
  href: '/assets/sprites/truck.webp',
  size: [480, 394] as [number, number],
  anchor: [283, 280] as Pt,
  scale: 0.19,
}

// Which way the sprite faces for a heading: the render's own way along the north–south axis,
// mirrored along the east–west one. (One render: heading north or west the cab trails.)
export const truckFlip = (heading: Side): 1 | -1 => (heading === 'east' || heading === 'west' ? -1 : 1)

// The truck drawn around its ground point, facing as given.
export function TruckSprite({ flip = 1 }: { flip?: 1 | -1 }) {
  const { href, size, anchor, scale } = TRUCK_IMAGE
  return (
    <g data-truck="" transform={flip === -1 ? 'scale(-1 1)' : undefined}>
      <ellipse cx={0} cy={1} rx={size[0] * scale * 0.42} ry={size[0] * scale * 0.12} transform="rotate(-26)" fill="#0b1220" opacity={0.22} />
      <image href={href} x={-anchor[0] * scale} y={-anchor[1] * scale} width={size[0] * scale} height={size[1] * scale} preserveAspectRatio="none" />
    </g>
  )
}

// Timing of a round trip (seconds): loading at the factory, each tile driven, unloading at the dock,
// and the quick turn at a bend.
export const TRUCK_TIMING = { load: 1.5, perTile: 0.9, unload: 3, turn: 0.3 }

// The keyframes of one truck's round trip along `route` (factory end first): where it is on the road
// (offset-distance) and which way it faces (a quick mirror-flip at each bend onto the other axis).
// The way back retraces the way out, so the facing changes at the same bends.
export function truckKeyframes(name: string, route: readonly Tile[]): { css: string; duration: number; flips: (1 | -1)[] } {
  const { load, perTile, unload, turn } = TRUCK_TIMING
  const legs = Math.max(route.length - 1, 0)
  const drive = legs * perTile
  const duration = load + 2 * drive + unload
  const pct = (t: number) => `${((t / duration) * 100).toFixed(3)}%`
  const flips: (1 | -1)[] = route.slice(1).map((t, i) => truckFlip(headingOf(route[i], t)))
  if (flips.length === 0) flips.push(1)
  const move = [`0% { offset-distance: 0%; }`, `${pct(load)} { offset-distance: 0%; }`, `${pct(load + drive)} { offset-distance: 100%; }`, `${pct(load + drive + unload)} { offset-distance: 100%; }`, `100% { offset-distance: 0%; }`]
  // Facing: the first leg's, flipping over `turn` seconds around each bend, out and back.
  const face: string[] = [`0% { transform: scaleX(${flips[0]}); }`]
  const turnAt = (at: number, before: 1 | -1, after: 1 | -1) => {
    if (before !== after) face.push(`${pct(at - turn / 2)} { transform: scaleX(${before}); }`, `${pct(at + turn / 2)} { transform: scaleX(${after}); }`)
  }
  // Out: leg i starts at load + i · perTile, turning from leg i − 1's facing to its own.
  for (let i = 1; i < flips.length; i++) turnAt(load + i * perTile, flips[i - 1], flips[i])
  // Back: the legs run in reverse, the bend between legs i and i − 1 reached after legs − i of them.
  for (let i = flips.length - 1; i >= 1; i--) turnAt(load + drive + unload + (legs - i) * perTile, flips[i], flips[i - 1])
  face.push(`100% { transform: scaleX(${flips[0]}); }`)
  const css = `@keyframes ${name}-move { ${move.join(' ')} } @keyframes ${name}-face { ${face.join(' ')} }`
  return { css, duration, flips }
}

// A short, stable name for a route's keyframes.
const routeName = (route: readonly Tile[]) => {
  let h = 0
  for (const t of route) h = (h * 31 + t.x * 17 + t.y * 131 + 7) >>> 0
  return `mg-truck-${h.toString(36)}`
}

// A Delivery Truck on its round trip (factory → Seaport dock → back): the wrapper rides the road
// through the route tiles' centres (CSS offset-path), the inner one turns it at bends. Paused with the
// farm (`.mg-paused`); off for reduced motion (it waits at the factory, facing its first leg). No
// pointer events. `points`: the route tiles' centres on screen (the grid's coordinates); `delay`:
// seconds to stagger several trucks.
export function TruckRun({ route, points, delay = 0, zIndex }: { route: readonly Tile[]; points: readonly { x: number; y: number }[]; delay?: number; zIndex?: number }) {
  const name = routeName(route)
  const { css, duration, flips } = truckKeyframes(name, route)
  // A route of one tile still needs a path: a tiny hop.
  const path = points.length > 1 ? points : [points[0], { x: points[0].x + 1, y: points[0].y }]
  const d = path.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')
  const motion = `@media (prefers-reduced-motion: no-preference) { [data-truck-run="${name}"] { animation: ${name}-move ${duration.toFixed(2)}s linear ${delay}s infinite; } [data-truck-run="${name}"] > [data-truck-face] { animation: ${name}-face ${duration.toFixed(2)}s linear ${delay}s infinite; } }`
  const style: CSSProperties = { offsetPath: `path('${d}')`, offsetRotate: '0deg', offsetAnchor: '0 0', width: 0, height: 0, zIndex }
  const size = TRUCK_IMAGE.size[0] * TRUCK_IMAGE.scale
  return (
    <div aria-hidden data-truck-run={name} data-route={route.length} className="pointer-events-none absolute top-0 left-0" style={style}>
      <style>{css + motion}</style>
      <div data-truck-face="" style={{ transform: `scaleX(${flips[0]})`, width: 0, height: 0 }}>
        <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="absolute overflow-visible" style={{ left: -size / 2, top: -size / 2 }}>
          <TruckSprite />
        </svg>
      </div>
    </div>
  )
}

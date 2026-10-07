// Chunky low-poly miniatures for the farm grid: every prop is built from flat planes lit by one key
// light from the upper left (bright lit faces, deep shaded ones, no outlines) on a soft contact shadow. Flat ground things (auto-tiled streams, the soil rings under trees,
// placement ghost, buff auras) go in the ground SVG; standing things are drawn in an SVG whose (0, 0) is their ground
// point. Pure markup, no hooks; animations are the `.mg-*` classes in globals.css.
import { memo, type CSSProperties, type ReactNode } from 'react'
import type { CatalogItem } from '../lib/farmCatalog'
import { GRID_SIZE, streamVariant, TILE_H, TILE_W, tileToScreen, type Footprint, type Links } from '../lib/farmGrid'
import { streamShapes, type StreamLayer } from '../lib/streamTiles'
import { BuildingImage } from './BuildingImages'
import { SeaportSprite, WindmillSprite, type Shore } from './PowerBuildings'
import { TrackTile, TrainSprite } from './RailwaySprites'
import { Blossom, facetedVolume, rampColor } from './treeKit'

type Pt = { x: number; y: number }
type Vars = CSSProperties & Record<`--mg-${string}`, string>

const INK = '#3b1f0e'
const WOOD = '#d08a45'
const WOOD_LIT = '#f0b574'
const WOOD_DARK = '#9a5a26'

const p = (...points: [number, number][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

// Diamond of a footprint (its four outer tile corners), offset by the grid origin.
export function footprintPoints({ x, y, width, height }: Footprint, origin: Pt): string {
  const top = tileToScreen(x, y)
  const right = tileToScreen(x + width, y)
  const bottom = tileToScreen(x + width, y + height)
  const left = tileToScreen(x, y + height)
  return [top, right, bottom, left].map((q) => `${(q.x + origin.x).toFixed(1)},${(q.y + origin.y).toFixed(1)}`).join(' ')
}

const centreOf = (f: Footprint, origin: Pt): Pt => {
  const top = tileToScreen(f.x, f.y)
  return { x: top.x + ((f.width - f.height) * TILE_W) / 4 + origin.x, y: top.y + ((f.width + f.height) * TILE_H) / 4 + origin.y }
}

// ── Ground layer ─────────────────────────────────────────────────────────────

// A tile of the grid plus which of its four sides join the same kind of tile (auto-tiling).
export type LinkedTile = { key: string; x: number; y: number; links: Links }

const NO_LINKS: Links = { north: false, east: false, south: false, west: false }

// A stream is a channel cut into the turf, with no outline: a bevelled bank (a sunlit rim over the
// earth it is cut from), the deep water against the walls, and the bright surface in the middle.
const STREAM = {
  rim: '#e3d3a4', // the bank's sunlit bevel
  bank: '#b9a472', // the bank itself
  wall: '#1f6f93', // the far wall of the cut, under water
  deep: '#2b90b8', // deep azure along the edges
  water: '#4ecdc4', // translucent turquoise surface
  shine: '#b4f3ea', // the lit plane down the middle
} as const
// How far the water sits below the bank (px): it shows the far wall of the cut and hides the near one.
const STREAM_DROP = 2.4

// Streams, auto-tiled into one waterway: every tile is a chamfered pool plus an arm towards each
// linked neighbour (lib/streamTiles.ts, tested), so channels meet exactly at shared edges. Each layer
// is drawn for all tiles at once, so fills cover the seams between shapes and the waterway reads as
// one cut. On every tile, slanted planes of light glint on the surface and chips of foam drift;
// lone ponds get a couple of cut stones on the bank.
function StreamNetworkImpl({ streams, origin }: { streams: readonly LinkedTile[]; origin: Pt }) {
  const shapes = (layer: StreamLayer) =>
    streams.flatMap((s) => streamShapes(s, s.links, layer).map((shape, i) => ({ key: `${s.key}-${i}`, points: pts(shape, origin) })))
  const layer = (name: StreamLayer, fill: string, key: string, transform?: string, opacity?: number, className?: string) => (
    <g key={key} transform={transform} opacity={opacity} className={className}>
      {shapes(name).map((s) => (
        <polygon key={s.key} points={s.points} fill={fill} stroke={fill} strokeWidth={0.8} />
      ))}
    </g>
  )
  const sunk = `translate(0 ${STREAM_DROP})`
  return (
    <g strokeLinejoin="round">
      {/* The bank: its body, then the sunlit bevel raised towards the light (up and to the left). */}
      {layer('bank', STREAM.bank, 'bank', 'translate(1 1.6)')}
      {layer('bank', STREAM.rim, 'rim')}
      {/* The cut: the far wall shows above the sunken water. */}
      {layer('foam', STREAM.wall, 'wall')}
      {layer('foam', STREAM.deep, 'deep', sunk)}
      {layer('water', STREAM.water, 'water', sunk)}
      {/* The lit plane down the middle: turns to a silver moonlit sheen at night (`.mg-stream-shine`). */}
      {layer('shine', STREAM.shine, 'shine', sunk, 0.7, 'mg-stream-shine')}
      {streams.map((s) => {
        const c = centreOf({ x: s.x, y: s.y, width: 1, height: 1 }, origin)
        const pond = streamVariant(s.links) === 'pond'
        const seed = s.x * 7 + s.y * 3
        const y = c.y + STREAM_DROP
        return (
          <g key={s.key}>
            {/* Planes of light on the surface, slanted with the sun. */}
            <g className="mg-twinkle" style={{ animationDelay: `${-(seed % 4)}s` }}>
              <polygon points={p([c.x - 17, y - 1], [c.x - 3, y - 6], [c.x + 1, y - 4], [c.x - 13, y + 1])} fill="#ffffff" opacity={0.85} />
              <polygon points={p([c.x + 4, y + 2], [c.x + 15, y - 2], [c.x + 18, y - 0.5], [c.x + 7, y + 3.5])} fill="#ffffff" opacity={0.6} />
            </g>
            {[
              [-9, 6, 3],
              [9, 4, 2.2],
            ].map(([dx, dy, r], i) => (
              <polygon
                key={i}
                points={p([c.x + dx, y + dy - r], [c.x + dx + r, y + dy], [c.x + dx, y + dy + r], [c.x + dx - r, y + dy])}
                fill="#ffffff"
                opacity={0.9}
                className="mg-bubble"
                style={{ '--mg-delay': `${-((seed + i * 0.8) % 2.4)}s` } as Vars}
              />
            ))}
            {pond &&
              [
                [-40, 3, 6],
                [38, 7, 5],
              ].map(([dx, dy, r]) => (
                <g key={dx}>
                  <polygon points={p([c.x + dx - r, c.y + dy], [c.x + dx - r * 0.3, c.y + dy - r * 0.7], [c.x + dx + r * 0.7, c.y + dy - r * 0.5], [c.x + dx + r, c.y + dy + r * 0.2], [c.x + dx + r * 0.2, c.y + dy + r * 0.7], [c.x + dx - r * 0.7, c.y + dy + r * 0.6])} fill={STONE[1]} />
                  <polygon points={p([c.x + dx - r, c.y + dy], [c.x + dx - r * 0.3, c.y + dy - r * 0.7], [c.x + dx + r * 0.7, c.y + dy - r * 0.5], [c.x + dx, c.y + dy])} fill={STONE[3]} />
                </g>
              ))}
          </g>
        )
      })}
    </g>
  )
}

// One stream tile on its own (the Shop's pedestal, the placement ghost): a lone pond at (0, 0).
export function StreamTile({ footprint, origin, links = NO_LINKS }: { footprint: Footprint; origin: Pt; links?: Links }) {
  return <StreamNetwork streams={[{ key: 'one', x: footprint.x, y: footprint.y, links }]} origin={origin} />
}

// The soil under a planted tree: a small ring of tilled earth hugging the trunk base, centred on the
// tile, so the grass checkerboard stays visible right up to the tree. A soft contact shadow sits
// under it, then a sunlit rim, the ring's inner edge and the soil itself. No outline.
const SOIL = { rim: '#b08863', body: '#966e4a', inner: '#7a5537', shadow: 'rgba(20, 40, 15, 0.35)' } as const
// Half-width and half-height of the ring in world pixels (a tile is 112 × 56).
export const ROOT_RING = { rx: 27, ry: 12.5 } as const
function TreePlotsImpl({ trees, origin }: { trees: readonly LinkedTile[]; origin: Pt }) {
  const { rx, ry } = ROOT_RING
  return (
    <g>
      {trees.map((t) => {
        const s = tileToScreen(t.x + 0.5, t.y + 0.5)
        const [cx, cy] = [s.x + origin.x, s.y + origin.y]
        return (
          <g key={t.key}>
            <ellipse cx={cx + 2.6} cy={cy + 2.5} rx={rx + 6} ry={ry + 3} fill={SOIL.shadow} className="mg-contact" />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={SOIL.rim} />
            <ellipse cx={cx + 0.6} cy={cy + 1} rx={rx - 3.2} ry={ry - 2} fill={SOIL.inner} />
            <ellipse cx={cx + 1.2} cy={cy + 2} rx={rx - 5} ry={ry - 3.2} fill={SOIL.body} />
          </g>
        )
      })}
    </g>
  )
}

const pts = (points: readonly Pt[], o: Pt = { x: 0, y: 0 }) => points.map((q) => `${(q.x + o.x).toFixed(1)},${(q.y + o.y).toFixed(1)}`).join(' ')

// Placement ghost: a glowing green footprint where the item fits, a throbbing comic red one where
// it doesn't.
export function GhostFootprint({ footprint, origin, valid }: { footprint: Footprint; origin: Pt; valid: boolean }) {
  const points = footprintPoints(footprint, origin)
  return valid ? (
    <g>
      <polygon points={points} fill="none" stroke="#b8ff5c" strokeWidth={16} strokeLinejoin="round" opacity={0.45} className="mg-throb" />
      <polygon points={points} fill="rgba(134, 255, 120, 0.42)" stroke="#16a34a" strokeWidth={4} strokeLinejoin="round" strokeDasharray="10 6" />
    </g>
  ) : (
    <g className="mg-throb">
      <polygon points={points} fill="rgba(255, 64, 64, 0.5)" stroke="#b3001b" strokeWidth={5} strokeLinejoin="round" />
      <polygon points={points} fill="none" stroke="#ffd6d6" strokeWidth={2} strokeLinejoin="round" strokeDasharray="6 6" />
    </g>
  )
}

// What a stream or Farmer's House being placed would boost: the house's 4 × 4 aura (gold) or the
// stream's four side tiles (turquoise), clipped to the grid.
export function BuffAura({ kind, tile, origin }: { kind: 'stream' | 'farmer_house'; tile: { x: number; y: number }; origin: Pt }) {
  const inside = (f: Footprint) => f.x >= 0 && f.y >= 0 && f.x + f.width <= GRID_SIZE && f.y + f.height <= GRID_SIZE
  if (kind === 'farmer_house') {
    const x0 = Math.max(0, tile.x - 1)
    const y0 = Math.max(0, tile.y - 1)
    const x1 = Math.min(GRID_SIZE, tile.x + 3)
    const y1 = Math.min(GRID_SIZE, tile.y + 3)
    if (x1 <= x0 || y1 <= y0) return null
    return (
      <polygon
        points={footprintPoints({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, origin)}
        fill="rgba(255, 196, 61, 0.26)"
        stroke="#ffb703"
        strokeWidth={4}
        strokeDasharray="12 7"
        strokeLinejoin="round"
      />
    )
  }
  const sides = [
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x + 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y },
  ]
    .map((t) => ({ ...t, width: 1, height: 1 }))
    .filter(inside)
  return (
    <g>
      {sides.map((f) => (
        <polygon key={`${f.x}-${f.y}`} points={footprintPoints(f, origin)} fill="rgba(64, 224, 208, 0.3)" stroke="#0fb5c8" strokeWidth={3} strokeDasharray="8 6" strokeLinejoin="round" />
      ))}
    </g>
  )
}

// ── Standing miniatures ((0, 0) = ground point) ──────────────────────────────

// Contact shadow under a standing thing, thrown a little to the right (sun and moon stand upper
// left). Its colour follows the light (`.mg-contact` in globals.css): a warm deep green by day, a
// midnight blue at night; the fill here is the daylight fallback.
const Contact = ({ rx, ry, dx = 6 }: { rx: number; ry: number; dx?: number }) => <ellipse cx={dx + rx * 0.06} cy={4} rx={rx * 1.06} ry={ry} fill="rgba(20, 40, 15, 0.35)" className="mg-contact" />

// One flat plane of a prop. It carries a hairline of its own colour, so no seam shows between planes.
const Face = ({ at, fill }: { at: [number, number][]; fill: string }) => <polygon points={p(...at)} fill={fill} stroke={fill} strokeWidth={0.6} strokeLinejoin="round" />

// Dark → light ramps for cut solids (the facet facing the sun, upper left, takes the last tone).
const STONE = ['#4b4a57', '#77748a', '#a29eb5', '#cfcbdc', '#f1eff7']
const HIDE = ['#8d8894', '#bdb8c4', '#e6e2ea', '#f7f5f9', '#ffffff']
const PINK = ['#b8527a', '#e07ba0', '#ff9dbf', '#ffc2d8', '#ffe3ee']
const MOSS = ['#1f6b2a', '#2f9140', '#52b84e', '#8fdc5a', '#d6f545']

// A chunky cut solid: a faceted volume (treeKit) in the tones of `ramp`, with the crease it throws
// down-right onto whatever is behind it.
function Chunk({ x, y, r, turn, ramp, squash = 0.8 }: { x: number; y: number; r: number; turn: number; ramp: readonly string[]; squash?: number }) {
  const { outline, facets } = facetedVolume([x, y, r], turn, squash)
  return (
    <g>
      <polygon points={outline} fill={ramp[0]} opacity={0.55} transform="translate(2 3)" />
      <polygon points={outline} fill={ramp[2]} />
      {facets.map(({ points, tone }, i) => (
        <polygon key={i} points={points} fill={rampColor(ramp, tone)} stroke={rampColor(ramp, tone)} strokeWidth={0.6} strokeLinejoin="round" />
      ))}
    </g>
  )
}

// A square timber post from (x, y) up `h`: a lit left face, a shaded right face and a chamfered cap.
function Post({ x, y, h, w = 6, cap = true }: { x: number; y: number; h: number; w?: number; cap?: boolean }) {
  return (
    <g>
      <Face at={[[x - w, y - 2], [x, y + 1.5], [x, y - h + 1.5], [x - w, y - h - 2]]} fill={WOOD_LIT} />
      <Face at={[[x, y + 1.5], [x + w, y - 2], [x + w, y - h - 2], [x, y - h + 1.5]]} fill={WOOD_DARK} />
      {cap && <Face at={[[x - w, y - h - 2], [x, y - h + 1.5], [x, y - h - 8]]} fill="#ffd9a6" />}
      {cap && <Face at={[[x, y - h + 1.5], [x + w, y - h - 2], [x, y - h - 8]]} fill={WOOD} />}
    </g>
  )
}

const lerp = (u: [number, number], v: [number, number], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]

// A hip roof slope from the eave (a → b) up to the apex, cut into bands of tiles that alternate a
// little in tone, with the thick front edge of the eave under it.
function RoofSlope({ a, b, apex, tones, edge }: { a: [number, number]; b: [number, number]; apex: [number, number]; tones: [string, string]; edge: string }) {
  const cuts = [0, 0.3, 0.56, 0.78, 1]
  return (
    <g>
      <Face at={[a, b, [b[0], b[1] + 7], [a[0], a[1] + 7]]} fill={edge} />
      {cuts.slice(0, -1).map((t, i) => (
        <Face key={t} at={[lerp(a, apex, t), lerp(b, apex, t), lerp(b, apex, cuts[i + 1]), lerp(a, apex, cuts[i + 1])]} fill={tones[i % 2]} />
      ))}
    </g>
  )
}

// Farmer's House (2 × 2): a cream timber cottage on a plinth of cut stone blocks, under an oversized
// terracotta hip roof in tile bands, with a brick chimney puffing smoke and warm glowing windows.
export function FarmerHouse() {
  const a = 76
  const b = 38
  const wall = 54
  const o = 16 // roof overhang
  const apex: [number, number] = [0, -wall - 76]
  const eL: [number, number] = [-a - o, -wall + 2]
  const eF: [number, number] = [0, b + o / 2 - wall + 2]
  const eR: [number, number] = [a + o, -wall + 2]
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={a + 22} ry={b + 10} dx={10} />
      {/* Warm pool of light in front of the door. */}
      <ellipse cx={-36} cy={30} rx={44} ry={20} fill="#ffd166" opacity={0.18} />
      <ellipse cx={-36} cy={30} rx={26} ry={12} fill="#ffd166" opacity={0.22} />
      {/* Plinth: three cut stone blocks a side, lit on the left. */}
      {[0, 1, 2].map((i) => {
        const [u0, u1] = [i / 3, (i + 1) / 3]
        return (
          <g key={i}>
            <Face at={[[-a + a * u0, b * u0], [-a + a * u1, b * u1], [-a + a * u1, b * u1 - 10], [-a + a * u0, b * u0 - 10]]} fill={i % 2 ? '#c9c4d6' : '#e2deea'} />
            <Face at={[[a * u0, b - b * u0], [a * u1, b - b * u1], [a * u1, b - b * u1 - 10], [a * u0, b - b * u0 - 10]]} fill={i % 2 ? '#77748a' : '#8f8ba3'} />
          </g>
        )
      })}
      {/* Walls: lit left (door side), shaded right (windows). */}
      <Face at={[[-a, -10], [0, b - 10], [0, b - wall], [-a, -wall]]} fill="#fff1d0" />
      <Face at={[[0, b - 10], [a, -10], [a, -wall], [0, b - wall]]} fill="#dcb47c" />
      {/* Mid beams, then the corner posts. */}
      <Face at={[[-a, -34], [0, b - 34], [0, b - 29], [-a, -29]]} fill={WOOD} />
      <Face at={[[0, b - 34], [a, -34], [a, -29], [0, b - 29]]} fill={WOOD_DARK} />
      <Post x={-a + 5} y={-8} h={wall - 12} w={5} cap={false} />
      <Post x={a - 5} y={-8} h={wall - 12} w={5} cap={false} />
      <Post x={0} y={b - 11} h={wall - 12} w={5} cap={false} />
      {/* A pointed plank door with a glowing pane. */}
      <Face at={[[-48, 4], [-48, -24], [-37, -31], [-24, -16], [-24, 16]]} fill="#b3542a" />
      <Face at={[[-48, 4], [-48, -24], [-43, -27], [-43, 6.5]]} fill="#d9774a" />
      <Face at={[[-39, -19], [-34, -22], [-31, -15], [-36, -12]]} fill="#ffd166" />
      <Face at={[[-30, 0], [-27, 1.5], [-27, 5], [-30, 3.5]]} fill="#ffe8a3" />
      {/* Two glowing windows with flower boxes on the right wall. */}
      {[22, 56].map((x) => {
        const y = b - (x / a) * b - 30
        return (
          <g key={x}>
            <Face at={[[x - 12, y + 12], [x + 12, y], [x + 12, y - 19], [x - 12, y - 7]]} fill="#8a5a2b" />
            <Face at={[[x - 9.5, y + 9.5], [x + 9.5, y], [x + 9.5, y - 16], [x - 9.5, y - 6.5]]} fill="#ffd166" />
            <Face at={[[x - 9.5, y + 9.5], [x - 0.5, y + 5], [x - 0.5, y - 11], [x - 9.5, y - 6.5]]} fill="#fff0b3" />
            <Face at={[[x - 13, y + 16], [x + 13, y + 3], [x + 13, y + 9], [x - 13, y + 22]]} fill={WOOD_DARK} />
            <polygon points={p([x - 6, y + 9], [x - 3, y + 13], [x - 6, y + 17], [x - 9, y + 13])} fill="#ff6b6b" />
            <polygon points={p([x + 5, y + 4], [x + 8, y + 8], [x + 5, y + 12], [x + 2, y + 8])} fill="#ffd23f" />
          </g>
        )
      })}
      {/* Lamplight, at night only (`.mg-night-only`): the windows and the door throw warm light on the
          walls and the grass. */}
      <g className="mg-night-only">
        <ellipse cx={-36} cy={30} rx={58} ry={26} fill="#ffc94d" opacity={0.3} />
        <ellipse cx={-36} cy={30} rx={34} ry={15} fill="#ffe08a" opacity={0.4} />
        {[22, 56].map((x) => {
          const y = b - (x / a) * b - 33
          return (
            <g key={x}>
              <ellipse cx={x} cy={y} rx={24} ry={20} fill="#ffc94d" opacity={0.28} />
              <ellipse cx={x} cy={y} rx={15} ry={13} fill="#fff0b3" opacity={0.42} />
            </g>
          )
        })}
        <ellipse cx={58} cy={26} rx={40} ry={16} fill="#ffc94d" opacity={0.22} />
      </g>
      {/* Eave shadow on the walls. */}
      <Face at={[[-a, -wall], [0, b - wall], [0, b - wall + 7], [-a, -wall + 7]]} fill="#e2c592" />
      <Face at={[[0, b - wall], [a, -wall], [a, -wall + 7], [0, b - wall + 7]]} fill="#b98f57" />
      {/* Hip roof: sunlit left slope, shaded right slope. */}
      <RoofSlope a={eL} b={eF} apex={apex} tones={['#ff8a4f', '#f27a45']} edge="#d9612f" />
      <RoofSlope a={eF} b={eR} apex={apex} tones={['#c24a26', '#b03f1f']} edge="#8f3216" />
      <Face at={[lerp(eL, apex, 0.06), lerp(eL, apex, 0.9), lerp(lerp(eL, eF, 0.12), apex, 0.9), lerp(lerp(eL, eF, 0.12), apex, 0.06)]} fill="#ffb98a" />
      {/* Brick chimney: two faces, a dark flue, smoke. */}
      <g transform="translate(34 -104)">
        <Face at={[[-11, 4], [0, 9], [0, 38], [-11, 33]]} fill="#d86a47" />
        <Face at={[[0, 9], [11, 4], [11, 33], [0, 38]]} fill="#9c4229" />
        <Face at={[[-13, 2], [0, 8], [13, 2], [0, -4]]} fill="#7a3322" />
        <Face at={[[-7, 2], [0, 5], [7, 2], [0, -1]]} fill="#2e1710" />
        <Face at={[[-9, 16], [-3, 19], [-3, 23], [-9, 20]]} fill="#f08a66" />
        <Face at={[[3, 22], [9, 19], [9, 23], [3, 26]]} fill="#7f331f" />
        {[0, 1.1, 2.2].map((delay, i) => (
          <circle key={delay} cx={i * 2} cy={-8} r={7} fill="#ffffff" className="mg-smoke" style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }} />
        ))}
      </g>
    </g>
  )
}

// Woodshop (2 × 2): a plank shed under a shingle hip roof, an oversized saw blade cut in two tones on
// its lit wall, and a stack of logs with hexagonal cut ends out front.
export function WoodshopSprite() {
  const a = 72
  const b = 36
  const wall = 46
  const apex: [number, number] = [0, -wall - 50]
  const eL: [number, number] = [-a - 14, -wall + 2]
  const eF: [number, number] = [0, b + 9 - wall]
  const eR: [number, number] = [a + 14, -wall + 2]
  const teeth: [number, number][] = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 === 0 ? 25 : 19
    const t = (i / 24) * Math.PI * 2
    return [Math.cos(t) * r, Math.sin(t) * r * 0.8]
  })
  const hex = (x: number, y: number, r: number): [number, number][] => Array.from({ length: 6 }, (_, i) => [x + Math.cos((i * Math.PI) / 3) * r, y + Math.sin((i * Math.PI) / 3) * r * 0.94])
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={a + 24} ry={b + 10} dx={10} />
      {/* Plank walls: four boards a side, alternating a little in tone. */}
      {[0, 1, 2, 3].map((i) => {
        const [h0, h1] = [(wall * i) / 4, (wall * (i + 1)) / 4]
        return (
          <g key={i}>
            <Face at={[[-a, -h0], [0, b - h0], [0, b - h1], [-a, -h1]]} fill={i % 2 ? '#e5a05a' : '#f0b574'} />
            <Face at={[[0, b - h0], [a, -h0], [a, -h1], [0, b - h1]]} fill={i % 2 ? '#a8662f' : '#b8733a'} />
          </g>
        )
      })}
      <Post x={0} y={b - 1} h={wall - 3} w={4.5} cap={false} />
      {/* Wide open doorway on the right wall. */}
      <Face at={[[18, b - 9], [48, b - 24], [48, b - 58], [18, b - 43]]} fill="#4a2a14" />
      <Face at={[[18, b - 9], [23, b - 11.5], [23, b - 45.5], [18, b - 43]]} fill="#6b3f1f" />
      {/* Shingle hip roof. */}
      <RoofSlope a={eL} b={eF} apex={apex} tones={['#b06a34', '#9a5a2b']} edge="#d08a45" />
      <RoofSlope a={eF} b={eR} apex={apex} tones={['#7a4420', '#6a3a1a']} edge="#8f5323" />
      {/* Oversized saw blade on the lit wall: a bright half towards the sun, a steel half away. */}
      <g transform="translate(-40 -14)">
        <polygon points={p(...teeth)} fill="#5c6675" transform="translate(1.6 2.4)" />
        <polygon points={p(...teeth)} fill="#aab4c4" />
        <polygon points={p([0, 0], ...teeth.slice(9, 20))} fill="#eef2f7" />
        <Face at={hex(0, 0, 8)} fill="#c92a2a" />
        <Face at={[[0, 0], ...hex(0, 0, 8).slice(3, 6)]} fill="#ff6b6b" />
        <polygon points={p([-14, -9], [-6, -14], [-4, -11])} fill="#ffffff" />
      </g>
      {/* Log stack: three below, two on top. */}
      {[
        [64, 26],
        [82, 17],
        [100, 8],
        [73, 10],
        [91, 1],
      ].map(([x, y], i) => (
        <g key={i}>
          <Face at={[[x - 30, y - 23], [x, y - 8], [x + 3, y - 3], [x - 27, y - 18]]} fill="#c98a4b" />
          <Face at={[[x - 27, y - 18], [x + 3, y - 3], [x, y + 7], [x - 30, y - 8]]} fill="#8a5426" />
          <Face at={hex(x, y, 8.5)} fill="#b9813f" />
          <Face at={hex(x - 0.6, y - 0.6, 6.6)} fill="#f6cf94" />
          <Face at={hex(x - 0.2, y - 0.2, 3)} fill="#d9a868" />
        </g>
      ))}
    </g>
  )
}

// Rockery: three cut boulders with mossy caps and low-poly flowers at their feet.
export function RockerySprite() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={36} ry={13} />
      <Chunk x={-11} y={-13} r={20} turn={1} ramp={STONE} />
      <Chunk x={15} y={-6} r={15} turn={4} ramp={STONE} />
      <Chunk x={-1} y={3} r={9} turn={2} ramp={STONE} />
      <Chunk x={-14} y={-27} r={9} turn={3} ramp={MOSS} squash={0.5} />
      <Chunk x={16} y={-16} r={7} turn={5} ramp={MOSS} squash={0.5} />
      {(
        [
          [-33, 5, '#ff6b6b'],
          [32, 6, '#ffd23f'],
          [-7, 12, '#ff8fb1'],
        ] as const
      ).map(([x, y, color]) => (
        <g key={x}>
          <polygon points={p([x - 0.8, y + 4], [x + 0.8, y + 4], [x + 0.8, y - 1], [x - 0.8, y - 1])} fill="#3f8a2e" />
          <Blossom x={x} y={y - 3} r={3} petal={color} center="#ffb703" />
        </g>
      ))}
    </g>
  )
}

// Fence: a square post with a chamfered cap in the middle of the tile and chunky bevelled rails
// towards every neighbouring fence, so runs snap together (auto-tiling).
export function FenceSprite({ links }: { links: { north: boolean; east: boolean; south: boolean; west: boolean } }) {
  const dirs = {
    north: { x: TILE_W / 4, y: -TILE_H / 4 },
    east: { x: TILE_W / 4, y: TILE_H / 4 },
    south: { x: -TILE_W / 4, y: TILE_H / 4 },
    west: { x: -TILE_W / 4, y: -TILE_H / 4 },
  } as const
  const rails = (Object.keys(dirs) as (keyof typeof dirs)[]).filter((k) => links[k])
  // Rails going back (north / west) are drawn behind the centre post; front ones in front of it.
  const back = rails.filter((k) => k === 'north' || k === 'west')
  const front = rails.filter((k) => k === 'south' || k === 'east')
  // A rail is a beam with a sunlit top chamfer, its face and a shaded underside.
  const rail = (k: keyof typeof dirs) =>
    [-12, -25].map((dy) => {
      const [x, y] = [dirs[k].x, dirs[k].y + dy]
      return (
        <g key={`${k}${dy}`}>
          <Face at={[[0, dy - 4], [x, y - 4], [x, y - 1.6], [0, dy - 1.6]]} fill={WOOD_LIT} />
          <Face at={[[0, dy - 1.6], [x, y - 1.6], [x, y + 2.2], [0, dy + 2.2]]} fill={WOOD} />
          <Face at={[[0, dy + 2.2], [x, y + 2.2], [x, y + 4], [0, dy + 4]]} fill={WOOD_DARK} />
        </g>
      )
    })
  return (
    <g>
      <Contact rx={16} ry={6} dx={2} />
      {back.map(rail)}
      {back.map((k) => (
        <Post key={`p${k}`} x={dirs[k].x} y={dirs[k].y} h={32} />
      ))}
      <Post x={0} y={0} h={32} />
      {front.map(rail)}
      {front.map((k) => (
        <Post key={`p${k}`} x={dirs[k].x} y={dirs[k].y} h={32} />
      ))}
    </g>
  )
}

// A stubby leg: a lit and a shaded face, with a hoof.
function Leg({ x, lit, dark, hoof }: { x: number; lit: string; dark: string; hoof: string }) {
  return (
    <g>
      <Face at={[[x - 4, -13], [x, -13], [x, 0], [x - 4, 0]]} fill={lit} />
      <Face at={[[x, -13], [x + 4, -13], [x + 4, 0], [x, 0]]} fill={dark} />
      <Face at={[[x - 4, -3.5], [x + 4, -3.5], [x + 4, 0], [x - 4, 0]]} fill={hoof} />
    </g>
  )
}

// Chunky low-poly cow (facing left), feet at (0, 0).
export function CowShape() {
  const INKY = '#2f2723'
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={25} ry={6.5} dx={0} />
      {[-14, -5, 8, 16].map((x) => (
        <Leg key={x} x={x} lit={HIDE[4]} dark={HIDE[1]} hoof="#4b3a33" />
      ))}
      <polygon points={p([22, -26], [30, -22], [31, -10], [28, -10], [27.5, -20], [21, -23])} fill={HIDE[1]} />
      <polygon points={p([29.5, -12], [33, -8], [29.5, -4], [26, -8])} fill="#4b3a33" />
      <Chunk x={3} y={-23} r={24} turn={2} ramp={HIDE} squash={0.66} />
      {/* Hide patches and the udder. */}
      <polygon points={p([-5, -35], [5, -37], [11, -31], [4, -26], [-4, -28])} fill={INKY} />
      <polygon points={p([14, -20], [22, -21], [23, -14], [16, -12])} fill={INKY} />
      <Face at={[[-1, -10], [9, -10], [7, -5], [1, -5]]} fill="#ffb3c1" />
      {/* Head. */}
      <g transform="translate(-22 -28)">
        <polygon points={p([-8, -10], [-12, -22], [-3, -13])} fill="#fff4d6" />
        <polygon points={p([9, -11], [13, -23], [4, -13])} fill="#e6d3a3" />
        <polygon points={p([-10, -6], [-18, -6], [-12, -1])} fill={HIDE[1]} />
        <Chunk x={1} y={-2} r={13} turn={5} ramp={HIDE} squash={0.95} />
        <Face at={[[-10, 4], [0, 1], [10, 4], [8, 12], [0, 14.5], [-8, 12]]} fill="#ff9db0" />
        <Face at={[[-10, 4], [0, 1], [0, 14.5], [-8, 12]]} fill="#ffc2cd" />
        <polygon points={p([-5, 6], [-3, 8], [-5, 10], [-7, 8])} fill={INK} />
        <polygon points={p([4, 6], [6, 8], [4, 10], [2, 8])} fill={INK} />
        <polygon points={p([-5, -7], [-2.4, -4], [-5, -1], [-7.6, -4])} fill={INK} />
        <polygon points={p([6, -7], [8.6, -4], [6, -1], [3.4, -4])} fill={INK} />
        <polygon points={p([-5.6, -5.6], [-4.4, -4.6], [-5.6, -3.8])} fill="#ffffff" />
        <polygon points={p([5.4, -5.6], [6.6, -4.6], [5.4, -3.8])} fill="#ffffff" />
        {/* A cut-gold bell. */}
        <Face at={[[-1, 14], [5, 14], [6, 20], [2, 22], [-2, 20]]} fill="#e89a00" />
        <Face at={[[-1, 14], [2, 14], [2, 22], [-2, 20]]} fill="#ffd23f" />
      </g>
    </g>
  )
}

// Chunky low-poly pig (facing left), feet at (0, 0).
export function PigShape() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={23} ry={6.5} dx={0} />
      {[-12, -4, 7, 14].map((x) => (
        <Leg key={x} x={x} lit={PINK[3]} dark={PINK[1]} hoof={PINK[0]} />
      ))}
      <polygon points={p([21, -24], [27, -27], [29, -21], [25, -19], [28, -15], [25, -14], [22, -19])} fill={PINK[1]} />
      <Chunk x={3} y={-21} r={22} turn={3} ramp={PINK} squash={0.7} />
      <g transform="translate(-19 -24)">
        <polygon points={p([-8, -8], [-12, -19], [-2, -12])} fill={PINK[3]} />
        <polygon points={p([7, -9], [11, -20], [1, -12])} fill={PINK[1]} />
        <Chunk x={0} y={0} r={12.5} turn={6} ramp={PINK} squash={0.95} />
        <Face at={[[-10, 3], [-3, 0], [4, 3], [3, 9], [-3, 11], [-9, 9]]} fill="#f0638f" />
        <Face at={[[-10, 3], [-3, 0], [-3, 11], [-9, 9]]} fill="#ff8fb4" />
        <polygon points={p([-6, 4], [-4.8, 6], [-6, 8], [-7.2, 6])} fill={INK} />
        <polygon points={p([-0.5, 4], [0.7, 6], [-0.5, 8], [-1.7, 6])} fill={INK} />
        <polygon points={p([-6, -7], [-3.6, -4], [-6, -1], [-8.4, -4])} fill={INK} />
        <polygon points={p([4, -7], [6.4, -4], [4, -1], [1.6, -4])} fill={INK} />
        <polygon points={p([-6.6, -5.6], [-5.4, -4.6], [-6.6, -3.8])} fill="#ffffff" />
        <polygon points={p([3.4, -5.6], [4.6, -4.6], [3.4, -3.8])} fill="#ffffff" />
      </g>
    </g>
  )
}

// Animals are HTML so they can wander with CSS; inside, a squash-and-stretch idle bob (both off for
// reduced motion). A cow ambles, a pig snuffles.
export function AnimalSprite({ variant, delay }: { variant: string | null; delay: number }) {
  const cow = variant !== 'pig'
  return (
    <span className="absolute -translate-x-1/2 -translate-y-full" style={{ left: 0, top: 0 }}>
      <span className={cow ? 'mg-wander block' : 'mg-snuffle block'} style={{ '--mg-delay': `${-delay}s` } as Vars}>
        <span className="mg-squash block" style={{ '--mg-delay': `${-(delay % 1.6)}s` } as Vars}>
          <svg aria-hidden width={72} height={58} viewBox="-36 -52 72 58" className="block overflow-visible">
            {cow ? <CowShape /> : <PigShape />}
          </svg>
        </span>
      </span>
    </span>
  )
}

// A standing item's drawing by type (fences show as a lone post outside the grid). Power buildings
// draw powered unless told otherwise; the seaport faces the front shore unless told otherwise.
export function ItemDrawing({
  item,
  links,
  powered = true,
  shore = 'front',
}: {
  item: Pick<CatalogItem, 'itemType' | 'variant'>
  links?: Parameters<typeof FenceSprite>[0]['links']
  powered?: boolean
  shore?: Shore
}) {
  switch (item.itemType) {
    case 'windmill_small':
      return <BuildingImage kind="windmill_small" powered={powered} />
    case 'windmill_large':
      return <WindmillSprite size="large" />
    case 'furniture_factory':
      return <BuildingImage kind="furniture_factory" powered={powered} />
    case 'candy_factory':
      return <BuildingImage kind="candy_factory" powered={powered} />
    case 'freight_train':
      return <TrainSprite />
    case 'rail_track':
      // Flat: one tile of track, centred on (0, 0).
      return <TrackTile links={links ?? { north: false, east: true, south: false, west: true }} />
    case 'seaport':
      return <SeaportSprite shore={shore} powered={powered} />
    case 'farmer_house':
      return <FarmerHouse />
    case 'woodshop':
      return <WoodshopSprite />
    case 'rockery':
      return <RockerySprite />
    case 'fence':
      return <FenceSprite links={links ?? { north: false, east: true, south: false, west: true }} />
    case 'animal':
      return item.variant === 'pig' ? <PigShape /> : <CowShape />
    case 'stream':
      // Flat: the tile itself, centred on (0, 0).
      return <StreamTile footprint={{ x: 0, y: 0, width: 1, height: 1 }} origin={{ x: 0, y: -TILE_H / 2 }} />
  }
}

// A catalogue item standing on a little 3D pedestal (the Shop's cards). Footprints wider than 2 tiles
// are drawn smaller, so the 6 × 6 windmill and the 6 × 2 seaport fit the card.
export function ItemPreview({ item, className }: { item: CatalogItem; className?: string }): ReactNode {
  const big = item.width > 1
  const shrink = Math.min(1, 2 / Math.max(item.width, item.height)) * (item.width > 2 ? 1.25 : 1)
  const view = big ? '-120 -175 240 230' : '-64 -80 128 118'
  const pad = big ? { a: 108, b: 54 } : { a: 56, b: 28 }
  return (
    <svg viewBox={view} className={className} aria-hidden>
      {/* Pedestal: a chunky grass-topped plinth. */}
      <g strokeLinejoin="round">
        <polygon points={p([-pad.a, 0], [0, pad.b], [0, pad.b + 14], [-pad.a, 14])} fill="#966e4a" />
        <polygon points={p([0, pad.b], [pad.a, 0], [pad.a, 14], [0, pad.b + 14])} fill="#7a5537" />
        <polygon points={p([-pad.a, 0], [0, -pad.b], [pad.a, 0], [0, pad.b])} fill="#82cb52" stroke="#44802c" strokeWidth={2} />
        <polygon points={p([-pad.a * 0.6, -pad.b * 0.25], [0, -pad.b * 0.85], [pad.a * 0.2, -pad.b * 0.62])} fill="#ffffff" opacity={0.18} />
      </g>
      <g transform={`translate(0 ${big ? 4 : 2})${shrink < 1 ? ` scale(${shrink.toFixed(3)})` : ''}`}>
        <ItemDrawing item={item} />
      </g>
    </svg>
  )
}

// Memoized: static layers render once; soil rings and streams only when their tiles change.
export const StreamNetwork = memo(StreamNetworkImpl)
export const TreePlots = memo(TreePlotsImpl)

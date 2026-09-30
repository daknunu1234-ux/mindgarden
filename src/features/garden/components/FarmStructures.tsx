// Chunky, toy-like miniatures for the farm grid, drawn in SVG like 3D casual-game collectibles:
// thick rounded outlines, lit left faces and shaded right faces (sun at the upper left), glossy
// highlights and soft contact shadows. Flat ground things (stream, tree pad, placement ghost, buff
// auras) go in the ground SVG; standing things are drawn in an SVG whose (0, 0) is their ground
// point. Pure markup, no hooks; animations are the `.mg-*` classes in globals.css.
import type { CSSProperties, ReactNode } from 'react'
import type { CatalogItem } from '../lib/farmCatalog'
import { GRID_SIZE, TILE_H, TILE_W, tileToScreen, type Footprint } from '../lib/farmGrid'

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

// A stream tile: crystalline turquoise water with white foam edges, rising bubbles and glints.
export function StreamTile({ footprint, origin }: { footprint: Footprint; origin: Pt }) {
  const c = centreOf(footprint, origin)
  const seed = footprint.x * 7 + footprint.y * 3
  return (
    <g>
      <polygon points={footprintPoints(footprint, origin)} fill="#12a6c6" stroke="#0a6f8a" strokeWidth={3} strokeLinejoin="round" />
      {/* Inner bright water, inset so the darker rim reads as depth. */}
      <polygon
        points={p([c.x, c.y - 21], [c.x + 42, c.y], [c.x, c.y + 21], [c.x - 42, c.y])}
        fill="#35dfe8"
        stroke="#ffffff"
        strokeWidth={5}
        strokeLinejoin="round"
        opacity={0.95}
      />
      <polygon points={p([c.x, c.y - 13], [c.x + 26, c.y], [c.x, c.y + 13], [c.x - 26, c.y])} fill="#7ff5f0" opacity={0.7} />
      <path d={`M ${c.x - 20} ${c.y - 3} q 10 -6 20 0 t 20 0`} stroke="#ffffff" strokeWidth={2.6} fill="none" strokeLinecap="round" className="mg-twinkle" />
      {[
        [-10, 6, 3.2],
        [8, 2, 2.4],
        [16, 8, 2],
      ].map(([dx, dy, r], i) => (
        <circle
          key={i}
          cx={c.x + dx}
          cy={c.y + dy}
          r={r}
          fill="#ffffff"
          opacity={0.9}
          className="mg-bubble"
          style={{ '--mg-delay': `${-((seed + i * 0.8) % 2.4)}s` } as Vars}
        />
      ))}
      {/* Two pebbles on the bank. */}
      <ellipse cx={c.x - 38} cy={c.y + 4} rx={6} ry={4} fill="#c9c4d6" stroke={INK} strokeWidth={1.6} />
      <ellipse cx={c.x + 34} cy={c.y + 8} rx={5} ry={3.4} fill="#b9b4c6" stroke={INK} strokeWidth={1.6} />
    </g>
  )
}

// The raised soil bed a knowledge tree grows from (terracotta mound with a lit top and sprigs).
export function TreePad({ footprint, origin }: { footprint: Footprint; origin: Pt }) {
  const c = centreOf(footprint, origin)
  return (
    <g>
      <ellipse cx={c.x + 3} cy={c.y + 5} rx={46} ry={22} fill="#1f7a34" opacity={0.3} />
      <ellipse cx={c.x} cy={c.y + 2} rx={40} ry={19} fill="#a24f24" stroke={INK} strokeWidth={3} />
      <ellipse cx={c.x} cy={c.y - 1} rx={36} ry={16} fill="#d9733a" />
      <ellipse cx={c.x - 6} cy={c.y - 4} rx={22} ry={8} fill="#f0955a" opacity={0.8} />
      {[
        [-30, -2],
        [28, 4],
        [-12, 12],
      ].map(([dx, dy], i) => (
        <path
          key={i}
          d={`M ${c.x + dx - 4} ${c.y + dy} l 2 -7 M ${c.x + dx} ${c.y + dy} l 0 -9 M ${c.x + dx + 4} ${c.y + dy} l -2 -7`}
          stroke="#2e9e3a"
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

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

// Soft contact shadow under a standing thing.
const Contact = ({ rx, ry, dx = 6 }: { rx: number; ry: number; dx?: number }) => <ellipse cx={dx} cy={4} rx={rx} ry={ry} fill="#0b5d2a" opacity={0.28} />

// Farmer's House (2 × 2): cream timber cottage on a stone plinth, oversized terracotta hip roof with
// a thick glossy rim, a rounded brick chimney puffing smoke, warm glowing windows and door.
export function FarmerHouse() {
  const a = 76
  const b = 38
  const wall = 54
  const o = 16 // roof overhang
  const apex: [number, number] = [0, -wall - 76]
  const eL: [number, number] = [-a - o, -wall + 2]
  const eF: [number, number] = [0, b + o / 2 - wall + 2]
  const eR: [number, number] = [a + o, -wall + 2]
  const lerp = (u: [number, number], v: [number, number], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <radialGradient id="mg-house-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd166" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffd166" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Contact rx={a + 22} ry={b + 10} dx={10} />
      {/* Warm pool of light in front of the door. */}
      <ellipse cx={-36} cy={30} rx={44} ry={20} fill="url(#mg-house-glow)" />
      {/* Stone plinth. */}
      <polygon points={p([-a, 0], [0, b], [0, b - 10], [-a, -10])} fill="#c9c4d6" stroke={INK} strokeWidth={3} />
      <polygon points={p([0, b], [a, 0], [a, -10], [0, b - 10])} fill="#9f9ab0" stroke={INK} strokeWidth={3} />
      {/* Walls: lit left (door side), shaded right (windows). */}
      <polygon points={p([-a, -10], [0, b - 10], [0, b - wall], [-a, -wall])} fill="#fff1d0" stroke={INK} strokeWidth={3} />
      <polygon points={p([0, b - 10], [a, -10], [a, -wall], [0, b - wall])} fill="#f3d39a" stroke={INK} strokeWidth={3} />
      {/* Timber corner posts and a mid beam. */}
      {[
        [-a, 0],
        [0, b],
        [a, 0],
      ].map(([x, y]) => (
        <path key={x} d={`M ${x} ${y - 10} L ${x} ${y - wall}`} stroke={WOOD_DARK} strokeWidth={7} />
      ))}
      <path d={`M ${-a} ${-32} L 0 ${b - 32} L ${a} ${-32}`} stroke={WOOD} strokeWidth={4} fill="none" />
      {/* Rounded door with a glowing pane. */}
      <path d="M -48 4 L -48 -24 q 0 -14 12 -8 q 12 6 12 20 L -24 16 z" fill="#b3542a" stroke={INK} strokeWidth={3} />
      <circle cx={-36} cy={-16} r={4} fill="#ffd166" stroke={INK} strokeWidth={1.5} />
      <circle cx={-29} cy={2} r={2.2} fill="#ffe8a3" />
      {/* Two glowing windows with shutters and flower boxes on the right wall. */}
      {[22, 56].map((x) => {
        const y = b - (x / a) * b - 30
        return (
          <g key={x}>
            <ellipse cx={x} cy={y} rx={20} ry={16} fill="url(#mg-house-glow)" />
            <polygon points={p([x - 10, y + 5 + 6], [x + 10, y - 5 + 6], [x + 10, y - 5 - 12], [x - 10, y + 5 - 12])} fill="#ffd166" stroke={INK} strokeWidth={2.5} />
            <path d={`M ${x} ${y + 6} L ${x} ${y - 12} M ${x - 10} ${y + 2} L ${x + 10} ${y - 8}`} stroke="#b3542a" strokeWidth={2} />
            <polygon points={p([x - 12, y + 16], [x + 12, y + 4], [x + 12, y + 10], [x - 12, y + 22])} fill={WOOD_DARK} stroke={INK} strokeWidth={2} />
            <circle cx={x - 6} cy={y + 13} r={3.2} fill="#ff6b6b" stroke={INK} strokeWidth={1.2} />
            <circle cx={x + 5} cy={y + 8} r={3.2} fill="#ffd23f" stroke={INK} strokeWidth={1.2} />
          </g>
        )
      })}
      {/* Eave shadow on the walls. */}
      <path d={`M ${-a} ${-wall + 4} L 0 ${b - wall + 4} L ${a} ${-wall + 4}`} stroke="#8a5a2b" strokeWidth={6} opacity={0.35} fill="none" />
      {/* Hip roof: lit left slope, shaded right slope, tile rows, a glossy rim. */}
      <polygon points={p(eL, eF, apex)} fill="#f27a45" stroke={INK} strokeWidth={4} />
      <polygon points={p(eF, eR, apex)} fill="#cf5530" stroke={INK} strokeWidth={4} />
      {[0.28, 0.52, 0.74].map((t) => {
        const l1 = lerp(eL, apex, t)
        const f1 = lerp(eF, apex, t)
        const r1 = lerp(eR, apex, t)
        return <path key={t} d={`M ${p(l1)} Q ${lerp(l1, f1, 0.5)[0]} ${lerp(l1, f1, 0.5)[1] + 5} ${p(f1)} Q ${lerp(f1, r1, 0.5)[0]} ${lerp(f1, r1, 0.5)[1] + 5} ${p(r1)}`} stroke="#a33d1f" strokeWidth={2.4} fill="none" />
      })}
      <path d={`M ${p(eL)} L ${p(eF)} L ${p(eR)}`} stroke={INK} strokeWidth={9} fill="none" />
      <path d={`M ${p(eL)} L ${p(eF)} L ${p(eR)}`} stroke="#ffa36b" strokeWidth={4.5} fill="none" />
      <path d={`M ${p(lerp(eL, apex, 0.15))} L ${p(lerp(eL, apex, 0.8))}`} stroke="#ffc49a" strokeWidth={3} opacity={0.8} />
      {/* Rounded brick chimney with smoke. */}
      <g transform="translate(34 -104)">
        <rect x={-11} y={0} width={22} height={34} rx={9} fill="#c65b3c" stroke={INK} strokeWidth={3} />
        <path d="M -7 10 h 8 M 2 20 h 7 M -8 27 h 6" stroke="#8f3b24" strokeWidth={2} />
        <ellipse cx={0} cy={1} rx={14} ry={6} fill="#7a3322" stroke={INK} strokeWidth={3} />
        <ellipse cx={0} cy={0} rx={8} ry={3} fill="#3b1f0e" />
        {[0, 1.1, 2.2].map((delay, i) => (
          <circle
            key={delay}
            cx={i * 2}
            cy={-8}
            r={7}
            fill="#ffffff"
            stroke="#dbe7f0"
            strokeWidth={1.5}
            className="mg-smoke"
            style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
      </g>
    </g>
  )
}

// Woodshop (2 × 2): a plank shed with wood-grain swirls and a shingle roof, an oversized cartoon
// saw blade on its wall, and a stack of round-ended logs out front.
export function WoodshopSprite() {
  const a = 72
  const b = 36
  const wall = 46
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <linearGradient id="mg-saw" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#d4dbe6" />
          <stop offset="100%" stopColor="#8e9aad" />
        </linearGradient>
      </defs>
      <Contact rx={a + 24} ry={b + 10} dx={10} />
      <polygon points={p([-a, 0], [0, b], [0, b - wall], [-a, -wall])} fill="#e5a05a" stroke={INK} strokeWidth={3} />
      <polygon points={p([0, b], [a, 0], [a, -wall], [0, b - wall])} fill="#bf7a3c" stroke={INK} strokeWidth={3} />
      {/* Planks and grain swirls. */}
      {[12, 24, 36].map((h) => (
        <g key={h} stroke="#a8652c" strokeWidth={2}>
          <path d={`M ${-a} ${-h} L 0 ${b - h}`} />
          <path d={`M 0 ${b - h} L ${a} ${-h}`} stroke="#8f5323" />
        </g>
      ))}
      <path d="M -54 -20 q 6 -4 10 0 q 4 4 -2 6" stroke="#b26a2e" strokeWidth={2} fill="none" />
      <path d="M 40 -6 q 6 -4 10 0 q 4 4 -2 6" stroke="#8f5323" strokeWidth={2} fill="none" />
      {/* Wide open doorway on the right wall. */}
      <polygon points={p([18, b - 9], [48, b - 24], [48, b - 58], [18, b - 43])} fill="#5a2f14" stroke={INK} strokeWidth={3} />
      {/* Shingle hip roof. */}
      <polygon points={p([-a - 14, -wall + 2], [0, b + 7 - wall + 2], [0, -wall - 50])} fill="#9a5a2b" stroke={INK} strokeWidth={4} />
      <polygon points={p([0, b + 7 - wall + 2], [a + 14, -wall + 2], [0, -wall - 50])} fill="#7a4420" stroke={INK} strokeWidth={4} />
      <path d={`M ${-a - 14} ${-wall + 2} L 0 ${b + 9 - wall} L ${a + 14} ${-wall + 2}`} stroke="#d08a45" strokeWidth={4} fill="none" />
      {/* Oversized saw blade on the lit wall. */}
      <g transform="translate(-40 -14)">
        <polygon
          points={Array.from({ length: 24 }, (_, i) => {
            const r = i % 2 === 0 ? 25 : 19
            const t = (i / 24) * Math.PI * 2
            return `${(Math.cos(t) * r).toFixed(1)},${(Math.sin(t) * r * 0.8).toFixed(1)}`
          }).join(' ')}
          fill="url(#mg-saw)"
          stroke={INK}
          strokeWidth={2.5}
        />
        <ellipse cx={0} cy={0} rx={8} ry={6.5} fill="#ef4444" stroke={INK} strokeWidth={2.5} />
        <path d="M -12 -10 q 6 -5 12 -4" stroke="#ffffff" strokeWidth={3} fill="none" />
      </g>
      {/* Log stack: three below, two on top, round cut ends with rings. */}
      {[
        [64, 26],
        [82, 17],
        [100, 8],
        [73, 10],
        [91, 1],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M ${x} ${y} l -30 -15`} stroke={INK} strokeWidth={17} />
          <path d={`M ${x} ${y} l -30 -15`} stroke={WOOD_DARK} strokeWidth={12} />
          <path d={`M ${x - 4} ${y - 5} l -22 -11`} stroke={WOOD} strokeWidth={3} />
          <ellipse cx={x} cy={y} rx={8.5} ry={8} fill="#f6cf94" stroke={INK} strokeWidth={2.5} />
          <ellipse cx={x} cy={y} rx={4.5} ry={4} fill="none" stroke="#c98a4b" strokeWidth={1.6} />
        </g>
      ))}
    </g>
  )
}

// Rockery: smooth lavender-grey boulders with moss caps and tiny tropical flowers.
export function RockerySprite() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={34} ry={13} />
      <path d="M -30 2 q -2 -24 18 -30 q 20 -4 24 20 q 2 12 -8 14 q -18 4 -34 -4 z" fill="#a9a3bb" stroke={INK} strokeWidth={3} />
      <path d="M -24 -14 q 4 -12 16 -12" stroke="#ffffff" strokeWidth={3.5} opacity={0.7} fill="none" />
      <path d="M 2 6 q 2 -20 16 -20 q 14 2 14 16 q 0 8 -10 8 q -12 2 -20 -4 z" fill="#8f89a3" stroke={INK} strokeWidth={3} />
      <path d="M -20 -26 q 10 -8 22 -2 q -4 6 -12 5 q -6 3 -10 -3 z" fill="#5fd044" stroke="#2e9e3a" strokeWidth={2} />
      <path d="M 8 -12 q 8 -5 16 0 q -4 4 -9 3 q -4 2 -7 -3 z" fill="#5fd044" stroke="#2e9e3a" strokeWidth={2} />
      {[
        [-32, 4, '#ff6b6b'],
        [30, 6, '#ffd23f'],
        [-6, 10, '#ff8fb1'],
      ].map(([x, y, color]) => (
        <g key={String(x)} transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} cx={0} cy={-4} rx={2.6} ry={4} fill={color as string} stroke={INK} strokeWidth={1} transform={`rotate(${deg})`} />
          ))}
          <circle r={2} fill="#ffb703" />
        </g>
      ))}
    </g>
  )
}

// Fence: a thick post with a round cap in the middle of the tile and chunky outlined rails (with
// pegs) towards every neighbouring fence, so runs snap together (auto-tiling).
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
  const rail = (k: keyof typeof dirs) =>
    [-12, -25].map((dy) => (
      <g key={`${k}${dy}`}>
        <line x1={0} y1={dy} x2={dirs[k].x} y2={dirs[k].y + dy} stroke={INK} strokeWidth={10} strokeLinecap="round" />
        <line x1={0} y1={dy} x2={dirs[k].x} y2={dirs[k].y + dy} stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
        <line x1={0} y1={dy - 1.5} x2={dirs[k].x} y2={dirs[k].y + dy - 1.5} stroke={WOOD_LIT} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    ))
  const post = (x: number, y: number, key: string) => (
    <g key={key}>
      <rect x={x - 6.5} y={y - 36} width={13} height={38} rx={5} fill={WOOD} stroke={INK} strokeWidth={2.5} />
      <rect x={x - 3.5} y={y - 32} width={3} height={28} rx={1.5} fill={WOOD_LIT} />
      <ellipse cx={x} cy={y - 36} rx={7.5} ry={4.5} fill={WOOD_LIT} stroke={INK} strokeWidth={2.5} />
      {[-12, -25].map((dy) => (
        <circle key={dy} cx={x} cy={y + dy} r={2.4} fill={WOOD_DARK} />
      ))}
    </g>
  )
  return (
    <g>
      <Contact rx={16} ry={6} dx={2} />
      {back.map(rail)}
      {back.map((k) => post(dirs[k].x, dirs[k].y, `p${k}`))}
      {post(0, 0, 'centre')}
      {front.map(rail)}
      {front.map((k) => post(dirs[k].x, dirs[k].y, `p${k}`))}
    </g>
  )
}

// Plump comic cow (facing left), feet at (0, 0).
export function CowShape() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={24} ry={6} dx={0} />
      {[-14, -5, 7, 15].map((x) => (
        <g key={x}>
          <rect x={x - 4} y={-12} width={8} height={12} rx={3.5} fill="#ffffff" stroke={INK} strokeWidth={2.5} />
          <rect x={x - 4} y={-4} width={8} height={4} rx={1.5} fill="#4b3a33" />
        </g>
      ))}
      <path d="M 22 -24 q 10 2 8 14" stroke={INK} strokeWidth={2.5} fill="none" />
      <circle cx={30} cy={-9} r={3.5} fill="#4b3a33" />
      <ellipse cx={2} cy={-22} rx={24} ry={15} fill="#ffffff" stroke={INK} strokeWidth={3} />
      <path d="M -4 -34 q 10 -4 14 4 q -2 8 -10 6 q -8 -2 -4 -10 z" fill="#2f2723" />
      <path d="M 14 -18 q 8 -2 8 6 q -6 4 -10 0 z" fill="#2f2723" />
      <ellipse cx={4} cy={-8} rx={6} ry={3} fill="#ffb3c1" stroke={INK} strokeWidth={1.8} />
      {/* Head. */}
      <g transform="translate(-22 -28)">
        <path d="M -6 -12 q -8 -8 -4 -12 q 4 2 6 8 z" fill="#fff4d6" stroke={INK} strokeWidth={2} />
        <path d="M 8 -12 q 8 -8 4 -12 q -4 2 -6 8 z" fill="#fff4d6" stroke={INK} strokeWidth={2} />
        <ellipse cx={-10} cy={-4} rx={6} ry={3.5} fill="#ffffff" stroke={INK} strokeWidth={2} transform="rotate(-20 -10 -4)" />
        <ellipse cx={1} cy={-2} rx={13} ry={12} fill="#ffffff" stroke={INK} strokeWidth={3} />
        <ellipse cx={0} cy={7} rx={11} ry={7} fill="#ffb3c1" stroke={INK} strokeWidth={2.5} />
        <circle cx={-4} cy={7} r={1.6} fill={INK} />
        <circle cx={4} cy={7} r={1.6} fill={INK} />
        <circle cx={-5} cy={-4} r={2.6} fill={INK} />
        <circle cx={5} cy={-4} r={2.6} fill={INK} />
        <circle cx={-4.2} cy={-5} r={0.9} fill="#ffffff" />
        <circle cx={5.8} cy={-5} r={0.9} fill="#ffffff" />
        <circle cx={2} cy={16} r={3.4} fill="#ffd23f" stroke={INK} strokeWidth={1.8} />
      </g>
    </g>
  )
}

// Plump comic pig (facing left), feet at (0, 0).
export function PigShape() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <Contact rx={22} ry={6} dx={0} />
      {[-12, -4, 6, 13].map((x) => (
        <rect key={x} x={x - 4} y={-11} width={8} height={11} rx={3.5} fill="#ff9dbf" stroke={INK} strokeWidth={2.5} />
      ))}
      <path d="M 21 -22 q 8 -4 6 3 q -2 5 4 4" stroke={INK} strokeWidth={2.5} fill="none" />
      <ellipse cx={2} cy={-20} rx={22} ry={15} fill="#ffb3cc" stroke={INK} strokeWidth={3} />
      <ellipse cx={4} cy={-11} rx={13} ry={5} fill="#ffd0e0" />
      <path d="M -6 -30 q 8 -5 16 -3" stroke="#ffffff" strokeWidth={3} opacity={0.7} fill="none" />
      <g transform="translate(-19 -24)">
        <path d="M -8 -8 l -4 -10 l 9 5 z" fill="#ff8fb4" stroke={INK} strokeWidth={2} />
        <path d="M 7 -9 l 3 -10 l -9 5 z" fill="#ff8fb4" stroke={INK} strokeWidth={2} />
        <circle cx={0} cy={0} r={12} fill="#ffb3cc" stroke={INK} strokeWidth={3} />
        <ellipse cx={-3} cy={5} rx={7} ry={5} fill="#ff7fa8" stroke={INK} strokeWidth={2.2} />
        <ellipse cx={-5.5} cy={5} rx={1.3} ry={2} fill={INK} />
        <ellipse cx={-0.5} cy={5} rx={1.3} ry={2} fill={INK} />
        <circle cx={-6} cy={-4} r={2.4} fill={INK} />
        <circle cx={4} cy={-4} r={2.4} fill={INK} />
        <circle cx={-5.2} cy={-4.8} r={0.8} fill="#ffffff" />
        <circle cx={4.8} cy={-4.8} r={0.8} fill="#ffffff" />
        <circle cx={7} cy={2} r={2.6} fill="#ff7fa8" opacity={0.6} />
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

// A standing item's drawing by type (fences show as a lone post outside the grid).
export function ItemDrawing({ item, links }: { item: Pick<CatalogItem, 'itemType' | 'variant'>; links?: Parameters<typeof FenceSprite>[0]['links'] }) {
  switch (item.itemType) {
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

// A catalogue item standing on a little 3D pedestal (the Shop's cards).
export function ItemPreview({ item, className }: { item: CatalogItem; className?: string }): ReactNode {
  const big = item.width > 1
  const view = big ? '-120 -175 240 230' : '-64 -80 128 118'
  const pad = big ? { a: 108, b: 54 } : { a: 56, b: 28 }
  return (
    <svg viewBox={view} className={className} aria-hidden>
      {/* Pedestal: a chunky grass-topped plinth. */}
      <g strokeLinejoin="round">
        <polygon points={p([-pad.a, 0], [0, pad.b], [0, pad.b + 14], [-pad.a, 14])} fill="#e0773a" stroke={INK} strokeWidth={3} />
        <polygon points={p([0, pad.b], [pad.a, 0], [pad.a, 14], [0, pad.b + 14])} fill="#b85a26" stroke={INK} strokeWidth={3} />
        <polygon points={p([-pad.a, 0], [0, -pad.b], [pad.a, 0], [0, pad.b])} fill="#74de4c" stroke="#2e9e3a" strokeWidth={3} />
        <polygon points={p([-pad.a * 0.6, -pad.b * 0.25], [0, -pad.b * 0.85], [pad.a * 0.2, -pad.b * 0.62])} fill="#ffffff" opacity={0.18} />
      </g>
      <g transform={`translate(0 ${big ? 4 : 2})`}>
        <ItemDrawing item={item} />
      </g>
    </svg>
  )
}

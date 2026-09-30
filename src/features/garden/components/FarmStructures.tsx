// Drawings for the farm grid: the grass tiles and flat ground items (SVG, drawn under everything),
// and the standing miniatures (Woodshop, rockery, fence, animals) placed by their ground point.
// Pure markup, no hooks. The Farmer's House reuses FarmScenery's Farmhouse drawing.
import { GRID_SIZE, TILE_H, TILE_W, tileToScreen, type Footprint } from '../lib/farmGrid'

type Pt = { x: number; y: number }

// Diamond of a footprint (its four outer tile corners), offset by the grid origin.
export function footprintPoints({ x, y, width, height }: Footprint, origin: Pt): string {
  const top = tileToScreen(x, y)
  const right = tileToScreen(x + width, y)
  const bottom = tileToScreen(x + width, y + height)
  const left = tileToScreen(x, y + height)
  return [top, right, bottom, left].map((p) => `${(p.x + origin.x).toFixed(1)},${(p.y + origin.y).toFixed(1)}`).join(' ')
}

// The 16 × 16 grass field on a soil cliff, with a soft checkerboard so tiles read clearly.
export function GroundTiles({ origin }: { origin: Pt }) {
  const whole = { x: 0, y: 0, width: GRID_SIZE, height: GRID_SIZE }
  const left = tileToScreen(0, GRID_SIZE)
  const bottom = tileToScreen(GRID_SIZE, GRID_SIZE)
  const right = tileToScreen(GRID_SIZE, 0)
  const cliff = 34
  const at = (p: Pt, dy = 0) => `${(p.x + origin.x).toFixed(1)},${(p.y + origin.y + dy).toFixed(1)}`
  const tiles = []
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      tiles.push(<polygon key={`${x}-${y}`} points={footprintPoints({ x, y, width: 1, height: 1 }, origin)} fill={(x + y) % 2 === 0 ? '#7fcf4f' : '#74c447'} />)
    }
  }
  return (
    <g>
      {/* Soil cliff under the front edges. */}
      <polygon points={[at(left), at(bottom), at(bottom, cliff), at(left, cliff)].join(' ')} fill="#8a5a2b" />
      <polygon points={[at(bottom), at(right), at(right, cliff), at(bottom, cliff)].join(' ')} fill="#6f4520" />
      <polygon points={footprintPoints(whole, origin)} fill="#6cbd42" stroke="#3f7d22" strokeWidth={3} />
      {tiles}
    </g>
  )
}

// A stream tile: water in the tile's diamond, with a glinting ripple.
export function StreamTile({ footprint, origin }: { footprint: Footprint; origin: Pt }) {
  const c = { x: tileToScreen(footprint.x, footprint.y).x + origin.x, y: tileToScreen(footprint.x, footprint.y).y + origin.y + TILE_H / 2 }
  return (
    <g>
      <polygon points={footprintPoints(footprint, origin)} fill="#38bdf8" stroke="#0e7490" strokeWidth={2} />
      <path d={`M ${c.x - 22} ${c.y - 2} q 11 -7 22 0 t 22 0`} stroke="#e0f7ff" strokeWidth={2.5} fill="none" strokeLinecap="round" className="mg-twinkle" />
      <path d={`M ${c.x - 14} ${c.y + 8} q 7 -5 14 0 t 14 0`} stroke="#bae6fd" strokeWidth={2} fill="none" strokeLinecap="round" />
    </g>
  )
}

// Placement ghost: the footprint tinted green (free) or red (taken / off the farm).
export function GhostFootprint({ footprint, origin, valid }: { footprint: Footprint; origin: Pt; valid: boolean }) {
  return (
    <polygon
      points={footprintPoints(footprint, origin)}
      fill={valid ? 'rgba(74, 222, 128, 0.45)' : 'rgba(248, 113, 113, 0.5)'}
      stroke={valid ? '#15803d' : '#b91c1c'}
      strokeWidth={3}
      strokeDasharray="8 5"
    />
  )
}

// ── Standing miniatures (drawn in an SVG whose (0, 0) is the item's ground point) ─────────────

// Woodshop: a timber shed with a saw blade on the gable and a log pile.
export function WoodshopSprite() {
  const w = 70
  const h = 38
  return (
    <g>
      <ellipse cx={0} cy={6} rx={w + 8} ry={h * 0.7} fill="rgba(47,95,22,0.3)" />
      <polygon points={`${-w},0 0,${h} 0,${h - 50} ${-w},-50`} fill="#b4763a" stroke="#4a2511" strokeWidth={2.5} />
      <polygon points={`0,${h} ${w},0 ${w},-50 0,${h - 50}`} fill="#8f5a2a" stroke="#4a2511" strokeWidth={2.5} />
      <polygon points={`${-w - 6},-48 0,${h - 48} 0,${h - 92} ${-w - 6},-92`} fill="#c2410c" stroke="#4a2511" strokeWidth={2.5} />
      <polygon points={`0,${h - 48} ${w + 6},-48 ${w + 6},-92 0,${h - 92}`} fill="#9a3412" stroke="#4a2511" strokeWidth={2.5} />
      {/* Door on the left wall, following its slope. */}
      <polygon points="-22,26 -8,33.7 -8,7.7 -22,0" fill="#4a2511" />
      <circle cx={-32} cy={-72} r={11} fill="#e5e7eb" stroke="#4a2511" strokeWidth={2} />
      <circle cx={-32} cy={-72} r={3} fill="#4a2511" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={w + 10 - i * 4} cy={10 - i * 9} r={7} fill="#d6a468" stroke="#6b3d18" strokeWidth={2} />
      ))}
    </g>
  )
}

// Rockery: three mossy boulders.
export function RockerySprite() {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={30} ry={12} fill="rgba(47,95,22,0.3)" />
      <path d="M -26 2 q 2 -22 18 -24 q 14 0 16 20 q -16 10 -34 4 z" fill="#9ca3af" stroke="#374151" strokeWidth={2} />
      <path d="M 2 4 q 4 -18 16 -18 q 12 2 12 16 q -12 8 -28 2 z" fill="#a8a29e" stroke="#374151" strokeWidth={2} />
      <path d="M -10 -18 q 6 -6 12 -2" stroke="#65a30d" strokeWidth={4} strokeLinecap="round" fill="none" />
      <path d="M 12 -12 q 4 -3 8 0" stroke="#65a30d" strokeWidth={3} strokeLinecap="round" fill="none" />
    </g>
  )
}

// Fence: a post in the middle of the tile and rails towards every neighbouring fence (auto-tiling).
export function FenceSprite({ links }: { links: { north: boolean; east: boolean; south: boolean; west: boolean } }) {
  // Screen direction from a tile's centre to the middle of each side.
  const dirs = {
    north: { x: TILE_W / 4, y: -TILE_H / 4 },
    east: { x: TILE_W / 4, y: TILE_H / 4 },
    south: { x: -TILE_W / 4, y: TILE_H / 4 },
    west: { x: -TILE_W / 4, y: -TILE_H / 4 },
  } as const
  const rails = (Object.keys(dirs) as (keyof typeof dirs)[]).filter((k) => links[k])
  return (
    <g>
      {rails.map((k) =>
        [-12, -22].map((dy) => (
          <line key={`${k}${dy}`} x1={0} y1={dy} x2={dirs[k].x} y2={dirs[k].y + dy} stroke="#f5f5f4" strokeWidth={4} strokeLinecap="round" />
        )),
      )}
      <rect x={-3.5} y={-30} width={7} height={30} rx={2} fill="#fafaf9" stroke="#57534e" strokeWidth={1.5} />
      {rails.map((k) => (
        <rect key={k} x={dirs[k].x - 3} y={dirs[k].y - 28} width={6} height={28} rx={2} fill="#fafaf9" stroke="#57534e" strokeWidth={1.5} />
      ))}
    </g>
  )
}

// Animals are HTML so they can wander with CSS (off for reduced motion); a shadow keeps them grounded.
export function AnimalSprite({ variant, delay }: { variant: string | null; delay: number }) {
  const cow = variant !== 'pig'
  return (
    <span className="absolute -translate-x-1/2 -translate-y-full" style={{ left: 0, top: 0 }}>
      <span
        className={cow ? 'mg-wander block' : 'mg-snuffle block'}
        style={{ ['--mg-delay' as string]: `${-delay}s` }}
      >
        <span aria-hidden className="block text-[34px] leading-none drop-shadow-[0_3px_0_rgba(47,95,22,0.35)]">
          {cow ? '🐄' : '🐖'}
        </span>
      </span>
    </span>
  )
}

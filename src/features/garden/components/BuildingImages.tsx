// PNG-rendered sprites for some 2 × 2 buildings (public/assets/sprites/*.webp, made from the renders
// in raw-assets/structures/*.png by scripts/prepare-building-sprites.mjs), with a light SVG overlay
// that animates them while powered. Each sprite is drawn as an SVG <image> around the building's ground
// point (0, 0), the centre of its footprint diamond, so it depth-sorts exactly like the vector sprites.
// Overlay parts are placed in sprite pixels (`spritePoint`), so they sit on the painted chimney, belt
// or bench at any scale. Animations are CSS only (transform and opacity), stop when power is lost,
// pause with the farm (`.mg-paused`: hidden tab or a dialog open) and are off for reduced motion. An
// unpowered building is drawn muted (`.mg-unpowered` in globals.css).
//   Candy Factory: white smoke puffs rising from the candy-cane chimney; wrapped candies rolling off
//     the conveyor's end (`.mg-roll`).
//   Furniture Factory: exhaust smoke from the metal pipe; golden sawdust sparks and wood chips spraying
//     from the saw bench (`.mg-spark`).
//   Small Windmill: a rotor of four lattice sails turning about the painted hub, in the sails' plane
//     (`.mg-spin`). Off while the render has its sails painted in (`bakedSails`): turning sails over
//     still ones would show both. A render without sails turns it on.
import type { CSSProperties } from 'react'
import { FootprintShadow, type Pt } from './lowPolyKit'
import { smoke } from './PowerBuildings'

type Vars = CSSProperties & Record<`--mg-${string}`, string>

export type BuildingImageKind = 'windmill_small' | 'candy_factory' | 'furniture_factory'

type SpriteConfig = {
  href: string
  // The sprite's pixel size, the pixel that sits on the ground point (the centre of the building's
  // base), and the scale from sprite pixels to farm pixels. Checked against the 2 × 2 tile diamond
  // (224 × 112 farm px): each base stays inside it.
  size: [number, number]
  anchor: [number, number]
  scale: number
}

export const BUILDING_IMAGES: Record<BuildingImageKind, SpriteConfig> = {
  windmill_small: { href: '/assets/sprites/windmill_small.webp', size: [640, 891], anchor: [377, 770], scale: 0.3 },
  candy_factory: { href: '/assets/sprites/candy_factory.webp', size: [640, 775], anchor: [332, 583], scale: 0.3 },
  furniture_factory: { href: '/assets/sprites/furniture_factory.webp', size: [640, 515], anchor: [312, 356], scale: 0.3 },
}

// Where the overlay parts sit, in sprite pixels (measured on the sprites).
export const OVERLAY_POINTS = {
  // The candy-cane chimney's opening; the conveyor's belt from where candies start rolling to its end.
  candyChimney: [497, 140],
  candyBeltFrom: [95, 600],
  candyBeltTo: [30, 668],
  // The furniture factory's metal pipe top; the middle of the saw bench.
  furniturePipe: [472, 14],
  furnitureBench: [245, 350],
  // The windmill's rotor hub, and its sails' two axes (hub to sail tip, sprite px): they span the
  // plane the sails turn in.
  windmillHub: [240, 355],
  windmillAxisX: [210, -132],
  windmillAxisY: [175, 348],
} as const satisfies Record<string, Pt>

// The windmill render has its sails painted in; set to false once it is a render without sails.
export const WINDMILL_RENDER = { bakedSails: true }

// A point given in a sprite's pixels, in farm pixels around the ground point.
export function spritePoint(kind: BuildingImageKind, [x, y]: readonly [number, number]): Pt {
  const { anchor, scale } = BUILDING_IMAGES[kind]
  return [(x - anchor[0]) * scale, (y - anchor[1]) * scale]
}

export function BuildingImage({ kind, powered = true }: { kind: BuildingImageKind; powered?: boolean }) {
  const { href, size, anchor, scale } = BUILDING_IMAGES[kind]
  return (
    <g data-building={kind} data-powered={powered} data-sprite="image">
      <FootprintShadow w={2} h={2} />
      <image
        href={href}
        x={-anchor[0] * scale}
        y={-anchor[1] * scale}
        width={size[0] * scale}
        height={size[1] * scale}
        preserveAspectRatio="none"
        className={powered ? undefined : 'mg-unpowered'}
      />
      {kind === 'candy_factory' && powered && <CandyOverlay />}
      {kind === 'furniture_factory' && powered && <FurnitureOverlay />}
      {kind === 'windmill_small' && !WINDMILL_RENDER.bakedSails && <WindmillRotor spinning={powered} />}
    </g>
  )
}

// ── Candy Factory ────────────────────────────────────────────────────────────

const CANDY_COLORS = ['#ff3d8f', '#ffd21a', '#2fb6ff']

function CandyOverlay() {
  const from = spritePoint('candy_factory', OVERLAY_POINTS.candyBeltFrom)
  const to = spritePoint('candy_factory', OVERLAY_POINTS.candyBeltTo)
  const roll: Vars = { '--mg-cx': `${(to[0] - from[0]).toFixed(1)}px`, '--mg-cy': `${(to[1] - from[1]).toFixed(1)}px` }
  return (
    <g data-overlay="candy_factory">
      {smoke('chimney', spritePoint('candy_factory', OVERLAY_POINTS.candyChimney), '#ffffff', [0, 1.1, 2.2], 1.1)}
      {/* Wrapped candies rolling down the belt and off its end, one after another. */}
      <g transform={`translate(${from[0].toFixed(1)} ${from[1].toFixed(1)})`} data-part="rolling-candies">
        {CANDY_COLORS.map((color, i) => (
          <g key={color} className="mg-roll" style={{ ...roll, animationDelay: `${i * 0.8}s` }}>
            <polygon points="-6,-2.2 -3,0 -6,2.2" fill={color} />
            <polygon points="6,-2.2 3,0 6,2.2" fill={color} />
            <ellipse rx={3.6} ry={2.6} fill={color} />
            <ellipse cx={-1.1} cy={-0.9} rx={1.3} ry={0.7} fill="#ffffff" opacity={0.85} />
          </g>
        ))}
      </g>
    </g>
  )
}

// ── Furniture Factory ────────────────────────────────────────────────────────

// The spray from the saw bench: where each particle flies to (farm px), when it starts, and whether it
// is a spark (round, golden) or a wood chip (a small amber sliver).
const SPRAY: { to: Pt; delay: number; chip: boolean }[] = [
  { to: [-14, -12], delay: 0, chip: false },
  { to: [-8, -18], delay: 0.2, chip: true },
  { to: [6, -16], delay: 0.4, chip: false },
  { to: [14, -9], delay: 0.6, chip: true },
  { to: [-18, -4], delay: 0.8, chip: false },
  { to: [10, -20], delay: 1, chip: false },
  { to: [-4, -22], delay: 1.2, chip: true },
  { to: [18, -3], delay: 1.4, chip: false },
]

function FurnitureOverlay() {
  const bench = spritePoint('furniture_factory', OVERLAY_POINTS.furnitureBench)
  return (
    <g data-overlay="furniture_factory">
      {smoke('pipe', spritePoint('furniture_factory', OVERLAY_POINTS.furniturePipe), '#eef1f6', [0, 1.1, 2.2], 0.9)}
      <g transform={`translate(${bench[0].toFixed(1)} ${bench[1].toFixed(1)})`} data-part="sawdust">
        {SPRAY.map(({ to, delay, chip }, i) => {
          const style: Vars = { '--mg-dx': `${to[0]}px`, '--mg-dy': `${to[1]}px`, animationDelay: `${delay}s` }
          return chip ? (
            <rect key={i} x={-1.4} y={-0.6} width={2.8} height={1.2} fill="#e9a45b" className="mg-spark" style={style} />
          ) : (
            <circle key={i} r={i % 2 ? 1.1 : 1.5} fill={i % 3 ? '#ffd25a' : '#fff1b0'} className="mg-spark" style={style} />
          )
        })}
      </g>
    </g>
  )
}

// ── Small Windmill ───────────────────────────────────────────────────────────

// One sail in the rotor's own frame (hub at the origin, the sail along −y, 100 long): a ladder of
// golden-oak rails and laths with cream canvas panels.
function RotorSail() {
  const laths = [22, 33, 44, 55, 66, 77, 88, 99]
  return (
    <g>
      <rect x={-1.6} y={-100} width={3.2} height={92} fill="#b56a1c" />
      {laths.slice(0, -1).map((y, k) => (
        <rect key={y} x={-8} y={-laths[k + 1]} width={16} height={laths[k + 1] - y} fill={k % 2 ? '#fff6e6' : '#f3e2c4'} />
      ))}
      <rect x={-9} y={-100} width={2.2} height={80} fill="#e0962c" />
      <rect x={6.8} y={-100} width={2.2} height={80} fill="#c97f1f" />
      {laths.map((y) => (
        <rect key={y} x={-9} y={-y - 1} width={18} height={2} fill="#e0962c" />
      ))}
    </g>
  )
}

// The rotor: four sails turning about the hub. The outer transform maps the rotor's frame onto the
// sails' plane as painted (its two axes onto the sprite's sail axes), so the turning circle shows as
// the right ellipse; the inner group turns (`.mg-spin`, about the hub: the group's box is centred on
// it), and stops where it is when the windmill loses power.
export function WindmillRotor({ spinning = true }: { spinning?: boolean }) {
  const { scale } = BUILDING_IMAGES.windmill_small
  const [hx, hy] = spritePoint('windmill_small', OVERLAY_POINTS.windmillHub)
  const [ax, ay] = OVERLAY_POINTS.windmillAxisX.map((v) => (v * scale) / 100)
  const [bx, by] = OVERLAY_POINTS.windmillAxisY.map((v) => (v * scale) / 100)
  return (
    <g transform={`matrix(${ax.toFixed(4)} ${ay.toFixed(4)} ${bx.toFixed(4)} ${by.toFixed(4)} ${hx.toFixed(2)} ${hy.toFixed(2)})`} data-part="rotor">
      <g className="mg-spin" style={{ transformBox: 'fill-box', transformOrigin: 'center', animationPlayState: spinning ? undefined : 'paused' }} data-spinning={spinning}>
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <RotorSail />
          </g>
        ))}
        <circle r={10} fill="#8f98a3" />
        <circle r={5} fill="#5b636d" />
        <circle cx={-3} cy={-3} r={2.2} fill="#ffffff" opacity={0.8} />
      </g>
    </g>
  )
}

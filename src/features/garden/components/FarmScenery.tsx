// Farm world scenery: pure SVG markup (no hooks, no ids), drawn inside FarmIslandView's canvas.
// Every piece is positioned by lib/farmLayout.ts; shapes here are isometric-ish and flat-shaded.
import type { Decoration, FarmPlot, FarmProp, Point } from '../lib/farmLayout'
import { HOUSE_HALF, PLOT_HALF_H, PLOT_HALF_W, TRACTOR_HALF } from '../lib/farmLayout'

const WOOD = '#a16207'
const WOOD_DARK = '#713f12'

// ── Ground ───────────────────────────────────────────────────────────────────

// Cobblestone lane: dark edge, pale bed, a row of rounded stones.
export function CobblePath({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke="#a8a29e" strokeWidth="24" />
      <path d={d} stroke="#d6d3d1" strokeWidth="19" />
      <path d={d} stroke="#f5f5f4" strokeWidth="8" strokeDasharray="1 11" />
      <path d={d} stroke="#e7e5e4" strokeWidth="6" strokeDasharray="1 13" strokeDashoffset="6" transform="translate(0 5)" />
    </g>
  )
}

// Raised soil bed with a ring of border stones and the tree's contact shadow.
export function PlotBed({ plot }: { plot: FarmPlot }) {
  const w = PLOT_HALF_W * 0.84
  const h = PLOT_HALF_H * 0.84
  const { x, y } = plot
  const diamond = (s: number) => `M ${x} ${y - h * s} L ${x + w * s} ${y} L ${x} ${y + h * s} L ${x - w * s} ${y} Z`
  const stones: Point[] = []
  const corners: Point[] = [
    [x, y - h * 1.08],
    [x + w * 1.08, y],
    [x, y + h * 1.08],
    [x - w * 1.08, y],
  ]
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % 4]
    for (let t = 0; t < 1; t += 1 / 7) stones.push([ax + (bx - ax) * t, ay + (by - ay) * t])
  }
  return (
    <g>
      <path d={diamond(1.12)} transform="translate(0 6)" fill="#15803d" opacity="0.25" />
      <path d={diamond(1)} transform="translate(0 6)" fill="#5c3a1a" />
      <path d={diamond(1)} fill="#7c4a21" />
      <path d={diamond(0.78)} fill="#8b5a2b" />
      {[-0.45, 0, 0.45].map((t) => (
        <path
          key={t}
          d={`M ${x - w * 0.5 + t * w * 0.5} ${y + t * h * 0.5} l ${w * 0.5} ${h * 0.5}`}
          stroke="#5c3a1a"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      ))}
      {stones.map(([sx, sy], i) => (
        <ellipse key={i} cx={sx} cy={sy} rx="4.2" ry="3" fill={i % 3 === 0 ? '#d6d3d1' : '#a8a29e'} stroke="#78716c" strokeWidth="0.8" />
      ))}
      {/* Contact shadow where the trunk meets the soil. */}
      <ellipse cx={x} cy={y + 2} rx="34" ry="10" fill="#1c1917" opacity="0.18" />
    </g>
  )
}

export function Fence({ run }: { run: Point[] }) {
  const rail = (dy: number) => `M ${run.map(([x, y]) => `${x.toFixed(1)} ${(y + dy).toFixed(1)}`).join(' L ')}`
  return (
    <g>
      <path d={rail(2)} stroke="#1c1917" strokeOpacity="0.15" strokeWidth="4" fill="none" transform="translate(0 4)" />
      {run.map(([x, y], i) => (
        <path key={i} d={`M ${x - 2} ${y} v -13 l 2 -3 l 2 3 v 13 z`} fill="#ffffff" stroke="#d6d3d1" strokeWidth="0.8" />
      ))}
      <path d={rail(-10)} stroke="#f5f5f4" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      <path d={rail(-4)} stroke="#f5f5f4" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
    </g>
  )
}

// ── Landmarks ────────────────────────────────────────────────────────────────

// Red barn farmhouse on its footprint diamond (x, y = footprint centre).
export function Farmhouse({ x, y }: { x: number; y: number }) {
  const { w, h } = HOUSE_HALF
  const wall = 58
  const apex: Point = [x, y - wall - 52]
  const eaveL: Point = [x - w - 8, y - wall + 2]
  const eaveR: Point = [x + w + 8, y - wall + 2]
  const eaveF: Point = [x, y + h - wall + 6]
  const eaveB: Point = [x, y - h - wall - 2]
  const pts = (...ps: Point[]) => ps.map((p) => p.join(',')).join(' ')
  return (
    <g>
      <ellipse cx={x} cy={y + h * 0.4} rx={w * 1.25} ry={h * 1.1} fill="#1c1917" opacity="0.18" />
      {/* Walls: left (lit) and front-right (shade). */}
      <polygon points={pts([x - w, y], [x, y + h], [x, y + h - wall], [x - w, y - wall])} fill="#dc2626" />
      <polygon points={pts([x, y + h], [x + w, y], [x + w, y - wall], [x, y + h - wall])} fill="#b91c1c" />
      {/* White trim. */}
      <path d={`M ${x - w} ${y} L ${x} ${y + h} L ${x + w} ${y}`} stroke="#fff" strokeWidth="3" fill="none" />
      <path d={`M ${x} ${y + h} V ${y + h - wall}`} stroke="#fff" strokeWidth="3" />
      {/* Barn door with the classic white X. */}
      <polygon points={pts([x + w * 0.25, y + h * 0.75], [x + w * 0.7, y + h * 0.3], [x + w * 0.7, y + h * 0.3 - 36], [x + w * 0.25, y + h * 0.75 - 36])} fill="#7f1d1d" stroke="#fff" strokeWidth="2.5" />
      <path
        d={`M ${x + w * 0.25} ${y + h * 0.75} L ${x + w * 0.7} ${y + h * 0.3 - 36} M ${x + w * 0.7} ${y + h * 0.3} L ${x + w * 0.25} ${y + h * 0.75 - 36}`}
        stroke="#fff"
        strokeWidth="2.5"
      />
      {/* Window on the left wall. */}
      <polygon points={pts([x - w * 0.7, y + h * 0.1 - 22], [x - w * 0.35, y + h * 0.5 - 22], [x - w * 0.35, y + h * 0.5 - 40], [x - w * 0.7, y + h * 0.1 - 40])} fill="#fde68a" stroke="#fff" strokeWidth="2.5" />
      {/* Roof: back faces lighter, front faces darker. */}
      <polygon points={pts(eaveL, eaveB, apex)} fill="#b45309" />
      <polygon points={pts(eaveB, eaveR, apex)} fill="#92400e" />
      <polygon points={pts(eaveL, eaveF, apex)} fill="#7c2d12" />
      <polygon points={pts(eaveF, eaveR, apex)} fill="#9a3412" />
      <path d={`M ${eaveL.join(' ')} L ${eaveF.join(' ')} L ${eaveR.join(' ')}`} stroke="#fef3c7" strokeWidth="2.5" fill="none" />
      {/* Hay loft window + weathervane. */}
      <circle cx={apex[0] - 8} cy={apex[1] + 30} r="7" fill="#fef3c7" stroke="#fff" strokeWidth="2" />
      <path d={`M ${apex[0]} ${apex[1]} v -16 M ${apex[0] - 7} ${apex[1] - 12} h 14`} stroke="#1c1917" strokeWidth="2" strokeLinecap="round" />
    </g>
  )
}

// Red farm tractor, facing front-left (x, y = footprint centre).
export function Tractor({ x, y }: { x: number; y: number }) {
  const { w, h } = TRACTOR_HALF
  return (
    <g>
      <ellipse cx={x} cy={y + 6} rx={w * 1.05} ry={h * 0.9} fill="#1c1917" opacity="0.2" />
      {/* Big rear wheel. */}
      <ellipse cx={x + 16} cy={y - 8} rx="18" ry="21" fill="#1f2937" />
      <ellipse cx={x + 16} cy={y - 8} rx="8" ry="9.5" fill="#9ca3af" />
      {/* Body: hood + cabin. */}
      <path d={`M ${x - 36} ${y - 6} L ${x - 6} ${y + 10} L ${x + 8} ${y + 2} L ${x + 8} ${y - 22} L ${x - 22} ${y - 38} L ${x - 36} ${y - 30} Z`} fill="#dc2626" />
      <path d={`M ${x - 36} ${y - 30} L ${x - 22} ${y - 38} L ${x + 8} ${y - 22} L ${x - 6} ${y - 14} Z`} fill="#ef4444" />
      <path d={`M ${x - 36} ${y - 6} L ${x - 6} ${y + 10} L ${x - 6} ${y - 14} L ${x - 36} ${y - 30} Z`} fill="#b91c1c" />
      {/* Cabin frame and roof. */}
      <path d={`M ${x - 4} ${y - 16} V ${y - 56} M ${x + 18} ${y - 28} V ${y - 64}`} stroke="#1f2937" strokeWidth="3" />
      <path d={`M ${x - 10} ${y - 56} L ${x + 24} ${y - 70} L ${x + 30} ${y - 62} L ${x - 4} ${y - 48} Z`} fill="#fef3c7" stroke="#b91c1c" strokeWidth="2" />
      {/* Exhaust pipe and grille. */}
      <path d={`M ${x - 26} ${y - 34} v -16`} stroke="#374151" strokeWidth="3.5" strokeLinecap="round" />
      <path d={`M ${x - 33} ${y - 20} l 10 6 M ${x - 33} ${y - 14} l 10 6`} stroke="#7f1d1d" strokeWidth="1.8" />
      {/* Front wheel. */}
      <ellipse cx={x - 26} cy={y + 2} rx="10" ry="12" fill="#1f2937" />
      <ellipse cx={x - 26} cy={y + 2} rx="4" ry="5" fill="#9ca3af" />
      {/* A crate of produce on the back. */}
      <rect x={x + 26} y={y - 30} width="16" height="12" fill={WOOD} stroke={WOOD_DARK} strokeWidth="1.5" />
      <circle cx={x + 31} cy={y - 32} r="3" fill="#ef4444" />
      <circle cx={x + 37} cy={y - 32} r="3" fill="#f97316" />
    </g>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 1} rx="8" ry="3" fill="#1c1917" opacity="0.2" />
      <circle cx={x} cy={y - 42} r="14" fill="#fde68a" opacity="0.55" className="mg-glow" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
      <rect x={x - 1.8} y={y - 38} width="3.6" height="38" rx="1.5" fill="#1f2937" />
      <path d={`M ${x - 6} ${y - 38} h 12 l -2 -10 h -8 z`} fill="#fef3c7" stroke="#1f2937" strokeWidth="1.5" />
      <path d={`M ${x - 7} ${y - 48} h 14 l -7 -5 z`} fill="#1f2937" />
    </g>
  )
}

function Bench({ x, y, flip }: { x: number; y: number; flip: boolean }) {
  const s = flip ? -1 : 1
  return (
    <g transform={`translate(${x} ${y}) scale(${s} 1)`}>
      <ellipse cx="0" cy="3" rx="20" ry="5" fill="#1c1917" opacity="0.18" />
      <path d="M -18 -4 L 2 6 L 18 -2 L -2 -12 Z" fill={WOOD} stroke={WOOD_DARK} strokeWidth="1.5" />
      <path d="M -18 -4 v 7 M 2 6 v 7 M 18 -2 v 7" stroke={WOOD_DARK} strokeWidth="2.5" />
      <path d="M -2 -12 L 18 -2 L 18 -14 L -2 -24 Z" fill="#b45309" stroke={WOOD_DARK} strokeWidth="1.5" />
      <path d="M 2 -16 L 16 -9 M 2 -20 L 16 -13" stroke={WOOD_DARK} strokeWidth="1" />
    </g>
  )
}

function Bale({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 4} rx="18" ry="6" fill="#1c1917" opacity="0.18" />
      <path d={`M ${x - 16} ${y - 4} L ${x} ${y + 4} L ${x + 16} ${y - 4} L ${x + 16} ${y - 18} L ${x} ${y - 26} L ${x - 16} ${y - 18} Z`} fill="#eab308" />
      <path d={`M ${x - 16} ${y - 18} L ${x} ${y - 10} L ${x + 16} ${y - 18} L ${x} ${y - 26} Z`} fill="#fde047" />
      <path d={`M ${x} ${y - 10} V ${y + 4}`} stroke="#ca8a04" strokeWidth="1.5" />
      <path d={`M ${x - 8} ${y - 14} v 14 M ${x + 8} ${y - 14} v 14`} stroke="#a16207" strokeWidth="1.8" />
      <path d={`M ${x - 12} ${y - 20} l 3 -2 M ${x + 4} ${y - 22} l 3 1`} stroke="#ca8a04" strokeWidth="1" />
    </g>
  )
}

function Hive({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx="12" ry="4" fill="#1c1917" opacity="0.2" />
      <rect x={x - 9} y={y - 6} width="18" height="6" rx="1" fill={WOOD_DARK} />
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={x} cy={y - 10 - i * 6} rx={12 - i * 2.2} ry="4.2" fill={i % 2 === 0 ? '#f59e0b' : '#fbbf24'} stroke="#b45309" strokeWidth="0.8" />
      ))}
      <path d={`M ${x - 3} ${y - 9} a 3 3 0 0 1 6 0 z`} fill="#451a03" />
    </g>
  )
}

export function Prop({ prop }: { prop: FarmProp }) {
  switch (prop.kind) {
    case 'lamp':
      return <Lamp x={prop.x} y={prop.y} />
    case 'bench':
      return <Bench x={prop.x} y={prop.y} flip={prop.flip} />
    case 'bale':
      return <Bale x={prop.x} y={prop.y} />
    case 'hive':
      return <Hive x={prop.x} y={prop.y} />
  }
}

export function DecorationShape({ decoration: { kind, x, y, scale } }: { decoration: Decoration }) {
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(2)})`
  switch (kind) {
    case 'bush':
      return (
        <g transform={t}>
          <ellipse cx="0" cy="6" rx="16" ry="4" fill="#166534" opacity="0.25" />
          <circle cx="-7" cy="0" r="8" fill="#16a34a" />
          <circle cx="7" cy="0" r="8" fill="#16a34a" />
          <circle cx="0" cy="-5" r="9" fill="#22c55e" />
          <circle cx="-3" cy="-7" r="2" fill="#bbf7d0" opacity="0.7" />
        </g>
      )
    case 'rock':
      return (
        <g transform={t}>
          <ellipse cx="0" cy="4" rx="12" ry="4" fill="#1c1917" opacity="0.15" />
          <ellipse cx="0" cy="1" rx="11" ry="7" fill="#a8a29e" />
          <ellipse cx="-2" cy="-1" rx="7" ry="4" fill="#d6d3d1" />
        </g>
      )
    case 'flower':
      return (
        <g transform={t}>
          <ellipse cx="0" cy="3" rx="14" ry="5" fill="#4ade80" opacity="0.6" />
          {([
            [-8, -1, '#f472b6'],
            [-2, -5, '#facc15'],
            [5, -2, '#fb7185'],
            [9, 2, '#c084fc'],
            [0, 2, '#ffffff'],
          ] as const).map(([dx, dy, color]) => (
            <g key={color}>
              <path d={`M ${dx} ${dy + 5} v -5`} stroke="#15803d" strokeWidth="1.3" />
              <circle cx={dx} cy={dy} r="2.8" fill={color} />
              <circle cx={dx} cy={dy} r="0.9" fill="#fde68a" />
            </g>
          ))}
        </g>
      )
    case 'grass':
      return (
        <g transform={t} stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" fill="none">
          <path d="M -5 4 q 1 -6 -2 -10 M 0 4 q 0 -8 1 -12 M 5 4 q -1 -6 3 -9" />
        </g>
      )
    case 'mushroom':
      return (
        <g transform={t}>
          <rect x="-2" y="-2" width="4" height="8" rx="1.5" fill="#fef3c7" />
          <path d="M -8 -1 a 8 7 0 0 1 16 0 z" fill="#ef4444" />
          <circle cx="-3" cy="-4" r="1.3" fill="#fff" />
          <circle cx="3" cy="-3" r="1.1" fill="#fff" />
        </g>
      )
  }
}

// Gentle wave strokes across the water.
export function Waves({ width, height }: { width: number; height: number }) {
  const waves: Point[] = []
  for (let y = 36; y < height; y += 60) for (let x = (y / 60) % 2 === 0 ? 30 : 80; x < width; x += 130) waves.push([x, y])
  return (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.45">
      {waves.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M ${x} ${y} q 8 -6 16 0 q 8 6 16 0`} />
      ))}
    </g>
  )
}

export function Dock({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 22} y={y} width="44" height="56" rx="3" fill={WOOD} stroke={WOOD_DARK} strokeWidth="2" />
      {[12, 24, 36, 48].map((dy) => (
        <path key={dy} d={`M ${x - 22} ${y + dy} h 44`} stroke={WOOD_DARK} strokeWidth="1.5" />
      ))}
      <rect x={x - 26} y={y + 48} width="6" height="16" rx="2" fill={WOOD_DARK} />
      <rect x={x + 20} y={y + 48} width="6" height="16" rx="2" fill={WOOD_DARK} />
    </g>
  )
}

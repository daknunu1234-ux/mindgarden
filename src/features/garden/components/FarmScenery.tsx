// Farm world scenery: pure SVG markup (no hooks, no ids), drawn inside FarmIslandView's canvas.
// Every piece is positioned by lib/farmLayout.ts. Style: cartoon-3D miniatures like a mobile farm
// game: bold warm-brown outlines, cel shading with the sun at the upper left (lit left/top faces,
// shaded right faces), glossy highlights and soft ambient-occlusion shadows on the grass.
import type { Decoration, FarmPlot, FarmProp, Point } from '../lib/farmLayout'
import { HOUSE_HALF, PLOT_HALF_H, PLOT_HALF_W } from '../lib/farmLayout'

const INK = '#4a230c' // outline for wood, soil and props
const WOOD = '#c98242'
const WOOD_LIT = '#e3a45e'
const WOOD_DARK = '#8a4f22'
const AO = '#2f5f16' // ambient-occlusion tint on grass

const pts = (...ps: Point[]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const up = (p: Point, v: number): Point => [p[0], p[1] - v]
const add = (p: Point, d: Point): Point => [p[0] + d[0], p[1] + d[1]]

// ── Ground ───────────────────────────────────────────────────────────────────

// Warm packed-dirt lane: dark rim, sandy bed, a sunlit centre line and scattered pebbles.
export function CobblePath({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={AO} strokeOpacity="0.25" strokeWidth="32" transform="translate(0 4)" />
      <path d={d} stroke="#a8713c" strokeWidth="27" />
      <path d={d} stroke="#e7c087" strokeWidth="22" />
      <path d={d} stroke="#f4d9a4" strokeWidth="10" transform="translate(-1 -2)" />
      <path d={d} stroke="#c99a5f" strokeWidth="4" strokeDasharray="2 17" />
      <path d={d} stroke="#fff3d6" strokeWidth="2.5" strokeDasharray="1 23" strokeDashoffset="9" transform="translate(4 3)" />
    </g>
  )
}

// Rounded isometric diamond (corners softened with quadratic curves).
function roundedDiamond([x, y]: Point, w: number, h: number, k = 0.16): string {
  const c: Point[] = [
    [x, y - h],
    [x + w, y],
    [x, y + h],
    [x - w, y],
  ]
  let d = ''
  for (let i = 0; i < 4; i++) {
    const p = c[i]
    const a = lerp(p, c[(i + 3) % 4], k)
    const b = lerp(p, c[(i + 1) % 4], k)
    d += `${i === 0 ? 'M' : 'L'} ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `
  }
  return `${d}Z`
}

// Tilled farm mound: a raised soil bed with a visible earthen side, ridged furrows running across it
// (each ridge sunlit on top and shaded underneath), a few clods, and an AO shadow on the grass.
export function PlotBed({ plot }: { plot: FarmPlot }) {
  const w = PLOT_HALF_W * 0.86
  const h = PLOT_HALF_H * 0.86
  const c: Point = [plot.x, plot.y]
  const T: Point = [c[0], c[1] - h]
  const R: Point = [c[0] + w, c[1]]
  const L: Point = [c[0] - w, c[1]]
  const side = 9
  // Furrows parallel to the T→R edge, from the L→T edge to the B→R edge (L + (R − T) = B).
  const dir: Point = [R[0] - T[0], R[1] - T[1]]
  const furrows = [0.16, 0.3, 0.44, 0.58, 0.72, 0.86].map((t) => {
    const start = lerp(L, T, t)
    const end = add(start, dir)
    return [lerp(start, end, 0.1), lerp(start, end, 0.9)] as const
  })
  const clods: Point[] = [lerp(L, R, 0.3), lerp(T, c, 0.55), lerp(c, R, 0.45), lerp(L, c, 0.7)].map((p, i) => [p[0] + (i % 2 ? 6 : -4), p[1] + (i % 2 ? 5 : 8)])

  return (
    <g>
      <path d={roundedDiamond([c[0] + 4, c[1] + side + 5], w * 1.12, h * 1.14)} fill={AO} opacity="0.3" />
      {/* Earthen side of the mound, then the tilled top. */}
      <path d={roundedDiamond([c[0], c[1] + side], w, h)} fill="#5a3112" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={roundedDiamond(c, w, h)} fill="#8f5429" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={roundedDiamond([c[0] - 3, c[1] - 2], w * 0.9, h * 0.88)} fill="#a0612f" />
      {furrows.map(([a, b], i) => (
        <g key={i} strokeLinecap="round" fill="none">
          <path d={`M ${a[0].toFixed(1)} ${(a[1] + 2.5).toFixed(1)} L ${b[0].toFixed(1)} ${(b[1] + 2.5).toFixed(1)}`} stroke="#6a3a17" strokeWidth="3" />
          <path d={`M ${a[0].toFixed(1)} ${a[1].toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)}`} stroke="#b8763d" strokeWidth="4.4" />
          <path d={`M ${a[0].toFixed(1)} ${(a[1] - 1.2).toFixed(1)} L ${b[0].toFixed(1)} ${(b[1] - 1.2).toFixed(1)}`} stroke="#d69556" strokeWidth="1.4" opacity="0.8" />
        </g>
      ))}
      {clods.map(([x, y], i) => (
        <g key={`clod${i}`}>
          <ellipse cx={x} cy={y} rx="3.4" ry="2.3" fill="#6a3a17" />
          <ellipse cx={x - 0.8} cy={y - 0.7} rx="2" ry="1.2" fill="#c8864a" />
        </g>
      ))}
      {/* Sunlit rim along the back edges. */}
      <path
        d={`M ${lerp(L, T, 0.12).map((v) => v.toFixed(1)).join(' ')} L ${lerp(L, T, 0.88).map((v) => v.toFixed(1)).join(' ')} M ${lerp(T, R, 0.12).map((v) => v.toFixed(1)).join(' ')} L ${lerp(T, R, 0.55).map((v) => v.toFixed(1)).join(' ')}`}
        stroke="#d9a066"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
    </g>
  )
}

// Rustic fence: a chunky post on every other point, two rails sagging between posts.
export function Fence({ run }: { run: Point[] }) {
  const posts = run.filter((_, i) => i % 2 === 0)
  const rail = (dy: number) =>
    posts
      .map(([x, y], i) => {
        if (i === 0) return `M ${x.toFixed(1)} ${(y + dy).toFixed(1)}`
        const [px, py] = posts[i - 1]
        return `Q ${((x + px) / 2).toFixed(1)} ${((y + py) / 2 + dy + 3.2).toFixed(1)} ${x.toFixed(1)} ${(y + dy).toFixed(1)}`
      })
      .join(' ')
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d={rail(1)} stroke={AO} strokeOpacity="0.28" strokeWidth="6" fill="none" transform="translate(2 5)" />
      {[-13, -6].map((dy) => (
        <g key={dy} fill="none">
          <path d={rail(dy)} stroke={INK} strokeWidth="5.2" />
          <path d={rail(dy)} stroke={WOOD} strokeWidth="3" />
          <path d={rail(dy - 0.8)} stroke={WOOD_LIT} strokeWidth="1" />
        </g>
      ))}
      {posts.map(([x, y], i) => (
        <g key={i}>
          <path d={`M ${x - 2.6} ${y + 1} V ${y - 16} Q ${x} ${y - 19.5} ${x + 2.6} ${y - 16} V ${y + 1} Z`} fill={WOOD} stroke={INK} strokeWidth="1.8" />
          <path d={`M ${x - 1.1} ${y - 1} V ${y - 15}`} stroke={WOOD_LIT} strokeWidth="1.1" />
        </g>
      ))}
    </g>
  )
}

// ── Landmarks ────────────────────────────────────────────────────────────────

// Soft rising smoke puffs (CSS `.mg-smoke`, off for reduced motion).
function Smoke({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g aria-hidden>
      {[0, 1.1, 2.2].map((delay, i) => (
        <circle
          key={delay}
          cx={x + i * 1.5}
          cy={y}
          r={5.5 * scale}
          fill="#fffaf0"
          stroke="#e7d8c3"
          strokeWidth="1"
          className="mg-smoke"
          style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}
    </g>
  )
}

// Classic red barn on its footprint diamond (x, y = footprint centre). The gambrel gable end faces
// the lit left-front side (big X door, hay poking out of the loft); the long front-right wall is in
// shade; the curved two-step roof runs back along it with a smoking chimney.
export function Farmhouse({ x, y }: { x: number; y: number }) {
  const { w, h } = HOUSE_HALF
  const H = 56 // wall height
  const P = 46 // gable height above the eaves
  const L: Point = [x - w, y]
  const F: Point = [x, y + h]
  const R: Point = [x + w, y]
  const d: Point = [R[0] - F[0], R[1] - F[1]] // ridge direction (front → back along the right wall)
  const Lt = up(L, H)
  const Ft = up(F, H)
  const K1 = up(lerp(Lt, Ft, 0.16), P * 0.6)
  const K2 = up(lerp(Lt, Ft, 0.84), P * 0.6)
  const M = up(lerp(Lt, Ft, 0.5), P)
  // A point on the gable face: u along L→F, v up from the ground.
  const face = (u: number, v: number) => up(lerp(L, F, u), v)
  const wall = (s: number, v: number) => up(lerp(F, R, s), v)
  const chimney = add(lerp(K2, M, 0.55), [d[0] * 0.72, d[1] * 0.72])

  return (
    <g strokeLinejoin="round">
      {/* AO shadow on the grass, thrown a little to the right. */}
      <ellipse cx={x + 10} cy={y + h * 0.35} rx={w * 1.3} ry={h * 1.15} fill={AO} opacity="0.32" />

      {/* Long right wall (shade) with plank slats and two small windows. */}
      <polygon points={pts(F, R, up(R, H), Ft)} fill="#b8271f" stroke={INK} strokeWidth="2.4" />
      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((s) => (
        <path key={`rw${s}`} d={`M ${wall(s, 2).join(' ')} L ${wall(s, H - 2).join(' ')}`} stroke="#8e1b15" strokeWidth="1.3" />
      ))}
      {[0.3, 0.68].map((s) => (
        <g key={`win${s}`}>
          <polygon points={pts(wall(s - 0.09, 22), wall(s + 0.09, 22), wall(s + 0.09, 40), wall(s - 0.09, 40))} fill="#fff4d6" stroke={INK} strokeWidth="2" />
          <polygon points={pts(wall(s - 0.07, 24), wall(s + 0.07, 24), wall(s + 0.07, 38), wall(s - 0.07, 38))} fill="#ffcf6b" />
          <path d={`M ${wall(s, 24).join(' ')} L ${wall(s, 38).join(' ')} M ${wall(s - 0.07, 31).join(' ')} L ${wall(s + 0.07, 31).join(' ')}`} stroke="#fff4d6" strokeWidth="1.6" />
        </g>
      ))}

      {/* Back (left) roof slope: mostly hidden, darker. */}
      <polygon points={pts(Lt, K1, add(K1, d), add(Lt, d))} fill="#6e2a18" stroke={INK} strokeWidth="2.4" />
      <polygon points={pts(K1, M, add(M, d), add(K1, d))} fill="#86341f" stroke={INK} strokeWidth="2.4" />

      {/* Gable end (lit): gambrel pentagon wall with plank slats. */}
      <polygon points={pts(L, F, Ft, K2, M, K1, Lt)} fill="#e5392d" stroke={INK} strokeWidth="2.4" />
      {[0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((u) => {
        const top = u < 0.16 ? H + (u / 0.16) * P * 0.6 : u > 0.84 ? H + ((1 - u) / 0.16) * P * 0.6 : H + P * 0.6 + (1 - Math.abs(u - 0.5) / 0.34) * P * 0.4
        return <path key={`gs${u}`} d={`M ${face(u, 2).join(' ')} L ${face(u, top - 3).join(' ')}`} stroke="#c02a20" strokeWidth="1.3" />
      })}
      <path d={`M ${face(0.04, 3).join(' ')} L ${face(0.04, H - 4).join(' ')}`} stroke="#ff7a66" strokeWidth="2" strokeLinecap="round" />

      {/* Big barn door with the white X. */}
      <polygon points={pts(face(0.3, 0), face(0.7, 0), face(0.7, 36), face(0.3, 36))} fill="#8f1d16" stroke="#fff7ea" strokeWidth="3" />
      <path d={`M ${face(0.3, 0).join(' ')} L ${face(0.7, 36).join(' ')} M ${face(0.7, 0).join(' ')} L ${face(0.3, 36).join(' ')} M ${face(0.5, 0).join(' ')} L ${face(0.5, 36).join(' ')}`} stroke="#fff7ea" strokeWidth="2.6" />

      {/* Hay loft window with straw poking out. */}
      <polygon points={pts(face(0.39, H + 4), face(0.61, H + 4), face(0.61, H + 24), face(0.39, H + 24))} fill="#3b170a" stroke="#fff7ea" strokeWidth="2.6" />
      <g stroke="#f6c33b" strokeWidth="2" strokeLinecap="round">
        {[0.41, 0.45, 0.49, 0.53, 0.57].map((u, i) => {
          const [bx, by] = face(u, H + 5 + (i % 2) * 3)
          return <path key={`hay${u}`} d={`M ${bx} ${by} l ${-2 + i} ${5 + (i % 3) * 2}`} />
        })}
      </g>
      <path d={`M ${face(0.4, H + 6).join(' ')} Q ${face(0.5, H + 10).join(' ')} ${face(0.6, H + 6).join(' ')}`} stroke="#fde68a" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* White trim: corners, eaves and the gambrel roof line. */}
      <path d={`M ${L.join(' ')} L ${F.join(' ')} L ${R.join(' ')}`} stroke="#fff7ea" strokeWidth="3" fill="none" />
      <path d={`M ${F.join(' ')} L ${Ft.join(' ')}`} stroke="#fff7ea" strokeWidth="3.4" />
      <path d={`M ${Lt.join(' ')} L ${Ft.join(' ')}`} stroke="#fff7ea" strokeWidth="2.6" />

      {/* Front roof slopes: lower then upper, curved shingle rows, a thick lit rim. */}
      <polygon points={pts(Ft, K2, add(K2, d), add(Ft, d))} fill="#9e3a22" stroke={INK} strokeWidth="2.4" />
      <polygon points={pts(K2, M, add(M, d), add(K2, d))} fill="#bd4a2b" stroke={INK} strokeWidth="2.4" />
      {[0.33, 0.66].map((t) => {
        const a1 = lerp(Ft, K2, t)
        const a2 = lerp(K2, M, t)
        return (
          <g key={`sh${t}`} stroke="#7a2a17" strokeWidth="1.4" fill="none">
            <path d={`M ${a1.join(' ')} L ${add(a1, d).join(' ')}`} />
            <path d={`M ${a2.join(' ')} L ${add(a2, d).join(' ')}`} />
          </g>
        )
      })}
      <path d={`M ${lerp(M, add(M, d), 0.04).join(' ')} L ${lerp(M, add(M, d), 0.96).join(' ')}`} stroke="#e8744e" strokeWidth="2.4" strokeLinecap="round" />
      <path d={`M ${Lt.join(' ')} L ${K1.join(' ')} L ${M.join(' ')} L ${K2.join(' ')} L ${Ft.join(' ')}`} stroke={INK} strokeWidth="7" fill="none" />
      <path d={`M ${Lt.join(' ')} L ${K1.join(' ')} L ${M.join(' ')} L ${K2.join(' ')} L ${Ft.join(' ')}`} stroke="#fff7ea" strokeWidth="3.6" fill="none" />

      {/* Chimney + smoke, and the weathervane on the ridge. */}
      <g>
        <polygon points={pts(add(chimney, [-5, 4]), add(chimney, [5, 1]), add(chimney, [5, -16]), add(chimney, [-5, -13]))} fill="#c9793e" stroke={INK} strokeWidth="2" />
        <polygon points={pts(add(chimney, [-7, -13]), add(chimney, [7, -17]), add(chimney, [7, -21]), add(chimney, [-7, -17]))} fill="#8a4f22" stroke={INK} strokeWidth="2" />
        <Smoke x={chimney[0]} y={chimney[1] - 26} />
      </g>
      <g stroke={INK} strokeLinecap="round">
        <path d={`M ${M[0]} ${M[1]} v -16`} strokeWidth="2.2" />
        <path d={`M ${M[0] - 7} ${M[1] - 11} h 14`} strokeWidth="2" />
        <path d={`M ${M[0]} ${M[1] - 16} l 7 -3 l -7 -3 z`} fill="#fbbf24" strokeWidth="1.4" />
      </g>
    </g>
  )
}

// Chubby toy tractor facing front-left (x, y = footprint centre): big near rear wheel, small front
// wheel, glossy red chassis that bounces at idle (`.mg-idle`), cabin with sky-blue glass, exhaust smoke.
export function Tractor({ x, y }: { x: number; y: number }) {
  const tyre = (cx: number, cy: number, rx: number, ry: number) => (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx + 1.5} ry={ry + 1.5} fill="#1a120c" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#3a2e28" />
      <ellipse cx={cx} cy={cy} rx={rx - 1.6} ry={ry - 1.6} fill="none" stroke="#1a120c" strokeWidth="2.2" strokeDasharray="2.4 3" />
      <ellipse cx={cx - 1} cy={cy - 1} rx={rx * 0.5} ry={ry * 0.5} fill="#f6b928" stroke="#8a4f0c" strokeWidth="1.6" />
      <ellipse cx={cx - 1} cy={cy - 1} rx={rx * 0.2} ry={ry * 0.2} fill="#d9361f" />
      <path d={`M ${cx - rx * 0.62} ${cy - ry * 0.45} q ${rx * 0.3} ${-ry * 0.45} ${rx * 0.75} ${-ry * 0.5}`} stroke="#8a7a70" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  )
  return (
    <g transform={`translate(${x} ${y})`} strokeLinejoin="round">
      <ellipse cx="4" cy="10" rx="52" ry="16" fill={AO} opacity="0.32" />
      {/* Far-side rear wheel peeks out behind the body. */}
      <ellipse cx="30" cy="-18" rx="13" ry="16" fill="#1a120c" />

      <g className="mg-idle" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {/* Exhaust + puffs. */}
        <rect x="-27" y="-54" width="5" height="24" rx="2.5" fill="#4a3a30" stroke="#1a120c" strokeWidth="1.6" />
        <Smoke x={-24} y={-62} scale={0.7} />
        {/* Chassis: hood + body, glossy. */}
        <path d="M -42 -2 Q -46 -20 -30 -26 L 6 -36 Q 18 -38 22 -28 L 26 -8 Q 24 4 10 7 L -30 11 Q -42 11 -42 -2 Z" fill="#e8352a" stroke="#5a0f0a" strokeWidth="2.6" />
        <path d="M -38 -12 Q -38 -22 -28 -25 L 4 -34 Q 12 -35 16 -30" stroke="#ff7466" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M -30 -22 L -8 -28" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
        <path d="M -40 2 Q -30 8 -4 5 Q 14 3 24 -4" stroke="#a61e16" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
        {/* Grille + headlight. */}
        <rect x="-45" y="-17" width="9" height="15" rx="3.5" fill="#5a0f0a" />
        <path d="M -43 -13 h 5 M -43 -9.5 h 5 M -43 -6 h 5" stroke="#f6b928" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="-33" cy="-21" r="4" fill="#fff4b0" stroke="#5a0f0a" strokeWidth="1.6" />
        <circle cx="-34" cy="-22" r="1.3" fill="#fff" />
        {/* Cabin: red frame, sky-blue glass, cream roof. */}
        <path d="M -2 -30 L -2 -58 Q -2 -62 2 -62 L 22 -62 Q 26 -62 26 -58 L 26 -26 Z" fill="#e8352a" stroke="#5a0f0a" strokeWidth="2.4" />
        <path d="M 2 -33 L 2 -56 L 21 -56 L 21 -31 Z" fill="#aee4ff" stroke="#5a0f0a" strokeWidth="1.6" />
        <path d="M 5 -52 L 12 -52 L 5 -40 Z" fill="#fff" opacity="0.7" />
        <rect x="-7" y="-69" width="38" height="9" rx="4.5" fill="#fff1d0" stroke="#5a0f0a" strokeWidth="2.2" />
        <path d="M -3 -66.5 h 26" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        {/* Little seat + steering wheel through the glass. */}
        <path d="M 8 -40 q 3 -3 6 0" stroke="#5a0f0a" strokeWidth="1.6" fill="none" />
      </g>

      {tyre(18, -4, 19, 21)}
      {tyre(-30, 7, 10, 11)}
    </g>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

// Rustic stone lantern: stacked sandstone base, a post, a warmly glowing lantern box and a cap.
function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g strokeLinejoin="round">
      <ellipse cx={x + 3} cy={y + 2} rx="12" ry="4" fill={AO} opacity="0.3" />
      <circle cx={x} cy={y - 32} r="17" fill="#ffd66b" opacity="0.4" className="mg-glow" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
      <ellipse cx={x} cy={y - 2} rx="9" ry="4.5" fill="#d9b886" stroke={INK} strokeWidth="1.6" />
      <path d={`M ${x - 4} ${y - 3} V ${y - 22} H ${x + 4} V ${y - 3} Z`} fill="#e8cf9f" stroke={INK} strokeWidth="1.6" />
      <path d={`M ${x - 2.4} ${y - 5} V ${y - 20}`} stroke="#fff0cc" strokeWidth="1.2" />
      <path d={`M ${x - 8} ${y - 22} h 16 l -1.5 -4 h -13 z`} fill="#d9b886" stroke={INK} strokeWidth="1.6" />
      <rect x={x - 6.5} y={y - 38} width="13" height="12" rx="2" fill="#ffcf4a" stroke={INK} strokeWidth="1.6" />
      <rect x={x - 4.5} y={y - 36} width="4" height="8" rx="1" fill="#fff6c2" />
      <path d={`M ${x - 10} ${y - 38} Q ${x} ${y - 47} ${x + 10} ${y - 38} Z`} fill="#b98a56" stroke={INK} strokeWidth="1.6" />
      <circle cx={x} cy={y - 44} r="2" fill="#b98a56" stroke={INK} strokeWidth="1.2" />
    </g>
  )
}

function Bench({ x, y, flip }: { x: number; y: number; flip: boolean }) {
  const s = flip ? -1 : 1
  return (
    <g transform={`translate(${x} ${y}) scale(${s} 1)`} strokeLinejoin="round">
      <ellipse cx="2" cy="4" rx="22" ry="6" fill={AO} opacity="0.3" />
      <path d="M -18 -4 v 8 M 2 6 v 8 M 18 -2 v 8" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M -18 -4 v 8 M 2 6 v 8 M 18 -2 v 8" stroke={WOOD_DARK} strokeWidth="2" strokeLinecap="round" />
      <path d="M -20 -4 L 2 7 L 20 -2 L -2 -13 Z" fill={WOOD} stroke={INK} strokeWidth="1.8" />
      <path d="M -13 -7.5 L 9 3.5 M -6 -11 L 16 0" stroke={WOOD_DARK} strokeWidth="1" />
      <path d="M -2 -13 L 20 -2 L 20 -15 L -2 -26 Z" fill={WOOD_LIT} stroke={INK} strokeWidth="1.8" />
      <path d="M 1 -18 L 17 -10 M 1 -22 L 17 -14" stroke={WOOD_DARK} strokeWidth="1.1" />
    </g>
  )
}

// One golden hay bale (isometric box with rounded faces), twine and straw texture.
function HayBale({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const w = 15 * s
  const h = 8 * s
  const t = 13 * s
  return (
    <g strokeLinejoin="round">
      <path d={`M ${x - w} ${y - h} L ${x} ${y} L ${x} ${y - t} L ${x - w} ${y - h - t} Z`} fill="#f2b632" stroke={INK} strokeWidth="1.7" />
      <path d={`M ${x} ${y} L ${x + w} ${y - h} L ${x + w} ${y - h - t} L ${x} ${y - t} Z`} fill="#d8921c" stroke={INK} strokeWidth="1.7" />
      <path d={`M ${x - w} ${y - h - t} L ${x} ${y - t} L ${x + w} ${y - h - t} L ${x} ${y - 2 * h - t} Z`} fill="#ffd95a" stroke={INK} strokeWidth="1.7" />
      <path d={`M ${x - w * 0.5} ${y - h * 0.5 - t * 0.1} v ${-t * 0.8} M ${x + w * 0.5} ${y - h * 0.5 - t * 0.1} v ${-t * 0.8}`} stroke="#9a3f12" strokeWidth="1.6" />
      <path d={`M ${x - w * 0.5} ${y - h * 1.5 - t} L ${x + w * 0.5} ${y - h * 0.5 - t}`} stroke="#9a3f12" strokeWidth="1.4" />
      <path d={`M ${x - w * 0.7} ${y - h - t * 0.55} l 4 1 M ${x + w * 0.2} ${y - h * 0.4 - t * 0.5} l 3 -1.5 M ${x - w * 0.3} ${y - h * 1.3 - t} l 4 -1`} stroke="#fff1a8" strokeWidth="1" strokeLinecap="round" />
    </g>
  )
}

// Stacked bales: two on the ground, one on top.
function Bale({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x + 4} cy={y + 5} rx="30" ry="9" fill={AO} opacity="0.3" />
      <HayBale x={x - 11} y={y + 2} />
      <HayBale x={x + 11} y={y + 6} />
      <HayBale x={x + 1} y={y - 11} s={0.95} />
    </g>
  )
}

function Hive({ x, y }: { x: number; y: number }) {
  return (
    <g strokeLinejoin="round">
      <ellipse cx={x + 2} cy={y + 2} rx="13" ry="4.5" fill={AO} opacity="0.3" />
      <rect x={x - 10} y={y - 6} width="20" height="6" rx="1.5" fill={WOOD} stroke={INK} strokeWidth="1.5" />
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={x} cy={y - 10 - i * 6} rx={13 - i * 2.4} ry="4.6" fill={i % 2 === 0 ? '#f59e0b' : '#fbbf24'} stroke={INK} strokeWidth="1.4" />
      ))}
      <ellipse cx={x - 4} cy={y - 29} rx="3" ry="1.4" fill="#fff4c2" opacity="0.8" />
      <path d={`M ${x - 3.5} ${y - 9} a 3.5 3.5 0 0 1 7 0 z`} fill="#3b170a" />
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

const BLOOMS = ['#ff5d8f', '#ffd23f', '#ff8c42', '#c77dff', '#ffffff']

export function DecorationShape({ decoration: { kind, x, y, scale } }: { decoration: Decoration }) {
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(2)})`
  switch (kind) {
    case 'bush': {
      // Round flowering bush: plush outlined clumps, sunlit tops, a sprinkle of blooms.
      const clumps: [number, number, number][] = [[-8, 0, 8.5], [8, 0, 8.5], [0, -6, 10]]
      const bloom = BLOOMS[Math.round(Math.abs(x + y)) % BLOOMS.length]
      return (
        <g transform={t}>
          <ellipse cx="3" cy="7" rx="18" ry="5" fill={AO} opacity="0.32" />
          {clumps.map(([cx, cy, r]) => (
            <circle key={`o${cx}`} cx={cx} cy={cy} r={r + 2} fill="#1d4d12" />
          ))}
          {clumps.map(([cx, cy, r]) => (
            <g key={cx}>
              <circle cx={cx} cy={cy} r={r} fill="#2f8f2a" />
              <circle cx={cx - r * 0.2} cy={cy - r * 0.25} r={r * 0.65} fill="#4cb83a" />
              <circle cx={cx - r * 0.35} cy={cy - r * 0.45} r={r * 0.3} fill="#8ee06a" />
            </g>
          ))}
          {[[-9, -3], [-2, -11], [6, -5], [10, 2], [-4, 3]].map(([bx, by]) => (
            <g key={`${bx}${by}`}>
              <circle cx={bx} cy={by} r="2.6" fill="#3b170a" opacity="0.4" />
              <circle cx={bx} cy={by} r="2.1" fill={bloom} />
              <circle cx={bx - 0.6} cy={by - 0.6} r="0.7" fill="#fff" />
            </g>
          ))}
        </g>
      )
    }
    case 'rock':
      return (
        <g transform={t} strokeLinejoin="round">
          <ellipse cx="2" cy="5" rx="13" ry="4" fill={AO} opacity="0.3" />
          <path d="M -11 3 Q -12 -6 -3 -8 Q 7 -10 11 -2 Q 12 4 4 5 Q -6 6 -11 3 Z" fill="#c9b08a" stroke={INK} strokeWidth="1.6" />
          <path d="M -7 -3 Q -3 -7 3 -6" stroke="#f0e2c4" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 4 4 Q 9 2 10 -2" stroke="#9c7f58" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M -9 1 q 3 -3 7 -2" stroke="#6fbf3a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'flower':
      return (
        <g transform={t}>
          <ellipse cx="1" cy="4" rx="15" ry="5" fill="#3f9a2a" opacity="0.55" />
          {([
            [-8, -1, 0],
            [-2, -6, 1],
            [5, -2, 2],
            [9, 3, 3],
            [0, 2, 4],
          ] as const).map(([dx, dy, i]) => (
            <g key={i}>
              <path d={`M ${dx} ${dy + 6} v -5`} stroke="#2f7d1f" strokeWidth="1.5" />
              <circle cx={dx} cy={dy} r="3.6" fill="#3b170a" opacity="0.35" />
              <circle cx={dx} cy={dy} r="3.1" fill={BLOOMS[i]} />
              <circle cx={dx} cy={dy} r="1.1" fill={i === 1 ? '#ff8c42' : '#ffe066'} />
              <circle cx={dx - 1.1} cy={dy - 1.1} r="0.7" fill="#fff" />
            </g>
          ))}
        </g>
      )
    case 'grass':
      return (
        <g transform={t} strokeLinecap="round" fill="none">
          <path d="M -5 4 q 1 -6 -2 -10 M 0 4 q 0 -8 1 -12 M 5 4 q -1 -6 3 -9" stroke="#2f7d1f" strokeWidth="3" />
          <path d="M -5 4 q 1 -6 -2 -10 M 0 4 q 0 -8 1 -12 M 5 4 q -1 -6 3 -9" stroke="#7ad24f" strokeWidth="1.4" />
        </g>
      )
    case 'mushroom':
      return (
        <g transform={t} strokeLinejoin="round">
          <ellipse cx="1" cy="6" rx="8" ry="2.5" fill={AO} opacity="0.3" />
          <rect x="-2.5" y="-2" width="5" height="8" rx="2" fill="#fff4de" stroke={INK} strokeWidth="1.2" />
          <path d="M -9 -1 a 9 8 0 0 1 18 0 z" fill="#ef3b2d" stroke={INK} strokeWidth="1.4" />
          <circle cx="-3.5" cy="-4.5" r="1.5" fill="#fff" />
          <circle cx="3" cy="-3.2" r="1.2" fill="#fff" />
          <circle cx="0" cy="-7" r="0.9" fill="#fff" />
        </g>
      )
  }
}

// Sun glints and soft ripple arcs across the water (a slow twinkle).
export function Waves({ width, height }: { width: number; height: number }) {
  const waves: Point[] = []
  for (let y = 36; y < height; y += 58) for (let x = (y / 58) % 2 < 1 ? 30 : 90; x < width; x += 140) waves.push([x, y])
  return (
    <g strokeLinecap="round" fill="none">
      {waves.map(([x, y], i) => (
        <g key={`${x}-${y}`} className="mg-twinkle" style={{ animationDelay: `${(i % 7) * 0.45}s` }}>
          <path d={`M ${x} ${y} q 9 -6 18 0 q 9 6 18 0`} stroke="#ffffff" strokeWidth="3" opacity="0.55" />
          <path d={`M ${x + 8} ${y + 9} q 6 -3 12 0`} stroke="#bff1ff" strokeWidth="2" opacity="0.6" />
        </g>
      ))}
    </g>
  )
}

// Wooden jetty with outlined planks and posts standing in the water.
export function Dock({ x, y }: { x: number; y: number }) {
  return (
    <g strokeLinejoin="round">
      {[-24, 18].map((dx) => (
        <g key={dx}>
          <rect x={x + dx} y={y + 40} width="7" height="26" rx="2.5" fill={WOOD_DARK} stroke={INK} strokeWidth="1.6" />
          <ellipse cx={x + dx + 3.5} cy={y + 66} rx="8" ry="2.6" fill="#ffffff" opacity="0.5" />
        </g>
      ))}
      <rect x={x - 24} y={y} width="48" height="58" rx="4" fill={WOOD} stroke={INK} strokeWidth="2.2" />
      {[11.5, 23, 34.5, 46].map((dy) => (
        <path key={dy} d={`M ${x - 24} ${y + dy} h 48`} stroke={WOOD_DARK} strokeWidth="1.6" />
      ))}
      <path d={`M ${x - 20} ${y + 4} v 50`} stroke={WOOD_LIT} strokeWidth="2" strokeLinecap="round" />
      <rect x={x - 24} y={y + 56} width="48" height="5" rx="2" fill={WOOD_DARK} stroke={INK} strokeWidth="1.6" />
    </g>
  )
}

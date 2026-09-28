import { seededRandom } from '@/shared/utils/seededRandom'

// Farm Island geometry (pure, unit-tested). Plots sit on an isometric grid:
// grid cell (c, r) → screen (c − r) · W · SPACING, (c + r) · H · SPACING. Cells fill from the middle
// out, so any number of decks makes a compact, centred farm. A farmhouse (back-left) and a tractor
// (front-right, by the entrance) are landmarks; the island grows around all of them.

export const PLOT_HALF_W = 84
export const PLOT_HALF_H = 46
// Plot centres sit this many tiles apart, leaving grass and paths between plots and room
// for a front tree's crown in front of the nameplate behind it.
export const PLOT_SPACING = 1.45
// Room above the top of the island for trees and the farmhouse roof.
export const TREE_HEADROOM = 150
// Landmark footprints (isometric half sizes).
export const HOUSE_HALF = { w: 78, h: 44 } as const
export const TRACTOR_HALF = { w: 46, h: 28 } as const

const ISLAND_MARGIN = 64
const WATER = 72
const SW = PLOT_HALF_W * PLOT_SPACING
const SH = PLOT_HALF_H * PLOT_SPACING

export type Point = [number, number]
export type FarmPlot = { index: number; c: number; r: number; x: number; y: number }
export type FarmPath = { from: number | 'dock' | 'house'; to: number; d: string }
export type Decoration = { kind: 'bush' | 'rock' | 'flower' | 'mushroom' | 'grass'; x: number; y: number; scale: number }
export type FarmProp = { kind: 'lamp' | 'bench' | 'bale' | 'hive'; x: number; y: number; flip: boolean; plot?: number }

export type FarmLayout = {
  width: number
  height: number
  // Plots in input order (index = position in the deck list). Draw them sorted by y.
  plots: FarmPlot[]
  island: { points: Point[]; path: string; grassPath: string; grass: Point[] }
  paths: FarmPath[]
  dock: { x: number; y: number }
  house: { x: number; y: number }
  tractor: { x: number; y: number }
  // Picket fence runs along the front edge, with a gap at the dock entrance.
  fence: Point[][]
  props: FarmProp[]
  decorations: Decoration[]
}

export type FarmOptions = {
  // Per plot (input order): true for flowering trees (sakura / apple, stage ≥ 3) → a beehive.
  flowering?: readonly boolean[]
}

// Grid cells for n plots, most central first.
function cellsFor(n: number): { c: number; r: number }[] {
  const k = Math.max(1, Math.ceil(Math.sqrt(n)))
  const mid = (k - 1) / 2
  const cells: { c: number; r: number }[] = []
  for (let c = 0; c < k; c++) for (let r = 0; r < k; r++) cells.push({ c, r })
  return cells
    .sort((a, b) => {
      const da = Math.abs(a.c - mid) + Math.abs(a.r - mid)
      const db = Math.abs(b.c - mid) + Math.abs(b.r - mid)
      return da - db || a.c + a.r - (b.c + b.r) || a.c - b.c
    })
    .slice(0, Math.max(n, 1))
}

const iso = (c: number, r: number): Point => [(c - r) * SW, (c + r) * SH]
const diamondCorners = ([x, y]: Point, w: number, h: number): Point[] => [
  [x, y - h],
  [x + w, y],
  [x, y + h],
  [x - w, y],
]

// Andrew's monotone chain; returns the hull counter-clockwise without repeating the first point.
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// Closed smooth outline through the midpoints of the polygon's edges.
function smoothClosedPath(points: Point[]): string {
  const n = points.length
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const start = mid(points[n - 1], points[0])
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const m = mid(p, points[(i + 1) % n])
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`
  }
  return `${d} Z`
}

export function pointInPolygon([x, y]: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const distToSegment = ([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) => {
  const dx = bx - ax
  const dy = by - ay
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Gentle curved path between two ground points (drawn as cobblestones).
const lane = (a: Point, b: Point) => {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 + 10
  return `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
}

// Diamond distance: < 1 inside a (w, h) diamond centred at c.
const diamondDist = ([x, y]: Point, [cx, cy]: Point, w: number, h: number) => Math.abs(x - cx) / w + Math.abs(y - cy) / h

export function layoutFarm(count: number, options: FarmOptions = {}): FarmLayout {
  const n = Math.max(0, Math.floor(count))
  const cells = cellsFor(n)
  const k = Math.max(1, Math.ceil(Math.sqrt(n)))

  // Landmarks, relative to the grid: farmhouse behind the left corner, tractor parked front-right by
  // the entrance: far enough forward that its sign clears the nameplate of the plot behind it.
  const houseRaw = iso(-1.3, k - 1)
  const tractorRaw = iso(k - 1 + 1.3, k - 1 + 0.1)

  const plotCorners = cells.flatMap(({ c, r }) => diamondCorners(iso(c, r), PLOT_HALF_W, PLOT_HALF_H))
  const corners = [
    ...plotCorners,
    ...diamondCorners(houseRaw, HOUSE_HALF.w, HOUSE_HALF.h),
    ...diamondCorners(tractorRaw, TRACTOR_HALF.w, TRACTOR_HALF.h),
  ]
  const cx = plotCorners.reduce((s, p) => s + p[0], 0) / plotCorners.length
  const cy = corners.reduce((s, p) => s + p[1], 0) / corners.length
  const grow = (p: Point): Point => {
    const dx = p[0] - cx
    const dy = p[1] - cy
    const len = Math.hypot(dx, dy) || 1
    return [p[0] + (dx / len) * ISLAND_MARGIN, p[1] + (dy / len) * ISLAND_MARGIN * 0.75]
  }
  const hull = convexHull(corners).map(grow)

  // Canvas: water all round, extra sky above for trees and the barn roof.
  const minX = Math.min(...hull.map((p) => p[0]))
  const maxX = Math.max(...hull.map((p) => p[0]))
  const minY = Math.min(...hull.map((p) => p[1]))
  const maxY = Math.max(...hull.map((p) => p[1]))
  const offX = WATER - minX
  const offY = WATER + TREE_HEADROOM - minY
  const shift = ([x, y]: Point): Point => [x + offX, y + offY]

  const island = hull.map(shift)
  // Grass top: the island outline pulled in towards its centre, leaving a sandy beach ring.
  const [gx, gy] = shift([cx, cy])
  const grass = island.map(([x, y]): Point => [gx + (x - gx) * 0.9, gy + (y - gy) * 0.88])

  const plots: FarmPlot[] =
    n === 0
      ? []
      : cells.map(({ c, r }, index) => {
          const [x, y] = shift(iso(c, r))
          return { index, c, r, x, y }
        })
  const [hx, hy] = shift(houseRaw)
  const [tx, ty] = shift(tractorRaw)
  const house = { x: hx, y: hy }
  const tractor = { x: tx, y: ty }

  // Dock at the front edge (below the plots' centre); paths: dock → front plot, a spanning tree over
  // grid neighbours (BFS), and a lane from the farmhouse to its nearest plot.
  const frontY = Math.max(...island.map((p) => p[1]))
  const dock = { x: shift([cx, 0])[0], y: frontY - 6 }
  const paths: FarmPath[] = []
  const segments: [Point, Point][] = []
  const addPath = (from: FarmPath['from'], to: number, a: Point, b: Point) => {
    paths.push({ from, to, d: lane(a, b) })
    segments.push([a, b])
  }
  if (plots.length > 0) {
    const byCell = new Map(plots.map((p) => [`${p.c},${p.r}`, p]))
    const front = [...plots].sort((a, b) => b.y - a.y || Math.abs(a.x - dock.x) - Math.abs(b.x - dock.x))[0]
    addPath('dock', front.index, [dock.x, dock.y], [front.x, front.y + PLOT_HALF_H * 0.6])
    const seen = new Set([front.index])
    const queue = [front]
    while (queue.length > 0) {
      const p = queue.shift()!
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = byCell.get(`${p.c + dc},${p.r + dr}`)
        if (!q || seen.has(q.index)) continue
        seen.add(q.index)
        queue.push(q)
        addPath(p.index, q.index, [p.x, p.y], [q.x, q.y])
      }
    }
    const nearest = [...plots].sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy))[0]
    addPath('house', nearest.index, [hx + HOUSE_HALF.w * 0.4, hy + HOUSE_HALF.h * 0.5], [nearest.x, nearest.y])
  }

  // Occupancy checks shared by fence, props and decorations.
  const onPlot = (p: Point, pad = 1.2) => plots.some((q) => diamondDist(p, [q.x, q.y], PLOT_HALF_W, PLOT_HALF_H) < pad)
  const onLandmark = (p: Point) =>
    diamondDist(p, [hx, hy], HOUSE_HALF.w * 1.25, HOUSE_HALF.h * 1.6) < 1 ||
    diamondDist(p, [tx, ty], TRACTOR_HALF.w * 1.5, TRACTOR_HALF.h * 1.8) < 1
  const onPath = (p: Point, gap: number) => segments.some(([a, b]) => distToSegment(p, a, b) < gap)
  const nearDock = (p: Point) => Math.abs(p[0] - dock.x) < 60 && p[1] > dock.y - 70

  // Fence: posts every 14px along the front half of the grass edge, broken at the entrance and
  // wherever a path, plot or landmark reaches the edge.
  const fence: Point[][] = []
  let run: Point[] = []
  const flush = () => {
    if (run.length >= 3) fence.push(run)
    run = []
  }
  for (let i = 0; i < grass.length; i++) {
    const a = grass[i]
    const b = grass[(i + 1) % grass.length]
    const steps = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const front = p[1] > gy + 6
      if (front && !nearDock(p) && !onPlot(p, 1.05) && !onLandmark(p) && !onPath(p, 16)) run.push(p)
      else flush()
    }
  }
  flush()

  // Props: lamps and benches beside paths, bales by the barn and tractor, hives by flowering trees.
  const props: FarmProp[] = []
  const free = (p: Point, gap = 26) =>
    pointInPolygon(p, grass) &&
    !onPlot(p) &&
    !onLandmark(p) &&
    !onPath(p, 16) &&
    !props.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < gap)
  const tryPlace = (kind: FarmProp['kind'], candidates: Point[], extra: Partial<FarmProp> = {}) => {
    const spot = candidates.find((p) => free(p))
    if (spot) props.push({ kind, x: spot[0], y: spot[1], flip: spot[0] < gx, ...extra })
  }
  // Beside a path segment, on either side, at a fraction along it.
  const besideSegment = ([a, b]: [Point, Point], t: number, dist: number): Point[] => {
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = -(b[1] - a[1]) / len
    const ny = (b[0] - a[0]) / len
    return [
      [x + nx * dist, y + ny * dist],
      [x - nx * dist, y - ny * dist],
    ]
  }
  segments.slice(0, 5).forEach((seg) => tryPlace('lamp', [...besideSegment(seg, 0.5, 26), ...besideSegment(seg, 0.3, 30)]))
  segments.slice(0, 3).forEach((seg) => tryPlace('bench', [...besideSegment(seg, 0.7, 34), ...besideSegment(seg, 0.2, 36)]))
  for (const [dx, dy] of [[-HOUSE_HALF.w * 1.35, 18], [HOUSE_HALF.w * 1.3, 26], [-HOUSE_HALF.w * 1.1, 44]]) {
    tryPlace('bale', [[hx + dx, hy + dy]])
  }
  tryPlace('bale', [[tx + TRACTOR_HALF.w * 1.7, ty + 8], [tx - TRACTOR_HALF.w * 1.7, ty + 14]])
  const flowering = options.flowering ?? []
  for (const p of plots) {
    if (!flowering[p.index]) continue
    tryPlace('hive', [
      [p.x - PLOT_HALF_W * 1.22, p.y + 6],
      [p.x + PLOT_HALF_W * 1.22, p.y + 6],
      [p.x, p.y - PLOT_HALF_H * 1.35],
      [p.x, p.y + PLOT_HALF_H * 1.3],
    ], { plot: p.index })
  }

  // Decorations: seeded flower patches, bushes, rocks and grass tufts in the free space.
  const random = seededRandom(`farm:${n}`)
  const kinds: Decoration['kind'][] = ['flower', 'bush', 'grass', 'flower', 'rock', 'grass', 'mushroom', 'flower']
  const decorations: Decoration[] = []
  const wanted = 10 + n * 3
  for (let attempt = 0; attempt < wanted * 14 && decorations.length < wanted; attempt++) {
    const p: Point = [offX + minX + random() * (maxX - minX), offY + minY + random() * (maxY - minY)]
    if (!pointInPolygon(p, grass)) continue
    const nearShore = grass.some((q, i) => distToSegment(p, q, grass[(i + 1) % grass.length]) < 14)
    const crowded =
      decorations.some((d) => Math.hypot(d.x - p[0], d.y - p[1]) < 28) || props.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 30)
    const onFence = fence.some((r) => r.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 14))
    if (nearShore || crowded || onFence || onPlot(p, 1.25) || onLandmark(p) || onPath(p, 18) || nearDock(p)) continue
    decorations.push({ kind: kinds[decorations.length % kinds.length], x: p[0], y: p[1], scale: 0.8 + random() * 0.5 })
  }

  return {
    width: Math.ceil(maxX - minX + WATER * 2),
    height: Math.ceil(maxY - minY + WATER * 2 + TREE_HEADROOM),
    plots,
    island: { points: island, path: smoothClosedPath(island), grassPath: smoothClosedPath(grass), grass },
    paths,
    dock,
    house,
    tractor,
    fence,
    props,
    decorations,
  }
}

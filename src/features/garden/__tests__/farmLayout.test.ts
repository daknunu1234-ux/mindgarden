import { describe, expect, it } from 'vitest'
import { layoutFarm, PLOT_HALF_H, PLOT_HALF_W, pointInPolygon, TREE_HEADROOM } from '../lib/farmLayout'

const COUNTS = [0, 1, 2, 3, 4, 5, 7, 9, 12, 20]

describe('layoutFarm', () => {
  it('places exactly one plot per deck, in input order', () => {
    for (const n of COUNTS) {
      const { plots } = layoutFarm(n)
      expect(plots).toHaveLength(n)
      expect(plots.map((p) => p.index)).toEqual([...Array(n).keys()])
    }
  })

  it('never lets two plot tiles overlap (isometric diamonds)', () => {
    for (const n of COUNTS) {
      const { plots } = layoutFarm(n)
      for (let i = 0; i < plots.length; i++) {
        for (let j = i + 1; j < plots.length; j++) {
          // Two diamonds of half-size (W, H) overlap when |dx|/W + |dy|/H < 2.
          const d = Math.abs(plots[i].x - plots[j].x) / PLOT_HALF_W + Math.abs(plots[i].y - plots[j].y) / PLOT_HALF_H
          expect(d, `plots ${i} and ${j} of ${n}`).toBeGreaterThanOrEqual(2 - 1e-9)
        }
      }
    }
  })

  it('keeps every plot on the island and inside the canvas, with room above for its tree', () => {
    for (const n of COUNTS) {
      const farm = layoutFarm(n)
      for (const p of farm.plots) {
        expect(pointInPolygon([p.x, p.y], farm.island.points), `plot ${p.index} of ${n}`).toBe(true)
        // All four tile corners on the island too.
        for (const [dx, dy] of [[0, -PLOT_HALF_H], [PLOT_HALF_W, 0], [0, PLOT_HALF_H], [-PLOT_HALF_W, 0]]) {
          expect(pointInPolygon([p.x + dx * 0.95, p.y + dy * 0.95], farm.island.points)).toBe(true)
        }
        expect(p.x - PLOT_HALF_W).toBeGreaterThan(0)
        expect(p.x + PLOT_HALF_W).toBeLessThan(farm.width)
        expect(p.y - TREE_HEADROOM).toBeGreaterThanOrEqual(0)
        expect(p.y + PLOT_HALF_H).toBeLessThan(farm.height)
      }
    }
  })

  it('connects every plot to the dock (a spanning tree) and the farmhouse to its nearest plot', () => {
    for (const n of COUNTS.filter((c) => c > 0)) {
      const { paths } = layoutFarm(n)
      expect(paths).toHaveLength(n + 1) // n − 1 plot links + 1 dock link + 1 farmhouse lane
      expect(paths.filter((e) => e.from === 'house')).toHaveLength(1)
      const reached = new Set<number>()
      const adj = new Map<string, number[]>()
      for (const e of paths) adj.set(String(e.from), [...(adj.get(String(e.from)) ?? []), e.to])
      const stack = [...(adj.get('dock') ?? [])]
      while (stack.length) {
        const k = stack.pop()!
        if (reached.has(k)) continue
        reached.add(k)
        stack.push(...(adj.get(String(k)) ?? []))
      }
      expect(reached.size, `n = ${n}`).toBe(n)
      for (const e of paths) expect(e.d).toMatch(/^M [\d.]+ [\d.]+ Q /)
    }
  })

  it('links only grid neighbours, so paths never cross the island', () => {
    const { plots, paths } = layoutFarm(9)
    for (const e of paths.filter((p) => typeof p.from === 'number')) {
      const a = plots[e.from as number]
      const b = plots[e.to]
      expect(Math.abs(a.c - b.c) + Math.abs(a.r - b.r)).toBe(1)
    }
  })

  it('grows the island with the number of decks and keeps the dock in front', () => {
    const small = layoutFarm(2)
    const big = layoutFarm(12)
    expect(big.width).toBeGreaterThan(small.width)
    for (const p of big.plots) expect(big.dock.y).toBeGreaterThan(p.y)
  })

  it('is deterministic, decorations included, and keeps decorations off plots', () => {
    expect(layoutFarm(7)).toEqual(layoutFarm(7))
    const farm = layoutFarm(7)
    expect(farm.decorations.length).toBeGreaterThan(0)
    for (const d of farm.decorations) {
      expect(pointInPolygon([d.x, d.y], farm.island.points)).toBe(true)
      for (const p of farm.plots) {
        expect(Math.abs(d.x - p.x) / PLOT_HALF_W + Math.abs(d.y - p.y) / PLOT_HALF_H).toBeGreaterThanOrEqual(1.25)
      }
    }
  })

  it('draws an empty island (no plots, no paths) when there are no decks', () => {
    const farm = layoutFarm(0)
    expect(farm).toMatchObject({ plots: [], paths: [] })
    expect(farm.island.points.length).toBeGreaterThanOrEqual(3)
    expect(farm.island.path.endsWith('Z')).toBe(true)
  })
})

describe('spacing and grass', () => {
  it('leaves a gap between neighbouring plot tiles for grass and paths', () => {
    for (const n of [4, 9, 12]) {
      const { plots } = layoutFarm(n)
      for (let i = 0; i < plots.length; i++) {
        for (let j = i + 1; j < plots.length; j++) {
          const d = Math.abs(plots[i].x - plots[j].x) / PLOT_HALF_W + Math.abs(plots[i].y - plots[j].y) / PLOT_HALF_H
          // Touching tiles would be exactly 2; spaced ones are clearly further apart.
          expect(d).toBeGreaterThanOrEqual(2.5)
        }
      }
    }
  })

  it('draws a closed grass top inside the beach', () => {
    const farm = layoutFarm(5)
    expect(farm.island.grassPath).toMatch(/^M [\d.]+ [\d.]+ Q .* Z$/)
    expect(farm.island.grassPath).not.toBe(farm.island.path)
  })
})

describe('farmstead landmarks, fence and props', () => {
  it('puts the farmhouse and tractor on the island, clear of every plot', async () => {
    const { HOUSE_HALF, TRACTOR_HALF } = await import('../lib/farmLayout')
    for (const n of [0, 1, 4, 9, 20]) {
      const farm = layoutFarm(n)
      for (const [spot, half] of [[farm.house, HOUSE_HALF], [farm.tractor, TRACTOR_HALF]] as const) {
        for (const [dx, dy] of [[0, -half.h], [half.w, 0], [0, half.h], [-half.w, 0]]) {
          expect(pointInPolygon([spot.x + dx, spot.y + dy], farm.island.points), `n=${n}`).toBe(true)
        }
        for (const p of farm.plots) {
          expect(Math.abs(spot.x - p.x) / (PLOT_HALF_W + half.w) + Math.abs(spot.y - p.y) / (PLOT_HALF_H + half.h)).toBeGreaterThanOrEqual(1)
        }
      }
      // The farmhouse sits behind-left, the tractor front-right.
      expect(farm.house.x).toBeLessThan(farm.tractor.x)
      // The tractor's sign (≈ 100px above it) must not land on a plot nameplate (just below a plot centre).
      for (const p of farm.plots) {
        const signY = farm.tractor.y - 100
        const overlaps = Math.abs(signY - (p.y + 18)) < 22 && Math.abs(farm.tractor.x - p.x) < 110
        expect(overlaps, `tractor sign vs plot ${p.index} (n=${n})`).toBe(false)
      }
    }
  })

  it('runs the fence along the front grass edge and leaves the dock entrance open', () => {
    for (const n of [1, 5, 12]) {
      const farm = layoutFarm(n)
      const posts = farm.fence.flat()
      expect(posts.length, `n=${n}`).toBeGreaterThan(10)
      for (const [x, y] of posts) {
        expect(pointInPolygon([x, y], farm.island.points)).toBe(true)
        expect(Math.abs(x - farm.dock.x) < 60 && y > farm.dock.y - 70).toBe(false)
      }
      for (const run of farm.fence) expect(run.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('places lamps and benches beside paths, bales by the barn, all on grass and off plots', () => {
    const farm = layoutFarm(9)
    const kinds = new Set(farm.props.map((p) => p.kind))
    for (const kind of ['lamp', 'bench', 'bale'] as const) expect(kinds.has(kind), kind).toBe(true)
    for (const prop of farm.props) {
      expect(pointInPolygon([prop.x, prop.y], farm.island.grass)).toBe(true)
      for (const p of farm.plots) {
        expect(Math.abs(prop.x - p.x) / PLOT_HALF_W + Math.abs(prop.y - p.y) / PLOT_HALF_H).toBeGreaterThanOrEqual(1.2)
      }
    }
    for (let i = 0; i < farm.props.length; i++) {
      for (let j = i + 1; j < farm.props.length; j++) {
        expect(Math.hypot(farm.props[i].x - farm.props[j].x, farm.props[i].y - farm.props[j].y)).toBeGreaterThanOrEqual(26)
      }
    }
  })

  it('adds a beehive only next to flowering trees', () => {
    const flowering = [true, false, true, false, false]
    const hives = layoutFarm(5, { flowering }).props.filter((p) => p.kind === 'hive')
    expect(hives.length).toBeGreaterThan(0)
    for (const h of hives) expect(flowering[h.plot!]).toBe(true)
    expect(layoutFarm(5).props.some((p) => p.kind === 'hive')).toBe(false)
  })

  it('stays deterministic with options', () => {
    expect(layoutFarm(6, { flowering: [true, true] })).toEqual(layoutFarm(6, { flowering: [true, true] }))
  })
})

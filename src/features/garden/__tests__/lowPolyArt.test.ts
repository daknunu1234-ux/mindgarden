import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { catalogItem } from '../lib/farmCatalog'
import { Cone, Cylinder, isoCorners, IsoBox, lit } from '../components/lowPolyKit'
import { BASES, diamond, FactorySprite, SeaportSprite, WindmillSprite } from '../components/PowerBuildings'
import { RunningTrain, TrackTile, trackArms, trackShape, TrainSprite } from '../components/RailwaySprites'

// The island's buildings in the 3D low-poly style: the faceted kit, tile bounds, and what each
// building shows (and animates) in each state.

const svg = (child: ReactElement) => renderToStaticMarkup(createElement('svg', null, child))
const fills = (html: string) => [...html.matchAll(/<polygon[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}

describe('the low-poly kit', () => {
  it('lights planes from the upper left: faces turned to the light are brighter', () => {
    expect(luminance(lit('#888888', -1))).toBeGreaterThan(luminance('#888888'))
    expect(luminance(lit('#888888', 1))).toBeLessThan(luminance('#888888'))
  })

  it('an iso block has a lit left wall, a shaded right wall and the brightest top', () => {
    const [left, right, top] = fills(svg(createElement(IsoBox, { a: 20, b: 20, h: 10, color: '#7dd3c8' })))
    expect(luminance(top)).toBeGreaterThan(luminance(left))
    expect(luminance(left)).toBeGreaterThan(luminance(right))
    // Its ground corners are the iso diamond: 2 : 1.
    expect(isoCorners([0, 0], 20, 20)).toEqual([
      [0, -20],
      [40, 0],
      [0, 20],
      [-40, 0],
    ])
  })

  it('a faceted cylinder draws only the facets facing the viewer, plus its cap; a cone its facets', () => {
    const cyl = svg(createElement(Cylinder, { rx: 30, ry: 15, h: 50, facets: 10, color: '#f6f0e3' }))
    expect((cyl.match(/<polygon/g) ?? []).length).toBe(5 + 1)
    const sides = fills(cyl).slice(0, 5)
    // The leftmost facet (towards the light) is brighter than the rightmost.
    expect(luminance(sides[sides.length - 1])).toBeGreaterThan(luminance(sides[0]))
    expect((svg(createElement(Cone, { rx: 20, ry: 10, h: 30, facets: 8, color: '#e0603a' })).match(/<polygon/g) ?? []).length).toBe(8)
  })
})

describe('tile bounds and sizes', () => {
  it('every 2 × 2 building stands inside its 2 × 2 tile diamond', () => {
    const [top, right, bottom, left] = diamond(2, 2)
    for (const [name, { a, b }] of Object.entries(BASES)) {
      for (const [x, y] of isoCorners([0, 0], a, b)) {
        // Inside the diamond |x| / halfWidth + |y| / halfHeight ≤ 1.
        expect(Math.abs(x) / right[0] + Math.abs(y) / bottom[1], name).toBeLessThanOrEqual(1)
      }
    }
    expect([top[1], left[0]]).toEqual([-56, -112])
  })

  it('the Grand Windmill is a 2 × 2 tower now, like the small one', () => {
    expect(catalogItem('windmill_large')).toMatchObject({ name: 'Grand Windmill', width: 2, height: 2, powerReach: 2 })
  })
})

describe('the buildings', () => {
  it('Small Windmill: stucco tower, a balcony, a cone roof and four turning lattice sails', () => {
    const html = svg(createElement(WindmillSprite, { size: 'small' }))
    expect(html).toContain('data-building="windmill_small"')
    expect(html).toMatch(/class="mg-spin"/)
    expect((html.match(/rotate\((0|90|180|270)\)/g) ?? []).length).toBe(4)
  })

  it('Grand Windmill: taller, two decks, a brass gear housing and a crimson dome', () => {
    const html = svg(createElement(WindmillSprite, { size: 'large' }))
    expect(html).toContain('data-building="windmill_large"')
    expect(html).toMatch(/class="mg-spin"/)
    const small = svg(createElement(WindmillSprite, { size: 'small' }))
    expect((html.match(/<polygon/g) ?? []).length).toBeGreaterThan((small.match(/<polygon/g) ?? []).length)
    // A crimson dome (strong red, little green) and a brass gear housing (red and green high, blue low).
    const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
    expect(fills(html).some((c) => {
      const [r, g, b] = rgb(c)
      return r > 140 && g < 60 && b < 60
    })).toBe(true)
    expect(fills(html).some((c) => {
      const [r, g, b] = rgb(c)
      return r > 160 && g > 120 && b < 70
    })).toBe(true)
    expect(fills(small).some((c) => {
      const [r, g, b] = rgb(c)
      return r > 140 && g < 60 && b < 60
    })).toBe(false)
  })

  it('Furniture Factory: the saw turns and the pipes smoke only while powered', () => {
    const on = svg(createElement(FactorySprite, { powered: true }))
    const off = svg(createElement(FactorySprite, { powered: false }))
    expect(on).toContain('mg-spin-slow')
    expect(on).toContain('mg-smoke')
    expect(off).not.toMatch(/mg-spin-slow|mg-smoke/)
  })

  it('Candy Factory: the conveyor moves and the chimney steams only while powered', () => {
    const on = svg(createElement(FactorySprite, { powered: true, kind: 'candy' }))
    const off = svg(createElement(FactorySprite, { powered: false, kind: 'candy' }))
    expect(on).toContain('data-building="candy_factory"')
    expect(on).toContain('data-conveyor="moving"')
    expect(on).toContain('class="mg-conveyor"')
    expect(on).toContain('mg-smoke')
    expect(off).toContain('data-conveyor="still"')
    expect(off).not.toMatch(/mg-conveyor"|mg-smoke/)
  })

  it('Seaport: a jib crane, containers and hazard curbs; the freighter only while powered', () => {
    const on = svg(createElement(SeaportSprite, { shore: 'front', powered: true }))
    expect(on).toContain('data-crane=""')
    expect(on).toContain('data-ship=""')
    // Yellow and dark hazard stripes along the waterline.
    expect(fills(on).filter((c) => c === '#facc15').length).toBeGreaterThan(4)
    expect(svg(createElement(SeaportSprite, { powered: false }))).not.toContain('data-ship')
  })

  it('tracks: straights, curves (Bézier rails) and junctions', () => {
    expect(trackShape(trackArms({ north: false, east: true, south: false, west: true }))).toBe('straight')
    expect(trackShape(trackArms({ north: true, east: true, south: false, west: false }))).toBe('curve')
    expect(trackShape(trackArms({ north: true, east: true, south: true, west: true }))).toBe('junction')
    const curve = svg(createElement(TrackTile, { links: { north: true, east: true, south: false, west: false } }))
    expect(curve).toContain('data-track-shape="curve"')
    expect((curve.match(/d="M [^"]* Q /g) ?? []).length).toBe(4) // two rails, each a web and a running surface
    const straight = svg(createElement(TrackTile, { links: { north: false, east: false, south: false, west: false } }))
    expect(straight).toContain('data-track-shape="straight"')
  })

  it('Freight Train: a steam locomotive (smoking) and two wagons of candy crates; the running one too', () => {
    const html = svg(createElement(TrainSprite))
    expect(html).toContain('data-locomotive=""')
    expect((html.match(/data-wagon=""/g) ?? []).length).toBe(2)
    expect(html).toContain('data-train-smoke=""')
    expect(html).toContain('mg-smoke')
    const running = renderToStaticMarkup(createElement(RunningTrain))
    expect(running).toContain('data-locomotive=""')
    expect(running).toContain('🍬')
  })

  it('the art is English-only and draws no text labels on the buildings', () => {
    for (const f of ['components/PowerBuildings.tsx', 'components/RailwaySprites.tsx', 'components/lowPolyKit.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/)
    }
  })
})

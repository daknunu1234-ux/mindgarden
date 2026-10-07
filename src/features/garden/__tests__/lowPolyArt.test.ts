import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { catalogItem } from '../lib/farmCatalog'
import { vivid } from '@/shared/lib/color'
import { Cone, Cylinder, DEEP_SHADOW, FootprintShadow, isoCorners, IsoBox, lit } from '../components/lowPolyKit'
import { BASES, diamond, FactorySprite, PALETTE, SeaportSprite } from '../components/PowerBuildings'

// The island's buildings in the 3D low-poly style: the faceted kit, tile bounds, and what each
// building shows (and animates) in each state.

const svg = (child: ReactElement) => renderToStaticMarkup(createElement('svg', null, child))
const fills = (html: string) => [...html.matchAll(/<polygon[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
// HSV-style saturation: (max − min) / max.
const saturation = (hex: string) => {
  const c = rgb(hex)
  return Math.max(...c) === 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c)
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

  it('vivid lighting: tones are saturated, lit faces warm, shaded faces deep and still coloured (not grey)', () => {
    expect(saturation(vivid('#7dd3c8', 1.3))).toBeGreaterThan(saturation('#7dd3c8'))
    expect(vivid('#888888')).toBe('#888888')
    const [r, , b] = rgb(lit('#888888', -1))
    expect(r).toBeGreaterThan(b) // warm sunlight
    const shadow = lit('#16d6b4', 1)
    expect(luminance(shadow)).toBeLessThan(luminance('#16d6b4') * 0.75)
    expect(saturation(shadow)).toBeGreaterThan(0.5) // a rich shadow, not a grey one
    // A grey's shadow leans to the deep indigo.
    const [sr, , sb] = rgb(lit('#888888', 1))
    expect(sb).toBeGreaterThan(sr)
  })

  it('bevel highlights: on block tops, cylinder rims and cone edges', () => {
    expect(svg(createElement(IsoBox, { a: 20, b: 20, h: 10, color: '#7dd3c8' }))).toMatch(/<line[^>]*stroke="#fffbe6"/)
    expect(svg(createElement(Cylinder, { rx: 30, ry: 15, h: 50, facets: 10, color: '#f6f0e3' }))).toMatch(/<polyline[^>]*stroke="#fffbe6"/)
    expect(svg(createElement(Cone, { rx: 20, ry: 10, h: 30, color: '#e0603a' }))).toMatch(/<line[^>]*stroke="#fffbe6"/)
  })

  it('a footprint ambient-occlusion shadow: two diamonds in the deep shadow tone', () => {
    const html = svg(createElement(FootprintShadow, { w: 2, h: 2 }))
    expect(html).toContain('data-ao="2x2"')
    expect((html.match(new RegExp(`<polygon[^>]*fill="${DEEP_SHADOW}"`, 'g')) ?? []).length).toBe(2)
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

  it('the island has one Windmill (2 × 2), and no Grand Windmill', () => {
    expect(catalogItem('windmill_small')).toMatchObject({ name: 'Windmill', width: 2, height: 2, powerReach: 4 })
    expect(catalogItem('windmill_large')).toBeUndefined()
  })
})

describe('the buildings', () => {
  it('every 2 × 2 building sits on its footprint shadow', () => {
    for (const el of [
      createElement(FactorySprite, { powered: true }),
      createElement(FactorySprite, { powered: true, kind: 'candy' }),
    ]) {
      expect(svg(el)).toContain('data-ao="2x2"')
    }
  })

  it('the palette is vivid: every hue is strongly saturated', () => {
    const hues = [PALETTE.canvasRed, PALETTE.cobalt, PALETTE.mint, PALETTE.candyPink, PALETTE.magenta, PALETTE.lime, PALETTE.citrus, PALETTE.azure, PALETTE.vermilion, PALETTE.royalBlue, PALETTE.emerald, PALETTE.hazard]
    for (const c of hues) expect(saturation(c), c).toBeGreaterThan(0.7)
  })

  it('Furniture Factory: the saw turns and the pipes smoke only while powered', () => {
    const on = svg(createElement(FactorySprite, { powered: true }))
    const off = svg(createElement(FactorySprite, { powered: false }))
    expect(on).toContain('mg-spin-slow')
    expect(on).toContain('mg-smoke')
    expect(off).not.toMatch(/mg-spin-slow|mg-smoke/)
    // Sawdust sparks fly off the saw only while it runs; safety stripes and cedar siding always.
    expect(on).toContain('data-part="sawdust"')
    expect((on.match(/class="mg-spark"/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(off).not.toMatch(/mg-spark|sawdust/)
    expect(off).toContain('data-part="hazard-stripes"')
    expect(off).toContain('data-part="cedar-siding"')
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
    // Gumdrops and a lollipop on the ridge; magenta candies on the belt.
    expect((on.match(/data-part="gumdrop"/g) ?? []).length).toBe(2)
    expect(on).toContain('data-part="lollipop"')
    expect((on.match(/data-part="candy"/g) ?? []).length).toBe(3)
    expect(on).toContain(`fill="${PALETTE.magenta}"`)
  })

  it('Seaport: a jib crane, containers and hazard curbs; the freighter only while powered', () => {
    const on = svg(createElement(SeaportSprite, { shore: 'front', powered: true }))
    expect(on).toContain('data-crane=""')
    expect(on).toContain('data-ship=""')
    // Yellow and dark hazard stripes along the waterline.
    expect(fills(on).filter((c) => c === '#facc15').length).toBeGreaterThan(4)
    expect(svg(createElement(SeaportSprite, { powered: false }))).not.toContain('data-ship')
    // Azure ripples round the pilings; the freighter trails a wake; containers in vermilion, blue, green.
    expect(on).toContain('data-part="ripples"')
    expect(on).toContain('class="mg-wave"')
    expect((on.match(/class="mg-wake"/g) ?? []).length).toBeGreaterThanOrEqual(4)
    for (const c of [PALETTE.vermilion, PALETTE.royalBlue, PALETTE.emerald]) expect(on).toContain(c)
  })

  it('the art is English-only and draws no text labels on the buildings', () => {
    for (const f of ['components/PowerBuildings.tsx', 'components/RoadSprites.tsx', 'components/lowPolyKit.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/)
    }
  })
})

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILDING_IMAGES, BuildingImage, type BuildingImageKind } from '../components/BuildingImages'
import { ItemDrawing } from '../components/FarmStructures'
import { diamond } from '../components/PowerBuildings'

// The PNG-rendered building sprites: which buildings use them, how they sit on their 2 × 2 tiles,
// and the files they load.

const svg = (child: ReactElement) => renderToStaticMarkup(createElement('svg', null, child))
const KINDS = Object.keys(BUILDING_IMAGES) as BuildingImageKind[]
const PUBLIC = join(__dirname, '..', '..', '..', '..', 'public')

// A WebP with alpha (VP8X): its canvas size, from the header.
function webpSize(file: string): [number, number] {
  const b = readFileSync(file)
  expect(b.toString('ascii', 0, 4)).toBe('RIFF')
  expect(b.toString('ascii', 8, 12)).toBe('WEBP')
  expect(b.toString('ascii', 12, 16)).toBe('VP8X')
  expect(b[20] & 0x10).toBe(0x10) // has an alpha channel
  return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]
}

describe('PNG building sprites', () => {
  it('the Small Windmill, Candy Factory and Furniture Factory draw as static images', () => {
    for (const kind of KINDS) {
      const html = svg(createElement(ItemDrawing, { item: { itemType: kind, variant: null } }))
      expect(html, kind).toContain(`data-building="${kind}"`)
      expect(html, kind).toContain('data-sprite="image"')
      expect(html, kind).toContain(`href="${BUILDING_IMAGES[kind].href}"`)
      // Static: no animation classes.
      expect(html, kind).not.toMatch(/class="mg-(spin|spin-slow|smoke|conveyor|spark)"/)
    }
    // The Grand Windmill keeps its vector drawing.
    expect(svg(createElement(ItemDrawing, { item: { itemType: 'windmill_large', variant: null } }))).not.toContain('data-sprite="image"')
  })

  it('each image is anchored on the ground point: its base centre at (0, 0), inside the 2 × 2 diamond', () => {
    const [, right, bottom] = diamond(2, 2)
    for (const kind of KINDS) {
      const { size, anchor, scale } = BUILDING_IMAGES[kind]
      const html = svg(createElement(BuildingImage, { kind }))
      const x = Number(html.match(/<image[^>]* x="([-\d.]+)"/)?.[1])
      const y = Number(html.match(/<image[^>]* y="([-\d.]+)"/)?.[1])
      const width = Number(html.match(/<image[^>]* width="([\d.]+)"/)?.[1])
      const height = Number(html.match(/<image[^>]* height="([\d.]+)"/)?.[1])
      // The anchor pixel lands on (0, 0).
      expect(x + anchor[0] * scale, kind).toBeCloseTo(0, 6)
      expect(y + anchor[1] * scale, kind).toBeCloseTo(0, 6)
      expect([width, height]).toEqual([size[0] * scale, size[1] * scale])
      // The anchor lies within the sprite, in its lower part (the base, not the roof).
      expect(anchor[0], kind).toBeGreaterThan(size[0] * 0.3)
      expect(anchor[0], kind).toBeLessThan(size[0] * 0.7)
      expect(anchor[1], kind).toBeGreaterThan(size[1] * 0.6)
      // The sprite is no wider than the footprint diamond plus a small margin, and its bottom edge
      // stays within the diamond's lower half (it never covers the tiles in front).
      expect(width, kind).toBeLessThanOrEqual(right[0] * 2 * 1.02)
      expect(y + height, kind).toBeLessThanOrEqual(bottom[1] + 2)
      // A footprint shadow grounds it.
      expect(html).toContain('data-ao="2x2"')
    }
  })

  it('an unpowered factory is drawn muted; a powered one is not', () => {
    const off = svg(createElement(ItemDrawing, { item: { itemType: 'candy_factory', variant: null }, powered: false }))
    const on = svg(createElement(ItemDrawing, { item: { itemType: 'candy_factory', variant: null }, powered: true }))
    expect(off).toContain('data-powered="false"')
    expect(off).toContain('class="mg-unpowered"')
    expect(on).not.toContain('mg-unpowered')
  })

  it('the files exist, have real transparency, match their configured size and stay light', () => {
    for (const kind of KINDS) {
      const { href, size } = BUILDING_IMAGES[kind]
      const file = join(PUBLIC, href)
      expect(webpSize(file), kind).toEqual(size)
      expect(statSync(file).size, kind).toBeLessThan(200 * 1024)
    }
  })

  it('the sprite code is English-only', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'BuildingImages.tsx'), 'utf8')
    expect(src).not.toMatch(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/)
  })
})

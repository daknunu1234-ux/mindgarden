import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILDING_IMAGES, BuildingImage, OVERLAY_POINTS, spritePoint, WINDMILL_RENDER, WindmillRotor, type BuildingImageKind } from '../components/BuildingImages'
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
  it('the Small Windmill, Candy Factory and Furniture Factory draw as images', () => {
    for (const kind of KINDS) {
      const html = svg(createElement(ItemDrawing, { item: { itemType: kind, variant: null } }))
      expect(html, kind).toContain(`data-building="${kind}"`)
      expect(html, kind).toContain('data-sprite="image"')
      expect(html, kind).toContain(`href="${BUILDING_IMAGES[kind].href}"`)
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

  it('a powered Candy Factory puffs chimney smoke and rolls candies off its belt; unpowered, nothing moves', () => {
    const on = svg(createElement(BuildingImage, { kind: 'candy_factory', powered: true }))
    const off = svg(createElement(BuildingImage, { kind: 'candy_factory', powered: false }))
    expect(on).toContain('data-overlay="candy_factory"')
    expect((on.match(/class="mg-smoke"/g) ?? []).length).toBe(3)
    expect(on).toContain('data-part="rolling-candies"')
    expect((on.match(/class="mg-roll"/g) ?? []).length).toBe(3)
    // The candies roll from the belt's start towards its end (down-left on screen).
    const [fx, fy] = spritePoint('candy_factory', OVERLAY_POINTS.candyBeltFrom)
    const [tx, ty] = spritePoint('candy_factory', OVERLAY_POINTS.candyBeltTo)
    expect(on).toContain(`translate(${fx.toFixed(1)} ${fy.toFixed(1)})`)
    expect(on).toContain(`--mg-cx:${(tx - fx).toFixed(1)}px`)
    expect(tx).toBeLessThan(fx)
    expect(ty).toBeGreaterThan(fy)
    expect(off).not.toMatch(/mg-smoke|mg-roll|data-overlay/)
    expect(off).toContain('class="mg-unpowered"')
  })

  it('a powered Furniture Factory smokes from its pipe and sprays sawdust and chips at the bench; unpowered, nothing moves', () => {
    const on = svg(createElement(BuildingImage, { kind: 'furniture_factory', powered: true }))
    const off = svg(createElement(BuildingImage, { kind: 'furniture_factory', powered: false }))
    expect(on).toContain('data-overlay="furniture_factory"')
    expect((on.match(/class="mg-smoke"/g) ?? []).length).toBe(3)
    expect(on).toContain('data-part="sawdust"')
    expect((on.match(/class="mg-spark"/g) ?? []).length).toBe(8)
    expect(on).toMatch(/<rect[^>]*class="mg-spark"/) // wood chips
    expect(on).toMatch(/<circle[^>]*class="mg-spark"/) // sparks
    expect(off).not.toMatch(/mg-smoke|mg-spark|data-overlay/)
    expect(off).toContain('class="mg-unpowered"')
  })

  it('overlay points lie on their sprites: chimneys and the pipe high up, the belt and bench lower down', () => {
    const inside = (kind: BuildingImageKind, [x, y]: readonly [number, number]) => {
      const [w, h] = BUILDING_IMAGES[kind].size
      return x >= 0 && x <= w && y >= 0 && y <= h
    }
    for (const [kind, key] of [
      ['candy_factory', 'candyChimney'],
      ['candy_factory', 'candyBeltFrom'],
      ['candy_factory', 'candyBeltTo'],
      ['furniture_factory', 'furniturePipe'],
      ['furniture_factory', 'furnitureBench'],
      ['windmill_small', 'windmillHub'],
    ] as const) {
      expect(inside(kind, OVERLAY_POINTS[key]), key).toBe(true)
    }
    // In farm pixels: smoke leaves well above the ground point; the belt end and bench are near it.
    expect(spritePoint('candy_factory', OVERLAY_POINTS.candyChimney)[1]).toBeLessThan(-100)
    expect(spritePoint('furniture_factory', OVERLAY_POINTS.furniturePipe)[1]).toBeLessThan(-80)
    expect(Math.abs(spritePoint('furniture_factory', OVERLAY_POINTS.furnitureBench)[1])).toBeLessThan(20)
    // The anchor maps to the ground point.
    expect(spritePoint('candy_factory', BUILDING_IMAGES.candy_factory.anchor)).toEqual([0, 0])
  })

  it('the windmill rotor turns about the painted hub, in the plane of the sails, and stops without power', () => {
    const html = svg(createElement(WindmillRotor, { spinning: true }))
    const [hx, hy] = spritePoint('windmill_small', OVERLAY_POINTS.windmillHub)
    const { scale } = BUILDING_IMAGES.windmill_small
    const [ax, ay] = OVERLAY_POINTS.windmillAxisX.map((v) => (v * scale) / 100)
    const [bx, by] = OVERLAY_POINTS.windmillAxisY.map((v) => (v * scale) / 100)
    expect(html).toContain(`matrix(${ax.toFixed(4)} ${ay.toFixed(4)} ${bx.toFixed(4)} ${by.toFixed(4)} ${hx.toFixed(2)} ${hy.toFixed(2)})`)
    expect(html).toContain('class="mg-spin"')
    expect((html.match(/rotate\((0|90|180|270)\)/g) ?? []).length).toBe(4)
    expect(html).not.toContain('animation-play-state')
    expect(svg(createElement(WindmillRotor, { spinning: false }))).toContain('animation-play-state:paused')
    // A sail tip (100 along an axis) lands on the painted sail tip.
    const tip = [hx + bx * 100, hy + by * 100]
    const painted = spritePoint('windmill_small', [OVERLAY_POINTS.windmillHub[0] + OVERLAY_POINTS.windmillAxisY[0], OVERLAY_POINTS.windmillHub[1] + OVERLAY_POINTS.windmillAxisY[1]])
    expect(tip[0]).toBeCloseTo(painted[0], 6)
    expect(tip[1]).toBeCloseTo(painted[1], 6)
  })

  it('the windmill rotor stays off while the render has its sails painted in', () => {
    const html = svg(createElement(BuildingImage, { kind: 'windmill_small' }))
    expect(WINDMILL_RENDER.bakedSails).toBe(true)
    expect(html).not.toContain('data-part="rotor"')
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

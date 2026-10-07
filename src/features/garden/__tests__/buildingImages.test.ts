import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  BUILDING_IMAGES,
  BuildingImage,
  CARGO_SHIP_IMAGE,
  CargoShip,
  OVERLAY_POINTS,
  SEAPORT_IMAGE,
  seaportFit,
  shipBerth,
  spritePoint,
  WINDMILL_RENDER,
  WindmillRotor,
  type BuildingImageKind,
} from '../components/BuildingImages'
import { ItemDrawing } from '../components/FarmStructures'
import { buildingStatus } from '../lib/buildingStatus'
import { catalogItem, FARM_CATALOG } from '../lib/farmCatalog'
import type { Pt } from '../components/lowPolyKit'
import { diamond, type Shore } from '../components/PowerBuildings'

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
  it('the Windmill, Candy Factory and Furniture Factory draw as images', () => {
    for (const kind of KINDS) {
      const html = svg(createElement(ItemDrawing, { item: { itemType: kind, variant: null } }))
      expect(html, kind).toContain(`data-building="${kind}"`)
      expect(html, kind).toContain('data-sprite="image"')
      expect(html, kind).toContain(`href="${BUILDING_IMAGES[kind].href}"`)
    }
  })

  it('the one Windmill (Shop, island and inspector alike): the rendered sprite, 60 coins, a 10 × 10 field', () => {
    const windmill = catalogItem('windmill_small')!
    expect(windmill).toMatchObject({ name: 'Windmill', price: 60, width: 2, height: 2 })
    expect(windmill.width + 2 * windmill.powerReach!).toBe(10)
    // The Shop card's drawing is the same rendered sprite.
    expect(svg(createElement(ItemDrawing, { item: windmill }))).toContain(`href="${BUILDING_IMAGES.windmill_small.href}"`)
    expect(buildingStatus('windmill_small', { poweredCount: 0, economy: null })?.outputs).toEqual([{ label: 'Power', value: '10×10 area' }])
    // No other windmill anywhere: no catalogue entry, no sprite, no vector fallback.
    expect(FARM_CATALOG.filter((i) => i.itemType.startsWith('windmill'))).toHaveLength(1)
    expect(catalogItem('windmill_large')).toBeUndefined()
    expect(KINDS.filter((k) => k.startsWith('windmill'))).toEqual(['windmill_small'])
    expect(readFileSync(join(__dirname, '..', 'components', 'PowerBuildings.tsx'), 'utf8')).not.toMatch(/WindmillSprite|GrandWindmill|windmill_large/)
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

describe('the rendered Seaport and its cargo ship', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
  const seaport = (shore: Shore, powered = true) => svg(createElement(ItemDrawing, { item: { itemType: 'seaport', variant: null }, shore, powered }))
  const slope = (p: Pt, q: Pt) => (q[1] - p[1]) / (q[0] - p[0])

  it('the Seaport draws as the rendered wharf, its ship only while powered; unpowered it is muted', () => {
    const on = seaport('front')
    expect(on).toContain('data-building="seaport"')
    expect(on).toContain('data-sprite="image"')
    expect(on).toContain(`href="${SEAPORT_IMAGE.href}"`)
    expect(on).toContain(`href="${CARGO_SHIP_IMAGE.href}"`)
    expect(on).toContain('data-ship=""')
    expect(on).toContain('data-ao="6x2"')
    const off = seaport('front', false)
    expect(off).not.toContain('data-ship')
    expect(off).not.toContain(CARGO_SHIP_IMAGE.href)
    expect(off).toContain('class="mg-unpowered"')
    expect(on).not.toContain('mg-unpowered')
  })

  it('the wharf fits its 6 × 2 footprint: edges on the tile slopes, the long edge 6 tiles, verticals upright', () => {
    const [top, right, bottom, left] = diamond(6, 2)
    const { left: sl, front: sf, right: sr } = SEAPORT_IMAGE.slab
    const back: Pt = [sl[0] + sr[0] - sf[0], sl[1] + sr[1] - sf[1]]
    for (const shore of ['front', 'back'] as const) {
      const { map } = seaportFit(shore)
      expect(slope(map(sl), map(sf)), shore).toBeCloseTo(0.5, 6)
      expect(slope(map(sf), map(sr)), shore).toBeCloseTo(-0.5, 6)
      expect(map(sf)[0] - map(sl)[0], shore).toBeCloseTo(right[0] - top[0], 6)
      // Upright: the image transform has no x-from-y term (matrix(a b 0 d e f)).
      expect(seaport(shore)).toMatch(/href="\/assets\/sprites\/seaport\.webp"[^>]*transform="matrix\([-\d.]+ [-\d.]+ 0 [-\d.]+ [-\d.]+ [-\d.]+\)"/)
    }
    // Front shore: the harbour block's inland (back) edge lies on the footprint's back edge; the extra
    // depth hangs out over the sea in front.
    const front = seaportFit('front').map
    expect(front(sr)[0]).toBeCloseTo(right[0], 6)
    expect(front(sr)[1]).toBeCloseTo(right[1], 6)
    expect(front(back)[0]).toBeCloseTo(top[0], 6)
    expect(front(back)[1]).toBeCloseTo(top[1], 6)
    // Back shore: its front edge lies on the footprint's front edge; the extra depth hangs out behind.
    const backFit = seaportFit('back').map
    expect(backFit(sf)[0]).toBeCloseTo(bottom[0], 6)
    expect(backFit(sf)[1]).toBeCloseTo(bottom[1], 6)
    expect(backFit(sl)[0]).toBeCloseTo(left[0], 6)
    expect(backFit(sl)[1]).toBeCloseTo(left[1], 6)
  })

  it('the ship berths out at sea, beside the wharf: in front of it on the front shore, behind it on the back shore', () => {
    // Out to sea: front shore down-left (−x, +y), back shore up-right (+x, −y), beyond the footprint.
    const [fx, fy] = shipBerth('front')
    expect(fx).toBeLessThan(0)
    expect(fy).toBeGreaterThan(0)
    expect(Math.abs(fx) / 224 + Math.abs(fy) / 112).toBeGreaterThan(1) // outside the 6 × 2 diamond
    const [bx, by] = shipBerth('back')
    expect(bx).toBeGreaterThan(0)
    expect(by).toBeLessThan(0)
    expect(Math.abs(bx) / 224 + Math.abs(by) / 112).toBeGreaterThan(1)
    // Drawing order: the ship after the wharf on the front shore, before it on the back shore.
    const order = (html: string) => [html.indexOf(SEAPORT_IMAGE.href), html.indexOf(CARGO_SHIP_IMAGE.href)]
    const [wf, sf] = order(seaport('front'))
    expect(sf).toBeGreaterThan(wf)
    const [wb, sb] = order(seaport('back'))
    expect(sb).toBeLessThan(wb)
  })

  it('the ship loops: arrives from the open sea, docks, turns and departs; it bobs; all pause and respect reduced motion', () => {
    const html = svg(createElement(CargoShip, { shore: 'front' }))
    expect(html).toContain('class="mg-dock"')
    expect(html).toContain('class="mg-float"')
    // Its course: one tile out to sea (front shore: down-left) and one along the coast.
    expect(html).toContain('--mg-ox:-56.0px')
    expect(html).toContain('--mg-oy:28.0px')
    expect(svg(createElement(CargoShip, { shore: 'back' }))).toContain('--mg-ox:56.0px')
    // The keyframes: out at sea and hidden, then at the berth (0, 0) for a stretch, then turning away.
    const dock = css.slice(css.indexOf('@keyframes mg-dock'), css.indexOf('@keyframes mg-float'))
    expect(dock).toMatch(/0% \{[^}]*opacity: 0/)
    expect(dock).toMatch(/34% \{ transform: translate\(0, 0\)/)
    expect(dock).toMatch(/64% \{ transform: translate\(0, 0\)/)
    expect(dock).toMatch(/rotate\(4deg\)/)
    // Animated only without a reduced-motion preference; frozen with the farm (hidden tab, dialog).
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.mg-dock \{ animation: mg-dock/)
    expect(css).toMatch(/\.mg-dock \{ animation[^}]*\}\s*\.mg-float \{ animation: mg-float/)
    expect(css).not.toMatch(/^\.mg-(dock|float) \{ animation/m)
    expect(css).toMatch(/\.mg-paused \*,[\s\S]*?animation-play-state: paused !important/)
  })

  it('the seaport and ship files have real transparency, match their configured size and stay light', () => {
    for (const { href, size } of [SEAPORT_IMAGE, CARGO_SHIP_IMAGE]) {
      const file = join(PUBLIC, href)
      expect(webpSize(file), href).toEqual(size)
      expect(statSync(file).size, href).toBeLessThan(200 * 1024)
    }
  })
})

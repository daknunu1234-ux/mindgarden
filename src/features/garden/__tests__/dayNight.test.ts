import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IslandBase } from '../components/FarmDiorama'
import { FarmerHouse, RockerySprite, StreamNetwork } from '../components/FarmStructures'
import { TreeStageSvg } from '../components/TreeStageSvg'
import {
  DAY_START_HOUR,
  LIGHTING_BOOT_ATTRIBUTE,
  LIGHTING_BOOT_SCRIPT,
  LIGHTING_KEY,
  lightingModeAt,
  lightingModeClass,
  lightingToggleTitle,
  nextLightingPreference,
  NIGHT_CLASS,
  NIGHT_START_HOUR,
  parseLightingPreference,
  readLightingPreference,
  resolveLighting,
  writeLightingPreference,
} from '../lib/dayNight'

// Any sprite component, rendered inside an <svg>.
const svg = (node: unknown, props: object = {}) => renderToStaticMarkup(createElement('svg', null, createElement(node as never, props as never)))

describe('day / night by the local clock', () => {
  it('is day from 06:00 up to 18:00 and night the rest of the time', () => {
    expect([DAY_START_HOUR, NIGHT_START_HOUR]).toEqual([6, 18])
    expect([6, 9, 12, 17].map(lightingModeAt)).toEqual(['day', 'day', 'day', 'day'])
    expect([18, 21, 23, 0, 3, 5].map(lightingModeAt)).toEqual(['night', 'night', 'night', 'night', 'night', 'night'])
    // Fractions and out-of-range hours wrap round the clock; nonsense is daylight.
    expect(lightingModeAt(17.99)).toBe('day')
    expect(lightingModeAt(24 + 7)).toBe('day')
    expect(lightingModeAt(-1)).toBe('night')
    expect(lightingModeAt(Number.NaN)).toBe('day')
  })

  it('follows the clock unless the player pinned a light; without a clock it shows daylight', () => {
    expect(resolveLighting('auto', 12)).toBe('day')
    expect(resolveLighting('auto', 22)).toBe('night')
    expect(resolveLighting('auto', null)).toBe('day')
    expect(resolveLighting('night', 12)).toBe('night')
    expect(resolveLighting('day', 22)).toBe('day')
    expect(resolveLighting('night', null)).toBe('night')
  })

  it('steps the toggle through clock → day → night → clock, and says so', () => {
    expect(nextLightingPreference('auto')).toBe('day')
    expect(nextLightingPreference('day')).toBe('night')
    expect(nextLightingPreference('night')).toBe('auto')
    expect(lightingToggleTitle('auto', 'night')).toBe('Following your clock (night now). Switch to always day')
    expect(lightingToggleTitle('day', 'day')).toBe('Always day. Switch to always night')
    expect(lightingToggleTitle('night', 'night')).toBe('Always night. Switch to your clock')
  })

  it('remembers the choice, and falls back to the clock when storage is empty, corrupt or blocked', () => {
    expect(parseLightingPreference('night')).toBe('night')
    expect(parseLightingPreference('day')).toBe('day')
    for (const bad of [null, undefined, '', 'dusk', 'true']) expect(parseLightingPreference(bad)).toBe('auto')
    const saved = new Map<string, string>()
    const store = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) }
    expect(writeLightingPreference(store, 'night')).toBe(true)
    expect(saved.get(LIGHTING_KEY)).toBe('night')
    expect(readLightingPreference(store)).toBe('night')
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readLightingPreference(blocked)).toBe('auto')
    expect(writeLightingPreference(blocked, 'day')).toBe(false)
    expect(readLightingPreference(null)).toBe('auto')
    expect(writeLightingPreference(null, 'day')).toBe(false)
  })

  it('is one class on the farm root at night, and none by day', () => {
    expect(NIGHT_CLASS).toBe('mg-night')
    expect(lightingModeClass('night')).toBe('mg-night')
    expect(lightingModeClass('day')).toBeUndefined()
  })
})

describe('lighting hooks in the scene', () => {
  it('marks every contact shadow so its colour follows the light', () => {
    expect(svg(RockerySprite)).toMatch(/<ellipse[^>]*class="mg-contact"/)
    expect(svg(FarmerHouse)).toMatch(/<ellipse[^>]*class="mg-contact"/)
    const tree = renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: 'oak', label: '' }))
    expect((tree.match(/class="mg-contact-soft"/g) ?? []).length).toBe(2)
    expect(tree).toMatch(/<ellipse[^>]*class="mg-contact"/)
    // The crown's lit chips turn to moonlit silver at night.
    expect(tree).toContain('class="mg-glint"')
  })

  it('pools sunlight and moonlight on the turf from the upper left', () => {
    const island = svg(IslandBase, { origin: { x: 0, y: 0 }, seed: 'demo' })
    expect(island).toContain('class="mg-sun-pool"')
    expect(island).toContain('class="mg-moon-pool"')
    // Warm amber by day, pale silver by night, each fading to nothing across the field.
    expect(island).toMatch(/id="mg-sun-pool"[^>]*>\s*<stop offset="0%" stop-color="#fff5c8"/)
    expect(island).toMatch(/id="mg-moon-pool"[^>]*>\s*<stop offset="0%" stop-color="#e0f4ff"/)
  })

  it('gives the night its glows: lamplight on the house, a halo on the surreal trees, a sheen on streams', () => {
    expect(svg(FarmerHouse)).toContain('class="mg-night-only"')
    for (const id of ['crystal_flora', 'cosmic_nebula', 'chrono_willow']) {
      const tree = renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: id, label: '' }))
      expect((tree.match(/class="mg-night-only"/g) ?? []).length, id).toBe(1)
    }
    expect(renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: 'oak', label: '' }))).not.toContain('mg-night-only')
    const none = { north: false, east: false, south: false, west: false }
    expect(svg(StreamNetwork, { streams: [{ key: 's', x: 2, y: 2, links: none }], origin: { x: 0, y: 0 } })).toContain('class="mg-stream-shine"')
  })
})

describe('lighting CSS', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
  const block = css.slice(css.indexOf('Day / night light on the farm'))
  // Night: the live farm's own class, or a not-yet-hydrated farm under the boot script's mark.
  const NIGHT = ':is(.mg-night, html[data-mg-light="night"] .mg-farm:not([data-lighting]))'
  // The declarations of the rule whose selector is exactly `selector`.
  const rule = (selector: string) => {
    const start = block.indexOf(`\n${selector} {`)
    return start < 0 ? null : block.slice(start, block.indexOf('}', start))
  }

  it('sets the soft day shadow tint by default and the midnight-blue one at night', () => {
    expect(rule(':root')).toContain('--mg-shadow-rgb: 20 40 15;')
    expect(rule(':root')).toContain('--mg-shadow-a: 0.35;')
    expect(rule(NIGHT)).toContain('--mg-shadow-rgb: 6 12 28;')
    expect(rule(NIGHT)).toContain('--mg-shadow-a: 0.58;')
    for (const cls of ['mg-contact', 'mg-contact-soft', 'mg-tree-contact', 'mg-tree-cast']) expect(rule(`.${cls}`), cls).toContain('var(--mg-shadow-rgb)')
  })

  it('tints the night with a veil and a navy vignette, and shows the night-only light', () => {
    expect(block).toContain('rgb(10 20 45 / 0.35)')
    for (const cls of ['mg-moonlight', 'mg-night-veil', 'mg-moon-pool', 'mg-night-only']) {
      expect(rule(`.${cls}`), cls).toContain('opacity: 0;')
      expect(block, cls).toContain(`${NIGHT} .${cls} { opacity: 1; }`)
    }
    expect(block).toContain(`${NIGHT} .mg-sunlight { opacity: 0; }`)
    // Moonlit silver on the crowns' chips and on the water.
    expect(block).toContain('#e0f4ff')
    expect(block).toContain('#b4e4ff')
  })

  it('cross-fades over 900 ms with opacity only: no filters, no keyframes, nothing that takes a click', () => {
    expect(block).toMatch(/transition: opacity 900ms ease-in-out;/)
    expect(block).not.toMatch(/filter|blur|backdrop/)
    expect(block).not.toMatch(/@keyframes/)
    expect(block).toMatch(/\.mg-bob::after,[\s\S]*pointer-events: none;/)
    expect(block).toMatch(/\.mg-night-only \{[^}]*pointer-events: none;/)
  })

  it('draws a farm that is not hydrated yet from the mark on <html>, and a live farm from its own class only', () => {
    // No bare `.mg-night` rule is left: every night rule also covers the pre-hydration farm.
    const bare = [...block.matchAll(/(^|\n)\s*\.mg-night[ .{]/g)]
    expect(bare).toHaveLength(0)
    expect(block.split(NIGHT).length - 1).toBeGreaterThanOrEqual(12)
    // The sea behind the island follows the same two conditions.
    expect(block).toContain('.mg-farm:is(.mg-night, html[data-mg-light="night"] :not([data-lighting])) {')
    expect(`data-mg-light`).toBe(LIGHTING_BOOT_ATTRIBUTE)
  })
})

describe('lighting boot script (no flash of daylight at night)', () => {
  // Runs the script the root layout inlines, with a fake clock, storage and document.
  const boot = (hour: number, stored: string | null | Error) => {
    const attributes: Record<string, string> = {}
    const windowLike = {
      localStorage: {
        getItem: (key: string) => {
          if (stored instanceof Error) throw stored
          return key === LIGHTING_KEY ? stored : null
        },
      },
    }
    const documentLike = { documentElement: { setAttribute: (name: string, value: string) => void (attributes[name] = value) } }
    class FakeDate {
      getHours() {
        return hour
      }
    }
    new Function('window', 'document', 'Date', LIGHTING_BOOT_SCRIPT)(windowLike, documentLike, FakeDate)
    return attributes[LIGHTING_BOOT_ATTRIBUTE]
  }

  it('marks <html> with the light the farm will have: the clock, unless a light is pinned', () => {
    expect(boot(12, null)).toBe('day')
    expect(boot(22, null)).toBe('night')
    expect(boot(5, 'auto')).toBe('night')
    expect(boot(6, 'auto')).toBe('day')
    expect(boot(17, null)).toBe('day')
    expect(boot(18, null)).toBe('night')
    expect(boot(22, 'day')).toBe('day')
    expect(boot(12, 'night')).toBe('night')
    // A corrupted value follows the clock; blocked storage too.
    expect(boot(23, 'dusk')).toBe('night')
    expect(boot(23, new Error('blocked'))).toBe('night')
    expect(boot(10, new Error('blocked'))).toBe('day')
  })

  it('agrees with the hook for every hour and every stored choice', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const stored of [null, 'auto', 'day', 'night', 'nonsense']) {
        expect(boot(hour, stored), `${hour}h ${stored}`).toBe(resolveLighting(parseLightingPreference(stored), hour))
      }
    }
  })

  it('is one small self-contained statement that cannot throw, inlined by the root layout', () => {
    expect(LIGHTING_BOOT_SCRIPT.length).toBeLessThan(400)
    expect(LIGHTING_BOOT_SCRIPT).toMatch(/^\(function\(\)\{try\{/)
    expect(LIGHTING_BOOT_SCRIPT).toMatch(/\}catch\(e\)\{\}\}\)\(\)$/)
    expect(LIGHTING_BOOT_SCRIPT).toContain(JSON.stringify(LIGHTING_KEY))
    const layout = readFileSync(join(__dirname, '..', '..', '..', 'app', 'layout.tsx'), 'utf8')
    expect(layout).toContain('dangerouslySetInnerHTML={{ __html: LIGHTING_BOOT_SCRIPT }}')
    expect(layout).toContain('suppressHydrationWarning')
    // The farm only says which light it is in once it is live, so the mark decides until then.
    const farm = readFileSync(join(__dirname, '..', 'components', 'FarmIslandView.tsx'), 'utf8')
    expect(farm).toContain('data-lighting={lighting.live ? lighting.mode : undefined}')
  })
})

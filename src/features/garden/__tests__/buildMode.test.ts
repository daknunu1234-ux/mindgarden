import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { afterPlace, canAfford, CONTINUOUS_TYPES, continuousHint, isContinuous, isExitKey, outOfCoinsMessage } from '../lib/buildMode'
import { catalogItem, FARM_CATALOG } from '../lib/farmCatalog'

// Continuous placement: Roads, Water and Fences are laid tile after tile; the tool stays in hand after
// each one, Esc puts it away, and an empty purse ends it.

const road = catalogItem('road')!
const water = catalogItem('stream')!
const fence = catalogItem('fence')!
const windmill = catalogItem('windmill_small')!
const rockery = catalogItem('rockery')!

// The tool after a run of clicks, as the island view applies afterPlace (coins drop by the price each
// time; the tool is kept while afterPlace says so).
function lay(item: typeof road, coins: number, clicks: number) {
  let purse = coins
  let laid = 0
  let active = true
  let reason: string | null = null
  for (let i = 0; i < clicks && active; i++) {
    if (!canAfford(item.price, purse)) {
      active = false
      reason = 'out-of-coins'
      break
    }
    purse -= item.price
    laid++
    const next = afterPlace(item, purse)
    if (!next.keep) {
      active = false
      reason = next.reason
    }
  }
  return { purse, laid, active, reason }
}

describe('continuous placement', () => {
  it('Roads and Water (and Fences) are laid continuously; one-off items are not', () => {
    expect(CONTINUOUS_TYPES).toEqual(['road', 'stream', 'fence'])
    expect([road, water, fence].map(isContinuous)).toEqual([true, true, true])
    expect([windmill, rockery].map(isContinuous)).toEqual([false, false])
    // Only 1 × 1 tiles qualify.
    expect(FARM_CATALOG.filter(isContinuous).every((i) => i.width === 1 && i.height === 1)).toBe(true)
  })

  it('keeps the tool active after each successful Road or Water tile', () => {
    expect(afterPlace(road, 50)).toEqual({ keep: true })
    expect(afterPlace(water, 50)).toEqual({ keep: true })
    expect(lay(road, 100, 7)).toEqual({ purse: 93, laid: 7, active: true, reason: null })
    expect(lay(water, 100, 3)).toEqual({ purse: 85, laid: 3, active: true, reason: null })
    // An unknown purse: keep going and let the server decide.
    expect(afterPlace(road, null)).toEqual({ keep: true })
  })

  it('a one-off item leaves placement mode once it is put down', () => {
    expect(afterPlace(windmill, 500)).toEqual({ keep: false, reason: 'single' })
    expect(lay(windmill, 500, 3)).toMatchObject({ laid: 1, active: false, reason: 'single' })
  })

  it('stops when the coins run out: the last affordable tile is laid, then the tool is put away', () => {
    // 3 coins: three roads, the third leaves the purse at 0 and the tool is put away.
    expect(afterPlace(road, 0)).toEqual({ keep: false, reason: 'out-of-coins' })
    expect(lay(road, 3, 10)).toEqual({ purse: 0, laid: 3, active: false, reason: 'out-of-coins' })
    // Water costs 5: with 12 coins two go down, the 2 left can't pay for a third.
    expect(lay(water, 12, 10)).toEqual({ purse: 2, laid: 2, active: false, reason: 'out-of-coins' })
    // Not even one: nothing is laid.
    expect(lay(water, 4, 1)).toEqual({ purse: 4, laid: 0, active: false, reason: 'out-of-coins' })
    expect(canAfford(5, 4)).toBe(false)
    expect(canAfford(5, null)).toBe(true)
    expect(outOfCoinsMessage('Road', 1)).toBe('Out of coins: another Road costs 1 🪙')
  })

  it('Escape puts the tool away; other keys do not', () => {
    expect(isExitKey('Escape')).toBe(true)
    expect(isExitKey('Esc')).toBe(true)
    expect(['Enter', ' ', 'r', 'Tab'].some(isExitKey)).toBe(false)
  })

  it('says what is being laid and how to finish', () => {
    expect(continuousHint('Road')).toBe('Placing Road • Click to place • Press ESC when done')
  })
})

describe('the island view and grid wire it in', () => {
  const view = readFileSync(join(__dirname, '..', 'components', 'FarmIslandView.tsx'), 'utf8')
  const grid = readFileSync(join(__dirname, '..', 'components', 'FarmIsometricGrid.tsx'), 'utf8')

  it('placing keeps the build state for continuous items and clears it otherwise', () => {
    expect(view).toMatch(/const next = request\.kind === 'item' \? afterPlace\(request\.item, coins === null \? null : coins - request\.item\.price\)/)
    expect(view).toMatch(/if \(next\.keep\) setBuild\(\(b\) => \(b \? \{ \.\.\.b, tile, laid: \(b\.laid \?\? 0\) \+ 1 \} : b\)\)\s+else setBuild\(null\)/)
    // An empty purse: the tool is put away with a toast, before or after the tile.
    expect(view).toMatch(/!canAfford\(request\.item\.price, coins\)\) \{\s+setBuild\(null\)\s+toast\(\{ message: outOfCoinsMessage/)
    expect(view).toContain("res.error.code === 'INSUFFICIENT_COINS'")
  })

  it('Esc, Done, a hidden tab and a click off the island end it', () => {
    expect(view).toMatch(/if \(isExitKey\(e\.key\)\) latest\.current\.cancelBuild\(\)/)
    expect(view).toMatch(/if \(hidden && latest\.current\.build\) latest\.current\.cancelBuild\(\)/)
    expect(view).toMatch(/onClick=\{cancelBuild\} data-build-done="">\s+Done/)
    expect(view).toContain('continuousHint(build.request.item.name)')
    expect(grid).toMatch(/if \(tile\) onBuildTap\(tile, pointerType\.current\)\s+else onBuildCancel\(\)/)
  })
})

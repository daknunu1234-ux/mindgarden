import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { IMMUNE_STAGE, isImmune, isWithered, treeLook, WITHER_AFTER_MS } from '@/shared/lib/treeVitality'
import { getTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'

// The farm tree prefetches its page on hover (next/navigation); outside Next there is no router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: () => undefined }) }))

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-10T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const PLANTED = '2026-01-01T00:00:00Z'

// A tree at a mastery %, practised `restMs` ago.
const tree = (percent: number, restMs: number, itemCount = 12) => ({
  stage: getTreeStage(percent),
  itemCount,
  lastPracticedAt: ago(restMs),
  plantedAt: PLANTED,
  now: NOW,
})

describe('withering after 72 hours without practice (stages 1–3)', () => {
  it('withers stage 1, 2 and 3 trees once the rest is over 72 h', () => {
    for (const percent of [0, 10, 30, 50, 65]) {
      expect(getTreeStage(percent)).toBeLessThan(IMMUNE_STAGE)
      expect(isWithered(tree(percent, 72 * HOUR + 1)), `${percent}%`).toBe(true)
      expect(isWithered(tree(percent, 30 * 24 * HOUR)), `${percent}%`).toBe(true)
    }
  })

  it('keeps them lively up to exactly 72 h', () => {
    expect(WITHER_AFTER_MS).toBe(72 * HOUR)
    for (const percent of [0, 30, 65]) {
      expect(isWithered(tree(percent, 72 * HOUR))).toBe(false)
      expect(isWithered(tree(percent, 1 * HOUR))).toBe(false)
    }
  })

  it('counts a never-practised tree’s rest from when it was planted', () => {
    const base = { stage: 1, itemCount: 5, lastPracticedAt: null, now: NOW }
    expect(isWithered({ ...base, plantedAt: ago(73 * HOUR) })).toBe(true)
    expect(isWithered({ ...base, plantedAt: ago(10 * HOUR) })).toBe(false)
    expect(isWithered({ ...base, plantedAt: null })).toBe(false)
  })

  it('never withers a tree with nothing to practise (no statements)', () => {
    expect(isWithered(tree(0, 400 * HOUR, 0))).toBe(false)
  })
})

describe('Stage 4 immunity: mastered trees are evergreen', () => {
  it('a stage 4 (Mature Canopy) or 5 (Golden) tree never withers, however long it rests', () => {
    for (const percent of [66, 80, 89, 90, 100]) {
      expect(getTreeStage(percent)).toBeGreaterThanOrEqual(IMMUNE_STAGE)
      expect(isImmune(getTreeStage(percent))).toBe(true)
      for (const rest of [73 * HOUR, 30 * 24 * HOUR, 365 * 24 * HOUR]) expect(isWithered(tree(percent, rest)), `${percent}% ${rest}`).toBe(false)
    }
  })

  it('immunity starts exactly at stage 4 (66 %): 65 % still withers', () => {
    expect(isWithered(tree(65, 100 * HOUR))).toBe(true)
    expect(isWithered(tree(66, 100 * HOUR))).toBe(false)
  })

  it('an inactive (> 72 h) stage 4 tree keeps its colours, its sway and its bees', () => {
    const withered = isWithered(tree(80, 100 * HOUR))
    expect(treeLook(withered)).toEqual({ grayscale: false, sways: true, ambience: true })
    // …while a withered stage 3 tree is grey and still.
    expect(treeLook(isWithered(tree(50, 100 * HOUR)))).toEqual({ grayscale: true, sways: false, ambience: false })
  })
})

describe('on the farm (the real tree markup)', () => {
  const plot = (percent: number, withered: boolean): FarmPlotView => ({
    id: `deck-${percent}`,
    slug: `tree-${percent}`,
    title: `Tree ${percent}`,
    treeType: 'oak',
    masteryPercent: percent,
    itemCount: 12,
    masteredCount: 0,
    mightyRoots: 0,
    needsWater: true,
    wateredDay: null,
    isOwner: true,
    withered,
  })

  async function render(p: FarmPlotView): Promise<string> {
    const { PlotButton } = await import('../components/FarmTree')
    return renderToStaticMarkup(createElement(PlotButton, { geometry: { x: 300, y: 300 }, plot: p, animate: false, phase: 0, onOpen: () => undefined }))
  }

  it('draws an inactive stage 4 tree fully coloured and swaying', async () => {
    // The farm page asks the same rule: stage 4 is never withered.
    const html = await render(plot(80, isWithered(tree(80, 100 * HOUR))))
    expect(html).toContain('mg-tree-sway')
    expect(html).toContain('data-vitality="lively"')
    expect(html).not.toContain('grayscale')
    expect(html).not.toContain('mg-withered')
  })

  it('draws a withered stage 2 tree grey and still', async () => {
    const html = await render(plot(30, isWithered(tree(30, 100 * HOUR))))
    expect(html).toContain('mg-withered')
    expect(html).toContain('data-vitality="withered"')
    expect(html).toContain('grayscale(1)')
    expect(html).not.toContain('mg-tree-sway')
    expect(html).toContain('withered: practise it to bring it back')
  })
})

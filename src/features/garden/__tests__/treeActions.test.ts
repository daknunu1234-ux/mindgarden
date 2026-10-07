import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MIN_ZOOM } from '@/shared/lib/camera'
import { treeScale } from '@/shared/lib/treeSkins'
import { ACTION_SCALE, ICON_SIZE, PlotLabels, treeActions } from '../components/FarmTree'
import { crownTopY } from '../lib/crownTop'
import { ACTION_GAP, plotSprite } from '../lib/plotSprite'
import type { FarmPlotView } from '../types'

// The only icons over a tree on the island: 💧 water and 🍎 harvest, in one cluster just above the
// crown, each shown only when there is something to do.

const plot: FarmPlotView = {
  id: 'deck-1',
  slug: 'sinh-hoc',
  title: 'Sinh học',
  treeType: 'oak',
  masteryPercent: 100,
  itemCount: 12,
  masteredCount: 3,
  mightyRoots: 12,
  isOwner: true,
  needsWater: true,
  wateredDay: null,
  fruitReady: true,
  buff: 1.8,
}
const render = (p: FarmPlotView, harvest = true) =>
  renderToStaticMarkup(createElement(PlotLabels, { geometry: { x: 300, y: 300 }, plot: p, onOpen: () => undefined, onHarvest: harvest ? () => undefined : undefined }))

describe('treeActions: which icons a tree shows', () => {
  it('💧 when the owner has not practised it today (and it has statements); 🍎 when its fruit is ripe', () => {
    expect(treeActions(plot, true)).toEqual({ water: { href: '/deck/sinh-hoc/drill' }, harvest: true })
    expect(treeActions({ ...plot, needsWater: false }, true).water).toBeNull()
    expect(treeActions({ ...plot, needsWater: null }, true).water).toBeNull()
    expect(treeActions({ ...plot, itemCount: 0 }, true).water).toBeNull()
    expect(treeActions({ ...plot, fruitReady: false }, true).harvest).toBe(false)
    // No harvest handler (e.g. no progress wiring): no 🍎.
    expect(treeActions(plot, false).harvest).toBe(false)
  })

  it('waters in review mode when every statement is already 5/5', () => {
    expect(treeActions({ ...plot, masteredCount: 12 }, true).water).toEqual({ href: '/deck/sinh-hoc/drill?review=1' })
  })

  it("never shows them on someone else's tree", () => {
    expect(treeActions({ ...plot, isOwner: false }, true)).toEqual({ water: null, harvest: false })
  })
})

describe('the icons on the island', () => {
  const html = render(plot)

  it('shows only the two action icons: no percentage, buff, level chip or mastered sparkle', () => {
    expect(html).toContain('data-icon="water"')
    expect(html).toContain('data-icon="fruit"')
    expect(html).not.toContain('data-icon="mastered"')
    // Visible text only (the harvest icon's tooltip says what it pays).
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/\d+%|×1\.8|\+2/)
  })

  it('clusters them side by side, centred on the trunk, resting on the tip of this tree’s own crown', () => {
    const cluster = /<div data-tree-actions="true" class="([^"]*)" style="([^"]*)">/.exec(html)
    expect(cluster).not.toBeNull()
    const [, classes, style] = cluster!
    for (const cls of ['flex', 'items-end', '-translate-x-1/2', '-translate-y-full']) expect(classes.split(' '), cls).toContain(cls)
    // An oak at 100% (stage 5) with 12 statements: its own crown top, the icons' bottom 2 px into it.
    const expected = plotSprite(300, 300, treeScale('oak', 12), crownTopY('oak', 5))
    expect(style).toBe(`left:${expected.actions.x}px;top:${expected.actions.y}px`)
    expect(expected.actions.y - expected.treeTop).toBe(-ACTION_GAP)
    // A sprout of the same species: the icons come down with its (much lower) crown.
    const sprout = /data-tree-actions="true"[^>]*style="left:300px;top:([-\d.]+)px"/.exec(render({ ...plot, masteryPercent: 5 }))
    expect(Number(sprout![1])).toBeCloseTo(plotSprite(300, 300, treeScale('oak', 12), crownTopY('oak', 1)).actions.y, 5)
    expect(Number(sprout![1])).toBeGreaterThan(expected.actions.y + 80)
    // Water first, then harvest, in one bobbing row.
    expect(html.indexOf('data-icon="water"')).toBeLessThan(html.indexOf('data-icon="fruit"'))
    // Cluster → zoom counter-scale (anchored at its bottom: it stays on the crown) → one bobbing row.
    expect(html).toMatch(/data-tree-actions[^>]*>\s*<div class="origin-bottom \[transform:scale\(clamp\(1,var\(--mg-inv-zoom,1\),3\)\)\]">\s*<div class="mg-bob flex items-end gap-1">/)
  })

  it('makes them compact (26 px beads, 15 px glyphs inside the rim) and tactile: grow and glow on hover', () => {
    expect(html).toMatch(/<a [^>]*href="\/deck\/sinh-hoc\/drill"/)
    expect(html).toMatch(/<button type="button"[^>]*title="Harvest: \+2 🪙"/)
    const icons = html.match(/class="pointer-events-auto flex size-\[26px\][^"]*"/g) ?? []
    expect(icons).toHaveLength(2)
    expect(ICON_SIZE).toBe(26)
    for (const icon of icons) {
      for (const cls of ['shrink-0', 'overflow-hidden', 'rounded-full', 'border-2', 'hover:scale-110']) expect(icon.split(/[\s"]/), cls).toContain(cls)
      expect(icon).toMatch(/hover:shadow-\[[^\]]*0_0_10px/)
    }
    // Vector glyphs (no emoji text to blur), 15 px: inside 26 px minus the 2 px border on each side.
    expect(html.match(/<svg[^>]*data-icon="(water|fruit)"[^>]*>/g)?.every((svg) => svg.includes('width="15"') && svg.includes('height="15"'))).toBe(true)
  })

  it('stays tappable when zoomed out: at the farthest zoom an icon is still about 27 px on screen', () => {
    const cap = Number(/clamp\(1,var\(--mg-inv-zoom,1\),(\d+(?:\.\d+)?)\)/.exec(ACTION_SCALE)![1])
    expect(ICON_SIZE * MIN_ZOOM * cap).toBeGreaterThanOrEqual(24)
    // Never shrinks below the bead's own size (zoomed in, it is the compact 26 px bead).
    expect(ACTION_SCALE).toContain('clamp(1,')
  })

  it('shows nothing above a tree with nothing to do', () => {
    const calm = render({ ...plot, needsWater: false, fruitReady: false })
    expect(calm).not.toContain('data-tree-actions')
    expect(render(plot, false)).not.toContain('data-icon="fruit"')
    expect(render({ ...plot, fruitReady: false })).toContain('data-icon="water"')
  })
})

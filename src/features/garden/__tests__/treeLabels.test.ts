import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/hooks/usePrefetchOnIntent', () => ({ usePrefetchOnIntent: () => ({}) }))

import { TreeLabelsToggle } from '../components/FarmHud'
import { PlotLabels, TREE_LABEL } from '../components/FarmTree'
import {
  parseShowAllTreeLabels,
  readShowAllTreeLabels,
  SHOW_ALL_TREE_LABELS_DEFAULT,
  TREE_LABELS_HOVER_CLASS,
  TREE_LABELS_KEY,
  treeLabelsModeClass,
  treeLabelsToggleTitle,
  writeShowAllTreeLabels,
} from '../lib/treeLabels'
import { PLOT_HALF_H } from '../lib/farmLayout'
import { plotSprite } from '../lib/plotSprite'
import type { FarmPlotView } from '../types'

// A stand-in for localStorage.
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('the "show all tree labels" preference', () => {
  it('is off by default: a clean island, labels on hover', () => {
    expect(SHOW_ALL_TREE_LABELS_DEFAULT).toBe(false)
    expect(readShowAllTreeLabels(fakeStorage())).toBe(false)
    expect(parseShowAllTreeLabels(null)).toBe(false)
    expect(parseShowAllTreeLabels(undefined)).toBe(false)
    // A corrupted value falls back to the default instead of turning labels on.
    for (const junk of ['', '1', 'yes', 'TRUE', '{"a":1}']) expect(parseShowAllTreeLabels(junk), junk).toBe(false)
  })

  it('remembers the choice across reloads, in both directions', () => {
    const store = fakeStorage()
    expect(writeShowAllTreeLabels(store, true)).toBe(true)
    expect(store.data.get(TREE_LABELS_KEY)).toBe('true')
    // "Reload": a fresh read from the same storage.
    expect(readShowAllTreeLabels(store)).toBe(true)
    expect(writeShowAllTreeLabels(store, false)).toBe(true)
    expect(store.data.get(TREE_LABELS_KEY)).toBe('false')
    expect(readShowAllTreeLabels(store)).toBe(false)
  })

  it('reads a saved choice written by an earlier visit', () => {
    expect(readShowAllTreeLabels(fakeStorage({ [TREE_LABELS_KEY]: 'true' }))).toBe(true)
    expect(readShowAllTreeLabels(fakeStorage({ [TREE_LABELS_KEY]: 'false' }))).toBe(false)
    // Another key never counts.
    expect(readShowAllTreeLabels(fakeStorage({ showAllTreeLabels: 'true' }))).toBe(false)
  })

  it('survives missing or blocked storage (server render, private mode)', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readShowAllTreeLabels(null)).toBe(false)
    expect(readShowAllTreeLabels(blocked)).toBe(false)
    expect(writeShowAllTreeLabels(null, true)).toBe(false)
    expect(writeShowAllTreeLabels(blocked, true)).toBe(false)
  })
})

describe('the toggle button', () => {
  const render = (showAll: boolean) => renderToStaticMarkup(createElement(TreeLabelsToggle, { showAll, onToggle: () => undefined }))

  it('says what pressing it will do, and reports its state', () => {
    expect(treeLabelsToggleTitle(true)).toBe('Hide labels (hover only)')
    expect(treeLabelsToggleTitle(false)).toBe('Show all labels & progress')
    const on = render(true)
    expect(on).toContain('aria-pressed="true"')
    expect(on).toContain('title="Hide labels (hover only)"')
    const off = render(false)
    expect(off).toContain('aria-pressed="false"')
    expect(off).toContain('title="Show all labels &amp; progress"')
    expect(off).toContain('aria-label="Show all labels &amp; progress"')
    // A real button that takes clicks inside the click-through HUD overlay.
    expect(off).toMatch(/^<button/)
    expect(off).toContain('pointer-events-auto')
  })
})

describe('label visibility on the farm', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
  const plot: FarmPlotView = {
    id: 'deck-1',
    slug: 'sinh-hoc',
    title: 'Sinh học Tế bào',
    treeType: 'oak',
    masteryPercent: 42,
    itemCount: 12,
    masteredCount: 2,
    mightyRoots: 0,
    isOwner: true,
    needsWater: true,
    wateredDay: null,
    fruitReady: true,
  } as FarmPlotView
  const labels = renderToStaticMarkup(createElement(PlotLabels, { geometry: { x: 300, y: 300 }, plot, onOpen: () => undefined, onHarvest: () => undefined }))

  it('hover mode is one class on the farm root; all-labels mode adds none', () => {
    expect(treeLabelsModeClass(false)).toBe(TREE_LABELS_HOVER_CLASS)
    expect(treeLabelsModeClass(true)).toBeUndefined()
    expect(TREE_LABELS_HOVER_CLASS).toBe('mg-labels-hover')
  })

  it('merges the name and the progress into one compact capsule, the only label', () => {
    expect(TREE_LABEL).toBe('mg-tree-label')
    expect((labels.match(/mg-tree-label/g) ?? []).length).toBe(1)
    const capsule = /<span class="(mg-tree-label [^"]*)" style="([^"]*)">([\s\S]*)<\/span><\/div>$/.exec(labels)
    expect(capsule).not.toBeNull()
    const [, classes, style, inner] = capsule!
    // One line: [ emoji  name • 42% ].
    expect(inner.replace(/<[^>]+>/g, '')).toBe('🪴Sinh học Tế bào•42%')
    // A single row, 18 px tall, small type, a dark see-through pill; no backdrop blur (it repeats per tile).
    for (const cls of ['flex', 'items-center', 'h-[18px]', 'text-[11px]', 'whitespace-nowrap', 'rounded-full', 'bg-black/55', 'border-white/10', 'text-white']) expect(classes.split(' '), cls).toContain(cls)
    expect(classes).not.toMatch(/flex-col|backdrop-blur/)
    // A long name is cut off instead of growing the capsule.
    expect(classes).toContain('max-w-[156px]')
    expect(inner).toContain('class="truncate"')
    // Anchored at the tree's base: centred on the trunk, at the tile's front edge.
    const at = plotSprite(300, 300, 1).label
    expect(style).toBe(`left:${at.x}px;top:${at.y}px`)
    expect(classes).toContain('-translate-x-1/2')
    // The 💧 and 🍎 bubbles are prompts: never hidden by the toggle.
    expect(labels).toContain('data-icon="water"')
    expect(labels).toContain('data-icon="fruit"')
    expect(labels).not.toMatch(/mg-tree-label[^"]*mg-bob/)
    // The labels layer is the element the CSS reaches from the tree's wrapper.
    expect(labels).toMatch(/^<div aria-hidden="true" class="mg-plot-labels /)
  })

  it('sits at the base of the tree for every size, under the crown and clear of its bubbles', () => {
    for (const scale of [0.85, 1, 1.18, 1.35, 1.35 * 1.18]) {
      const { label, thirsty, mighty, treeTop } = plotSprite(300, 300, scale)
      // Centred on the trunk, just below the ground point, inside the tile's front half.
      expect(label.x).toBe(300)
      expect(label.y).toBeGreaterThan(300)
      expect(label.y - 300).toBeLessThan(PLOT_HALF_H)
      // The 💧 / 🍎 / ✨ bubbles ride above the crown: far above the capsule (18 px tall).
      expect(label.y - thirsty.y).toBeGreaterThan(60)
      expect(label.y - mighty.y).toBeGreaterThan(60)
      expect(label.y).toBeGreaterThan(treeTop)
    }
    // The same spot whatever the tree's size: it hugs the tile, not the crown.
    expect(plotSprite(300, 300, 0.85).label).toEqual(plotSprite(300, 300, 1.6).label)
  })

  it('turns the percentage gold from the golden-bloom threshold', () => {
    const golden = renderToStaticMarkup(createElement(PlotLabels, { geometry: { x: 0, y: 0 }, plot: { ...plot, masteryPercent: 95, needsWater: false, fruitReady: false }, onOpen: () => undefined }))
    expect(golden).toMatch(/text-yellow-300[^>]*>95%/)
    expect(golden).toContain('border-yellow-300/60')
    expect(labels).toMatch(/text-emerald-300[^>]*>42%/)
  })

  it('hides labels only in hover mode: with all labels on, no rule hides them', () => {
    const hidden = /\.mg-labels-hover \.mg-tree-label \{([^}]*)\}/.exec(css)
    expect(hidden).not.toBeNull()
    expect(hidden![1]).toMatch(/opacity: 0;/)
    expect(hidden![1]).toMatch(/pointer-events: none;/)
    // Every rule that hides a label is scoped to hover mode.
    for (const [rule] of css.matchAll(/[^{}]*\.mg-tree-label[^{}]*\{[^}]*opacity: 0;[^}]*\}/g)) expect(rule).toContain('.mg-labels-hover')
  })

  it('reveals the labels of the tree that is hovered, focused or tapped, and keeps them while pointed at', () => {
    const shown = /((?:\.mg-labels-hover [^{]*,\s*)*\.mg-labels-hover [^{]*)\{\s*opacity: 1;\s*transform: none;\s*pointer-events: auto;\s*\}/.exec(css)
    expect(shown).not.toBeNull()
    const selectors = shown![1].split(',').map((s) => s.trim())
    expect(selectors).toEqual([
      '.mg-labels-hover .mg-plot:hover + .mg-plot-labels .mg-tree-label',
      '.mg-labels-hover .mg-plot:focus-within + .mg-plot-labels .mg-tree-label',
      '.mg-labels-hover .mg-plot-labels .mg-tree-label:hover',
    ])
  })

  it('fades and rises in with opacity / transform transitions', () => {
    const base = /\n\.mg-tree-label \{([^}]*)\}/.exec(css)
    expect(base).not.toBeNull()
    expect(base![1]).toMatch(/transition: opacity [^;]*, transform /)
    expect(/\.mg-labels-hover \.mg-tree-label \{[^}]*transform: translateY\(6px\) scale\(0\.94\);/.test(css)).toBe(true)
  })

  it('puts the tree wrapper right before its labels layer in the grid, as the CSS needs', () => {
    const grid = readFileSync(join(__dirname, '..', 'components', 'FarmIsometricGrid.tsx'), 'utf8')
    expect(grid).toMatch(/className="mg-plot contents">\s*<PlotButton[^>]*\/>\s*<\/div>\s*<PlotLabels/)
  })
})

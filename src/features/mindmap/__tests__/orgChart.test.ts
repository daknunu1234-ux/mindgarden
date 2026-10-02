import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { seededRandom } from '@/shared/utils/seededRandom'
import { RootChart } from '../components/RootChart'
import { cameraTransform, clampPan, clampZoom, DRAG_THRESHOLD, fitCamera, groundScreenY, MAX_ZOOM, MIN_ZOOM, panBy, wheelZoom, zoomAround, zoomPercent } from '../hooks/chartCamera'
import { CHART, layoutRootTree, ROOT_STATUS_LABEL, rootStatus, subRootCount, taprootPath, tendrilPath, type ChartCard } from '../hooks/orgChartLayout'
import type { RootNodeView } from '../types'

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({ id, title: id, items: items.map((i) => ({ id: i })), children })

// cell ─┬─ i1, i2 ; nucleus ── i3 ; nucleus ─ dna ── i4 ; cell ─ ribo ── i6
// energy ── i5 ; empty (no statements)
const TREE = [node('cell', ['i1', 'i2'], [node('nucleus', ['i3'], [node('dna', ['i4'])]), node('ribo', ['i6'])]), node('energy', ['i5']), node('empty')]

// Random but deterministic trees for the no-overlap property.
function randomTree(seed: string, width: number, depth: number): RootNodeView[] {
  const random = seededRandom(seed)
  let n = 0
  const make = (d: number): RootNodeView => node(`n${n++}`, [], d < depth ? Array.from({ length: Math.floor(random() * 4) }, () => make(d + 1)) : [])
  return Array.from({ length: width }, () => make(1))
}
const overlaps = (a: ChartCard, b: ChartCard) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutRootTree', () => {
  const layout = layoutRootTree(TREE)
  const card = (id: string) => layout.cards.find((c) => c.nodeId === id)!

  it('lays out every root and sub-root, tier by tier, and never a statement', () => {
    expect(layout.cards.map((c) => `${c.depth}:${c.nodeId}`)).toEqual(['0:cell', '1:nucleus', '2:dna', '1:ribo', '0:energy', '0:empty'])
    expect(layout.cards.map((c) => c.parentId)).toEqual([null, 'cell', 'nucleus', 'cell', null, null])
    expect(layout.tiers).toBe(3)
    // Statements are not part of the chart at all.
    expect(layout.cards.some((c) => c.nodeId.startsWith('i'))).toBe(false)
  })

  it('stands the tree free at the top, its trunk on the centre line and its foot on the ground', () => {
    // The whole drawing box (crown included) is inside the chart, so fitting the chart never clips it.
    expect(layout.tree).toEqual({ x: layout.width / 2 - CHART.tree.size / 2, y: CHART.pad, w: CHART.tree.size, h: CHART.tree.size })
    expect(layout.tree.y).toBeGreaterThanOrEqual(0)
    // The trunk's foot: half-way across the drawing, nine tenths down. The ground runs through it.
    expect(layout.base).toEqual({ x: layout.width / 2, y: CHART.pad + CHART.tree.size * 0.9 })
    // The label floats beside the trunk, above the ground, clear of the taproot and inside the chart.
    expect(layout.label.x).toBe(layout.base.x + CHART.label.dx)
    expect(layout.label.y + layout.label.h).toBeLessThan(layout.base.y)
    expect(layout.label.x + layout.label.w).toBeLessThanOrEqual(layout.width - CHART.pad)
    expect(layout.label.x).toBeGreaterThan(layout.taproot.x + 11)
  })

  it('drops a taproot from the foot of the trunk, and hangs each tier one row lower', () => {
    expect(layout.taproot).toMatchObject({ x: layout.base.x, y1: layout.base.y, y2: layout.base.y + CHART.taproot })
    expect(layout.taproot.path).toBe(taprootPath(layout.base.x, layout.base.y, layout.base.y + CHART.taproot))
    // A closed, tapering shape: wide at the trunk, narrow where it branches.
    expect(taprootPath(100, 50, 84)).toBe('M 89 47 C 89 68.7, 95.5 68.7, 95.5 84 L 104.5 84 C 104.5 68.7, 111 68.7, 111 47 Z')
    expect(card('cell').y).toBe(card('energy').y)
    expect(card('cell').y).toBe(layout.taproot.y2 + CHART.gapY)
    // Every card is under the ground.
    for (const c of layout.cards) expect(c.y).toBeGreaterThan(layout.base.y)
    expect(card('nucleus').y).toBe(card('cell').y + CHART.card.h + CHART.gapY)
    expect(card('nucleus').y).toBe(card('ribo').y)
    expect(card('dna').y).toBe(card('nucleus').y + CHART.card.h + CHART.gapY)
    // Top-level roots keep their order, left to right.
    expect(card('cell').x).toBeLessThan(card('energy').x)
    expect(card('energy').x).toBeLessThan(card('empty').x)
  })

  it('centres every root over its own sub-roots', () => {
    const mid = (id: string) => card(id).x + card(id).w / 2
    expect(mid('cell')).toBeCloseTo((mid('nucleus') + mid('ribo')) / 2, 6)
    expect(mid('nucleus')).toBeCloseTo(mid('dna'), 6)
  })

  it('never overlaps two cards and keeps them all inside the chart, for any tree shape', () => {
    for (let s = 0; s < 30; s++) {
      const l = layoutRootTree(randomTree(`tree${s}`, 1 + (s % 6), 1 + (s % 4)))
      for (let i = 0; i < l.cards.length; i++) {
        for (let j = i + 1; j < l.cards.length; j++) expect(overlaps(l.cards[i], l.cards[j]), `seed ${s}: ${l.cards[i].nodeId} vs ${l.cards[j].nodeId}`).toBe(false)
        expect(l.cards[i].x).toBeGreaterThanOrEqual(CHART.pad - 1e-9)
        expect(l.cards[i].x + l.cards[i].w).toBeLessThanOrEqual(l.width - CHART.pad + 1e-9)
        expect(l.cards[i].y + l.cards[i].h).toBeLessThanOrEqual(l.height - CHART.pad + 1e-9)
      }
    }
  })

  it('keeps the spacing tight: neighbours a small gap apart, tiers one curve apart', () => {
    const flat = layoutRootTree([node('a'), node('b'), node('c')])
    expect(flat.cards[1].x - (flat.cards[0].x + flat.cards[0].w)).toBe(CHART.gapX)
    expect(flat.width).toBe(3 * CHART.card.w + 2 * CHART.gapX + CHART.pad * 2)
    expect(CHART.gapX).toBeLessThanOrEqual(24)
    expect(CHART.gapY).toBeLessThanOrEqual(56)
  })

  it('joins every card to its parent (top-level roots to the tree) with one smooth curve', () => {
    expect(layout.edges).toHaveLength(layout.cards.length)
    expect(layout.edges.map((e) => `${e.from ?? 'tree'}>${e.to}`)).toEqual(['tree>cell', 'cell>nucleus', 'nucleus>dna', 'cell>ribo', 'tree>energy', 'tree>empty'])
    for (const e of layout.edges) {
      const child = card(e.to)
      // From the parent's foot (bottom centre) to the child's head (top centre).
      expect([e.x2, e.y2]).toEqual([child.x + child.w / 2, child.y])
      // Top-level roots are fed by the taproot's end, right under the trunk: not by a card or a box.
      const from = e.from ? { x: card(e.from).x + card(e.from).w / 2, y: card(e.from).y + card(e.from).h } : { x: layout.taproot.x, y: layout.taproot.y2 }
      expect([e.x1, e.y1]).toEqual([from.x, from.y])
      expect(e.path).toBe(tendrilPath(e.x1, e.y1, e.x2, e.y2))
      // A cubic Bezier: leaves straight down and arrives straight down (control points share the ends' x).
      expect(e.path).toMatch(/^M [-\d.]+ [-\d.]+ C [-\d.]+ [-\d.]+, [-\d.]+ [-\d.]+, [-\d.]+ [-\d.]+$/)
    }
    expect(tendrilPath(10, 0, 50, 100)).toBe('M 10 0 C 10 55, 50 45, 50 100')
  })

  it('handles an empty tree and is deterministic', () => {
    const none = layoutRootTree([])
    expect(none).toMatchObject({ cards: [], edges: [], tiers: 0 })
    // The tree, its foot and a little soil under it.
    expect(none.height).toBe(none.base.y + CHART.taproot + CHART.gapY + CHART.pad)
    expect(none.width).toBe((CHART.label.dx + CHART.label.w) * 2 + CHART.pad * 2)
    expect(none.base.x).toBe(none.width / 2)
    expect(layoutRootTree(TREE)).toEqual(layoutRootTree(TREE))
  })
})

describe('root status badge', () => {
  it('names how far a root has come', () => {
    expect(rootStatus(null)).toBe('empty')
    expect(rootStatus(0)).toBe('seed')
    expect(rootStatus(0.4)).toBe('growing')
    expect(rootStatus(3.2)).toBe('growing')
    expect(rootStatus(3.4)).toBe('thriving')
    expect(rootStatus(4.9)).toBe('thriving')
    expect(rootStatus(5)).toBe('mighty')
    expect(Object.values(ROOT_STATUS_LABEL)).toEqual(['No statements', 'Seed', 'Growing', 'Thriving', 'Mighty Root'])
  })

  it('counts the roots under a root at any depth', () => {
    expect(subRootCount(TREE[0])).toBe(3)
    expect(subRootCount(TREE[1])).toBe(0)
  })
})

describe('chart camera', () => {
  const view = { w: 800, h: 600 }
  const world = { w: 1600, h: 900 }

  it('zooms between 50% and 180%', () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.5, 1.8])
    expect(clampZoom(0.1)).toBe(0.5)
    expect(clampZoom(5)).toBe(1.8)
    expect(clampZoom(1.2)).toBe(1.2)
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(zoomPercent(0.5)).toBe(50)
    expect(zoomPercent(1.8)).toBe(180)
  })

  it('is one translate3d + scale transform', () => {
    expect(cameraTransform({ x: 12.345, y: -7, k: 1.25 })).toBe('translate3d(12.35px, -7.00px, 0) scale(1.2500)')
  })

  it('keeps the point under the cursor still while zooming', () => {
    const before = { x: -100, y: -40, k: 1 }
    const anchor = { x: 300, y: 200 }
    const worldPoint = { x: (anchor.x - before.x) / before.k, y: (anchor.y - before.y) / before.k }
    for (const k of [0.6, 1.4, 1.8]) {
      const after = zoomAround(before, anchor, k, view, world)
      expect(after.k).toBe(k)
      expect(worldPoint.x * after.k + after.x).toBeCloseTo(anchor.x, 6)
      expect(worldPoint.y * after.k + after.y).toBeCloseTo(anchor.y, 6)
    }
    // Past the limits it stops at them; at a limit nothing moves.
    expect(zoomAround(before, anchor, 9, view, world).k).toBe(1.8)
    const atMax = { x: 0, y: 0, k: 1.8 }
    expect(zoomAround(atMax, anchor, 3, view, world)).toBe(atMax)
  })

  it('pans freely in both directions but never loses the chart', () => {
    const start = { x: 0, y: 0, k: 1 }
    expect(panBy(start, -120, -80, view, world)).toEqual({ x: -120, y: -80, k: 1 })
    expect(panBy(start, 60, 45, view, world)).toEqual({ x: 60, y: 45, k: 1 })
    // Dragged far away, part of the chart stays in the frame on every side.
    const farLeft = panBy(start, -99_999, 0, view, world)
    expect(farLeft.x + world.w * farLeft.k).toBeGreaterThan(0)
    const farRight = panBy(start, 99_999, 0, view, world)
    expect(farRight.x).toBeLessThan(view.w)
    const farUp = panBy(start, 0, -99_999, view, world)
    expect(farUp.y + world.h * farUp.k).toBeGreaterThan(0)
    const farDown = panBy(start, 0, 99_999, view, world)
    expect(farDown.y).toBeLessThan(view.h)
    expect(clampPan(start, { w: 0, h: 0 }, world)).toBe(start)
  })

  it('fits the whole chart on screen, centred, never above 100% or below 50%', () => {
    const chart = { w: 1400, h: 900 }
    const fit = fitCamera(view, chart)
    expect(fit.k).toBeCloseTo((800 - 48) / 1400, 6)
    expect(fit.x + (chart.w * fit.k) / 2).toBeCloseTo(view.w / 2, 6)
    expect(fit.y).toBeGreaterThanOrEqual(0)
    expect(fit.y + chart.h * fit.k).toBeLessThanOrEqual(view.h)
    // A small chart is shown at 100%, centred both ways.
    const small = fitCamera(view, { w: 400, h: 300 })
    expect(small).toEqual({ k: 1, x: 200, y: 150 })
    // A huge one stops at 50% and starts from its top (the tree node).
    const huge = fitCamera(view, { w: 9000, h: 4000 })
    expect(huge.k).toBe(0.5)
    expect(huge.y).toBeGreaterThan(0)
    expect(fitCamera({ w: 0, h: 0 }, world)).toEqual({ x: 0, y: 0, k: 1 })
  })

  it('turns the wheel into a smooth zoom: up zooms in, down zooms out, clamped', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1)
    expect(wheelZoom(1, 100)).toBeLessThan(1)
    expect(wheelZoom(1, -100) * wheelZoom(1, 100)).toBeCloseTo(1, 6)
    expect(wheelZoom(1.8, -500)).toBe(1.8)
    expect(wheelZoom(0.5, 500)).toBe(0.5)
    expect(DRAG_THRESHOLD).toBe(6)
  })

  it('frames the whole diorama: the crown at the top is never clipped by fit to screen', () => {
    for (const tree of [[], TREE, [node('a'), node('b'), node('c'), node('d'), node('e'), node('f')]]) {
      const l = layoutRootTree(tree)
      const fit = fitCamera(view, { w: l.width, h: l.height })
      // The top of the tree's drawing box lands inside the frame, with the trunk on screen too.
      expect(l.tree.y * fit.k + fit.y).toBeGreaterThanOrEqual(0)
      expect(l.tree.x * fit.k + fit.x).toBeGreaterThanOrEqual(0)
      expect((l.tree.x + l.tree.w) * fit.k + fit.x).toBeLessThanOrEqual(view.w)
      expect(groundScreenY(fit, l.base.y)).toBeLessThanOrEqual(view.h)
    }
    // The ground line follows the camera: world y × zoom + offset.
    expect(groundScreenY({ x: 5, y: 40, k: 0.5 }, 230)).toBe(155)
  })
})

describe('RootChart', () => {
  const levels = { i1: 5, i2: 5, i3: 2, i4: 0, i5: 4, i6: 5 }
  const render = (props: object = {}) => renderToStaticMarkup(createElement(RootChart, { nodes: TREE, levels, treeType: 'oak', title: 'Sinh học Tế bào', ...props }))
  const html = render()

  it('draws every tier of roots as compact cards, and no statement cards', () => {
    expect([...html.matchAll(/data-root-card="([^"]+)" data-depth="(\d)"/g)].map((m) => `${m[2]}:${m[1]}`)).toEqual(['0:cell', '1:nucleus', '2:dna', '1:ribo', '0:energy', '0:empty'])
    // Statements only show as a count on their root's card.
    expect(html).not.toMatch(/data-root-card="i\d"/)
    expect(html).not.toContain('Statement 1')
    expect(html).toContain('📜 2 · 🌿 2 sub-roots')
    expect(html).toContain('aria-label="Sub-root nucleus: Growing"')
    // The label names the tree; the toolbar counts everything under it.
    expect(html).toContain('Sinh học Tế bào')
    expect(html).toContain('6 roots · 6 statements')
  })

  it('gives every card a status badge, a progress ring and a way to its statements', () => {
    expect([...html.matchAll(/data-status="([a-z]+)"/g)].map((m) => m[1])).toEqual(['mighty', 'growing', 'seed', 'mighty', 'thriving', 'empty'])
    expect((html.match(/aria-label="View the statements of /g) ?? []).length).toBe(6)
    expect(html).toContain('aria-label="Open nucleus: 1 statement"')
    // One mastery ring per card, plus the tree's own.
    expect((html.match(/viewBox="0 0 32 32"/g) ?? []).length).toBe(7)
  })

  it('joins the tiers with curving tendrils, thinner with every tier', () => {
    expect([...html.matchAll(/data-edge="([^"]+)" data-edge-from="([^"]+)"/g)].map((m) => `${m[2]}>${m[1]}`)).toEqual(['tree>cell', 'cell>nucleus', 'nucleus>dna', 'cell>ribo', 'tree>energy', 'tree>empty'])
    // The wood stroke of each tendril (the one without an opacity).
    const curves = [...html.matchAll(/<path d="(M [^"]+)" stroke="[^"]+" stroke-width="([\d.]+)"><\/path>/g)]
    expect(curves.length).toBe(6)
    for (const [, d] of curves) expect(d).toContain(' C ')
    const widths = curves.map((c) => Number(c[2]))
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(html).not.toMatch(/<filter|feGaussianBlur/)
  })

  it('lets the tree stand free: no box round it, swaying about its foot, with a floating label', () => {
    const sprite = createElement('svg', { 'data-sprite': 'tree' })
    const withTree = render({ surface: { content: sprite, base: { x: 0.5, y: 0.9 } }, stageLabel: '🌳 Mature Canopy' })
    const l = layoutRootTree(TREE)
    // The drawing sits in a plain, unstyled box of its own size: no border, no background, no shadow.
    const tree = /<div data-chart-tree="true" class="([^"]*)" style="([^"]*)">/.exec(withTree)!
    expect(tree[1]).toBe('pointer-events-none absolute')
    expect(tree[2]).toBe(`left:${l.tree.x}px;top:${l.tree.y}px;width:${l.tree.w}px;height:${l.tree.h}px`)
    expect(withTree).not.toContain('data-chart-top')
    // It sways with the farm's idle motion, about the foot of the trunk.
    expect(withTree).toMatch(/<div class="mg-tree-sway size-full" style="transform-origin:50% 90%"><svg data-sprite="tree">/)
    // Title, stage and mastery float beside the trunk in one small capsule.
    const label = /<div data-chart-label="true" class="([^"]*)" style="([^"]*)">([\s\S]*?)<\/div>/.exec(withTree)!
    expect(label[1]).toContain('rounded-full')
    expect(label[2]).toContain(`left:${l.label.x}px;top:${l.label.y}px`)
    expect(label[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Sinh học Tế bào 🌳 Mature Canopy · mastery 3.5/5')
    // Without a drawing there is still a label, and no empty box.
    expect(html).not.toContain('data-chart-tree')
    expect(html).toContain('data-chart-label')
  })

  it('sprouts the roots from the trunk: a soil ring, a taproot, then tendrils into the soil', () => {
    const l = layoutRootTree(TREE)
    expect(html).toContain('data-root-ring')
    // The taproot is a filled, tapering shape starting at the trunk's foot.
    expect(html).toMatch(new RegExp(`<g data-taproot="true"><path d="${l.taproot.path.replace(/[.]/g, '\\.')}"`))
    // Every top-level tendril starts where the taproot ends.
    const starts = [...html.matchAll(/data-edge-from="tree"><path d="M ([\d.]+) ([\d.]+) /g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(starts).toHaveLength(3)
    for (const start of starts) expect(start).toEqual([l.taproot.x, l.taproot.y2])
    // The frame paints sky and soil round the ground line, which follows the camera.
    expect(html).toMatch(/class="mg-chart-ground /)
    const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
    expect(css).toMatch(/\.mg-chart-ground \{[\s\S]*?var\(--mg-ground\)/)
    const hook = readFileSync(join(__dirname, '..', 'hooks', 'useChartCamera.ts'), 'utf8')
    expect(hook).toContain("style.setProperty('--mg-ground'")
    // An empty tree has no taproot: nothing to feed yet.
    expect(render({ nodes: [] })).not.toContain('data-taproot')
  })

  it('has the canvas controls in the corner and a chart moved by one transform', () => {
    for (const label of ['Zoom out', 'Zoom in', 'Fit to screen']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('aria-label="Zoom 100%"')
    expect(html).toMatch(/role="toolbar" aria-label="Canvas view" class="absolute top-3 right-3/)
    // The frame clips and takes the gestures; the chart inside is the transformed layer.
    expect(html).toMatch(/aria-label="Tree and its roots" class="[^"]*touch-none[^"]*overflow-hidden/)
    const l = layoutRootTree(TREE)
    expect(html).toMatch(new RegExp(`data-chart-world="true" class="[^"]*origin-top-left[^"]*will-change-transform[^"]*" style="width:${l.width}px;height:${l.height}px"`))
    // The hook writes translate3d + scale straight to that element, once per frame.
    const hook = readFileSync(join(__dirname, '..', 'hooks', 'useChartCamera.ts'), 'utf8')
    expect(hook).toContain('worldRef.current.style.transform = cameraTransform(camera.current)')
    expect(hook).toContain('requestAnimationFrame')
    // A drag swallows the click that ends it, so cards and buttons never fire by accident.
    expect(hook).toMatch(/onClickCapture[\s\S]*suppressClick\.current[\s\S]*stopPropagation/)
  })

  it('shows practice and owner tools only when the page passes them', () => {
    // Read-only visitor: no drill buttons, no owner tools, no Add root.
    expect(html).not.toMatch(/Drill the root|Compete on the root|Tools for root|Add root/)
    const owner = render({
      practice: { mode: 'drill', onPractice: () => undefined },
      ownerTools: { onEditStatement: () => undefined, onDeleteStatement: () => undefined, onEditRoot: () => undefined, onDeleteRoot: () => undefined },
      onManage: () => undefined,
      onAddRoot: () => undefined,
    })
    // Rounds start from top-level roots that have statements: cell and energy, not empty, not sub-roots.
    expect([...owner.matchAll(/aria-label="Drill the root ([a-z]+)"/g)].map((m) => m[1])).toEqual(['cell', 'energy'])
    // Every root and sub-root gets the owner's tools.
    expect((owner.match(/aria-label="Tools for root /g) ?? []).length).toBe(6)
    for (const tool of ['Edit root dna', 'Delete root dna', 'Manage dna: add statements and sub-branches']) expect(owner).toContain(tool)
    expect(owner).toContain('Add root')
    expect(render({ practice: { mode: 'compete', onPractice: () => undefined } })).toContain('Compete on the root cell')
  })

  it('shows the empty hint under the tree when there are no roots', () => {
    const empty = render({ nodes: [], emptyLabel: 'No roots yet.' })
    expect(empty).toContain('No roots yet.')
    expect(empty).not.toContain('data-root-card')
    expect(empty).toContain('0 roots · 0 statements')
  })
})

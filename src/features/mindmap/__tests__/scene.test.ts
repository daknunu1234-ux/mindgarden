import { describe, expect, it } from 'vitest'
import { layoutMindmap } from '../hooks/mindmapLayout'
import { conduitPath, groundPath, rootStroke, SCENE_SIDE_MARGIN, sceneGeometry, type SurfaceBox } from '../hooks/scene'
import type { RootNodeView } from '../types'

const node = (id: string, children: RootNodeView[] = []): RootNodeView => ({ id, title: id, items: [{ id: `${id}-i` }], children })
const TREE = [node('a', [node('a1'), node('a2')]), node('b'), node('c')]
const TREE_BOX: SurfaceBox = { width: 176, height: 176, baseX: 88, baseY: 158 }
const COLORS = { bark: '#8b5a2b', glow: '#a3e635', gold: '#eab308' }

describe('sceneGeometry', () => {
  const layout = layoutMindmap(TREE)

  it('puts the tree base exactly on the trunk point at the ground line', () => {
    const g = sceneGeometry(layout, TREE_BOX)
    expect(g.surface!.left + TREE_BOX.baseX).toBe(g.trunkX)
    expect(g.surface!.top + TREE_BOX.baseY).toBe(g.groundY)
    expect(g.trunkX).toBe(g.offsetX + layout.trunk.x)
  })

  it('has a fixed size, independent of viewport and zoom, with soil past the roots on both sides', () => {
    const g = sceneGeometry(layout, TREE_BOX)
    expect(g.width).toBe(layout.width + SCENE_SIDE_MARGIN * 2)
    expect(g.offsetX).toBe(SCENE_SIDE_MARGIN)
    expect(sceneGeometry(layout, TREE_BOX)).toEqual(g)
  })

  it('keeps the tree anchored for any tree size and margin', () => {
    for (const t of [[], [node('x')], TREE, [...TREE, node('d'), node('e'), node('f')]]) {
      for (const margin of [0, 100, SCENE_SIDE_MARGIN]) {
        const g = sceneGeometry(layoutMindmap(t), TREE_BOX, margin)
        expect(g.surface!.left + TREE_BOX.baseX).toBeCloseTo(g.trunkX)
        expect(g.surface!.top + TREE_BOX.baseY).toBe(g.groundY)
        expect(g.offsetX).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gives the camera a focus box around the tree and the roots', () => {
    const g = sceneGeometry(layout, TREE_BOX)
    expect(g.focus.x).toBeLessThanOrEqual(g.offsetX)
    expect(g.focus.x + g.focus.w).toBeGreaterThanOrEqual(g.offsetX + layout.width)
    expect(g.focus.y).toBe(g.surface!.top)
    expect(g.focus.y + g.focus.h).toBe(g.height)
  })

  it('still draws ground and soil for a tree without roots', () => {
    const g = sceneGeometry(layoutMindmap([]), TREE_BOX)
    expect(g.height).toBeGreaterThan(g.groundY)
  })
})

describe('rootStroke', () => {
  it('follows 0.35 + 0.65 × mastery / 3 for opacity', () => {
    expect(rootStroke(0, COLORS).opacity).toBeCloseTo(0.35)
    expect(rootStroke(1.5, COLORS).opacity).toBeCloseTo(0.675)
    expect(rootStroke(3, COLORS).opacity).toBeCloseTo(1)
    expect(rootStroke(null, COLORS).opacity).toBeCloseTo(0.35)
  })

  it('stays plain wood below 2/3, glows in the skin color from 2/3, and turns gold at 3/3', () => {
    expect(rootStroke(1, COLORS)).toMatchObject({ from: COLORS.bark, to: COLORS.bark, glow: 'none' })
    expect(rootStroke(2, COLORS)).toMatchObject({ from: COLORS.bark, to: COLORS.glow, glow: 'soft' })
    expect(rootStroke(3, COLORS)).toMatchObject({ from: COLORS.bark, to: COLORS.gold, glow: 'gold' })
  })

  it('brightens and thickens a highlighted path', () => {
    expect(rootStroke(0, COLORS, true)).toMatchObject({ opacity: 1, width: 4 })
  })
})

describe('paths', () => {
  it('draws a closed, tapered conduit from the ground to the crown', () => {
    const d = conduitPath(100, 150, 40)
    expect(d.startsWith('M 91 148')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('96.5 190')
  })

  it('draws a ground line that spans the whole width', () => {
    const d = groundPath(640, 150)
    expect(d.startsWith('M 0 150')).toBe(true)
    expect(d.trim().endsWith('640 150')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { conduitPath, groundPath, rootStroke, sceneGeometry, type SurfaceBox } from '../hooks/scene'
import { layoutRoots } from '../hooks/useRootLayout'
import type { RootNodeView } from '../types'

const node = (id: string, children: RootNodeView[] = []): RootNodeView => ({ id, title: id, items: [], children })
const TREE = [node('a', [node('a1'), node('a2')]), node('b')]
const TREE_BOX: SurfaceBox = { width: 150, height: 150, baseX: 75, baseY: 135 }
const COLORS = { bark: '#8b5a2b', glow: '#a3e635', gold: '#eab308' }

describe('sceneGeometry', () => {
  const layout = layoutRoots(TREE)

  it('puts the tree base exactly on the trunk point at the ground line', () => {
    const g = sceneGeometry(layout, TREE_BOX, 900, 1)
    expect(g.surface!.left + TREE_BOX.baseX).toBe(g.trunkX)
    expect(g.surface!.top + TREE_BOX.baseY).toBe(g.groundY)
    expect(g.trunkX).toBe(g.offsetX + layout.trunk.x)
  })

  it('keeps the tree anchored to the trunk at every zoom and viewport width', () => {
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5]) {
      for (const viewport of [0, 320, 900, 2000]) {
        const g = sceneGeometry(layout, TREE_BOX, viewport, zoom)
        expect(g.surface!.left + TREE_BOX.baseX).toBeCloseTo(g.trunkX)
        expect(g.surface!.top + TREE_BOX.baseY).toBe(g.groundY)
        // The root layout is never cut off.
        expect(g.offsetX).toBeGreaterThanOrEqual(0)
        expect(g.width).toBeGreaterThanOrEqual(layout.width)
      }
    }
  })

  it('fills the viewport at the current zoom so the soil runs edge to edge', () => {
    expect(sceneGeometry(layout, TREE_BOX, 2000, 1).width).toBe(2000)
    expect(sceneGeometry(layout, TREE_BOX, 2000, 0.5).width).toBe(4000)
  })

  it('centers the roots when the canvas is wider than they are', () => {
    const g = sceneGeometry(layout, TREE_BOX, 2000, 1)
    expect(g.offsetX).toBe((2000 - layout.width) / 2)
  })

  it('still draws ground and soil for a tree without roots', () => {
    const g = sceneGeometry(layoutRoots([]), TREE_BOX, 600, 1)
    expect(g.height).toBeGreaterThan(g.groundY)
    expect(g.surface!.left + TREE_BOX.baseX).toBe(g.trunkX)
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

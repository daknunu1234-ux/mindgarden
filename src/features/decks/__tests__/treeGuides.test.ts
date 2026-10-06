import { describe, expect, it } from 'vitest'
import { treeGuides, type TreeGuide } from '../lib/treeGuides'

// The guides drawn as text, one line per row: what the Workshop shows with lines and elbows.
function draw(levels: number[], labels: string[]): string[] {
  return treeGuides(levels).map((g: TreeGuide, i) => {
    const cols = g.through.map((t) => (t ? '│  ' : '   ')).join('')
    const elbow = g.elbow === 'tee' ? '├─ ' : g.elbow === 'last' ? '└─ ' : ''
    return `${cols}${elbow}${labels[i]}${g.stem ? ' ┐' : ''}`
  })
}

describe('treeGuides', () => {
  it('1 → 1.1 → 1.1.1: L-shaped and T-shaped branches, through-lines where a branch continues', () => {
    expect(
      draw(
        [0, 1, 2, 3, 2, 1, 2],
        ['1 (root)', '1.1 (sub-root)', '1.1.1 (statement)', '1.1.1.1 (sub-statement)', '1.1.2 (statement)', '1.2 (statement)', '1.2.1 (sub-statement)'],
      ),
    ).toEqual([
      '1 (root) ┐',
      '├─ 1.1 (sub-root) ┐',
      '│  ├─ 1.1.1 (statement) ┐',
      '│  │  └─ 1.1.1.1 (sub-statement)',
      '│  └─ 1.1.2 (statement)',
      '└─ 1.2 (statement) ┐',
      '   └─ 1.2.1 (sub-statement)',
    ])
  })

  it('a collapsed node (its branch left out) gets no stem and closes cleanly', () => {
    // 1.1 collapsed: its children are not in the list.
    expect(draw([0, 1, 1], ['1', '1.1 (collapsed)', '1.2'])).toEqual(['1 ┐', '├─ 1.1 (collapsed)', '└─ 1.2'])
  })

  it('a last child deep down leaves no dangling line in the columns it closes', () => {
    const guides = treeGuides([0, 1, 2, 3, 1])
    expect(guides[3]).toEqual({ through: [true, false], elbow: 'last', stem: false })
    expect(guides[2]).toEqual({ through: [true], elbow: 'last', stem: true })
    expect(guides[4]).toEqual({ through: [], elbow: 'last', stem: false })
  })

  it('every line at level n has n − 1 columns and an elbow; nothing for the top line or an empty list', () => {
    const levels = [0, 1, 1, 2, 3, 3, 2, 1]
    treeGuides(levels).forEach((g, i) => {
      expect(g.through).toHaveLength(Math.max(0, levels[i] - 1))
      expect(g.elbow === null).toBe(levels[i] === 0)
    })
    expect(treeGuides([])).toEqual([])
  })
})

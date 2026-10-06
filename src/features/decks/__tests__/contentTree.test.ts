import { describe, expect, it } from 'vitest'
import {
  branchCounts,
  branchEnd,
  editRow,
  indentRow,
  indentSlot,
  insertIndex,
  insertRow,
  moveRow,
  outlineRows,
  removeRow,
  toDeckTree,
  toEditorNodes,
  toggleRow,
  type StoredNode,
} from '../lib/contentTree'
import type { ContentRow } from '../types'

// One tree's outline as content nodes (lib/contentTree.ts): the reader that turns stored rows into
// the outline, the root views derived from it, and every in-place edit.

// cell (root): s1 (statement) ─ s1a (statement) ─ s1aa (statement)
//              s2
//              nucleus (root): n1
//                 dna (root)
//              membrane (root)
//                 m1 ─ wall (a root under a statement)
//                         w1
// energy (root): e1
const STORED: StoredNode[] = [
  // Out of order on purpose: sort_order decides (then created_at, then id).
  { id: 'energy', parentId: null, type: 'root', content: 'Năng lượng', sortOrder: 2 },
  { id: 'cell', parentId: null, type: 'root', content: 'Tế bào', sortOrder: 1 },
  { id: 'membrane', parentId: 'cell', type: 'root', content: 'Màng', sortOrder: 4 },
  { id: 's2', parentId: 'cell', type: 'statement', content: 'Tế bào có màng.', sortOrder: 2 },
  { id: 's1', parentId: 'cell', type: 'statement', content: 'Ty thể', sortOrder: 1 },
  { id: 'nucleus', parentId: 'cell', type: 'root', content: 'Nhân', sortOrder: 3 },
  { id: 's1a', parentId: 's1', type: 'statement', content: 'sản sinh ATP', sortOrder: 1 },
  { id: 's1aa', parentId: 's1a', type: 'statement', content: 'qua hô hấp tế bào', sortOrder: 1 },
  { id: 'n1', parentId: 'nucleus', type: 'statement', content: 'Nhân chứa DNA.', sortOrder: 1 },
  { id: 'dna', parentId: 'nucleus', type: 'root', content: 'DNA', sortOrder: 2 },
  { id: 'm1', parentId: 'membrane', type: 'statement', content: 'Màng bán thấm.', sortOrder: 1 },
  { id: 'wall', parentId: 'm1', type: 'root', content: 'Thành', sortOrder: 1 },
  { id: 'w1', parentId: 'wall', type: 'statement', content: 'Thành tế bào thực vật.', sortOrder: 1 },
  { id: 'e1', parentId: 'energy', type: 'statement', content: 'ATP là năng lượng.', sortOrder: 1 },
]
const ROWS = outlineRows(STORED)
const order = (rows: readonly ContentRow[]) => rows.map((r) => r.id)
const levels = (rows: readonly ContentRow[]) => Object.fromEntries(rows.map((r) => [r.id, [r.parentId, r.depth]]))

describe('outlineRows: stored nodes → the outline the Workshop draws', () => {
  it('each node, then its branch, children by sort_order, with depths', () => {
    expect(ROWS.map((r) => [r.id, r.depth])).toEqual([
      ['cell', 0],
      ['s1', 1],
      ['s1a', 2],
      ['s1aa', 3],
      ['s2', 1],
      ['nucleus', 1],
      ['n1', 2],
      ['dna', 2],
      ['membrane', 1],
      ['m1', 2],
      ['wall', 3],
      ['w1', 4],
      ['energy', 0],
      ['e1', 1],
    ])
  })

  it('breaks sort_order ties by insert time, then id; leaves out a node whose parent is missing', () => {
    const rows = outlineRows([
      { id: 'r', parentId: null, type: 'root', content: 'R', sortOrder: 1 },
      { id: 'b', parentId: 'r', type: 'statement', content: 'B', sortOrder: 1, createdAt: '2026-10-02' },
      { id: 'a', parentId: 'r', type: 'statement', content: 'A', sortOrder: 1, createdAt: '2026-10-01' },
      { id: 'lost', parentId: 'gone', type: 'statement', content: 'L', sortOrder: 1 },
    ])
    expect(order(rows)).toEqual(['r', 'a', 'b'])
  })
})

describe('the root views (lists, dialogs, the mindmap)', () => {
  it('toEditorNodes: roots with depth = roots above; items = statements whose nearest root it is', () => {
    const nodes = toEditorNodes(ROWS)
    expect(nodes.map((n) => [n.id, n.depth])).toEqual([
      ['cell', 0],
      ['nucleus', 1],
      ['dna', 2],
      ['membrane', 1],
      ['wall', 2],
      ['energy', 0],
    ])
    expect(nodes[0].items.map((i) => [i.id, i.parentId, i.depth])).toEqual([
      ['s1', null, 0],
      ['s1a', 's1', 1],
      ['s1aa', 's1a', 2],
      ['s2', null, 0],
    ])
    // A root under a statement belongs to the nearest root above the statement.
    expect(nodes.find((n) => n.id === 'membrane')!.items.map((i) => i.id)).toEqual(['m1'])
    expect(nodes.find((n) => n.id === 'wall')!.items.map((i) => i.id)).toEqual(['w1'])
    expect(nodes[0].items[0]).toMatchObject({ statement: 'Ty thể', drillable: true })
  })

  it('toDeckTree: roots nested by nearest root, siblings numbered in order, items carry the root title', () => {
    const tree = toDeckTree(ROWS)
    expect(tree.map((n) => [n.id, n.sortOrder])).toEqual([
      ['cell', 0],
      ['energy', 1],
    ])
    expect(tree[0].children.map((n) => n.id)).toEqual(['nucleus', 'membrane'])
    expect(tree[0].children[1].children.map((n) => n.id)).toEqual(['wall'])
    expect(tree[1].items).toEqual([{ id: 'e1', prompt: 'Năng lượng', parentId: null, depth: 0 }])
  })

  it('branchCounts: what a delete takes along', () => {
    expect(branchCounts(ROWS, 'cell')).toEqual({ statements: 7, roots: 4 })
    expect(branchCounts(ROWS, 's1')).toEqual({ statements: 2, roots: 0 })
    expect(branchCounts(ROWS, 'membrane')).toEqual({ statements: 2, roots: 1 })
    expect(branchCounts(ROWS, 'nope')).toEqual({ statements: 0, roots: 0 })
  })
})

describe('adding, editing, deleting, moving', () => {
  it('a new node goes right after a sibling’s branch, else at the end of its parent’s branch', () => {
    expect(insertIndex(ROWS, 'cell', 's1')).toBe(order(ROWS).indexOf('s2'))
    expect(insertIndex(ROWS, 'cell', null)).toBe(order(ROWS).indexOf('energy'))
    expect(insertIndex(ROWS, null, null)).toBe(ROWS.length)
    const added = insertRow(ROWS, { id: 'x', parentId: 'cell', type: 'statement', content: 'X' }, 's1') as ContentRow[]
    expect(order(added).slice(0, 6)).toEqual(['cell', 's1', 's1a', 's1aa', 'x', 's2'])
    expect(added.find((r) => r.id === 'x')!.depth).toBe(1)
    expect(insertRow(ROWS, { id: 'y', parentId: null, type: 'statement', content: 'Y' })).toMatch(/top-level/)
    expect(insertRow(ROWS, { id: 'cell', parentId: null, type: 'root', content: 'again' })).toEqual(ROWS)
  })

  it('edits text in place; deletes a node with its whole branch', () => {
    expect(editRow(ROWS, 's2', 'Mới.').find((r) => r.id === 's2')!.content).toBe('Mới.')
    expect(order(removeRow(ROWS, 'membrane'))).not.toEqual(expect.arrayContaining(['membrane', 'm1', 'wall', 'w1']))
    expect(removeRow(ROWS, 'membrane')).toHaveLength(ROWS.length - 4)
  })

  it('moves a node with its branch under another root, last, depths following', () => {
    const moved = moveRow(ROWS, 's1', 'energy') as ContentRow[]
    expect(order(moved).slice(-4)).toEqual(['e1', 's1', 's1a', 's1aa'])
    expect(levels(moved)).toMatchObject({ s1: ['energy', 1], s1a: ['s1', 2], s1aa: ['s1a', 3] })
    expect(moveRow(ROWS, 'membrane', 'wall')).toMatch(/own branch/)
    expect(moved).toHaveLength(ROWS.length)
  })
})

describe('Tab / Shift+Tab: in place, the outline order never changes', () => {
  it('Tab: the row becomes the last child of the row above at its level', () => {
    const next = indentRow(ROWS, 's2', 'in') as ContentRow[]
    expect(order(next)).toEqual(order(ROWS))
    expect(levels(next)).toMatchObject({ s2: ['s1', 2] })
    // A root nests under a statement just as well (any node under any node).
    expect(levels(indentRow(ROWS, 'nucleus', 'in') as ContentRow[])).toMatchObject({ nucleus: ['s2', 2], n1: ['nucleus', 3], dna: ['nucleus', 3] })
    expect(indentRow(ROWS, 's1', 'in')).toMatch(/Nothing above/)
    expect(indentRow(ROWS, 'cell', 'in')).toMatch(/Nothing above/)
  })

  it('Shift+Tab: up a level right below its old parent; the rows below it become its children', () => {
    // s1a has nothing below it under s1: it just moves up.
    const out = indentRow(ROWS, 's1a', 'out') as ContentRow[]
    expect(order(out)).toEqual(order(ROWS))
    expect(levels(out)).toMatchObject({ s1a: ['cell', 1], s1aa: ['s1a', 2], s2: ['cell', 1] })
    // nucleus has membrane below it under cell: membrane becomes its child.
    const nucleusOut = indentRow(ROWS, 'nucleus', 'out') as ContentRow[]
    expect(order(nucleusOut)).toEqual(order(ROWS))
    expect(levels(nucleusOut)).toMatchObject({ nucleus: [null, 0], n1: ['nucleus', 1], membrane: ['nucleus', 1], w1: ['wall', 4] })
  })

  it('Shift+Tab refuses what would leave a statement at the top, and a top-level root', () => {
    expect(indentRow(ROWS, 's1', 'out')).toMatch(/top-level node is a root/)
    expect(indentRow(ROWS, 'cell', 'out')).toMatch(/Already a top-level root/)
  })

  it('every possible Tab and Shift+Tab, on every row, keeps the rendered order and the row count', () => {
    let moves = 0
    for (const dir of ['in', 'out'] as const) {
      for (const r of ROWS) {
        const next = indentRow(ROWS, r.id, dir)
        if (typeof next === 'string') continue
        moves++
        expect(order(next), `${dir} ${r.id}`).toEqual(order(ROWS))
        expect(next).toHaveLength(ROWS.length)
        // Depths always follow the parents (a parent always above its children, one level up).
        for (const row of next) if (row.parentId) expect(row.depth).toBe(next.find((p) => p.id === row.parentId)!.depth + 1)
      }
    }
    expect(moves).toBeGreaterThan(10)
  })

  it('Tab then Shift+Tab on the last child puts it back', () => {
    const tab = indentRow(ROWS, 's2', 'in') as ContentRow[]
    expect(indentRow(tab, 's2', 'out')).toEqual(ROWS)
  })

  it('branchEnd: the index just past a row’s branch', () => {
    expect(branchEnd(ROWS, 0)).toBe(order(ROWS).indexOf('energy'))
    expect(branchEnd(ROWS, order(ROWS).indexOf('s1'))).toBe(order(ROWS).indexOf('s2'))
  })
})

describe('a new line (nothing saved yet)', () => {
  it('Tab nests it under the row above; Shift+Tab moves it out only from the end of its siblings', () => {
    expect(indentSlot(ROWS, { parentId: 'cell', afterId: 's2', type: 'statement' }, 'in')).toEqual({ parentId: 's2', afterId: null, type: 'statement' })
    expect(indentSlot(ROWS, { parentId: 'cell', afterId: null, type: 'statement' }, 'in')).toEqual({ parentId: 'membrane', afterId: null, type: 'statement' })
    expect(indentSlot(ROWS, { parentId: 'dna', afterId: null, type: 'statement' }, 'in')).toBeNull()
    // Last under s1a: out, right below s1a.
    expect(indentSlot(ROWS, { parentId: 's1a', afterId: 's1aa', type: 'statement' }, 'out')).toEqual({ parentId: 's1', afterId: 's1a', type: 'statement' })
    // In the middle of nucleus's children: it would jump below dna, so it stays.
    expect(indentSlot(ROWS, { parentId: 'nucleus', afterId: 'n1', type: 'statement' }, 'out')).toBeNull()
    // A statement line can't reach the top level; a root line can.
    expect(indentSlot(ROWS, { parentId: 'energy', afterId: 'e1', type: 'statement' }, 'out')).toBeNull()
    expect(indentSlot(ROWS, { parentId: 'energy', afterId: 'e1', type: 'root' }, 'out')).toEqual({ parentId: null, afterId: 'energy', type: 'root' })
  })

  it('Alt flips its type in place (toggleRow does the same for a saved row)', () => {
    expect(typeof toggleRow(ROWS, 's2')).not.toBe('string')
    expect((toggleRow(ROWS, 's2') as ContentRow[]).find((r) => r.id === 's2')!.type).toBe('root')
  })
})

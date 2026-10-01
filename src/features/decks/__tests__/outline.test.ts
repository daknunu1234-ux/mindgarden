import { describe, expect, it } from 'vitest'
import {
  expandPath,
  hiddenCount,
  isWithin,
  nestEditorNodes,
  nextOutlineSlot,
  outlineKey,
  outlineParents,
  resolveOutlineSlot,
  rootSummaries,
  slotTarget,
  topRootOf,
  type OutlineSlot,
} from '../lib/outline'
import type { EditorNode } from '../types'

const item = (id: string) => ({ id, statement: `${id} là đúng.`, drillable: true })
// cell (i1, i2) ─┬─ nucleus (i3) ── dna
//                └─ membrane
// energy (i4)
const NODES: EditorNode[] = [
  { id: 'cell', title: 'Tế bào', depth: 0, items: [item('i1'), item('i2')] },
  { id: 'nucleus', title: 'Nhân', depth: 1, items: [item('i3')] },
  { id: 'dna', title: 'DNA', depth: 2, items: [] },
  { id: 'membrane', title: 'Màng', depth: 1, items: [] },
  { id: 'energy', title: 'Năng lượng', depth: 0, items: [item('i4')] },
]
const parents = outlineParents(NODES)

describe('nestEditorNodes', () => {
  it('turns the flat tree-order list back into nested roots', () => {
    const tree = nestEditorNodes(NODES)
    expect(tree.map((r) => r.id)).toEqual(['cell', 'energy'])
    expect(tree[0].children.map((c) => c.id)).toEqual(['nucleus', 'membrane'])
    expect(tree[0].children[0].children.map((c) => c.id)).toEqual(['dna'])
    expect(tree[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
  })

  it('never loses a node when depths jump', () => {
    const tree = nestEditorNodes([
      { id: 'a', title: 'A', depth: 0, items: [] },
      { id: 'b', title: 'B', depth: 3, items: [] },
    ])
    expect(tree[0].children.map((c) => c.id)).toEqual(['b'])
    expect(nestEditorNodes([])).toEqual([])
  })
})

describe('root selector and parents', () => {
  it('summarises each top-level root with its whole branch', () => {
    expect(rootSummaries(NODES)).toEqual([
      { id: 'cell', title: 'Tế bào', statementCount: 3, subRootCount: 3 },
      { id: 'energy', title: 'Năng lượng', statementCount: 1, subRootCount: 0 },
    ])
  })

  it('knows parents and the top-level root of any node', () => {
    expect(parents.get('cell')).toBeNull()
    expect(parents.get('dna')).toBe('nucleus')
    expect(topRootOf('dna', parents)).toBe('cell')
    expect(topRootOf('energy', parents)).toBe('energy')
    expect(topRootOf('gone', parents)).toBeNull()
  })
})

describe('outlineKey', () => {
  it('maps Enter, Tab and Shift+Tab and ignores other keys', () => {
    expect(outlineKey({ key: 'Enter', shiftKey: false })).toBe('enter')
    expect(outlineKey({ key: 'Tab', shiftKey: false })).toBe('tab')
    expect(outlineKey({ key: 'Tab', shiftKey: true })).toBe('shift-tab')
    expect(outlineKey({ key: 'Enter', shiftKey: true })).toBeNull()
    expect(outlineKey({ key: 'x', shiftKey: false })).toBeNull()
  })

  it('waits while an IME composes (Vietnamese Telex / VNI)', () => {
    expect(outlineKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBeNull()
  })
})

describe('nextOutlineSlot', () => {
  const root: OutlineSlot = { kind: 'root' }
  const sub: OutlineSlot = { kind: 'branch', parentId: 'nucleus' }
  const statement: OutlineSlot = { kind: 'statement', nodeId: 'nucleus' }

  it('Enter makes a sibling; Enter on an empty line closes', () => {
    for (const slot of [root, sub, statement]) {
      expect(nextOutlineSlot(slot, 'enter', true, null, parents)).toBe(slot)
      expect(nextOutlineSlot(slot, 'enter', false, null, parents)).toBeNull()
    }
  })

  it('Tab makes a child: statements under the root just typed, a sub-root from a statement', () => {
    expect(nextOutlineSlot(root, 'tab', true, 'new', parents)).toEqual({ kind: 'statement', nodeId: 'new' })
    expect(nextOutlineSlot(sub, 'tab', true, 'new-sub', parents)).toEqual({ kind: 'statement', nodeId: 'new-sub' })
    expect(nextOutlineSlot(statement, 'tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'nucleus' })
    expect(nextOutlineSlot(root, 'tab', false, null, parents)).toBe(root)
  })

  it('Shift+Tab goes up a level', () => {
    expect(nextOutlineSlot(statement, 'shift-tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'cell' })
    expect(nextOutlineSlot(sub, 'shift-tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'cell' })
    expect(nextOutlineSlot({ kind: 'branch', parentId: 'cell' }, 'shift-tab', false, null, parents)).toEqual(root)
    expect(nextOutlineSlot(root, 'shift-tab', false, null, parents)).toBe(root)
    expect(nextOutlineSlot({ kind: 'statement', nodeId: 'gone' }, 'shift-tab', false, null, parents)).toBeNull()
  })

  it('types a root, its statements and a sub-root without the mouse', () => {
    let slot: OutlineSlot | null = root
    slot = nextOutlineSlot(slot, 'tab', true, 'A', parents)
    expect(slot).toEqual({ kind: 'statement', nodeId: 'A' })
    slot = nextOutlineSlot(slot!, 'enter', true, null, parents)
    expect(slot).toEqual({ kind: 'statement', nodeId: 'A' })
    slot = nextOutlineSlot(slot!, 'tab', false, null, parents)
    expect(slot).toEqual({ kind: 'branch', parentId: 'A' })
  })
})

describe('resolveOutlineSlot', () => {
  const saved = (id: string) => (id === 'pending-node-1' ? 'r9' : id)
  it('follows a root from its temp id to its real id', () => {
    expect(resolveOutlineSlot({ kind: 'statement', nodeId: 'pending-node-1' }, saved)).toEqual({ kind: 'statement', nodeId: 'r9' })
    expect(resolveOutlineSlot({ kind: 'branch', parentId: 'pending-node-1' }, saved)).toEqual({ kind: 'branch', parentId: 'r9' })
    const same: OutlineSlot = { kind: 'statement', nodeId: 'cell' }
    expect(resolveOutlineSlot(same, saved)).toBe(same)
  })
})

describe('collapse / expand', () => {
  const tree = nestEditorNodes(NODES)

  it('counts everything a collapsed node hides, at any depth', () => {
    expect(hiddenCount(tree[0])).toEqual({ statements: 3, subRoots: 3, total: 6 })
    expect(hiddenCount(tree[0].children[0])).toEqual({ statements: 1, subRoots: 1, total: 2 })
    expect(hiddenCount(tree[1])).toEqual({ statements: 1, subRoots: 0, total: 1 })
  })

  it('knows what lies inside a branch', () => {
    expect(isWithin('dna', 'cell', parents)).toBe(true)
    expect(isWithin('nucleus', 'nucleus', parents)).toBe(true)
    expect(isWithin('membrane', 'nucleus', parents)).toBe(false)
    expect(isWithin('energy', 'cell', parents)).toBe(false)
  })

  it('expands a node and every node above it, so an input under it shows', () => {
    const collapsed = new Set(['cell', 'nucleus', 'energy'])
    expect([...expandPath(collapsed, 'dna', parents)]).toEqual(['energy'])
    expect([...expandPath(collapsed, 'membrane', parents)].sort()).toEqual(['energy', 'nucleus'])
    expect(collapsed.size).toBe(3)
  })

  it('keeps the same set when nothing on the path was collapsed (no re-render)', () => {
    const collapsed = new Set(['energy'])
    expect(expandPath(collapsed, 'dna', parents)).toBe(collapsed)
    // A root typed a moment ago isn't in the parent index yet: nothing to expand.
    expect(expandPath(collapsed, 'pending-node-1', parents)).toBe(collapsed)
  })

  it('names the node a slot types under', () => {
    expect(slotTarget({ kind: 'root' })).toBeNull()
    expect(slotTarget({ kind: 'branch', parentId: 'cell' })).toBe('cell')
    expect(slotTarget({ kind: 'statement', nodeId: 'dna' })).toBe('dna')
  })
})

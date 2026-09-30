import { describe, expect, it } from 'vitest'
import { seededRandom } from '@/shared/utils/seededRandom'
import { CARD, DRAFT_KEY, layoutMindmap, nodeKey, type MindmapCard, type MindmapDraftSlot } from '../hooks/mindmapLayout'
import { nextQuickSlot, parentIndex, quickAddKey, quickAddPrompt, resolveSlot } from '../hooks/quickAdd'
import type { RootNodeView } from '../types'

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({
  id,
  title: id,
  items: items.map((i) => ({ id: i, prompt: id })),
  children,
})

// cell ─┬─ i1, i2
//       └─ nucleus ── i3 ; nucleus ─ dna
// energy
const TREE = [node('cell', ['i1', 'i2'], [node('nucleus', ['i3'], [node('dna')])]), node('energy')]
const parents = parentIndex(TREE)

describe('quickAddKey', () => {
  it('maps Enter, Tab and Shift+Tab, and ignores everything else', () => {
    expect(quickAddKey({ key: 'Enter', shiftKey: false })).toBe('enter')
    expect(quickAddKey({ key: 'Tab', shiftKey: false })).toBe('tab')
    expect(quickAddKey({ key: 'Tab', shiftKey: true })).toBe('shift-tab')
    expect(quickAddKey({ key: 'Enter', shiftKey: true })).toBeNull()
    expect(quickAddKey({ key: 'a', shiftKey: false })).toBeNull()
  })

  it('leaves keys alone while an IME is composing (Vietnamese Telex / VNI)', () => {
    expect(quickAddKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBeNull()
    expect(quickAddKey({ key: 'Tab', shiftKey: false, isComposing: true })).toBeNull()
  })
})

describe('parentIndex', () => {
  it('knows every node’s parent, null at the top level', () => {
    expect(parents.get('cell')).toBeNull()
    expect(parents.get('nucleus')).toBe('cell')
    expect(parents.get('dna')).toBe('nucleus')
    expect(parents.get('missing')).toBeUndefined()
  })
})

describe('nextQuickSlot', () => {
  const root: MindmapDraftSlot = { kind: 'root' }
  const branch: MindmapDraftSlot = { kind: 'branch', parentId: 'nucleus' }
  const statement: MindmapDraftSlot = { kind: 'statement', nodeId: 'nucleus' }

  it('Enter keeps typing siblings, and closes on an empty line', () => {
    for (const slot of [root, branch, statement]) {
      expect(nextQuickSlot(slot, 'enter', true, null, parents)).toEqual(slot)
      expect(nextQuickSlot(slot, 'enter', false, null, parents)).toBeNull()
    }
  })

  it('Tab nests: statements under the root just typed, a sub-root from a statement line', () => {
    expect(nextQuickSlot(root, 'tab', true, 'new-root', parents)).toEqual({ kind: 'statement', nodeId: 'new-root' })
    expect(nextQuickSlot(branch, 'tab', true, 'new-sub', parents)).toEqual({ kind: 'statement', nodeId: 'new-sub' })
    expect(nextQuickSlot(statement, 'tab', true, null, parents)).toEqual({ kind: 'branch', parentId: 'nucleus' })
    expect(nextQuickSlot(statement, 'tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'nucleus' })
    // Nothing typed on a root line: nothing to nest under, the input stays.
    expect(nextQuickSlot(root, 'tab', false, null, parents)).toEqual(root)
  })

  it('Shift+Tab goes up a level', () => {
    // A statement under nucleus → a new sibling of nucleus (a sub-root of cell).
    expect(nextQuickSlot(statement, 'shift-tab', true, null, parents)).toEqual({ kind: 'branch', parentId: 'cell' })
    // A sub-root of nucleus → a sibling of nucleus; a sub-root of a top-level root → a new root.
    expect(nextQuickSlot(branch, 'shift-tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'cell' })
    expect(nextQuickSlot({ kind: 'branch', parentId: 'cell' }, 'shift-tab', false, null, parents)).toEqual(root)
    expect(nextQuickSlot({ kind: 'statement', nodeId: 'energy' }, 'shift-tab', false, null, parents)).toEqual(root)
    // Already at the top.
    expect(nextQuickSlot(root, 'shift-tab', false, null, parents)).toEqual(root)
    // An unknown node closes the input.
    expect(nextQuickSlot({ kind: 'statement', nodeId: 'gone' }, 'shift-tab', false, null, parents)).toBeNull()
  })

  it('types a whole outline without the mouse', () => {
    // Root "A" ↵ Tab → statement under A; statement ↵ → another; Tab → sub-root of A; Shift+Tab → root level.
    let slot: MindmapDraftSlot | null = { kind: 'root' }
    slot = nextQuickSlot(slot, 'tab', true, 'A', parents)
    expect(slot).toEqual({ kind: 'statement', nodeId: 'A' })
    slot = nextQuickSlot(slot!, 'enter', true, null, parents)
    expect(slot).toEqual({ kind: 'statement', nodeId: 'A' })
    slot = nextQuickSlot(slot!, 'tab', false, null, parents)
    expect(slot).toEqual({ kind: 'branch', parentId: 'A' })
    const withA = parentIndex([...TREE, node('A')])
    slot = nextQuickSlot(slot!, 'shift-tab', false, null, withA)
    expect(slot).toEqual({ kind: 'root' })
  })
})

describe('quickAddPrompt', () => {
  it('names the kind and where it goes', () => {
    expect(quickAddPrompt({ kind: 'root' }, () => undefined).placeholder).toBe('New root…')
    expect(quickAddPrompt({ kind: 'statement', nodeId: 'cell' }, (id) => (id === 'cell' ? 'Tế bào' : undefined)).label).toBe('New statement under Tế bào')
    expect(quickAddPrompt({ kind: 'branch', parentId: 'x' }, () => undefined).label).toBe('New sub-root under this root')
  })
})

describe('layoutMindmap with a quick-add input', () => {
  const overlaps = (a: MindmapCard, b: MindmapCard) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const draftOf = (slot: MindmapDraftSlot) => {
    const l = layoutMindmap(TREE, new Set(), slot)
    return { l, draft: l.cards.find((c) => c.key === DRAFT_KEY), card: (key: string) => l.cards.find((c) => c.key === key)! }
  }

  it('lays nothing extra out without a draft', () => {
    expect(layoutMindmap(TREE).cards.some((c) => c.kind === 'draft')).toBe(false)
  })

  it('puts a statement input after the root’s statements, before its sub-roots, sized like a statement', () => {
    const { draft, card } = draftOf({ kind: 'statement', nodeId: 'cell' })
    expect(draft).toMatchObject({ kind: 'draft', parentKey: nodeKey('cell'), w: CARD.statement.w, h: CARD.statement.h })
    expect(draft!.y).toBeGreaterThan(card('i:i2').y)
    expect(draft!.y).toBeLessThan(card(nodeKey('nucleus')).y)
    expect(draft!.x).toBe(card('i:i2').x)
  })

  it('puts a sub-root input at the end of the branch, sized like a sub-root', () => {
    const { draft, card } = draftOf({ kind: 'branch', parentId: 'nucleus' })
    expect(draft).toMatchObject({ parentKey: nodeKey('nucleus'), w: CARD.branch.w, h: CARD.branch.h })
    expect(draft!.x).toBe(card(nodeKey('dna')).x)
    expect(draft!.y).toBeGreaterThan(card(nodeKey('dna')).y)
  })

  it('puts a new root in its own column at the end of the row, on a line from the crown, without moving the crown', () => {
    const { l, draft, card } = draftOf({ kind: 'root' })
    expect(draft).toMatchObject({ parentKey: null, w: CARD.category.w, h: CARD.category.h, y: card(nodeKey('energy')).y })
    expect(draft!.x).toBeGreaterThan(card(nodeKey('energy')).x + CARD.category.w)
    expect(l.crown).toEqual(layoutMindmap(TREE).crown)
    expect(l.edges.find((e) => e.to === DRAFT_KEY)?.from).toBeNull()
  })

  it('also works on an empty tree (the very first root)', () => {
    const l = layoutMindmap([], new Set(), { kind: 'root' })
    expect(l.cards).toHaveLength(1)
    expect(l.cards[0].kind).toBe('draft')
  })

  it('skips an input under a collapsed or unknown root', () => {
    expect(layoutMindmap(TREE, new Set(['cell']), { kind: 'statement', nodeId: 'nucleus' }).cards.some((c) => c.kind === 'draft')).toBe(false)
    expect(layoutMindmap(TREE, new Set(), { kind: 'branch', parentId: 'gone' }).cards.some((c) => c.kind === 'draft')).toBe(false)
  })

  it('never overlaps another card, wherever it opens', () => {
    const random = seededRandom('quick-add')
    for (let s = 0; s < 30; s++) {
      const tree = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, r) =>
        node(`r${s}-${r}`, Array.from({ length: Math.floor(random() * 3) }, (_, i) => `r${s}-${r}-i${i}`), [node(`r${s}-${r}-c`, [`r${s}-${r}-ci`])]),
      )
      const ids = tree.flatMap((r) => [r.id, r.children[0].id])
      const target = ids[Math.floor(random() * ids.length)]
      const slots: MindmapDraftSlot[] = [{ kind: 'root' }, { kind: 'branch', parentId: target }, { kind: 'statement', nodeId: target }]
      for (const slot of slots) {
        const l = layoutMindmap(tree, new Set(), slot)
        const draft = l.cards.find((c) => c.kind === 'draft')!
        for (const c of l.cards) if (c !== draft) expect(overlaps(c, draft), `${slot.kind} vs ${c.key}`).toBe(false)
      }
    }
  })
})

describe('resolveSlot', () => {
  const saved = (id: string) => (id === 'pending-node-1' ? 'r9' : id)
  it('follows a root from its temp id to its real id, and keeps everything else as it is', () => {
    expect(resolveSlot({ kind: 'statement', nodeId: 'pending-node-1' }, saved)).toEqual({ kind: 'statement', nodeId: 'r9' })
    expect(resolveSlot({ kind: 'branch', parentId: 'pending-node-1' }, saved)).toEqual({ kind: 'branch', parentId: 'r9' })
    const same: MindmapDraftSlot = { kind: 'statement', nodeId: 'cell' }
    expect(resolveSlot(same, saved)).toBe(same)
    const root: MindmapDraftSlot = { kind: 'root' }
    expect(resolveSlot(root, saved)).toBe(root)
  })
})

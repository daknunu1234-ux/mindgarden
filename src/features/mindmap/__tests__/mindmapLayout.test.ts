import { describe, expect, it } from 'vitest'
import { seededRandom } from '@/shared/utils/seededRandom'
import {
  ancestorKeys,
  CARD,
  countDescendantCards,
  itemKey,
  layoutMindmap,
  nodeKey,
  statementLabel,
  statementTitle,
  type MindmapCard,
} from '../hooks/mindmapLayout'
import type { RootNodeView } from '../types'

const node = (id: string, items: (string | [string, string])[] = [], children: RootNodeView[] = []): RootNodeView => ({
  id,
  title: id,
  items: items.map((i) => (typeof i === 'string' ? { id: i, prompt: id } : { id: i[0], prompt: i[1] })),
  children,
})

// cell ─┬─ i1, i2 (statements)
//       └─ nucleus ── i3 ; nucleus ─ dna ── i4
// energy ── i5
const TREE = [node('cell', ['i1', 'i2'], [node('nucleus', ['i3'], [node('dna', ['i4'])])]), node('energy', [['i5', 'What powers the cell?']])]

// Random but deterministic trees for the no-overlap property.
function randomTree(seed: string, width: number, depth: number): RootNodeView[] {
  const random = seededRandom(seed)
  let n = 0
  const make = (d: number): RootNodeView => {
    const id = `n${n++}`
    const items = Array.from({ length: Math.floor(random() * 4) }, (_, i) => `${id}-i${i}`)
    const children = d < depth ? Array.from({ length: Math.floor(random() * 3) }, () => make(d + 1)) : []
    return node(id, items, children)
  }
  return Array.from({ length: width }, () => make(1))
}

const overlaps = (a: MindmapCard, b: MindmapCard) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutMindmap', () => {
  const layout = layoutMindmap(TREE)
  const card = (key: string) => layout.cards.find((c) => c.key === key)!

  it('creates category, branch and statement cards in depth-first order', () => {
    expect(layout.cards.map((c) => `${c.kind}:${c.key}`)).toEqual([
      'category:n:cell',
      'statement:i:i1',
      'statement:i:i2',
      'branch:n:nucleus',
      'statement:i:i3',
      'branch:n:dna',
      'statement:i:i4',
      'category:n:energy',
      'statement:i:i5',
    ])
  })

  it('puts categories in one row under the crown and stacks content below, indented by depth', () => {
    expect(card('n:cell').y).toBe(card('n:energy').y)
    expect(card('i:i1').y).toBeGreaterThan(card('n:cell').y + CARD.category.h)
    expect(card('i:i3').x).toBeGreaterThan(card('n:nucleus').x - 1)
    expect(card('i:i4').x).toBeGreaterThan(card('i:i3').x)
    expect(card('n:energy').x).toBeGreaterThan(Math.max(...layout.cards.filter((c) => c.x < card('n:energy').x).map((c) => c.x + c.w)))
  })

  it('centres the crown under the tree trunk, between the first and last category', () => {
    const a = card('n:cell')
    const b = card('n:energy')
    expect(layout.crown.x).toBe((a.x + a.w / 2 + b.x + b.w / 2) / 2)
    expect(layout.trunk).toEqual({ x: layout.crown.x, y: 0 })
    expect(layout.crown.y).toBeGreaterThan(0)
  })

  it('connects every card to its parent (categories to the crown) with a cubic Bezier', () => {
    const keys = new Set(layout.cards.map((c) => c.key))
    expect(layout.edges).toHaveLength(layout.cards.length)
    for (const e of layout.edges) {
      expect(keys.has(e.to)).toBe(true)
      if (e.from !== null) expect(keys.has(e.from)).toBe(true)
      expect(e.path).toMatch(/^M [\d.]+ [\d.]+ C [\d.]+ [\d.]+, [\d.]+ [\d.]+, [\d.]+ [\d.]+$/)
    }
    expect(layout.edges.filter((e) => e.from === null).map((e) => e.to)).toEqual(['n:cell', 'n:energy'])
    // Child edges end on the child's left port.
    const i3 = layout.edges.find((e) => e.to === 'i:i3')!
    expect([i3.x2, i3.y2]).toEqual([card('i:i3').x, card('i:i3').y + CARD.statement.h / 2])
  })

  it('never overlaps two cards, for any tree shape', () => {
    for (let s = 0; s < 25; s++) {
      const l = layoutMindmap(randomTree(`tree${s}`, 1 + (s % 6), 1 + (s % 4)))
      for (let i = 0; i < l.cards.length; i++) {
        for (let j = i + 1; j < l.cards.length; j++) {
          expect(overlaps(l.cards[i], l.cards[j]), `seed ${s}: ${l.cards[i].key} vs ${l.cards[j].key}`).toBe(false)
        }
      }
    }
  })

  it('keeps every card inside the canvas', () => {
    for (let s = 0; s < 10; s++) {
      const l = layoutMindmap(randomTree(`bounds${s}`, 4, 3))
      for (const c of l.cards) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.x + c.w).toBeLessThanOrEqual(l.width)
        expect(c.y + c.h).toBeLessThanOrEqual(l.height)
      }
    }
  })

  it('is deterministic and handles an empty tree', () => {
    expect(layoutMindmap(TREE)).toEqual(layoutMindmap(TREE))
    expect(layoutMindmap([])).toMatchObject({ cards: [], edges: [], height: 0 })
  })
})

describe('collapse', () => {
  it('hides a collapsed node’s content and reports how many cards are hidden', () => {
    const l = layoutMindmap(TREE, new Set(['cell']))
    expect(l.cards.map((c) => c.key)).toEqual(['n:cell', 'n:energy', 'i:i5'])
    // i1, i2, nucleus, i3, dna, i4
    expect(l.cards[0]).toMatchObject({ hiddenCount: 6, collapsible: true })
    expect(l.height).toBeLessThan(layoutMindmap(TREE).height)
  })

  it('collapses a nested branch only', () => {
    const l = layoutMindmap(TREE, new Set(['nucleus']))
    expect(l.cards.some((c) => c.key === 'n:nucleus')).toBe(true)
    expect(l.cards.some((c) => c.key === 'i:i3' || c.key === 'n:dna' || c.key === 'i:i4')).toBe(false)
    expect(l.cards.find((c) => c.key === 'n:nucleus')!.hiddenCount).toBe(3)
  })

  it('marks nodes without content as not collapsible', () => {
    expect(layoutMindmap([node('empty')]).cards[0]).toMatchObject({ collapsible: false, hiddenCount: 0 })
    expect(countDescendantCards(TREE[0])).toBe(6)
  })
})

describe('labels and highlight path', () => {
  it('shows a distinct prompt, otherwise "Statement n" (statement text is the answer, never shown)', () => {
    expect(statementTitle('What powers the cell?', 'energy', 1)).toBe('What powers the cell?')
    expect(statementTitle('Ty thể', 'Ty thể', 2)).toBe('Statement 2')
    expect(statementTitle(' ty THỂ ', 'Ty thể', 1)).toBe('Statement 1')
    expect(statementTitle(undefined, 'x', 3)).toBe('Statement 3')
  })

  it('statementLabel shows the statement itself (owner, clone or visitor) and falls back only when it is blank', () => {
    expect(statementLabel('Ty thể sản sinh ATP.', 'Ty thể', 'Ty thể', 1)).toBe('Ty thể sản sinh ATP.')
    expect(statementLabel('  Ribosome tổng hợp protein.  ', 'Ty thể', 'Ty thể', 2)).toBe('Ribosome tổng hợp protein.')
    expect(statementLabel('', 'Ty thể', 'Ty thể', 2)).toBe('Statement 2')
    expect(statementLabel('   ', 'What powers the cell?', 'Ty thể', 1)).toBe('What powers the cell?')
    expect(statementLabel(null, undefined, 'x', 3)).toBe('Statement 3')
    expect(statementLabel(undefined, 'Ty thể', 'Ty thể', 4)).toBe('Statement 4')
    const l = layoutMindmap(TREE)
    expect(l.cards.find((c) => c.key === itemKey('i5'))!.title).toBe('What powers the cell?')
    expect(l.cards.find((c) => c.key === itemKey('i2'))!.title).toBe('Statement 2')
  })

  it('walks from a card up to its category', () => {
    expect(ancestorKeys(layoutMindmap(TREE), itemKey('i4'))).toEqual(new Set(['i:i4', 'n:dna', 'n:nucleus', 'n:cell']))
    expect(ancestorKeys(layoutMindmap(TREE), null)).toEqual(new Set())
    expect(nodeKey('x')).toBe('n:x')
  })
})

describe('growing the mindmap', () => {
  const addStatement = (tree: RootNodeView[], nodeId: string, itemId: string): RootNodeView[] =>
    tree.map((n) => (n.id === nodeId ? { ...n, items: [...n.items, { id: itemId }] } : { ...n, children: addStatement(n.children, nodeId, itemId) }))
  const addBranch = (tree: RootNodeView[], parentId: string, child: RootNodeView): RootNodeView[] =>
    tree.map((n) => (n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: addBranch(n.children, parentId, child) }))

  it('re-lays out without collisions after adding statements and sub-branches anywhere', () => {
    let tree = TREE
    const edits = [
      () => (tree = addStatement(tree, 'nucleus', 'new1')),
      () => (tree = addBranch(tree, 'cell', node('ribo', ['r1', 'r2']))),
      () => (tree = addBranch(tree, 'dna', node('gene', ['g1']))),
      () => (tree = addStatement(tree, 'energy', 'new2')),
    ]
    for (const edit of edits) {
      edit()
      const l = layoutMindmap(tree)
      for (let i = 0; i < l.cards.length; i++) {
        for (let j = i + 1; j < l.cards.length; j++) expect(overlaps(l.cards[i], l.cards[j]), `${l.cards[i].key} / ${l.cards[j].key}`).toBe(false)
      }
    }
  })

  it('pushes later columns right when a deeper branch widens a column', () => {
    const before = layoutMindmap(TREE).cards.find((c) => c.key === 'n:energy')!.x
    const deeper = addBranch(TREE, 'dna', node('gene', [], [node('allele', ['a1'])]))
    const after = layoutMindmap(deeper).cards.find((c) => c.key === 'n:energy')!.x
    expect(after).toBeGreaterThan(before)
  })
})

describe('inspector helpers', () => {
  it('lists every card under a node, and nothing for a statement', async () => {
    const { descendantKeys } = await import('../hooks/mindmapLayout')
    const l = layoutMindmap(TREE)
    expect(descendantKeys(l, 'n:nucleus')).toEqual(new Set(['i:i3', 'n:dna', 'i:i4']))
    expect(descendantKeys(l, 'i:i1')).toEqual(new Set())
    expect(descendantKeys(l, null)).toEqual(new Set())
  })

  it('collects a branch’s node ids for expanding it', async () => {
    const { branchNodeIds } = await import('../hooks/mindmapLayout')
    expect(branchNodeIds(TREE[0])).toEqual(['cell', 'nucleus', 'dna'])
  })
})

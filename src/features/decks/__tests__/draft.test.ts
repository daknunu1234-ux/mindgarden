import { describe, expect, it } from 'vitest'
import { countDeckTree } from '../lib/deckTree'
import { applyDeckOps, confirmItems, dropOp, isPendingItemId, PENDING_ITEM_PREFIX, type DeckOp } from '../lib/draft'
import type { DeckDetail, DeckEditor } from '../types'

const detail: DeckDetail = {
  deck: {
    id: 'deck',
    userId: 'me',
    title: 'Sinh học',
    slug: 'sinh-hoc',
    description: null,
    isPublic: false,
    treeType: 'oak',
    createdAt: '2026-09-30',
    isTournamentOpen: false,
  },
  tree: [
    { id: 'r1', title: 'Tế bào', sortOrder: 0, items: [{ id: 'i1', prompt: 'Tế bào' }], children: [{ id: 'r2', title: 'Ty thể', sortOrder: 0, items: [], children: [] }] },
  ],
}
const editor: DeckEditor = {
  deckId: 'deck',
  treeType: 'oak',
  nodes: [
    { id: 'r1', title: 'Tế bào', depth: 0, items: [{ id: 'i1', statement: 'Tế bào là đơn vị sống.', drillable: true }] },
    { id: 'r2', title: 'Ty thể', depth: 1, items: [] },
  ],
}

describe('applyDeckOps', () => {
  it('shows a new species everywhere at once', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'a', kind: 'species', treeType: 'maple' }])
    expect(view.treeType).toBe('maple')
    expect(view.detail.deck.treeType).toBe('maple')
    expect(view.editor?.treeType).toBe('maple')
    expect(detail.deck.treeType).toBe('oak')
  })

  it('adds pending statements to the mindmap tree and the editor list (a nested root too), with the root title as prompt', () => {
    const ops: DeckOp[] = [{ key: 'b', kind: 'addItems', nodeId: 'r2', items: [{ tempId: `${PENDING_ITEM_PREFIX}b`, statement: 'Ty thể sản sinh ATP.' }] }]
    const view = applyDeckOps(detail, editor, ops)
    expect(view.detail.tree[0].children[0].items).toEqual([{ id: `${PENDING_ITEM_PREFIX}b`, prompt: 'Ty thể' }])
    expect(view.editor?.nodes[1].items).toEqual([{ id: `${PENDING_ITEM_PREFIX}b`, statement: 'Ty thể sản sinh ATP.', drillable: false }])
    expect(view.pendingIds.has(`${PENDING_ITEM_PREFIX}b`)).toBe(true)
    // Counts (and so the size tier and the Statements stat) follow at once.
    expect(countDeckTree(view.detail.tree).itemCount).toBe(2)
    expect(countDeckTree(detail.tree).itemCount).toBe(1)
  })

  it('works for visitors too (no editor list)', () => {
    expect(applyDeckOps(detail, null, [{ key: 'a', kind: 'species', treeType: 'palm' }]).editor).toBeNull()
  })
})

describe('confirm / roll back', () => {
  const ops: DeckOp[] = [
    { key: 's', kind: 'species', treeType: 'cherry' },
    {
      key: 'b',
      kind: 'addItems',
      nodeId: 'r1',
      items: [
        { tempId: `${PENDING_ITEM_PREFIX}b-0`, statement: 'Nhân chứa DNA.' },
        { tempId: `${PENDING_ITEM_PREFIX}b-1`, statement: 'Tế bào là đơn vị sống.' },
      ],
    },
  ]

  it('swaps pending statements for the server rows (real ids, drillable), dropping skipped duplicates', () => {
    const view = applyDeckOps(detail, editor, confirmItems(ops, 'b', [{ id: 'i2', statement: 'Nhân chứa DNA.', drillable: true }]))
    expect(view.editor?.nodes[0].items.map((i) => [i.id, i.drillable])).toEqual([
      ['i1', true],
      ['i2', true],
    ])
    expect(view.detail.tree[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(view.pendingIds.size).toBe(0)
  })

  it('rolls a refused change back and keeps the others', () => {
    const noSpecies = applyDeckOps(detail, editor, dropOp(ops, 's'))
    expect(noSpecies.treeType).toBe('oak')
    expect(noSpecies.editor?.nodes[0].items).toHaveLength(3)
    const noItems = applyDeckOps(detail, editor, dropOp(ops, 'b'))
    expect(noItems.treeType).toBe('cherry')
    expect(noItems.editor?.nodes[0].items).toEqual(editor.nodes[0].items)
  })

  it('tells pending ids apart', () => {
    expect(isPendingItemId(`${PENDING_ITEM_PREFIX}x`)).toBe(true)
    expect(isPendingItemId('6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f')).toBe(false)
  })
})

describe('removing a statement', () => {
  it('takes it out of the mindmap tree, the editor list and the counts at once', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'r', kind: 'removeItem', itemId: 'i1' }])
    expect(view.detail.tree[0].items).toEqual([])
    expect(view.editor?.nodes[0].items).toEqual([])
    expect(countDeckTree(view.detail.tree).itemCount).toBe(0)
  })

  it('removes a statement added earlier on this visit too, and a refusal brings it back', () => {
    const ops: DeckOp[] = [
      { key: 'a', kind: 'addItems', nodeId: 'r2', items: [{ tempId: 't', statement: 'Ty thể sản sinh ATP.' }], confirmed: [{ id: 'i9', statement: 'Ty thể sản sinh ATP.', drillable: true }] },
      { key: 'r', kind: 'removeItem', itemId: 'i9' },
    ]
    expect(applyDeckOps(detail, editor, ops).editor?.nodes[1].items).toEqual([])
    expect(applyDeckOps(detail, editor, dropOp(ops, 'r')).editor?.nodes[1].items.map((i) => i.id)).toEqual(['i9'])
  })
})

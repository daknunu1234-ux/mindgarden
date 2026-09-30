import { describe, expect, it } from 'vitest'
import { countDeckTree } from '../lib/deckTree'
import {
  applyDeckOps,
  confirmEdit,
  confirmItems,
  confirmNode,
  dropOp,
  isPendingItemId,
  isPendingNodeId,
  PENDING_ITEM_PREFIX,
  PENDING_NODE_PREFIX,
  rebaseOps,
  settleOp,
  type DeckOp,
} from '../lib/draft'
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

describe('adding roots and sub-roots', () => {
  const temp = `${PENDING_NODE_PREFIX}n`

  it('shows a new top-level root at the end of the mindmap and the editor list, pending', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'n', kind: 'addNode', tempId: temp, parentId: null, title: 'Năng lượng' }])
    expect(view.detail.tree.map((n) => [n.id, n.title, n.sortOrder])).toEqual([
      ['r1', 'Tế bào', 0],
      [temp, 'Năng lượng', 1],
    ])
    expect(view.editor?.nodes.at(-1)).toEqual({ id: temp, title: 'Năng lượng', depth: 0, items: [] })
    expect(view.pendingIds.has(temp)).toBe(true)
    expect(countDeckTree(view.detail.tree).nodeCount).toBe(3)
  })

  it('puts a sub-root after its parent’s whole branch in the editor list, one level deeper', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'n', kind: 'addNode', tempId: temp, parentId: 'r1', title: 'Lục lạp' }])
    expect(view.detail.tree[0].children.map((c) => c.id)).toEqual(['r2', temp])
    expect(view.editor?.nodes.map((n) => [n.id, n.depth])).toEqual([
      ['r1', 0],
      ['r2', 1],
      [temp, 1],
    ])
  })

  it('lets statements and sub-roots be typed under a root that is still saving, then moves them to its real id', () => {
    const ops: DeckOp[] = [
      { key: 'n', kind: 'addNode', tempId: temp, parentId: null, title: 'Năng lượng' },
      { key: 'i', kind: 'addItems', nodeId: temp, items: [{ tempId: `${PENDING_ITEM_PREFIX}i`, statement: 'ATP là năng lượng.' }] },
      { key: 'c', kind: 'addNode', tempId: `${PENDING_NODE_PREFIX}c`, parentId: temp, title: 'ATP' },
      { key: 'r', kind: 'renameNode', nodeId: temp, title: 'Năng lượng tế bào' },
    ]
    const pending = applyDeckOps(detail, editor, ops)
    expect(pending.detail.tree[1]).toMatchObject({ id: temp, title: 'Năng lượng tế bào', items: [{ id: `${PENDING_ITEM_PREFIX}i`, prompt: 'Năng lượng' }] })
    expect(pending.detail.tree[1].children.map((c) => c.id)).toEqual([`${PENDING_NODE_PREFIX}c`])

    const confirmed = confirmNode(ops, 'n', 'r9')
    expect(confirmed.map((op) => ('nodeId' in op ? op.nodeId : 'parentId' in op ? op.parentId : null))).toEqual([null, 'r9', 'r9', 'r9'])
    const view = applyDeckOps(detail, editor, confirmed)
    expect(view.detail.tree[1].id).toBe('r9')
    expect(view.detail.tree[1].children[0].id).toBe(`${PENDING_NODE_PREFIX}c`)
    expect(view.pendingIds.has('r9')).toBe(false)
    expect(view.editor?.nodes.find((n) => n.id === 'r9')?.items.map((i) => i.id)).toEqual([`${PENDING_ITEM_PREFIX}i`])
  })

  it('rolls a refused root back, with whatever was typed under it', () => {
    const ops: DeckOp[] = [
      { key: 'n', kind: 'addNode', tempId: temp, parentId: null, title: 'X' },
      { key: 'i', kind: 'addItems', nodeId: temp, items: [{ tempId: `${PENDING_ITEM_PREFIX}i`, statement: 'Y là Z.' }] },
    ]
    const view = applyDeckOps(detail, editor, dropOp(ops, 'n'))
    expect(view.detail.tree).toEqual(detail.tree)
    expect(view.editor?.nodes).toEqual(editor.nodes)
  })

  it('is idempotent once fresh server data already holds the node', () => {
    const withNode: DeckDetail = { ...detail, tree: [...detail.tree, { id: 'r9', title: 'Năng lượng', sortOrder: 1, items: [], children: [] }] }
    const ops = confirmNode([{ key: 'n', kind: 'addNode', tempId: temp, parentId: null, title: 'Năng lượng' }], 'n', 'r9')
    expect(applyDeckOps(withNode, null, ops).detail.tree).toHaveLength(2)
  })

  it('tells pending root ids apart', () => {
    expect(isPendingNodeId(temp)).toBe(true)
    expect(isPendingNodeId('r1')).toBe(false)
    expect(isPendingItemId(temp)).toBe(false)
  })
})

describe('renaming a root', () => {
  it('renames it in the mindmap tree and the editor list at once', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'r', kind: 'renameNode', nodeId: 'r2', title: 'Ti thể' }])
    expect(view.detail.tree[0].children[0].title).toBe('Ti thể')
    expect(view.editor?.nodes[1].title).toBe('Ti thể')
    expect(detail.tree[0].children[0].title).toBe('Ty thể')
  })
})

describe('rebasing onto fresh server data', () => {
  it('keeps only the ops still waiting for the server', () => {
    const ops: DeckOp[] = [
      { key: 's', kind: 'species', treeType: 'maple' },
      { key: 'r', kind: 'renameNode', nodeId: 'r1', title: 'A' },
      { key: 'd', kind: 'removeItem', itemId: 'i1' },
      { key: 'n', kind: 'addNode', tempId: `${PENDING_NODE_PREFIX}n`, parentId: null, title: 'B' },
      { key: 'i', kind: 'addItems', nodeId: 'r1', items: [{ tempId: 't', statement: 'C là D.' }] },
    ]
    const settled = confirmItems(confirmNode(settleOp(settleOp(ops, 's'), 'd'), 'n', 'r9'), 'i', [{ id: 'i7', statement: 'C là D.', drillable: true }])
    expect(rebaseOps(settled).map((op) => op.key)).toEqual(['r'])
    expect(rebaseOps(ops).map((op) => op.key)).toEqual(['s', 'r', 'd', 'n', 'i'])
  })
})

describe('editing a statement in place', () => {
  it('shows the new text at once, then the server’s cleaned text and drillable flag; a refusal restores it', () => {
    const ops: DeckOp[] = [{ key: 'e', kind: 'editItem', itemId: 'i1', statement: 'Tế bào là đơn vị  cơ bản.' }]
    expect(applyDeckOps(detail, editor, ops).editor?.nodes[0].items[0]).toEqual({ id: 'i1', statement: 'Tế bào là đơn vị  cơ bản.', drillable: true })
    const saved = confirmEdit(ops, 'e', { statement: 'Tế bào là đơn vị cơ bản.', drillable: false })
    expect(applyDeckOps(detail, editor, saved).editor?.nodes[0].items[0]).toEqual({ id: 'i1', statement: 'Tế bào là đơn vị cơ bản.', drillable: false })
    expect(rebaseOps(saved)).toEqual([])
    expect(applyDeckOps(detail, editor, dropOp(ops, 'e')).editor?.nodes[0].items).toEqual(editor.nodes[0].items)
  })
})

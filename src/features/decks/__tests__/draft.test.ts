import { describe, expect, it } from 'vitest'
import { outlineRows } from '../lib/contentTree'
import { countDeckTree } from '../lib/deckTree'
import {
  applyDeckOps,
  confirmAdd,
  confirmMany,
  dropOp,
  isPendingItemId,
  isPendingNodeId,
  PENDING_ITEM_PREFIX,
  PENDING_NODE_PREFIX,
  rebaseOps,
  settleOp,
  type DeckOp,
} from '../lib/draft'
import type { ContentRow, DeckDetail, DeckEditor } from '../types'

// Tế bào (r1): i1
//    Ty thể (r2)
const rows = outlineRows([
  { id: 'r1', parentId: null, type: 'root', content: 'Tế bào', sortOrder: 1 },
  { id: 'i1', parentId: 'r1', type: 'statement', content: 'Tế bào là đơn vị sống.', sortOrder: 1 },
  { id: 'r2', parentId: 'r1', type: 'root', content: 'Ty thể', sortOrder: 2 },
])
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
  tree: [],
}
const editor: DeckEditor = { deckId: 'deck', treeType: 'oak', nodes: [], rows }
const ids = (r: readonly ContentRow[] | undefined) => r?.map((x) => x.id)
const apply = (ops: DeckOp[]) => applyDeckOps(detail, editor, ops)

describe('applyDeckOps', () => {
  it('shows a new species everywhere at once', () => {
    const view = apply([{ key: 'a', kind: 'species', treeType: 'maple' }])
    expect(view.treeType).toBe('maple')
    expect(view.detail.deck.treeType).toBe('maple')
    expect(view.editor?.treeType).toBe('maple')
    expect(detail.deck.treeType).toBe('oak')
  })

  it('adds a pending node where it was typed, and the canvas tree and root lists follow', () => {
    const temp = `${PENDING_ITEM_PREFIX}b`
    const view = apply([{ key: 'b', kind: 'add', tempId: temp, parentId: 'r2', afterId: null, type: 'statement', content: 'Ty thể sản sinh ATP.' }])
    expect(ids(view.editor?.rows)).toEqual(['r1', 'i1', 'r2', temp])
    expect(view.detail.tree[0].children[0].items).toEqual([{ id: temp, prompt: 'Ty thể', parentId: null, depth: 0 }])
    expect(view.editor?.nodes[1].items.map((i) => i.id)).toEqual([temp])
    expect(view.pendingIds.has(temp)).toBe(true)
    expect(countDeckTree(view.detail.tree).itemCount).toBe(2)
  })

  it('a bulk import appends its statements under the node', () => {
    const view = apply([
      { key: 'm', kind: 'addMany', parentId: 'r1', items: [{ tempId: 'pending-item-m-0', content: 'Nhân chứa DNA.' }, { tempId: 'pending-item-m-1', content: 'Màng bán thấm.' }] },
    ])
    expect(ids(view.editor?.rows)).toEqual(['r1', 'i1', 'r2', 'pending-item-m-0', 'pending-item-m-1'])
  })

  it('edit, indent, toggle, move and remove apply in order; the row count only changes on add / remove', () => {
    const ops: DeckOp[] = [
      { key: '1', kind: 'edit', id: 'i1', content: 'Sửa rồi.' },
      { key: '2', kind: 'indent', id: 'r2', dir: 'in' },
      { key: '3', kind: 'toggle', id: 'r2' },
    ]
    const view = apply(ops)
    expect(ids(view.editor?.rows)).toEqual(ids(rows))
    expect(view.editor?.rows.find((r) => r.id === 'r2')).toMatchObject({ parentId: 'i1', depth: 2, type: 'statement' })
    expect(view.editor?.rows.find((r) => r.id === 'i1')?.content).toBe('Sửa rồi.')
    expect(ids(apply([...ops, { key: '4', kind: 'remove', id: 'i1' }]).editor?.rows)).toEqual(['r1'])
    const moved = apply([{ key: '5', kind: 'move', id: 'i1', toParentId: 'r2' }])
    expect(moved.editor?.rows.find((r) => r.id === 'i1')).toMatchObject({ parentId: 'r2', depth: 2 })
  })

  it('an op that cannot apply (the server would refuse it too) changes nothing', () => {
    expect(apply([{ key: 'x', kind: 'indent', id: 'r1', dir: 'out' }]).editor?.rows).toEqual(rows)
    expect(apply([{ key: 'x', kind: 'toggle', id: 'r1' }]).editor?.rows).toEqual(rows)
  })

  it('works for visitors too (no editor)', () => {
    expect(applyDeckOps(detail, null, [{ key: 'a', kind: 'species', treeType: 'palm' }]).editor).toBeNull()
  })
})

describe('confirm / roll back', () => {
  const temp = `${PENDING_NODE_PREFIX}a`
  const ops: DeckOp[] = [
    { key: 'a', kind: 'add', tempId: temp, parentId: 'r1', afterId: 'i1', type: 'root', content: 'Nhân' },
    // Typed under the new root before the server answered.
    { key: 'b', kind: 'add', tempId: `${PENDING_ITEM_PREFIX}b`, parentId: temp, afterId: null, type: 'statement', content: 'Nhân chứa DNA.' },
    { key: 'c', kind: 'edit', id: temp, content: 'Nhân tế bào' },
  ]

  it('confirmAdd: the node takes its real id and every later op follows it', () => {
    const next = confirmAdd(ops, 'a', 'real-a')
    expect(next[0]).toMatchObject({ confirmedId: 'real-a' })
    expect(next[1]).toMatchObject({ parentId: 'real-a' })
    expect(next[2]).toMatchObject({ id: 'real-a' })
    const view = applyDeckOps(detail, editor, next)
    expect(ids(view.editor?.rows)).toEqual(['r1', 'i1', 'real-a', `${PENDING_ITEM_PREFIX}b`, 'r2'])
    expect(view.editor?.rows.find((r) => r.id === 'real-a')?.content).toBe('Nhân tế bào')
    expect(view.pendingIds.has('real-a')).toBe(false)
  })

  it('confirmMany: real ids when nothing was skipped; the confirmed list replaces the temp rows', () => {
    const many: DeckOp[] = [
      { key: 'm', kind: 'addMany', parentId: 'r2', items: [{ tempId: 't0', content: 'Một câu.' }, { tempId: 't1', content: 'Hai câu.' }] },
      { key: 'e', kind: 'edit', id: 't1', content: 'Hai câu sửa.' },
    ]
    const all = confirmMany(many, 'm', [
      { id: 'n0', statement: 'Một câu.' },
      { id: 'n1', statement: 'Hai câu.' },
    ])
    expect(all[1]).toMatchObject({ id: 'n1' })
    expect(applyDeckOps(detail, editor, all).editor?.rows.find((r) => r.id === 'n1')?.content).toBe('Hai câu sửa.')
    // One skipped as a duplicate: only what the server created shows.
    const some = confirmMany(many, 'm', [{ id: 'n1', statement: 'Hai câu.' }])
    expect(ids(applyDeckOps(detail, editor, some).editor?.rows)).toEqual(['r1', 'i1', 'r2', 'n1'])
  })

  it('dropOp rolls a refused change back; rebaseOps keeps only what is still in flight', () => {
    expect(ids(applyDeckOps(detail, editor, dropOp(ops, 'a')).editor?.rows)).toEqual(ids(rows))
    const settled = settleOp(confirmAdd(ops, 'a', 'real-a'), 'c')
    expect(rebaseOps(settled).map((op) => op.key)).toEqual(['b'])
    expect(settleOp(ops, 'a')).toEqual(ops)
  })

  it('pending ids are recognisable', () => {
    expect(isPendingItemId(`${PENDING_ITEM_PREFIX}x`)).toBe(true)
    expect(isPendingNodeId(`${PENDING_NODE_PREFIX}x`)).toBe(true)
    expect(isPendingItemId('11111111-1111-4111-8111-111111111111')).toBe(false)
  })
})

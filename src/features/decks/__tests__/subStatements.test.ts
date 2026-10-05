import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../services/answers', () => ({ readAnswersForNodes: vi.fn(), answersByNode: vi.fn() }))

import { createClient } from '@/shared/lib/supabase/server'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { moveKnowledgeItem } from '../actions/moveKnowledgeItem'
import { reviewBulkStatements } from '../lib/bulkStatements'
import { applyDeckOps, confirmItems, confirmNode, dropOp, placeItems, rebaseOps, settleOp, PENDING_ITEM_PREFIX, type DeckOp } from '../lib/draft'
import { editSaves, nextOutlineSlot, outlineKey, outlineParents, resolveOutlineSlot, slotAfterEdit, type OutlineSlot } from '../lib/outline'
import {
  appendSortOrder,
  compareStatementRows,
  flattenStatements,
  insertSortOrder,
  MAX_PARENT_CONTEXT_LENGTH,
  nestStatements,
  parentContext,
  withSubStatements,
} from '../lib/statements'
import type { DeckDetail, DeckEditor, EditorNode } from '../types'

// ─── Keyboard: Enter vs Shift+Enter, Tab / Shift+Tab, and how an inline edit ends ─────────────────

describe('statement keyboard flow (Notion-like)', () => {
  const nodes: EditorNode[] = [
    { id: 'cell', title: 'Tế bào', depth: 0, items: [] },
    { id: 'nucleus', title: 'Nhân', depth: 1, items: [] },
  ]
  const parents = outlineParents(nodes)
  const line: OutlineSlot = { kind: 'statement', nodeId: 'nucleus' }
  const subLine: OutlineSlot = { kind: 'statement', nodeId: 'nucleus', parentId: 's1' }

  it('tells Enter from Shift+Enter, and waits while an IME composes', () => {
    expect(outlineKey({ key: 'Enter', shiftKey: false })).toBe('enter')
    expect(outlineKey({ key: 'Enter', shiftKey: true })).toBe('shift-enter')
    expect(outlineKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBeNull()
    expect(outlineKey({ key: 'Enter', shiftKey: true, isComposing: true })).toBeNull()
  })

  it('new line: Enter saves and opens the next line right below the one just typed', () => {
    expect(nextOutlineSlot(line, 'enter', true, 'new-1', parents)).toEqual({ kind: 'statement', nodeId: 'nucleus', afterId: 'new-1' })
    expect(nextOutlineSlot(subLine, 'enter', true, 'new-2', parents)).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 's1', afterId: 'new-2' })
    // Enter on an empty line closes it.
    expect(nextOutlineSlot(line, 'enter', false, null, parents)).toBeNull()
  })

  it('new line: Shift+Enter saves and closes, whatever the line', () => {
    for (const slot of [line, subLine, { kind: 'root' } as const, { kind: 'branch', parentId: 'cell' } as const]) {
      expect(nextOutlineSlot(slot, 'shift-enter', true, 'x', parents)).toBeNull()
      expect(nextOutlineSlot(slot, 'shift-enter', false, null, parents)).toBeNull()
    }
  })

  it('new line: Tab nests a sub-statement under the statement just typed (one level only)', () => {
    expect(nextOutlineSlot(line, 'tab', true, 'new-1', parents)).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 'new-1' })
    // Already a sub-statement: Tab opens the next sub-statement, never a third level.
    expect(nextOutlineSlot(subLine, 'tab', true, 'new-2', parents)).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 's1', afterId: 'new-2' })
    // Nothing typed: a sub-root, as before.
    expect(nextOutlineSlot(line, 'tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'nucleus' })
  })

  it('new line: Shift+Tab on a sub-statement line goes back to a statement line below its parent', () => {
    expect(nextOutlineSlot(subLine, 'shift-tab', false, null, parents)).toEqual({ kind: 'statement', nodeId: 'nucleus', afterId: 's1' })
    expect(nextOutlineSlot(line, 'shift-tab', false, null, parents)).toEqual({ kind: 'branch', parentId: 'cell' })
  })

  it('editing: Enter commits and spawns a blank line directly below the edited statement', () => {
    const edited = { kind: 'item', id: 's2', nodeId: 'nucleus', parentId: null } as const
    expect(slotAfterEdit(edited, 'enter')).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: null, afterId: 's2' })
    // A sub-statement's new line is a sub-statement of the same statement.
    expect(slotAfterEdit({ ...edited, parentId: 's1' }, 'enter')).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 's1', afterId: 's2' })
  })

  it('editing: Shift+Enter, Esc and clicking away commit without a new line; only ✕ discards', () => {
    const edited = { kind: 'item', id: 's2', nodeId: 'nucleus', parentId: null } as const
    for (const end of ['shift-enter', 'escape', 'blur', 'cancel'] as const) expect(slotAfterEdit(edited, end)).toBeNull()
    for (const end of ['enter', 'shift-enter', 'tab', 'shift-tab', 'escape', 'blur'] as const) expect(editSaves(end)).toBe(true)
    expect(editSaves('cancel')).toBe(false)
  })

  it('editing: Tab opens a sub-statement under the statement; Shift+Tab on a sub-statement goes up', () => {
    const edited = { kind: 'item', id: 's2', nodeId: 'nucleus', parentId: null } as const
    expect(slotAfterEdit(edited, 'tab')).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 's2' })
    expect(slotAfterEdit({ ...edited, parentId: 's1' }, 'tab')).toEqual({ kind: 'statement', nodeId: 'nucleus', parentId: 's1', afterId: 's2' })
    expect(slotAfterEdit({ ...edited, parentId: 's1' }, 'shift-tab')).toEqual({ kind: 'statement', nodeId: 'nucleus', afterId: 's1' })
    expect(slotAfterEdit(edited, 'shift-tab')).toBeNull()
    // Roots keep their flow: Tab opens a statement line, anything else just ends the rename.
    expect(slotAfterEdit({ kind: 'node', id: 'cell' }, 'tab')).toEqual({ kind: 'statement', nodeId: 'cell' })
    expect(slotAfterEdit({ kind: 'node', id: 'cell' }, 'enter')).toBeNull()
  })

  it('an open line follows its parent / anchor from temp id to real id, and keeps its identity otherwise', () => {
    const resolve = (id: string) => (id === 'tmp' ? 'real' : id)
    expect(resolveOutlineSlot({ kind: 'statement', nodeId: 'nucleus', parentId: 'tmp', afterId: 'tmp' }, resolve)).toEqual({
      kind: 'statement',
      nodeId: 'nucleus',
      parentId: 'real',
      afterId: 'real',
    })
    const slot: OutlineSlot = { kind: 'statement', nodeId: 'nucleus', afterId: 'x' }
    expect(resolveOutlineSlot(slot, resolve)).toBe(slot)
  })
})

// ─── Statement hierarchy and order (pure) ─────────────────────────────────────────────────────────

describe('statement hierarchy helpers', () => {
  const rows = [
    { id: 'a', parentId: null },
    { id: 'a1', parentId: 'a' },
    { id: 'b', parentId: null },
    { id: 'a2', parentId: 'a' },
    { id: 'orphan', parentId: 'gone' },
    { id: 'deep', parentId: 'a1' },
  ]

  it('nests sub-statements under their statement, in order; orphans and a third level stay statements', () => {
    expect(nestStatements(rows).map((g) => [g.item.id, g.children.map((c) => c.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', []],
      ['orphan', []],
      ['deep', []],
    ])
    expect(flattenStatements(rows).map((r) => r.id)).toEqual(['a', 'a1', 'a2', 'b', 'orphan', 'deep'])
    expect(flattenStatements(rows)).toHaveLength(rows.length)
  })

  it('picks a statement with its sub-statements (a sub-statement alone)', () => {
    expect(withSubStatements(rows, 'a').map((r) => r.id)).toEqual(['a', 'a1', 'a2'])
    expect(withSubStatements(rows, 'a1').map((r) => r.id)).toEqual(['a1', 'deep'])
    expect(withSubStatements(rows, 'b').map((r) => r.id)).toEqual(['b'])
  })

  it('orders rows by sort_order, then creation, then id (rows without sort_order compare by time)', () => {
    const sorted = [
      { id: 'z', sort_order: 2 },
      { id: 'y', sort_order: 1, created_at: '2026-10-02' },
      { id: 'x', sort_order: 1, created_at: '2026-10-01' },
    ].sort(compareStatementRows)
    expect(sorted.map((r) => r.id)).toEqual(['x', 'y', 'z'])
    expect([{ id: 'b', created_at: '2026-10-02' }, { id: 'a', created_at: '2026-10-01' }].sort(compareStatementRows).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('inserts right below a row by the midpoint, and appends after the last one', () => {
    expect(insertSortOrder(100, 200, 999)).toBe(150)
    expect(insertSortOrder(100, null, 999)).toBe(999)
    // Clocks that disagree never put the new row above its anchor.
    expect(insertSortOrder(100, null, 50)).toBeGreaterThan(100)
    expect(appendSortOrder(null, 42)).toBe(42)
    expect(appendSortOrder(500, 42)).toBeGreaterThan(500)
    // Halving keeps finding room long after any realistic number of inserts at one spot.
    let next = 200
    for (let i = 0; i < 30; i++) next = insertSortOrder(100, next, 0)
    expect(next).toBeGreaterThan(100)
    expect(next).toBeLessThan(200)
  })

  it('takes a short parent statement as a sub-statement’s subject, never a long sentence', () => {
    expect(parentContext('Ty thể')).toBe('Ty thể')
    expect(parentContext('  ')).toBeNull()
    expect(parentContext(null)).toBeNull()
    expect(parentContext('x'.repeat(MAX_PARENT_CONTEXT_LENGTH))).toHaveLength(MAX_PARENT_CONTEXT_LENGTH)
    expect(parentContext('x'.repeat(MAX_PARENT_CONTEXT_LENGTH + 1))).toBeNull()
  })
})

// ─── Optimistic draft: placement, sub-statements, moves ────────────────────────────────────────────

const detail: DeckDetail = {
  deck: { id: 'deck', userId: 'me', title: 'Sinh học', slug: 'sinh-hoc', description: null, isPublic: false, treeType: 'oak', createdAt: '2026-10-01', isTournamentOpen: false },
  tree: [
    {
      id: 'r1',
      title: 'Tế bào',
      sortOrder: 0,
      items: [
        { id: 's1', prompt: 'Tế bào', parentId: null },
        { id: 's1a', prompt: 'Tế bào', parentId: 's1' },
        { id: 's2', prompt: 'Tế bào', parentId: null },
      ],
      children: [{ id: 'r2', title: 'Ty thể', sortOrder: 0, items: [{ id: 't1', prompt: 'Ty thể', parentId: null }], children: [] }],
    },
  ],
}
const editor: DeckEditor = {
  deckId: 'deck',
  treeType: 'oak',
  nodes: [
    {
      id: 'r1',
      title: 'Tế bào',
      depth: 0,
      items: [
        { id: 's1', statement: 'Ty thể', drillable: true, parentId: null },
        { id: 's1a', statement: 'sản sinh ATP', drillable: true, parentId: 's1' },
        { id: 's2', statement: 'Ribosome tổng hợp protein.', drillable: true, parentId: null },
      ],
    },
    { id: 'r2', title: 'Ty thể', depth: 1, items: [{ id: 't1', statement: 'Ty thể có màng kép.', drillable: true, parentId: null }] },
  ],
}
const ids = (items: readonly { id: string }[] | undefined) => items?.map((i) => i.id)

describe('deck draft with sub-statements', () => {
  it('places a statement typed below another right after it (after its sub-statements)', () => {
    const ops: DeckOp[] = [{ key: 'a', kind: 'addItems', nodeId: 'r1', items: [{ tempId: 'p1', statement: 'Nhân chứa DNA.' }], afterId: 's1' }]
    const view = applyDeckOps(detail, editor, ops)
    expect(ids(view.editor?.nodes[0].items)).toEqual(['s1', 's1a', 'p1', 's2'])
    expect(ids(view.detail.tree[0].items)).toEqual(['s1', 's1a', 'p1', 's2'])
  })

  it('places a sub-statement among its statement’s sub-statements, below an anchor or last', () => {
    const last = applyDeckOps(detail, editor, [{ key: 'a', kind: 'addItems', nodeId: 'r1', items: [{ tempId: 'p1', statement: 'có DNA riêng' }], parentId: 's1' }])
    expect(last.editor?.nodes[0].items.map((i) => [i.id, i.parentId])).toEqual([
      ['s1', null],
      ['s1a', 's1'],
      ['p1', 's1'],
      ['s2', null],
    ])
    expect(last.detail.tree[0].items.find((i) => i.id === 'p1')).toEqual({ id: 'p1', prompt: 'Tế bào', parentId: 's1' })
    expect(placeItems([{ id: 'x' }, { id: 'y' }], [{ id: 'n' }], 'x')).toEqual([{ id: 'x' }, { id: 'n' }, { id: 'y' }])
    expect(placeItems([{ id: 'x' }], [{ id: 'n' }], 'missing')).toEqual([{ id: 'x' }, { id: 'n' }])
    expect(placeItems([{ id: 'x' }], [{ id: 'x' }], null)).toEqual([{ id: 'x' }])
  })

  it('a sub-statement typed under a statement that is still saving follows it to its real id', () => {
    let ops: DeckOp[] = [
      { key: 'a', kind: 'addItems', nodeId: 'r1', items: [{ tempId: `${PENDING_ITEM_PREFIX}a`, statement: 'Lục lạp' }] },
      { key: 'b', kind: 'addItems', nodeId: 'r1', items: [{ tempId: `${PENDING_ITEM_PREFIX}b`, statement: 'quang hợp' }], parentId: `${PENDING_ITEM_PREFIX}a` },
      { key: 'c', kind: 'addItems', nodeId: 'r1', items: [{ tempId: `${PENDING_ITEM_PREFIX}c`, statement: 'Không bào' }], afterId: `${PENDING_ITEM_PREFIX}a` },
    ]
    const before = applyDeckOps(detail, editor, ops)
    expect(before.editor?.nodes[0].items.find((i) => i.id === `${PENDING_ITEM_PREFIX}b`)?.parentId).toBe(`${PENDING_ITEM_PREFIX}a`)
    ops = confirmItems(ops, 'a', [{ id: 'real-a', statement: 'Lục lạp', drillable: true }])
    expect(ops[1]).toMatchObject({ parentId: 'real-a' })
    expect(ops[2]).toMatchObject({ afterId: 'real-a' })
    const after = applyDeckOps(detail, editor, ops)
    expect(after.editor?.nodes[0].items.map((i) => [i.id, i.parentId]).slice(-3)).toEqual([
      ['real-a', null],
      [`${PENDING_ITEM_PREFIX}b`, 'real-a'],
      [`${PENDING_ITEM_PREFIX}c`, null],
    ])
  })

  it('deleting a statement takes its sub-statements with it (as the database cascade does)', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'd', kind: 'removeItem', itemId: 's1' }])
    expect(ids(view.editor?.nodes[0].items)).toEqual(['s2'])
    expect(ids(view.detail.tree[0].items)).toEqual(['s2'])
  })

  it('moving a statement carries its sub-statements to the end of the target root, with its title as prompt', () => {
    const view = applyDeckOps(detail, editor, [{ key: 'm', kind: 'moveItem', itemId: 's1', toNodeId: 'r2' }])
    expect(ids(view.editor?.nodes[0].items)).toEqual(['s2'])
    expect(view.editor?.nodes[1].items.map((i) => [i.id, i.parentId])).toEqual([
      ['t1', null],
      ['s1', null],
      ['s1a', 's1'],
    ])
    expect(view.detail.tree[0].children[0].items).toEqual([
      { id: 't1', prompt: 'Ty thể', parentId: null },
      { id: 's1', prompt: 'Ty thể', parentId: null },
      { id: 's1a', prompt: 'Ty thể', parentId: 's1' },
    ])
  })

  it('moving a sub-statement un-nests it, also within its own root', () => {
    const away = applyDeckOps(detail, editor, [{ key: 'm', kind: 'moveItem', itemId: 's1a', toNodeId: 'r2' }])
    expect(away.editor?.nodes[0].items.map((i) => i.id)).toEqual(['s1', 's2'])
    expect(away.editor?.nodes[1].items.at(-1)).toMatchObject({ id: 's1a', parentId: null })
    const here = applyDeckOps(detail, editor, [{ key: 'm', kind: 'moveItem', itemId: 's1a', toNodeId: 'r1' }])
    expect(here.editor?.nodes[0].items.map((i) => [i.id, i.parentId])).toEqual([
      ['s1', null],
      ['s2', null],
      ['s1a', null],
    ])
  })

  it('an unknown target moves nothing; a move into a root still saving follows its real id; settled moves rebase away', () => {
    expect(applyDeckOps(detail, editor, [{ key: 'm', kind: 'moveItem', itemId: 's1', toNodeId: 'nope' }]).editor).toEqual(editor)
    const ops: DeckOp[] = [
      { key: 'n', kind: 'addNode', tempId: 'pending-node-n', parentId: null, title: 'Năng lượng' },
      { key: 'm', kind: 'moveItem', itemId: 's2', toNodeId: 'pending-node-n' },
    ]
    expect(confirmNode(ops, 'n', 'r9')[1]).toMatchObject({ toNodeId: 'r9' })
    expect(applyDeckOps(detail, editor, ops).editor?.nodes.at(-1)?.items.map((i) => i.id)).toEqual(['s2'])
    // A refusal drops the move (the statement is back); a confirmation settles it.
    expect(applyDeckOps(detail, editor, dropOp(ops, 'm')).editor?.nodes[0].items.map((i) => i.id)).toContain('s2')
    expect(rebaseOps(settleOp([ops[1]], 'm'))).toEqual([])
  })
})

// ─── Bulk preview: edit and discard parsed lines before importing ─────────────────────────────────

describe('reviewBulkStatements (bulk preview edits)', () => {
  const notes = '- Ty thể sản sinh ATP.\n- Ribosome tổng hợp ptotein.\n- Rác rưởi copy nhầm'

  it('shows every parsed line unchanged without edits', () => {
    const { items, discarded } = reviewBulkStatements(notes)
    expect(items.map((i) => [i.statement, i.edited, i.problem])).toEqual([
      ['Ty thể sản sinh ATP.', false, null],
      ['Ribosome tổng hợp ptotein.', false, null],
      ['Rác rưởi copy nhầm', false, null],
    ])
    expect(discarded).toBe(0)
  })

  it('applies an inline edit (cleaned) and drops a discarded line, keyed by the parsed line', () => {
    const { items, discarded } = reviewBulkStatements(notes, [], {
      'Ribosome tổng hợp ptotein.': '  Ribosome   tổng hợp protein. ',
      'Rác rưởi copy nhầm': null,
    })
    expect(items.map((i) => i.statement)).toEqual(['Ty thể sản sinh ATP.', 'Ribosome tổng hợp protein.'])
    expect(items[1]).toMatchObject({ key: 'Ribosome tổng hợp ptotein.', edited: true, problem: null })
    expect(discarded).toBe(1)
  })

  it('checks edited lines again: too short, too long, LaTeX, already in the root, a duplicate of another line', () => {
    const { items } = reviewBulkStatements('- Một câu đúng.\n- Hai câu đúng.\n- Ba câu đúng.\n- Bốn câu đúng.\n- Năm câu đúng.', ['Có sẵn rồi.'], {
      'Một câu đúng.': 'abc',
      'Hai câu đúng.': 'x'.repeat(501),
      'Ba câu đúng.': 'Dùng \\frac{a}{b}',
      'Bốn câu đúng.': 'Có sẵn rồi.',
      'Năm câu đúng.': 'Một câu đúng.',
    })
    expect(items.map((i) => i.problem)).toEqual(['too-short', 'too-long', 'latex', 'exists', null])
    const dup = reviewBulkStatements('- Một câu đúng.\n- Hai câu đúng.', [], { 'Hai câu đúng.': 'Một câu đúng.' }).items
    expect(dup.map((i) => i.problem)).toEqual([null, 'duplicate'])
  })

  it('an edit back to the original text is not marked edited; edits of lines no longer pasted are ignored', () => {
    expect(reviewBulkStatements(notes, [], { 'Ty thể sản sinh ATP.': 'Ty thể sản sinh ATP.' }).items[0].edited).toBe(false)
    expect(reviewBulkStatements('- Một câu đúng.', [], { 'Không còn nữa.': null }).discarded).toBe(0)
  })
})

// ─── Services: create (sub-statement, insert below) and move, against an in-memory database ──────

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const ROOT_A = '55555555-5555-4555-8555-555555555555'
const ROOT_B = '66666666-6666-4666-8666-666666666666'
const ROOT_X = '77777777-7777-4777-8777-777777777777'
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const S1A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const S2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const T1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'

type Row = Record<string, unknown>

// Tables as arrays, the query builder subset the services use, RLS "deck owner" on knowledge_items
// writes, and the composite foreign key's ON UPDATE CASCADE (sub-statements follow their statement's node_id).
function fakeDb(viewer: string | null) {
  const db: Record<string, Row[]> = {
    decks: [
      { id: DECK, user_id: OWNER, slug: 'sinh-hoc', tree_type: 'oak' },
      { id: OTHER_DECK, user_id: OWNER, slug: 'khac', tree_type: 'oak' },
    ],
    mindmap_nodes: [
      { id: ROOT_A, deck_id: DECK, title: 'Tế bào' },
      { id: ROOT_B, deck_id: DECK, title: 'Ty thể' },
      { id: ROOT_X, deck_id: OTHER_DECK, title: 'Khác' },
    ],
    knowledge_items: [
      { id: S1, node_id: ROOT_A, parent_item_id: null, prompt: 'Tế bào', sort_order: 100 },
      { id: S1A, node_id: ROOT_A, parent_item_id: S1, prompt: 'Tế bào', sort_order: 110 },
      { id: S2, node_id: ROOT_A, parent_item_id: null, prompt: 'Tế bào', sort_order: 200 },
      { id: T1, node_id: ROOT_B, parent_item_id: null, prompt: 'Ty thể', sort_order: 300 },
    ],
  }
  const writes: { table: string; op: 'insert' | 'update'; data: Row; where?: Row }[] = []
  let nextId = 0
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      const where: Row = {}
      const orders: { col: string; asc: boolean }[] = []
      let limit = Infinity
      let mode: 'select' | 'update' | 'insert' = 'select'
      let payload: Row = {}
      const owned = () => viewer === OWNER
      const matching = () => {
        const rows = db[table].filter((r) => filters.every((f) => f(r)))
        for (const { col, asc } of [...orders].reverse()) rows.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
        return rows.slice(0, limit)
      }
      const run = (): { data: Row[]; error: null } => {
        if (mode === 'insert') {
          if (!owned()) return { data: [], error: null }
          const row = { id: `new-${nextId++}`, parent_item_id: null, sort_order: 9_999, ...payload }
          db[table].push(row)
          writes.push({ table, op: 'insert', data: payload })
          return { data: [{ id: row.id as string }], error: null }
        }
        if (mode === 'update') {
          if (!owned()) return { data: [], error: null }
          const rows = matching()
          writes.push({ table, op: 'update', data: payload, where: { ...where } })
          for (const row of rows) {
            if (table === 'knowledge_items' && 'node_id' in payload) {
              // FK (parent_item_id, node_id) → (id, node_id) ON UPDATE CASCADE.
              for (const child of db.knowledge_items) if (child.parent_item_id === row.id) child.node_id = payload.node_id
            }
            Object.assign(row, payload)
          }
          return { data: rows.map((r) => ({ id: r.id as string })), error: null }
        }
        return { data: matching(), error: null }
      }
      const q = {
        select: () => q,
        eq: (col: string, value: unknown) => {
          where[col] = value
          filters.push((r) => r[col] === value)
          return q
        },
        is: (col: string, value: unknown) => {
          where[col] = value
          filters.push((r) => (r[col] ?? null) === value)
          return q
        },
        gt: (col: string, value: number) => {
          filters.push((r) => (r[col] as number) > value)
          return q
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orders.push({ col, asc: opts?.ascending ?? true })
          return q
        },
        limit: (n: number) => {
          limit = n
          return q
        },
        update: (patch: Row) => {
          mode = 'update'
          payload = patch
          return q
        },
        insert: (row: Row) => {
          mode = 'insert'
          payload = row
          return q
        },
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        single: async () => ({ data: run().data[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve(run()).then(resolve),
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  const item = (id: string) => db.knowledge_items.find((r) => r.id === id)
  return { db, writes, item }
}

beforeEach(() => vi.clearAllMocks())

describe('createKnowledgeItem: sub-statements and rows typed below another', () => {
  it('adds a sub-statement under a statement of the same root', async () => {
    const { db } = fakeDb(OWNER)
    const res = await createKnowledgeItem({ nodeId: ROOT_A, statement: 'có DNA riêng', parentItemId: S1 })
    expect(res).toMatchObject({ success: true })
    expect(db.knowledge_items.at(-1)).toMatchObject({ node_id: ROOT_A, parent_item_id: S1, prompt: 'Tế bào', correct_stmt: 'có DNA riêng' })
  })

  it('refuses a parent in another root, a sub-statement as parent, and a visitor', async () => {
    const other = fakeDb(OWNER)
    expect(await createKnowledgeItem({ nodeId: ROOT_B, statement: 'có DNA riêng', parentItemId: S1 })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(await createKnowledgeItem({ nodeId: ROOT_A, statement: 'cấp ba thì không', parentItemId: S1A })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(other.writes).toEqual([])
    const visitor = fakeDb(VISITOR)
    expect(await createKnowledgeItem({ nodeId: ROOT_A, statement: 'không phải của tôi', parentItemId: S1 })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(visitor.writes).toEqual([])
  })

  it('gives a row typed below a statement a sort_order between it and the next one at its level', async () => {
    const { db } = fakeDb(OWNER)
    await createKnowledgeItem({ nodeId: ROOT_A, statement: 'Nhân chứa DNA.', afterItemId: S1 })
    // Between S1 (100) and S2 (200): its sub-statement S1A (110) is on another level.
    expect(db.knowledge_items.at(-1)?.sort_order).toBe(150)
    await createKnowledgeItem({ nodeId: ROOT_A, statement: 'cũng có ribosome', parentItemId: S1, afterItemId: S1A })
    // The last sub-statement: appended (insert time), never above its anchor.
    expect(db.knowledge_items.at(-1)?.sort_order).toBeGreaterThan(110)
  })

  it('without an anchor (or with one from another root) leaves the order to the column default', async () => {
    const { writes } = fakeDb(OWNER)
    await createKnowledgeItem({ nodeId: ROOT_A, statement: 'Thêm một câu nữa.' })
    await createKnowledgeItem({ nodeId: ROOT_A, statement: 'Và một câu khác.', afterItemId: T1 })
    expect(writes.map((w) => 'sort_order' in w.data)).toEqual([false, false])
  })

  it('validates the new fields before any query', async () => {
    const { writes } = fakeDb(OWNER)
    expect(await createKnowledgeItem({ nodeId: ROOT_A, statement: 'Một câu đúng.', parentItemId: 'nope' })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(writes).toEqual([])
  })
})

describe('moveKnowledgeItem: moving a statement between roots and sub-roots', () => {
  it('updates node_id (the foreign key brings its sub-statements along), un-nests it, and appends it', async () => {
    const { item, writes } = fakeDb(OWNER)
    const res = await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: ROOT_B })
    expect(res).toEqual({ success: true, data: { id: S1, nodeId: ROOT_B, subStatements: 1 } })
    expect(item(S1)).toMatchObject({ node_id: ROOT_B, parent_item_id: null, prompt: 'Ty thể' })
    // Last in the target root (T1 is 300).
    expect(item(S1)?.sort_order as number).toBeGreaterThan(300)
    // The sub-statement followed through the cascade, and its prompt was updated.
    expect(item(S1A)).toMatchObject({ node_id: ROOT_B, parent_item_id: S1, prompt: 'Ty thể' })
    expect(item(S2)).toMatchObject({ node_id: ROOT_A })
    expect(writes.map((w) => [w.op, w.where])).toEqual([
      ['update', { id: S1 }],
      ['update', { parent_item_id: S1 }],
    ])
    // One UPDATE writes node_id and parent_item_id together (never a dangling (parent, node) pair).
    expect(writes[0].data).toMatchObject({ node_id: ROOT_B, parent_item_id: null })
  })

  it('moves a sub-statement out on its own, also to its own root (it becomes a statement there)', async () => {
    const away = fakeDb(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1A, toNodeId: ROOT_B })).toMatchObject({ success: true, data: { subStatements: 0 } })
    expect(away.item(S1A)).toMatchObject({ node_id: ROOT_B, parent_item_id: null })
    expect(away.item(S1)).toMatchObject({ node_id: ROOT_A })
    const here = fakeDb(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1A, toNodeId: ROOT_A })).toMatchObject({ success: true })
    expect(here.item(S1A)).toMatchObject({ node_id: ROOT_A, parent_item_id: null })
  })

  it('does nothing for a statement already in that root', async () => {
    const { writes } = fakeDb(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S2, toNodeId: ROOT_A })).toEqual({ success: true, data: { id: S2, nodeId: ROOT_A, subStatements: 0 } })
    expect(writes).toEqual([])
  })

  it('refuses a target in another tree, a statement of another tree, visitors and signed-out callers', async () => {
    const cross = fakeDb(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: ROOT_X })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(await moveKnowledgeItem({ deckId: OTHER_DECK, itemId: S1, toNodeId: ROOT_X })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(cross.writes).toEqual([])
    const visitor = fakeDb(VISITOR)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: ROOT_B })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(visitor.item(S1)).toMatchObject({ node_id: ROOT_A })
    fakeDb(null)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: ROOT_B })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
  })

  it('validates ids with Zod before any query', async () => {
    const { writes } = fakeDb(OWNER)
    for (const input of [{ deckId: DECK, itemId: 'x', toNodeId: ROOT_B }, { deckId: DECK, itemId: S1 }, null]) {
      expect(await moveKnowledgeItem(input)).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect(writes).toEqual([])
  })
})

// ─── Migration 22: the database keeps the hierarchy honest ────────────────────────────────────────

describe('migration 20261010000000_sub_statements.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261010000000_sub_statements.sql'), 'utf8')
  const body = sql.split(/^-- Verify/m)[0]

  it('ties a sub-statement to a statement of the SAME root, moving and deleting with it', () => {
    expect(body).toMatch(/unique \(id, node_id\)/)
    expect(body).toMatch(
      /foreign key \(parent_item_id, node_id\) references public\.knowledge_items \(id, node_id\)\s+on update cascade on delete cascade/,
    )
    expect(body).toMatch(/check \(parent_item_id <> id\)/)
  })

  it('allows one level only, in a trigger', () => {
    expect(body).toMatch(/create trigger knowledge_items_one_level\s+before insert or update of parent_item_id on public\.knowledge_items/)
    expect(body).toContain('SUB_STATEMENT_TOO_DEEP')
  })

  it('orders statements: existing rows keep their creation order, new ones append', () => {
    expect(body).toMatch(/set sort_order = extract\(epoch from created_at\)/)
    expect(body).toMatch(/set default \(extract\(epoch from clock_timestamp\(\)\)::double precision\)/)
  })

  it('grants only the new, non-secret columns', () => {
    expect(body).toMatch(/grant select \(parent_item_id, sort_order\) on table public\.knowledge_items to anon, authenticated/)
    expect(body).not.toMatch(/grant select[^;]*(correct_stmt|trap_rules)/)
  })

  it('clone_deck copies the hierarchy (statements before sub-statements, ids remapped) and the order, and still never progress', () => {
    expect(body).toMatch(/order by \(ki\.parent_item_id is not null\), ki\.sort_order/)
    expect(body).toMatch(/\(v_imap ->> v_item\.parent_item_id::text\)::uuid/)
    expect(body).toMatch(/insert into public\.knowledge_items \(node_id, parent_item_id, prompt, correct_stmt, trap_rules, sort_order\)/)
    expect(body).not.toMatch(/insert into public\.user_progress/)
    // Same price rule as migration 18.
    expect(body).toContain('v_cost := public.seed_price(v_source.tree_type) + least(v_items, 50)')
  })
})

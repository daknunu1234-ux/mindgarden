import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, migratedDb } from '@/test/pglite'
import { indentRow, outlineRows, type StoredNode } from '../lib/contentTree'
import type { ContentRow } from '../types'

// indent_content_node (Tab / Shift+Tab) on a real PostgreSQL (PGlite): for every row and both
// directions, the database does exactly what the page predicted (lib/contentTree indentRow, the
// deck draft's optimistic step): same parents, same depths, the outline order untouched, no row
// added or removed. And it refuses what the page refuses.

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

// cell: s1 ─ s1a ─ s1aa; s2; nucleus (root): n1, dna (root); membrane (root): m1 ─ wall (root): w1
// energy: e1
const TREE: [name: string, parent: string | null, type: 'root' | 'statement', sort: number][] = [
  ['cell', null, 'root', 1],
  ['s1', 'cell', 'statement', 1],
  ['s1a', 's1', 'statement', 1],
  ['s1aa', 's1a', 'statement', 1],
  ['s2', 'cell', 'statement', 2],
  ['nucleus', 'cell', 'root', 3],
  ['n1', 'nucleus', 'statement', 1],
  ['dna', 'nucleus', 'root', 2],
  ['membrane', 'cell', 'root', 4],
  ['m1', 'membrane', 'statement', 1],
  ['wall', 'm1', 'root', 1],
  ['w1', 'wall', 'statement', 1],
  ['energy', null, 'root', 2],
  ['e1', 'energy', 'statement', 1],
]
const ID = Object.fromEntries(TREE.map(([name], i) => [name, `a0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
const NAME = Object.fromEntries(Object.entries(ID).map(([name, id]) => [id, name]))

let db: PGlite

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev'), ($2, 'visitor@test.dev')`, [OWNER, VISITOR])
  await db.query(`insert into public.decks (id, user_id, title, slug, is_public) values ($1, $2, 'Sinh học', 'sinh-hoc', true)`, [DECK, OWNER])
  for (const [name, parent, type, sort] of TREE) {
    await db.query(`insert into public.content_nodes (id, deck_id, parent_id, content, node_type, sort_order) values ($1, $2, $3, $4, $5, $6)`, [
      ID[name],
      DECK,
      parent && ID[parent],
      `Nội dung ${name}`,
      type,
      sort,
    ])
  }
}, 120_000)

// The outline as the app reads it, by name.
async function readOutline(): Promise<ContentRow[]> {
  const { rows } = await db.query<{ id: string; parent_id: string | null; node_type: 'root' | 'statement'; content: string; sort_order: number; created_at: string }>(
    `select id, parent_id, node_type, content, sort_order, created_at::text from public.content_nodes where deck_id = $1`,
    [DECK],
  )
  const stored: StoredNode[] = rows.map((r) => ({
    id: NAME[r.id],
    parentId: r.parent_id && NAME[r.parent_id],
    type: r.node_type,
    content: r.content,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }))
  return outlineRows(stored)
}

// Run one indent in a transaction that is rolled back, so every case starts from the same tree.
async function tryIndent(name: string, dir: 'in' | 'out'): Promise<ContentRow[] | string> {
  await db.query('begin')
  try {
    await db.query(`select * from public.indent_content_node($1, $2)`, [ID[name], dir])
    return await readOutline()
  } catch (e) {
    return (e as Error).message
  } finally {
    await db.query('rollback')
  }
}

const shape = (rows: readonly ContentRow[]) => rows.map((r) => [r.id, r.parentId, r.depth])

describe('indent_content_node', () => {
  it('does exactly what the page predicted, for every row, both ways (order and count never change)', async () => {
    await asUser(db, OWNER)
    const before = await readOutline()
    let moves = 0
    for (const dir of ['in', 'out'] as const) {
      for (const row of before) {
        const predicted = indentRow(before, row.id, dir)
        const actual = await tryIndent(row.id, dir)
        if (typeof predicted === 'string') {
          expect(typeof actual, `${dir} ${row.id}: refused`).toBe('string')
          continue
        }
        moves++
        expect(typeof actual, `${dir} ${row.id}: ${actual}`).not.toBe('string')
        expect(shape(actual as ContentRow[]), `${dir} ${row.id}`).toEqual(shape(predicted))
        expect((actual as ContentRow[]).map((r) => r.id)).toEqual(before.map((r) => r.id))
      }
    }
    expect(moves).toBeGreaterThan(10)
    // Nothing leaked from the rolled-back cases.
    expect(await readOutline()).toEqual(before)
  })

  it('names why it refuses', async () => {
    await asUser(db, OWNER)
    expect(await tryIndent('s1', 'in')).toMatch(/NO_ROW_ABOVE/)
    expect(await tryIndent('cell', 'out')).toMatch(/ALREADY_TOP/)
    expect(await tryIndent('s1', 'out')).toMatch(/TOP_LEVEL_STATEMENT/)
  })

  it('only the owner may indent', async () => {
    await asUser(db, VISITOR)
    expect(await tryIndent('s2', 'in')).toMatch(/AUTH_FORBIDDEN|NODE_NOT_FOUND/)
    await asUser(db, null)
    expect(await tryIndent('s2', 'in')).toMatch(/AUTH_UNAUTHORIZED/)
  })

  it('Tab after Tab keeps working: repeated midpoints stay in order', async () => {
    await asUser(db, OWNER)
    await db.query('begin')
    try {
      // Shift+Tab then Tab on the same row, many times: sort_order keeps halving gaps.
      for (let i = 0; i < 30; i++) {
        await db.query(`select * from public.indent_content_node($1, 'out')`, [ID.s1a])
        await db.query(`select * from public.indent_content_node($1, 'in')`, [ID.s1a])
      }
      const rows = await readOutline()
      expect(rows.map((r) => r.id)).toEqual(TREE.map(([name]) => name))
    } finally {
      await db.query('rollback')
    }
  })
})

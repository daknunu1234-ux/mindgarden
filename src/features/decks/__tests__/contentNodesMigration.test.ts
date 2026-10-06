import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyFrom, asUser, migratedDb } from '@/test/pglite'

// The move to content_nodes (20261013000000), on a real PostgreSQL (PGlite): a tree built in the OLD
// schema (mindmap_nodes + knowledge_items with sub-statements, progress, tournament progress) is
// migrated, then checked row by row: same ids, the right parents and types, the outline in the same
// order, progress attached, the old tables stepped aside, and the functions working on the new table.

const UNIFY = '20261013000000_content_nodes.sql'
const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'

let db: PGlite
const one = async <T,>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<T>(sql, params)).rows[0]
const all = async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).n)

// The old tree (ids decided here so they can be followed through the move):
//   Sinh học (root R, sort 0)
//     statements: "Tế bào là đơn vị sống." (T1)
//     Bào quan (sub-root O, sort 0): "Ty thể" (M) ─ "sản sinh ATP" (M1), "có DNA riêng" (M2); "Ribosome…" (B)
//     Phân tử (sub-root P, sort 1)
//   Năng lượng (root E, sort 1): "ATP là năng lượng." (A)
const ID = {
  deck: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  R: 'a0000000-0000-4000-8000-000000000001',
  O: 'a0000000-0000-4000-8000-000000000002',
  P: 'a0000000-0000-4000-8000-000000000003',
  E: 'a0000000-0000-4000-8000-000000000004',
  T1: 'b0000000-0000-4000-8000-000000000001',
  M: 'b0000000-0000-4000-8000-000000000002',
  M1: 'b0000000-0000-4000-8000-000000000003',
  M2: 'b0000000-0000-4000-8000-000000000004',
  B: 'b0000000-0000-4000-8000-000000000005',
  A: 'b0000000-0000-4000-8000-000000000006',
}

beforeAll(async () => {
  db = await migratedDb({ before: UNIFY })
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev'), ($2, 'visitor@test.dev')`, [OWNER, VISITOR])
  await db.query(`insert into public.decks (id, user_id, title, slug, is_public, is_tournament_open) values ($1, $2, 'Sinh học', 'sinh-hoc', true, true)`, [ID.deck, OWNER])
  // Roots: inserted out of order on purpose (sort_order decides).
  for (const [id, parent, title, sort] of [
    [ID.E, null, 'Năng lượng', 1],
    [ID.R, null, 'Sinh học', 0],
    [ID.P, ID.R, 'Phân tử', 1],
    [ID.O, ID.R, 'Bào quan', 0],
  ] as const) {
    await db.query(`insert into public.mindmap_nodes (id, deck_id, parent_id, title, sort_order) values ($1, $2, $3, $4, $5)`, [id, ID.deck, parent, title, sort])
  }
  for (const [id, node, parent, text, sort] of [
    [ID.B, ID.O, null, 'Ribosome tổng hợp protein.', 30],
    [ID.M, ID.O, null, 'Ty thể', 10],
    [ID.M2, ID.O, ID.M, 'có DNA riêng', 12],
    [ID.M1, ID.O, ID.M, 'sản sinh ATP', 11],
    [ID.T1, ID.R, null, 'Tế bào là đơn vị sống.', 5],
    [ID.A, ID.E, null, 'ATP là năng lượng.', 1],
  ] as const) {
    await db.query(
      `insert into public.knowledge_items (id, node_id, parent_item_id, prompt, correct_stmt, trap_rules, sort_order)
       values ($1, $2, $3, 'p', $4, '{"negate": true}', $5)`,
      [id, node, parent, text, sort],
    )
  }
  await db.query(`insert into public.user_progress (user_id, knowledge_item_id, mastery_level) values ($1, $2, 4), ($1, $3, 2)`, [OWNER, ID.M1, ID.B])
  const participant = await one<{ id: string }>(`insert into public.deck_tournament_participants (deck_id, user_id) values ($1, $2) returning id`, [ID.deck, VISITOR])
  await db.query(`insert into public.deck_tournament_item_progress (participant_id, knowledge_item_id, mastery_level) values ($1, $2, 3)`, [participant.id, ID.A])

  // Only the move: the optional drop of the legacy tables (20261013000100) is checked at the end.
  await applyFrom(db, UNIFY, { through: UNIFY })
}, 120_000)

// The outline as the app reads it: each node, then its children by sort_order (created_at, id).
async function outline(deck: string) {
  const rows = await all<{ id: string; parent_id: string | null; node_type: string; content: string; sort_order: number; created_at: string }>(
    `select id, parent_id, node_type, content, sort_order, created_at::text from public.content_nodes where deck_id = $1`,
    [deck],
  )
  const out: { id: string; depth: number; type: string }[] = []
  const visit = (parent: string | null, depth: number) =>
    rows
      .filter((r) => r.parent_id === parent)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .forEach((r) => {
        out.push({ id: r.id, depth, type: r.node_type })
        visit(r.id, depth + 1)
      })
  visit(null, 0)
  return out
}

describe('moving roots and statements into content_nodes', () => {
  it('copies every root and statement once, with the same ids, types and text', async () => {
    expect(await count(`public.content_nodes where deck_id = $1`, [ID.deck])).toBe(10)
    expect(await one(`select node_type, content, parent_id from public.content_nodes where id = $1`, [ID.O])).toEqual({ node_type: 'root', content: 'Bào quan', parent_id: ID.R })
    expect(await one(`select node_type, content, parent_id from public.content_nodes where id = $1`, [ID.M1])).toEqual({ node_type: 'statement', content: 'sản sinh ATP', parent_id: ID.M })
    expect(await one(`select parent_id from public.content_nodes where id = $1`, [ID.B])).toEqual({ parent_id: ID.O })
    expect(await one(`select trap_rules from public.content_nodes where id = $1`, [ID.A])).toEqual({ trap_rules: { negate: true } })
  })

  it('keeps the outline in exactly the order it showed: a root, its statements, then its sub-roots', async () => {
    expect((await outline(ID.deck)).map((r) => [r.id, r.depth, r.type])).toEqual([
      [ID.R, 0, 'root'],
      [ID.T1, 1, 'statement'],
      [ID.O, 1, 'root'],
      [ID.M, 2, 'statement'],
      [ID.M1, 3, 'statement'],
      [ID.M2, 3, 'statement'],
      [ID.B, 2, 'statement'],
      [ID.P, 1, 'root'],
      [ID.E, 0, 'root'],
      [ID.A, 1, 'statement'],
    ])
  })

  it('keeps progress, now pointing at content_nodes (deleting a node removes its progress)', async () => {
    expect(await all(`select knowledge_item_id, mastery_level from public.user_progress order by mastery_level desc`)).toEqual([
      { knowledge_item_id: ID.M1, mastery_level: 4 },
      { knowledge_item_id: ID.B, mastery_level: 2 },
    ])
    expect(await count(`public.deck_tournament_item_progress where knowledge_item_id = $1`, [ID.A])).toBe(1)
    const fks = await all<{ table: string; ref: string }>(
      `select rel.relname as table, ref.relname as ref from pg_constraint c
         join pg_class rel on rel.oid = c.conrelid join pg_class ref on ref.oid = c.confrelid
        where c.contype = 'f' and rel.relname in ('user_progress', 'deck_tournament_item_progress') and ref.relname not in ('users', 'deck_tournament_participants')`,
    )
    expect(fks.sort((a, b) => a.table.localeCompare(b.table))).toEqual([
      { table: 'deck_tournament_item_progress', ref: 'content_nodes' },
      { table: 'user_progress', ref: 'content_nodes' },
    ])
  })

  it('renames the old tables out of the way (kept for rollback)', async () => {
    const tables = await all<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' and (tablename like '%mindmap_nodes' or tablename like '%knowledge_items') order by 1`)
    expect(tables.map((t) => t.tablename)).toEqual(['legacy_knowledge_items', 'legacy_mindmap_nodes'])
    expect(await count(`public.legacy_knowledge_items`)).toBe(6)
  })
})

describe('content_nodes rules and functions', () => {
  it('a top-level node is a root; no node goes under its own branch; a node stays in its tree', async () => {
    await expect(db.query(`insert into public.content_nodes (deck_id, parent_id, content, node_type) values ($1, null, 'lạc lõng', 'statement')`, [ID.deck])).rejects.toThrow(
      /TOP_LEVEL_STATEMENT/,
    )
    await expect(db.query(`update public.content_nodes set node_type = 'statement' where id = $1`, [ID.E])).rejects.toThrow(/TOP_LEVEL_STATEMENT/)
    await expect(db.query(`update public.content_nodes set parent_id = $1 where id = $2`, [ID.M1, ID.O])).rejects.toThrow(/NODE_CYCLE/)
    await expect(db.query(`insert into public.content_nodes (deck_id, parent_id, content) values ($1, $2, 'sai cây')`, ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', ID.R])).rejects.toThrow()
    await expect(db.query(`update public.content_nodes set content = 'Dùng \\frac{a}{b}' where id = $1`, [ID.B])).rejects.toThrow(/plain_statement/)
  })

  it('toggling the type is one UPDATE: no row added or removed, progress untouched', async () => {
    const before = await count(`public.content_nodes`)
    await db.query(`update public.content_nodes set node_type = 'root' where id = $1`, [ID.B])
    await db.query(`update public.content_nodes set node_type = 'statement' where id = $1`, [ID.B])
    expect(await count(`public.content_nodes`)).toBe(before)
    expect(await one(`select mastery_level from public.user_progress where knowledge_item_id = $1`, [ID.B])).toEqual({ mastery_level: 2 })
  })

  it('award_mastery_coin finds the tree through the node', async () => {
    await db.query(`update public.user_progress set mastery_level = 5 where knowledge_item_id = $1`, [ID.M1])
    const before = (await one<{ coins: number }>(`select coins from public.users where id = $1`, [OWNER])).coins
    expect(await one(`select * from public.award_mastery_coin($1, $2)`, [OWNER, ID.M1])).toEqual({ coins_earned: 1, total_coins: before + 1 })
  })

  it('record_tournament_answer accepts a statement of the tree and refuses a root', async () => {
    const drillable = [ID.T1, ID.M, ID.M1, ID.M2, ID.B, ID.A]
    expect(await one(`select mastery_level from public.record_tournament_answer($1, $2, $3, true, current_date, $4)`, [VISITOR, ID.deck, ID.A, drillable])).toEqual({ mastery_level: 4 })
    await expect(db.query(`select * from public.record_tournament_answer($1, $2, $3, true, current_date, $4)`, [VISITOR, ID.deck, ID.O, [...drillable, ID.O]])).rejects.toThrow(/ITEM_NOT_FOUND/)
  })

  it('clone_deck copies every node with its type, parent and order, and no progress', async () => {
    await asUser(db, VISITOR)
    const clone = await one<{ deck_id: string; cost: number }>(`select * from public.clone_deck($1, 'sinh-hoc-copy')`, [ID.deck])
    expect(clone.cost).toBe(100 + 6)
    const copy = await outline(clone.deck_id)
    const original = await outline(ID.deck)
    expect(copy.map((r) => [r.depth, r.type])).toEqual(original.map((r) => [r.depth, r.type]))
    expect(await count(`public.content_nodes where deck_id = $1`, [clone.deck_id])).toBe(10)
    expect(await count(`public.user_progress p join public.content_nodes c on c.id = p.knowledge_item_id where c.deck_id = $1`, [clone.deck_id])).toBe(0)
  })

  it('uproot_deck counts statements (not roots) for the Woodshop refund', async () => {
    await asUser(db, OWNER)
    await db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y, width, height) values ($1, 'woodshop', 0, 0, 2, 2)`, [OWNER])
    const res = await one<{ refund: number }>(`select * from public.uproot_deck($1)`, [ID.deck])
    // 6 statements → floor(6 × 0.25) = 1 (roots don't count).
    expect(res.refund).toBe(1)
    expect(await count(`public.content_nodes where deck_id = $1`, [ID.deck])).toBe(0)
    expect(await count(`public.user_progress where user_id = $1`, [OWNER])).toBe(0)
  })
})

describe('20261013000100_drop_legacy_trees.sql', () => {
  it('drops the legacy tables, and the app tables keep working without them', async () => {
    await applyFrom(db, '20261013000100_drop_legacy_trees.sql')
    expect(await count(`pg_tables where schemaname = 'public' and tablename like 'legacy_%'`)).toBe(0)
    expect(await count(`public.content_nodes`)).toBeGreaterThan(0)
  })
})

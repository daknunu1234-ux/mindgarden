import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportOutlineDto, MAX_OUTLINE_LINES } from '../dto/ImportOutlineDto'
import { MAX_OUTLINE_DEPTH, planOutline } from '../lib/outlinePlan'

// importOutline (decks): a confirmed document outline into the owner's tree. Placement (planOutline),
// validation (ImportOutlineDto) and the level-by-level insert with its rollback (insertOutline).

const DECK = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'

const R = (depth: number, text: string) => ({ depth, type: 'root' as const, text })
const S = (depth: number, text: string) => ({ depth, type: 'statement' as const, text })

describe('planOutline: where each line goes', () => {
  it('every line under the nearest line above it one level up; each parent numbers its children in order', () => {
    const plan = planOutline([
      R(0, 'Sinh học tế bào'),
      S(1, 'Mọi sinh vật đều cấu tạo từ tế bào.'),
      R(1, 'Bào quan'),
      S(2, 'Ty thể sản sinh ATP.'),
      S(3, 'Ty thể có DNA riêng.'), // a sub-statement
      S(2, 'Ribosome: tổng hợp protein'),
      R(2, 'Lục lạp'), // a sub-sub-root
      S(3, 'Lục lạp quang hợp.'),
      R(0, 'Năng lượng'),
      S(1, 'ATP là đồng tiền năng lượng.'),
    ])
    expect(plan.map((l) => [l.index, l.depth, l.parent, l.order])).toEqual([
      [0, 0, null, 1],
      [1, 1, 0, 1],
      [2, 1, 0, 2], // roots and statements share their parent's order
      [3, 2, 2, 1],
      [4, 3, 3, 1],
      [5, 2, 2, 2],
      [6, 2, 2, 3],
      [7, 3, 6, 1],
      [8, 0, null, 2],
      [9, 1, 8, 1],
    ])
  })

  it('a line deeper than it can be goes one level below the line above it', () => {
    expect(planOutline([R(0, 'Gốc'), S(3, 'Nhảy cóc ba cấp.')]).map((l) => [l.depth, l.parent])).toEqual([
      [0, null],
      [1, 0],
    ])
  })
})

describe('ImportOutlineDto: only a sound outline gets through', () => {
  const ok = (items: { depth: number; type: string; text: string }[]) => ImportOutlineDto.safeParse({ deckId: DECK, items })

  it('cleans text and accepts any nesting the Workshop allows', () => {
    const res = ok([R(0, '  Tế bào​ '), R(1, 'Bào quan'), S(2, 'MBIs:   người ngoài mua lại'), S(3, 'Một ý con của câu trên.')])
    expect(res.success && res.data.items).toEqual([R(0, 'Tế bào'), R(1, 'Bào quan'), S(2, 'MBIs: người ngoài mua lại'), S(3, 'Một ý con của câu trên.')])
  })

  it('refuses a bad shape, bad lengths, LaTeX, unknown types and too many lines', () => {
    expect(ok([S(0, 'Một câu đầu tiên.')]).success).toBe(false) // a top-level statement
    expect(ok([R(1, 'Gốc')]).success).toBe(false) // does not start at the top
    expect(ok([R(0, 'Gốc'), S(2, 'Nhảy cóc một cấp.')]).success).toBe(false) // skips a level
    expect(ok([R(0, 'Gốc'), S(1, 'abc')]).success).toBe(false)
    expect(ok([R(0, 'Gốc'), S(1, 'x'.repeat(501))]).success).toBe(false)
    expect(ok([R(0, 'R'.repeat(151))]).success).toBe(false)
    expect(ok([R(0, '   ')]).success).toBe(false)
    expect(ok([R(0, 'Gốc'), S(1, String.raw`Diện tích là \frac{a}{b} nhé`)]).success).toBe(false)
    expect(ok([{ depth: 0, type: 'leaf', text: 'Gốc' }]).success).toBe(false)
    expect(ok([]).success).toBe(false)
    const deep = Array.from({ length: MAX_OUTLINE_DEPTH + 2 }, (_, d) => R(d, `Cấp ${d}`))
    expect(ok(deep).success).toBe(false)
    expect(ok(deep.slice(0, MAX_OUTLINE_DEPTH + 1)).success).toBe(true)
    const many = [R(0, 'Gốc'), ...Array.from({ length: MAX_OUTLINE_LINES }, (_, i) => S(1, `Câu số ${i}.`))]
    expect(ok(many).success).toBe(false)
    expect(ok(many.slice(0, MAX_OUTLINE_LINES)).success).toBe(true)
  })

  it('takes only depth, type and text: no ids, owners or file contents', () => {
    const res = ImportOutlineDto.safeParse({ deckId: DECK, userId: 'x', file: 'base64…', items: [{ ...R(0, 'Gốc'), id: 'x', parentId: 'y' }] })
    expect(res.success && res.data).toEqual({ deckId: DECK, items: [R(0, 'Gốc')] })
  })
})

// ── insertOutline with an in-memory content_nodes ─────────────────────────────────────────────

type Node = { id: string; deck_id: string; parent_id: string | null; content: string; node_type: 'root' | 'statement'; sort_order: number; trap_rules: unknown }
const db = { owner: OWNER, nodes: [] as Node[], failOnType: null as null | 'root' | 'statement', failAfterInserts: Infinity, inserts: 0, nextId: 1 }

vi.mock('../services/authoring', () => ({
  checkDeckOwner: async (_s: unknown, deckId: string, userId: string) =>
    deckId !== DECK ? { success: false, error: { code: 'DECK_NOT_FOUND', message: 'Deck not found' } } : userId !== db.owner ? { success: false, error: { code: 'AUTH_FORBIDDEN', message: 'Only the owner can edit this tree' } } : { success: true, data: { slug: 'sinh-hoc', treeType: 'oak' } },
}))

import { insertOutline } from '../services/outlineImport'

function client() {
  return {
    from: () => {
      const filters: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          filters[col] = v
          return q
        },
        is: async (col: string, v: null) => ({ data: db.nodes.filter((n) => n.deck_id === filters.deck_id && (n as Record<string, unknown>)[col] === v), error: null }),
        insert: (rows: Omit<Node, 'id'>[]) => ({
          select: async () => {
            db.inserts += 1
            if (db.inserts > db.failAfterInserts || rows.some((r) => r.node_type === db.failOnType && db.failAfterInserts === Infinity && db.failOnType !== null)) return { data: null, error: { code: '23514', message: 'check failed' } }
            const added = rows.map((r) => ({ ...r, id: `n${db.nextId++}` }))
            for (const r of added) {
              // The shape trigger: a top-level node is a root; a parent must exist in this tree.
              if (r.parent_id === null && r.node_type !== 'root') return { data: null, error: { code: 'P0001', message: 'TOP_LEVEL_STATEMENT' } }
              if (r.parent_id !== null && !db.nodes.some((n) => n.id === r.parent_id && n.deck_id === r.deck_id)) return { data: null, error: { code: '23503', message: 'fk' } }
              db.nodes.push(r)
            }
            return { data: added.map((r) => ({ id: r.id })), error: null }
          },
        }),
        delete: () => ({
          in: async (_col: string, ids: string[]) => {
            // ON DELETE CASCADE down the branch.
            const gone = new Set(ids)
            let grew = true
            while (grew) {
              grew = false
              for (const n of db.nodes) if (n.parent_id && gone.has(n.parent_id) && !gone.has(n.id)) {
                gone.add(n.id)
                grew = true
              }
            }
            db.nodes = db.nodes.filter((n) => !gone.has(n.id))
            return { error: null }
          },
        }),
      }
      return q
    },
  } as never
}

const OUTLINE = [
  R(0, 'Sinh học tế bào'),
  R(1, 'Bào quan'),
  S(2, 'Ty thể sản sinh ATP.'),
  S(3, 'Ty thể có DNA riêng.'),
  S(2, 'Ribosome: tổng hợp protein'),
  R(0, 'Năng lượng'),
  S(1, 'ATP là đồng tiền năng lượng.'),
]
const childrenOf = (parent: string | null) => db.nodes.filter((n) => n.parent_id === parent).sort((a, b) => a.sort_order - b.sort_order)

beforeEach(() => {
  db.owner = OWNER
  db.nodes = [{ id: 'old', deck_id: DECK, parent_id: null, content: 'Gốc có sẵn', node_type: 'root', sort_order: 4, trap_rules: {} }]
  db.failOnType = null
  db.failAfterInserts = Infinity
  db.inserts = 0
  db.nextId = 1
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('insertOutline', () => {
  it('adds the outline after the existing roots, depth by depth, each node under its parent in order', async () => {
    const res = await insertOutline(client(), OWNER, { deckId: DECK, items: OUTLINE })
    expect(res).toEqual({ success: true, data: { slug: 'sinh-hoc', roots: 2, subRoots: 1, statements: 4 } })
    expect(db.inserts).toBe(4) // one insert per depth (0–3)
    expect(childrenOf(null).map((n) => [n.content, n.sort_order])).toEqual([
      ['Gốc có sẵn', 4],
      ['Sinh học tế bào', 5],
      ['Năng lượng', 6],
    ])
    const cell = childrenOf(null)[1]
    const organelles = childrenOf(cell.id)
    expect(organelles.map((n) => [n.content, n.node_type])).toEqual([['Bào quan', 'root']])
    expect(childrenOf(organelles[0].id).map((n) => [n.content, n.node_type, n.sort_order])).toEqual([
      ['Ty thể sản sinh ATP.', 'statement', 1],
      ['Ribosome: tổng hợp protein', 'statement', 2],
    ])
    // A sub-statement under its statement.
    const mito = db.nodes.find((n) => n.content === 'Ty thể sản sinh ATP.')!
    expect(childrenOf(mito.id).map((n) => [n.content, n.node_type])).toEqual([['Ty thể có DNA riêng.', 'statement']])
    expect(childrenOf(childrenOf(null)[2].id).map((n) => n.content)).toEqual(['ATP là đồng tiền năng lượng.'])
    // Statements get the drill's default trap rules; roots none.
    expect(db.nodes.find((n) => n.content === 'Ty thể sản sinh ATP.')!.trap_rules).toEqual({ negate: true })
    expect(cell.trap_rules).toEqual({})
  })

  it('a failure part-way removes everything it added (no half import), and the tree is as before', async () => {
    db.failAfterInserts = 3 // depths 0–2 go in, depth 3 fails
    const res = await insertOutline(client(), OWNER, { deckId: DECK, items: OUTLINE })
    expect(res).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not import the outline; nothing was added' } })
    expect(db.nodes.map((n) => n.id)).toEqual(['old'])
  })

  it('only the owner can import, and nothing is written otherwise', async () => {
    db.owner = 'someone-else'
    expect(await insertOutline(client(), OWNER, { deckId: DECK, items: OUTLINE })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(await insertOutline(client(), OWNER, { deckId: '33333333-3333-4333-8333-333333333333', items: OUTLINE })).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
    expect(db.inserts).toBe(0)
  })
})

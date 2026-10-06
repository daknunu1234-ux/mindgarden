import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sub-statements in practice: both levels are queried by the real listDrillItems (fake database,
// answers mocked), asked in rounds, kept in a branch round, and graded against the same context.

vi.mock('@/features/decks/services/answers', () => ({ readTrapRules: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { readTrapRules } from '@/features/decks/services/answers'
import { gradeSubmission } from '@/features/progress/server'
import { fakeContentDb, type FakeNode } from '@/test/fakeContentDb'
import { buildDrillSession } from '../services/drillSession'

const OWNER = 'owner-1'
const LONG_PARENT = 'Nhân tế bào là trung tâm điều khiển mọi hoạt động sống của tế bào và chứa gần như toàn bộ vật chất di truyền.'

// Sinh học (n-bio) ─┬─ Tế bào được phát hiện năm 1665
//                   ├─ Bào quan (n-org): Ty thể ─┬─ sản sinh ATP
//                   │                            └─ có DNA riêng
//                   │                   Ribosome: tổng hợp protein
//                   │                   <LONG_PARENT> ── nằm trong vùng nhân
//                   └─ Phân tử (n-mol): ATP, Glucose
// One content_nodes table: roots and statements alike, a statement's parent may be a statement.
const st = (id: string, parent: string, order: number, content: string): FakeNode => ({ id, deck_id: 'd1', parent_id: parent, node_type: 'statement', content, sort_order: order })
const NODES: FakeNode[] = [
  // Listed out of order on purpose: sort_order decides.
  st('c2', 'p1', 2, 'có DNA riêng'),
  st('p1', 'n-org', 1, 'Ty thể'),
  st('c1', 'p1', 1, 'sản sinh ATP'),
  st('p2', 'n-org', 2, 'Ribosome: tổng hợp protein'),
  st('p3', 'n-org', 3, LONG_PARENT),
  st('c3', 'p3', 1, 'nằm trong vùng nhân'),
  st('m1', 'n-mol', 1, 'ATP'),
  st('m2', 'n-mol', 2, 'Glucose'),
  st('b1', 'n-bio', 1, 'Tế bào được phát hiện năm 1665'),
  { id: 'n-bio', deck_id: 'd1', parent_id: null, node_type: 'root', content: 'Sinh học', sort_order: 1 },
  { id: 'n-org', deck_id: 'd1', parent_id: 'n-bio', node_type: 'root', content: 'Bào quan', sort_order: 2 },
  { id: 'n-mol', deck_id: 'd1', parent_id: 'n-bio', node_type: 'root', content: 'Phân tử', sort_order: 3 },
]
const STATEMENTS = NODES.filter((n) => n.node_type === 'statement')
const DECK = { id: 'd1', slug: 'sinh-hoc', title: 'Sinh học', tree_type: 'oak', user_id: OWNER, is_public: false, is_tournament_open: false }

// The drill path's reads, recorded: the deck row, the tree's content nodes, one node (grading).
function fakeSupabase() {
  const fake = fakeContentDb({ viewer: OWNER, decks: [DECK], nodes: NODES })
  const selects: string[] = []
  const client = {
    ...fake.client,
    from: (table: string) => {
      const q = fake.client.from(table)
      const select = q.select.bind(q)
      return Object.assign(q, { select: (cols: string) => (selects.push(`${table}: ${cols}`), select(cols)) })
    },
  }
  return { client: client as never, selects }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readTrapRules).mockImplementation(async (_client, ids) => ({ success: true, data: new Map(ids.map((id) => [id, { negate: true }])) }))
})

describe('listDrillItems with sub-statements', () => {
  it('reads every statement node at any depth, in statement order, with their parent', async () => {
    const { client, selects } = fakeSupabase()
    const res = await listDrillItems(client, { deckId: 'd1' })
    if (!res.success) throw new Error(res.error.message)
    expect(res.data.items.map((i) => i.id)).toEqual(['b1', 'p1', 'c1', 'c2', 'p2', 'p3', 'c3', 'm1', 'm2'])
    expect(Object.fromEntries(res.data.items.map((i) => [i.id, i.parentItemId]))).toMatchObject({ p1: null, c1: 'p1', c2: 'p1', c3: 'p3', m1: null })
    // One table, no join; the trap rules are read apart (service role), never with the outline.
    expect(selects.filter((s) => !s.startsWith('decks'))).toEqual(['content_nodes: id, parent_id, node_type, content, sort_order, created_at'])
    expect(selects.join(' ')).not.toMatch(/trap_rules|knowledge_items|mindmap_nodes/)
    expect(readTrapRules).toHaveBeenCalledWith(expect.anything(), res.data.items.map((i) => i.id))
  })

  it('gives a sub-statement its short parent statement as context; a long parent leaves the root’s', async () => {
    const { client } = fakeSupabase()
    const res = await listDrillItems(client, { deckId: 'd1' })
    if (!res.success) throw new Error(res.error.message)
    const byId = new Map(res.data.items.map((i) => [i.id, i]))
    expect(byId.get('c1')).toMatchObject({ nodeId: 'n-org', path: ['Sinh học', 'Bào quan', 'Ty thể'], ancestry: ['n-bio', 'n-org', 'p1'] })
    expect(byId.get('p1')).toMatchObject({ path: ['Sinh học', 'Bào quan'], ancestry: ['n-bio', 'n-org'] })
    expect(byId.get('c3')).toMatchObject({ path: ['Sinh học', 'Bào quan'], ancestry: ['n-bio', 'n-org'] })
    // Siblings span both levels of the root.
    expect(byId.get('c1')?.siblingStatements).toEqual(expect.arrayContaining(['Ty thể', 'có DNA riêng', 'Ribosome: tổng hợp protein']))
  })
})

describe('drill rounds and grading with sub-statements', () => {
  async function round(nodeId?: string) {
    const { client } = fakeSupabase()
    const res = await buildDrillSession(client, { deckId: 'd1', nodeId, limit: 20, includeMastered: true }, 'sess-sub', { viewerId: OWNER })
    if (!res.success) throw new Error(res.error.message)
    return { client, session: res.data }
  }

  it('a whole-tree round asks parents and sub-statements', async () => {
    const { session } = await round()
    expect(session.questions.map((q) => q.itemId).sort()).toEqual(['b1', 'c1', 'c2', 'c3', 'm1', 'm2', 'p1', 'p2', 'p3'])
    expect(session.skippedCount).toBe(0)
  })

  it('a root round includes both levels of that root and nothing outside its branch', async () => {
    expect((await round('n-org')).session.questions.map((q) => q.itemId).sort()).toEqual(['c1', 'c2', 'c3', 'p1', 'p2', 'p3'])
    expect((await round('n-mol')).session.questions.map((q) => q.itemId).sort()).toEqual(['m1', 'm2'])
    // A top-level root's round covers its sub-roots' statements and sub-statements too.
    expect((await round('n-bio')).session.questions).toHaveLength(STATEMENTS.length)
  })

  it('every question, sub-statements included, grades exactly one choice correct', async () => {
    const { client, session } = await round()
    for (const q of session.questions) {
      const verdicts = await Promise.all(q.choices.map((c) => gradeSubmission(client, { itemId: q.itemId, seed: q.seed, tag: c.tag }, OWNER)))
      expect(verdicts.filter((v) => v.success && v.data.isCorrect).length, `${q.itemId} ${q.kind}`).toBe(1)
    }
  })

  it('shows a sub-statement under its statement in the breadcrumb, asked about it', async () => {
    const { session } = await round()
    const q = session.questions.find((x) => x.itemId === 'c1')!
    expect(q.context).toEqual(['Sinh học', 'Bào quan', 'Ty thể'])
    if (q.kind === 'statement') expect(q.choices.some((c) => c.text.startsWith('Ty thể sản sinh'))).toBe(true)
  })
})

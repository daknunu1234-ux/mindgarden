import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sub-statements in practice: both levels are queried by the real listDrillItems (fake database,
// answers mocked), asked in rounds, kept in a branch round, and graded against the same context.

vi.mock('@/features/decks/services/answers', async (importActual) => ({
  ...(await importActual<typeof import('@/features/decks/services/answers')>()),
  readAnswersForNodes: vi.fn(),
}))

import { listDrillItems } from '@/features/decks/server'
import { readAnswersForNodes } from '@/features/decks/services/answers'
import { gradeSubmission } from '@/features/progress/server'
import { buildDrillSession } from '../services/drillSession'

const OWNER = 'owner-1'
const LONG_PARENT = 'Nhân tế bào là trung tâm điều khiển mọi hoạt động sống của tế bào và chứa gần như toàn bộ vật chất di truyền.'

// Sinh học (n-bio) ─┬─ Bào quan (n-org): Ty thể ─┬─ sản sinh ATP
//                   │                            └─ có DNA riêng
//                   │                   Ribosome: tổng hợp protein
//                   │                   <LONG_PARENT> ── nằm trong vùng nhân
//                   └─ Phân tử (n-mol): ATP, Glucose
type ItemRow = { id: string; node: string; parent: string | null; order: number; text: string }
const ROWS: ItemRow[] = [
  // Listed out of order on purpose: sort_order decides.
  { id: 'c2', node: 'n-org', parent: 'p1', order: 3, text: 'có DNA riêng' },
  { id: 'p1', node: 'n-org', parent: null, order: 1, text: 'Ty thể' },
  { id: 'c1', node: 'n-org', parent: 'p1', order: 2, text: 'sản sinh ATP' },
  { id: 'p2', node: 'n-org', parent: null, order: 4, text: 'Ribosome: tổng hợp protein' },
  { id: 'p3', node: 'n-org', parent: null, order: 5, text: LONG_PARENT },
  { id: 'c3', node: 'n-org', parent: 'p3', order: 6, text: 'nằm trong vùng nhân' },
  { id: 'm1', node: 'n-mol', parent: null, order: 7, text: 'ATP' },
  { id: 'm2', node: 'n-mol', parent: null, order: 8, text: 'Glucose' },
  { id: 'b1', node: 'n-bio', parent: null, order: 9, text: 'Tế bào được phát hiện năm 1665' },
]
const NODES = [
  { id: 'n-bio', parent_id: null, title: 'Sinh học' },
  { id: 'n-org', parent_id: 'n-bio', title: 'Bào quan' },
  { id: 'n-mol', parent_id: 'n-bio', title: 'Phân tử' },
]
const DECK = { id: 'd1', slug: 'sinh-hoc', title: 'Sinh học', tree_type: 'oak', user_id: OWNER, is_public: false, is_tournament_open: false }

// The three reads the drill path makes: the deck row, its roots with their items embedded
// (no answers), and one item's deck (grading).
function fakeSupabase() {
  const selects: string[] = []
  const from = (table: string) => {
    let id: string | null = null
    const q = {
      select: (cols: string) => (selects.push(`${table}: ${cols}`), q),
      eq: (col: string, value: string) => {
        if (col === 'id') id = value
        return q
      },
      order: () => q,
      maybeSingle: async () => {
        if (table === 'decks') return { data: DECK, error: null }
        if (table === 'knowledge_items') {
          const row = ROWS.find((r) => r.id === id)
          return { data: row ? { id: row.id, node_id: row.node, mindmap_nodes: { deck_id: DECK.id } } : null, error: null }
        }
        throw new Error(`unexpected maybeSingle on ${table}`)
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: NODES.map((n) => ({
            ...n,
            knowledge_items: ROWS.filter((r) => r.node === n.id).map((r) => ({
              id: r.id,
              prompt: n.title,
              parent_item_id: r.parent,
              sort_order: r.order,
              created_at: '2026-10-01T00:00:00Z',
            })),
          })),
          error: null,
        }).then(resolve),
    }
    return q
  }
  return { client: { from } as never, selects }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readAnswersForNodes).mockResolvedValue({
    success: true,
    data: ROWS.map((r) => ({ itemId: r.id, nodeId: r.node, parentItemId: r.parent, correctStmt: r.text, trapRules: { negate: true } })),
  })
})

describe('listDrillItems with sub-statements', () => {
  it('queries statements and sub-statements alike, in statement order, with their parent', async () => {
    const { client, selects } = fakeSupabase()
    const res = await listDrillItems(client, { deckId: 'd1' })
    if (!res.success) throw new Error(res.error.message)
    expect(res.data.items.map((i) => i.id)).toEqual(['b1', 'p1', 'c1', 'c2', 'p2', 'p3', 'c3', 'm1', 'm2'])
    expect(Object.fromEntries(res.data.items.map((i) => [i.id, i.parentItemId]))).toMatchObject({ p1: null, c1: 'p1', c2: 'p1', c3: 'p3', m1: null })
    // The embed reads the hierarchy, never the answers.
    expect(selects.find((s) => s.startsWith('mindmap_nodes'))).toContain('knowledge_items(id, prompt, parent_item_id, sort_order, created_at)')
    expect(selects.join(' ')).not.toMatch(/correct_stmt|trap_rules/)
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
    expect((await round('n-bio')).session.questions).toHaveLength(ROWS.length)
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

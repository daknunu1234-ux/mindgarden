import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../services/answers', () => ({ readAnswersForNodes: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { createKnowledgeItems } from '../actions/createKnowledgeItems'
import { MAX_BULK_STATEMENTS, parseBulletedText, previewBulkStatements } from '../lib/bulkStatements'
import { readAnswersForNodes } from '../services/answers'

// ─── parseBulletedText ─────────────────────────────────────────────────────────────────────────

describe('parseBulletedText', () => {
  it('strips Markdown bullets: - * +', () => {
    expect(parseBulletedText('- Ty thể sản sinh ATP.\n* Ribosome tổng hợp protein.\n+ Lục lạp quang hợp.')).toEqual([
      'Ty thể sản sinh ATP.',
      'Ribosome tổng hợp protein.',
      'Lục lạp quang hợp.',
    ])
  })

  it('strips Unicode bullets and dashes: • ‣ ⁃ – —', () => {
    expect(parseBulletedText('• Fact one here\n‣ Fact two here\n⁃ Fact three\n– Fact four\n— Fact five')).toEqual([
      'Fact one here',
      'Fact two here',
      'Fact three',
      'Fact four',
      'Fact five',
    ])
  })

  it('strips numbered markers: 1. 2) [3] (4)', () => {
    expect(parseBulletedText('1. First fact\n2) Second fact\n[3] Third fact\n(4) Fourth fact\n10. Tenth fact')).toEqual([
      'First fact',
      'Second fact',
      'Third fact',
      'Fourth fact',
      'Tenth fact',
    ])
  })

  it('splits plain line breaks, including Windows and old Mac ones', () => {
    expect(parseBulletedText('Line number one\r\nLine number two\rLine number three\nLine number four')).toHaveLength(4)
  })

  it('ignores empty lines, whitespace-only lines, lone markers and lines under 5 characters', () => {
    expect(parseBulletedText('\n\n   \n-\n- \n1.\n•   \nok\n- abc\n  -   A real fact  \n\t\n')).toEqual(['A real fact'])
    expect(parseBulletedText('')).toEqual([])
  })

  it('keeps internal punctuation, capitalization, numbers and Vietnamese diacritics as written', () => {
    expect(parseBulletedText('- Khi nhiệt độ TĂNG, áp suất khí lớn hơn (P ~ T).\n- F = m * a, với a = 9.8 m/s².')).toEqual([
      'Khi nhiệt độ TĂNG, áp suất khí lớn hơn (P ~ T).',
      'F = m * a, với a = 9.8 m/s².',
    ])
  })

  it('only strips a marker followed by a space: hyphenated or signed text stays', () => {
    expect(parseBulletedText('-5 độ C là rất lạnh\nWell-known fact here\n2024 là năm nhuận')).toEqual(['-5 độ C là rất lạnh', 'Well-known fact here', '2024 là năm nhuận'])
  })

  it('collapses runs of spaces and invisible characters, and de-duplicates identical statements', () => {
    expect(parseBulletedText('- Ty   thể  sản sinh ATP.\n• Ty thể sản sinh ATP.\n- Ty​thể differs')).toEqual(['Ty thể sản sinh ATP.', 'Ty thể differs'])
  })
})

describe('previewBulkStatements', () => {
  it('flags statements that would be refused or already exist in the root', () => {
    const preview = previewBulkStatements(`- Ty thể sản sinh ATP.\n- Công thức \\frac{a}{b} ở đây\n- ${'x'.repeat(501)}\n- Ribosome mới tinh`, ['Ty thể sản sinh ATP.'])
    expect(preview.map((p) => p.problem)).toEqual(['exists', 'latex', 'too-long', null])
  })
})

// ─── createKnowledgeItems (batch action) ───────────────────────────────────────────────────────

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const ROOT = '55555555-5555-4555-8555-555555555555'

type Inserted = { node_id: string; prompt: string; correct_stmt: string; trap_rules: unknown }

function fakeSupabase(viewer: string | null, { rootDeck = DECK, existing = [] as string[] } = {}) {
  const inserts: Inserted[][] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (table === 'mindmap_nodes') return { data: { id: ROOT, title: 'Bào quan', deck_id: rootDeck }, error: null }
          if (table === 'decks') return { data: { user_id: OWNER, slug: 'sinh-hoc', tree_type: 'oak' }, error: null }
          throw new Error(`unexpected maybeSingle on ${table}`)
        },
        insert: (rows: Inserted[]) => {
          if (table !== 'knowledge_items') throw new Error(`unexpected insert into ${table}`)
          inserts.push(rows)
          return { select: async () => ({ data: rows.map((_, i) => ({ id: `new-${i}` })), error: null }) }
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  vi.mocked(readAnswersForNodes).mockResolvedValue({
    success: true,
    data: existing.map((correctStmt, i) => ({ itemId: `old-${i}`, nodeId: ROOT, correctStmt, trapRules: { negate: true } })),
  })
  return { inserts }
}

const input = (statements: unknown[]) => ({ deckId: DECK, rootId: ROOT, statements })

beforeEach(() => vi.clearAllMocks())

describe('createKnowledgeItems', () => {
  it('inserts every statement in ONE batch under the root, with the default prompt and trap rules', async () => {
    const { inserts } = fakeSupabase(OWNER)
    const res = await createKnowledgeItems(input(['Ty thể sản sinh ATP.', 'Ribosome tổng hợp protein.', 'Khi nhiệt độ tăng, áp suất tăng.']))
    expect(res.success && res.data.created.map((c) => c.id)).toEqual(['new-0', 'new-1', 'new-2'])
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toEqual([
      { node_id: ROOT, prompt: 'Bào quan', correct_stmt: 'Ty thể sản sinh ATP.', trap_rules: { negate: true } },
      { node_id: ROOT, prompt: 'Bào quan', correct_stmt: 'Ribosome tổng hợp protein.', trap_rules: { negate: true } },
      { node_id: ROOT, prompt: 'Bào quan', correct_stmt: 'Khi nhiệt độ tăng, áp suất tăng.', trap_rules: { negate: true } },
    ])
    // Siblings make the subject swaps: all three are drillable together.
    expect(res.success && res.data.created.every((c) => c.drillable)).toBe(true)
    // No page re-render: the deck page shows the statements optimistically (deck draft).
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sanitizes each statement (spaces, invisible characters) and skips ones already in the root', async () => {
    const { inserts } = fakeSupabase(OWNER, { existing: ['Ty thể sản sinh ATP.'] })
    const res = await createKnowledgeItems(input(['  Ty thể   sản sinh ATP. ', 'Ribosome​ tổng hợp protein.']))
    expect(inserts[0].map((r) => r.correct_stmt)).toEqual(['Ribosome tổng hợp protein.'])
    expect(res).toMatchObject({ success: true, data: { skipped: 1 } })
  })

  it('writes nothing when everything is already there', async () => {
    const { inserts } = fakeSupabase(OWNER, { existing: ['Ty thể sản sinh ATP.'] })
    expect(await createKnowledgeItems(input(['Ty thể sản sinh ATP.']))).toMatchObject({ success: true, data: { created: [], skipped: 1 } })
    expect(inserts).toEqual([])
  })

  it('enforces ownership: a visitor gets AUTH_FORBIDDEN and nothing is inserted', async () => {
    const { inserts } = fakeSupabase(VISITOR)
    expect(await createKnowledgeItems(input(['Ty thể sản sinh ATP.']))).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(inserts).toEqual([])
  })

  it('refuses a root of another tree, and signed-out players', async () => {
    const other = fakeSupabase(OWNER, { rootDeck: OTHER_DECK })
    expect(await createKnowledgeItems(input(['Ty thể sản sinh ATP.']))).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(other.inserts).toEqual([])
    const out = fakeSupabase(null)
    expect(await createKnowledgeItems(input(['Ty thể sản sinh ATP.']))).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(out.inserts).toEqual([])
  })

  it('validates length and content before any query', async () => {
    const { inserts } = fakeSupabase(OWNER)
    for (const bad of [[], ['abc'], ['   '], ['x'.repeat(501)], ['Dùng \\sqrt{2} ở đây'], [42], Array.from({ length: MAX_BULK_STATEMENTS + 1 }, (_, i) => `Statement number ${i}`)]) {
      expect(await createKnowledgeItems(input(bad))).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect(await createKnowledgeItems({ deckId: 'nope', rootId: ROOT, statements: ['Ty thể sản sinh ATP.'] })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(inserts).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })
})

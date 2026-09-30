import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../services/answers', () => ({ readAnswersForNodes: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { HOVER_REVEAL } from '@/shared/components/game/HoverActions'
import { createClient } from '@/shared/lib/supabase/server'
import { updateKnowledgeItem } from '../actions/updateKnowledgeItem'
import { readAnswersForNodes } from '../services/answers'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const ROOT = '55555555-5555-4555-8555-555555555555'
const ITEM = '66666666-6666-4666-8666-666666666666'

// In-memory rows + RLS "items: update if deck owner" (other players' updates touch 0 rows).
function fakeSupabase(viewer: string | null, { itemDeck = DECK } = {}) {
  const item = { id: ITEM, node_id: ROOT, correct_stmt: 'Ty thể sản sinh ATP.' }
  const updates: Record<string, unknown>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p
          return q
        },
        maybeSingle: async () => {
          if (table === 'knowledge_items') return { data: { id: item.id, node_id: item.node_id }, error: null }
          if (table === 'mindmap_nodes') return { data: { deck_id: itemDeck, title: 'Bào quan' }, error: null }
          if (table === 'decks') return { data: { user_id: OWNER, slug: 'sinh-hoc', tree_type: 'oak' }, error: null }
          throw new Error(`unexpected maybeSingle on ${table}`)
        },
        then: (resolve: (v: { data: { id: string }[]; error: null }) => unknown) => {
          if (!patch) throw new Error('unexpected select without update')
          if (viewer !== OWNER) return Promise.resolve({ data: [], error: null }).then(resolve)
          updates.push(patch)
          Object.assign(item, patch)
          return Promise.resolve({ data: [{ id: item.id }], error: null }).then(resolve)
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  vi.mocked(readAnswersForNodes).mockResolvedValue({
    success: true,
    data: [
      { itemId: ITEM, nodeId: ROOT, correctStmt: item.correct_stmt, trapRules: { negate: true } },
      { itemId: 'sibling', nodeId: ROOT, correctStmt: 'Ribosome tổng hợp protein.', trapRules: { negate: true } },
    ],
  })
  return { item, updates }
}

beforeEach(() => vi.clearAllMocks())

describe('updateKnowledgeItem', () => {
  it("updates the owner's statement text (cleaned) without re-rendering the deck page", async () => {
    const { item, updates } = fakeSupabase(OWNER)
    const res = await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: '  Ty thể   tổng hợp ATP.  ' })
    expect(res).toEqual({ success: true, data: { id: ITEM, statement: 'Ty thể tổng hợp ATP.', drillable: true } })
    expect(updates).toEqual([{ correct_stmt: 'Ty thể tổng hợp ATP.' }])
    expect(item.correct_stmt).toBe('Ty thể tổng hợp ATP.')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects non-owners (AUTH_FORBIDDEN) without changing anything', async () => {
    const { item, updates } = fakeSupabase(VISITOR)
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'AUTH_FORBIDDEN' },
    })
    expect(updates).toEqual([])
    expect(item.correct_stmt).toBe('Ty thể sản sinh ATP.')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers before any query', async () => {
    const { updates } = fakeSupabase(null)
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'AUTH_UNAUTHORIZED' },
    })
    expect(updates).toEqual([])
  })

  it('validates the length bounds (5–500 after trimming) and plain text', async () => {
    const { updates } = fakeSupabase(OWNER)
    for (const text of ['abcd', '    ab    ', 'x'.repeat(501), 'Dùng \\frac{a}{b} ở đây', '', 42]) {
      expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect((await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'abcde' })).success).toBe(true)
    expect((await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'x'.repeat(500) })).success).toBe(true)
    expect(updates).toHaveLength(2)
  })

  it('refuses a statement that is not in the given tree, and malformed ids', async () => {
    const { updates } = fakeSupabase(OWNER, { itemDeck: OTHER_DECK })
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'ITEM_NOT_FOUND' },
    })
    expect(await updateKnowledgeItem({ deckId: 'nope', itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(updates).toEqual([])
  })
})

describe('HOVER_REVEAL (owner tools)', () => {
  it('hides the tools until hover or keyboard focus, and always shows them on touch screens', () => {
    for (const cls of [
      'opacity-0',
      'pointer-events-none',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'transition-opacity',
      'duration-200',
      '[@media(hover:none)]:opacity-100',
      '[@media(hover:none)]:pointer-events-auto',
    ]) {
      expect(HOVER_REVEAL.split(' ')).toContain(cls)
    }
  })
})

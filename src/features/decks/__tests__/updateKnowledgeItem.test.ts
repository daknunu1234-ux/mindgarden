import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { HOVER_REVEAL } from '@/shared/components/game/HoverActions'
import { createClient } from '@/shared/lib/supabase/server'
import { updateKnowledgeItem } from '../actions/updateKnowledgeItem'
import { fakeContentDb } from '@/test/fakeContentDb'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const ROOT = '55555555-5555-4555-8555-555555555555'
const ITEM = '66666666-6666-4666-8666-666666666666'

// One public tree (so a visitor can read it, but RLS lets only the owner write): root + statement.
// `itemDeck` puts the statement in another tree instead.
function fakeSupabase(viewer: string | null, { itemDeck = DECK } = {}) {
  const fake = fakeContentDb({
    viewer,
    decks: [
      { id: DECK, user_id: OWNER, slug: 'sinh-hoc', is_public: true },
      { id: OTHER_DECK, user_id: OWNER, slug: 'khac', is_public: true },
    ],
    nodes: [
      { id: ROOT, deck_id: itemDeck, parent_id: null, node_type: 'root', content: 'Bào quan', sort_order: 1 },
      { id: ITEM, deck_id: itemDeck, parent_id: ROOT, node_type: 'statement', content: 'Ty thể sản sinh ATP.', sort_order: 1 },
    ],
  })
  vi.mocked(createClient).mockResolvedValue(fake.client as never)
  const item = fake.node(ITEM)!
  return {
    item: { get correct_stmt() { return item.content } },
    get updates() { return fake.writes.filter((w) => w.op === 'update').map((w) => w.data as Record<string, unknown>) },
  }
}

beforeEach(() => vi.clearAllMocks())

describe('updateKnowledgeItem', () => {
  it("updates the owner's statement text (cleaned) without re-rendering the deck page", async () => {
    const fake = fakeSupabase(OWNER)
    const res = await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: '  Ty thể   tổng hợp ATP.  ' })
    expect(res).toEqual({ success: true, data: { id: ITEM, statement: 'Ty thể tổng hợp ATP.', drillable: true } })
    expect(fake.updates).toEqual([{ content: 'Ty thể tổng hợp ATP.' }])
    expect(fake.item.correct_stmt).toBe('Ty thể tổng hợp ATP.')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects non-owners (AUTH_FORBIDDEN) without changing anything', async () => {
    const fake = fakeSupabase(VISITOR)
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'AUTH_FORBIDDEN' },
    })
    expect(fake.updates).toEqual([])
    expect(fake.item.correct_stmt).toBe('Ty thể sản sinh ATP.')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers before any query', async () => {
    const fake = fakeSupabase(null)
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'AUTH_UNAUTHORIZED' },
    })
    expect(fake.updates).toEqual([])
  })

  it('validates the length bounds (5–500 after trimming) and plain text', async () => {
    const fake = fakeSupabase(OWNER)
    for (const text of ['abcd', '    ab    ', 'x'.repeat(501), 'Dùng \\frac{a}{b} ở đây', '', 42]) {
      expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect((await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'abcde' })).success).toBe(true)
    expect((await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'x'.repeat(500) })).success).toBe(true)
    expect(fake.updates).toHaveLength(2)
  })

  it('refuses a statement that is not in the given tree, and malformed ids', async () => {
    const fake = fakeSupabase(OWNER, { itemDeck: OTHER_DECK })
    expect(await updateKnowledgeItem({ deckId: DECK, itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'ITEM_NOT_FOUND' },
    })
    expect(await updateKnowledgeItem({ deckId: 'nope', itemId: ITEM, text: 'Ty thể tổng hợp ATP.' })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(fake.updates).toEqual([])
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

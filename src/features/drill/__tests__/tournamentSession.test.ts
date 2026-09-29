import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { buildDrillSession } from '../services/drillSession'

const HOST = 'host'
const LINH = 'linh'
const ITEMS = [
  { id: 'i1', nodeId: 'n1', nodeTitle: 'Bào quan', prompt: 'Bào quan', correctStmt: 'Ty thể sản sinh ATP.', trapRules: { negate: true } },
  { id: 'i2', nodeId: 'n1', nodeTitle: 'Bào quan', prompt: 'Bào quan', correctStmt: 'Ribosome tổng hợp protein.', trapRules: { negate: true } },
].map((item, _i, all) => ({ ...item, siblingStatements: all.filter((o) => o.id !== item.id).map((o) => o.correctStmt) }))

function tree(deck: Partial<{ isPublic: boolean; isTournamentOpen: boolean }> = {}) {
  vi.mocked(listDrillItems).mockResolvedValue({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'bao-quan', title: 'Bào quan', treeType: 'oak', ownerId: HOST, isPublic: true, isTournamentOpen: true, ...deck },
      nodes: [{ id: 'n1', parentId: null, title: 'Bào quan' }],
      items: ITEMS,
    },
  })
}

const input = { slug: 'bao-quan', limit: 20, includeMastered: false }

beforeEach(() => vi.clearAllMocks())

describe('buildDrillSession in tournament mode', () => {
  it('opens a round for a visitor on a hosting tree, with their TOURNAMENT levels resting 5/5 items', async () => {
    tree()
    const loadLevels = vi.fn(async () => new Map([['i1', 5]]))
    const res = await buildDrillSession({} as never, input, 'sess1', { viewerId: LINH, mode: 'tournament', loadLevels })
    expect(res).toMatchObject({ success: true, data: { mode: 'tournament', masteredCount: 1, includeMastered: false } })
    expect(res.success && res.data.questions.map((q) => q.itemId)).toEqual(['i2'])
    expect(loadLevels).toHaveBeenCalledWith(['i1', 'i2'], 'd1')
  })

  it('never mixes mastered items back in, even if asked', async () => {
    tree()
    const res = await buildDrillSession({} as never, { ...input, includeMastered: true }, 'sess1', {
      viewerId: LINH,
      mode: 'tournament',
      loadLevels: async () => new Map([['i1', 5]]),
    })
    expect(res.success && res.data.questions.map((q) => q.itemId)).toEqual(['i2'])
  })

  it('keeps out the host, signed-out readers and closed tournaments', async () => {
    tree()
    expect(await buildDrillSession({} as never, input, 's', { viewerId: HOST, mode: 'tournament' })).toMatchObject({ error: { code: 'AUTH_FORBIDDEN' } })
    expect(await buildDrillSession({} as never, input, 's', { viewerId: null, mode: 'tournament' })).toMatchObject({ error: { code: 'AUTH_UNAUTHORIZED' } })
    tree({ isTournamentOpen: false })
    expect(await buildDrillSession({} as never, input, 's', { viewerId: LINH, mode: 'tournament' })).toMatchObject({ error: { code: 'TOURNAMENT_CLOSED' } })
    tree({ isPublic: false })
    expect(await buildDrillSession({} as never, input, 's', { viewerId: LINH, mode: 'tournament' })).toMatchObject({ error: { code: 'TOURNAMENT_CLOSED' } })
  })

  it('leaves strict visitor mode as it was for normal practice, tournament or not', async () => {
    tree()
    expect(await buildDrillSession({} as never, input, 's', { viewerId: LINH })).toMatchObject({ error: { code: 'FORBIDDEN_VISITOR_PRACTICE' } })
    expect(await buildDrillSession({} as never, input, 's', { viewerId: HOST })).toMatchObject({ success: true, data: { mode: 'practice' } })
  })

  it('sends the client no owner id or tournament flags, only what the round needs', async () => {
    tree()
    const res = await buildDrillSession({} as never, input, 's', { viewerId: LINH, mode: 'tournament' })
    expect(res.success && res.data.deck).toEqual({ id: 'd1', slug: 'bao-quan', title: 'Bào quan', treeType: 'oak' })
  })
})

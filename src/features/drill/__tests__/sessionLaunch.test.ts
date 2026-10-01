import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { GetTournamentSessionDto } from '../dto/GetDrillSessionDto'
import { rootParam } from '../lib/drillHref'
import { launchPool, planLaunch, WHOLE_TREE_LABEL, type LaunchContext } from '../lib/sessionLaunch'
import { buildTournamentSession } from '../services/drillSession'

// Tree: "Tế bào" (A) with sub-root "Bào quan" (B), and a second root "Di truyền" (C).
const A = '11111111-1111-4111-8111-00000000000a'
const B = '11111111-1111-4111-8111-00000000000b'
const C = '11111111-1111-4111-8111-00000000000c'
const NODES = [
  { id: A, parentId: null, title: 'Tế bào' },
  { id: B, parentId: A, title: 'Bào quan' },
  { id: C, parentId: null, title: 'Di truyền' },
]
// Two statements per root, each flips tăng ↔ giảm (drillable).
const ITEMS = NODES.flatMap((node, n) =>
  [0, 1].map((k) => ({
    id: `i-${node.title}-${k}`,
    nodeId: node.id,
    nodeTitle: node.title,
    prompt: node.title,
    correctStmt: `Chỉ số ${n}${k} tăng khi trời nóng.`,
    trapRules: { negate: true },
    siblingStatements: [],
    path: [node.title],
    ancestry: [node.id],
  })),
)
const ids = (title: string) => [0, 1].map((k) => `i-${title}-${k}`)

function tree() {
  vi.mocked(listDrillItems).mockResolvedValue({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'sinh-hoc', title: 'Sinh học', treeType: 'oak', ownerId: 'host', isPublic: true, isTournamentOpen: true },
      nodes: NODES,
      items: ITEMS,
    },
  })
}

beforeEach(() => vi.clearAllMocks())

// ─── buildTournamentSession: whole tree or one root ────────────────────────────────────────────

describe('buildTournamentSession', () => {
  const question = (res: Awaited<ReturnType<typeof buildTournamentSession>>) => (res.success ? res.data.questions.map((q) => q.itemId).sort() : [])

  it('without rootId asks from the whole tree', async () => {
    tree()
    const res = await buildTournamentSession({} as never, { slug: 'sinh-hoc', limit: 10 }, 's', { viewerId: 'linh' })
    expect(res).toMatchObject({ success: true, data: { mode: 'tournament', focus: null } })
    expect(question(res)).toEqual([...ids('Tế bào'), ...ids('Bào quan'), ...ids('Di truyền')].sort())
  })

  it('with rootId asks only that root and its sub-roots', async () => {
    tree()
    const res = await buildTournamentSession({} as never, { slug: 'sinh-hoc', nodeId: A, limit: 10 }, 's', { viewerId: 'linh' })
    expect(res).toMatchObject({ success: true, data: { mode: 'tournament', focus: { nodeId: A, title: 'Tế bào' } } })
    expect(question(res)).toEqual([...ids('Tế bào'), ...ids('Bào quan')].sort())
  })

  it('a leaf root is strictly its own statements', async () => {
    tree()
    const res = await buildTournamentSession({} as never, { slug: 'sinh-hoc', nodeId: C, limit: 10 }, 's', { viewerId: 'linh' })
    expect(question(res)).toEqual(ids('Di truyền').sort())
  })

  it('a root of another tree is NODE_NOT_FOUND', async () => {
    tree()
    const res = await buildTournamentSession({} as never, { slug: 'sinh-hoc', nodeId: '99999999-9999-4999-8999-999999999999', limit: 10 }, 's', {
      viewerId: 'linh',
    })
    expect(res).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
  })

  it('in a root, lowest tournament mastery comes first, 5/5 rests, then the size cuts', async () => {
    tree()
    const levels = new Map([
      ['i-Tế bào-0', 5],
      ['i-Tế bào-1', 3],
      ['i-Bào quan-0', 1],
      ['i-Bào quan-1', 0],
    ])
    const res = await buildTournamentSession({} as never, { slug: 'sinh-hoc', nodeId: A, limit: 5 }, 's', { viewerId: 'linh', loadLevels: async () => levels })
    expect(res.success && res.data.questions.map((q) => q.itemId)).toEqual(['i-Bào quan-1', 'i-Bào quan-0', 'i-Tế bào-1'])
  })

  it('keeps the tournament guard: the host and closed tournaments are refused, with or without a root', async () => {
    tree()
    expect(await buildTournamentSession({} as never, { slug: 'sinh-hoc', nodeId: A, limit: 10 }, 's', { viewerId: 'host' })).toMatchObject({
      error: { code: 'AUTH_FORBIDDEN' },
    })
    vi.mocked(listDrillItems).mockResolvedValue({
      success: true,
      data: { deck: { id: 'd1', slug: 'sinh-hoc', title: 'Sinh học', treeType: 'oak', ownerId: 'host', isPublic: true, isTournamentOpen: false }, nodes: NODES, items: ITEMS },
    })
    expect(await buildTournamentSession({} as never, { slug: 'sinh-hoc', limit: 10 }, 's', { viewerId: 'linh' })).toMatchObject({ error: { code: 'TOURNAMENT_CLOSED' } })
  })

  it('the tournament DTO takes an optional uuid rootId', () => {
    expect(GetTournamentSessionDto.parse({ slug: 'sinh-hoc', rootId: A, limit: '5' })).toEqual({ slug: 'sinh-hoc', rootId: A, limit: 5 })
    expect(GetTournamentSessionDto.parse({ slug: 'sinh-hoc' })).toEqual({ slug: 'sinh-hoc', limit: 10 })
    expect(GetTournamentSessionDto.safeParse({ slug: 'sinh-hoc', rootId: 'bao-quan' }).success).toBe(false)
  })
})

describe('rootParam (round pages)', () => {
  it('prefers ?rootId=, still accepts the older ?nodeId=, and ignores empty values', () => {
    expect(rootParam('r1', 'n1')).toBe('r1')
    expect(rootParam(undefined, 'n1')).toBe('n1')
    expect(rootParam('', undefined)).toBeUndefined()
    expect(rootParam(['r1', 'r2'], undefined)).toBeUndefined()
  })
})

// ─── The launch pop-up plan: same for the whole-tree button and every root trigger ─────────────

const tree3 = [
  {
    id: A,
    title: 'Tế bào',
    items: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    children: [{ id: B, title: 'Bào quan', items: [{ id: 'b1' }, { id: 'b2' }], children: [] }],
  },
  { id: C, title: 'Di truyền', items: [{ id: 'c1' }], children: [] },
]
// a3 can't become a question (no trap).
const pool = launchPool(tree3, new Map([['a3', false]]))
const drill: LaunchContext = { mode: 'drill', slug: 'sinh-hoc', ...pool, levels: { a1: 5, b1: 2 } }
const compete: LaunchContext = { mode: 'compete', slug: 'sinh-hoc', ...pool, levels: { b1: 5, b2: 5 } }

describe('launchPool', () => {
  it('flattens nested roots with their parents and drillable flags', () => {
    expect(pool.nodes).toEqual([
      { id: A, parentId: null, title: 'Tế bào' },
      { id: B, parentId: A, title: 'Bào quan' },
      { id: C, parentId: null, title: 'Di truyền' },
    ])
    expect(pool.items.find((i) => i.id === 'a3')).toEqual({ id: 'a3', nodeId: A, drillable: false })
    expect(pool.items.find((i) => i.id === 'b1')).toEqual({ id: 'b1', nodeId: B, drillable: true })
  })
})

describe('planLaunch', () => {
  it('whole-tree "Water Tree": title, available (drillable, not 5/5) and the round URL', () => {
    const plan = planLaunch(drill)!
    expect(plan.title).toBe('Water Tree 🌱 - Whole Tree')
    expect(WHOLE_TREE_LABEL).toBe('Whole Tree')
    expect(plan.available).toBe(4) // a2, b1, b2, c1 (a1 is 5/5, a3 isn't drillable)
    expect(plan.href(10)).toBe('/deck/sinh-hoc/drill?limit=10')
  })

  it('"Drill Root" scopes to the root and its sub-roots, with rootId in the URL', () => {
    const plan = planLaunch(drill, { rootId: A })!
    expect(plan.title).toBe('Water Tree 🌱 - Root: Tế bào')
    expect(plan.available).toBe(3) // a2, b1, b2
    expect(plan.href(5)).toBe(`/deck/sinh-hoc/drill?rootId=${A}&limit=5`)
  })

  it('review mixes 5/5 statements back in (watering only)', () => {
    const plan = planLaunch(drill, { review: true })!
    expect(plan.title).toBe('Review 🌿 - Whole Tree')
    expect(plan.available).toBe(5)
    expect(plan.href(20)).toBe('/deck/sinh-hoc/drill?review=1&limit=20')
  })

  it('"Join Mind Tournament" / "Compete Root" use the tournament URL and the contestant\'s tournament levels', () => {
    const whole = planLaunch(compete)!
    expect(whole.title).toBe('Compete ⚔️ - Whole Tree')
    expect(whole.mode).toBe('compete')
    expect(whole.available).toBe(3) // a1, a2, c1 (b1, b2 are 5/5 in the tournament; a3 isn't drillable)
    expect(whole.href(10)).toBe('/deck/sinh-hoc/tournament?limit=10')

    const root = planLaunch(compete, { rootId: B })!
    expect(root.title).toBe('Compete ⚔️ - Root: Bào quan')
    expect(root.available).toBe(0)
    expect(root.href(5)).toBe(`/deck/sinh-hoc/tournament?rootId=${B}&limit=5`)
  })

  it('never offers review in a tournament, and rejects a root that is not in the tree', () => {
    expect(planLaunch(compete, { review: true })!.review).toBe(false)
    expect(planLaunch(drill, { rootId: 'elsewhere' })).toBeNull()
  })
})

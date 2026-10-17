import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { buildQuestion, prepareDeck, seedTrapType, toDeckNote, trapTypeOf, trapTypes, TRAP_TYPES, type TrapType } from '@/shared/lib/questionEngine'
import { seededRandom } from '@/shared/utils/seededRandom'
import { TRAP_HISTORY, scheduleTrapTypes, typeCounts } from '../lib/trapSchedule'
import { buildDrillSession } from '../services/drillSession'

// A watering round (💧 Water Tree → buildDrillSession) is scheduled by lib/trapSchedule: its questions
// are spread evenly over the trap types and no type comes back within 2 questions. Checked on the
// real session builder, over a tree of plain declarative statements (no "when", no "e.g.").

const OWNER = 'owner'
const STATEMENTS: [root: string, text: string][] = [
  ['Organelles', 'Ribosomes synthesize proteins.'],
  ['Organelles', 'Lysosomes digest waste.'],
  ['Organelles', 'Mitochondria produce ATP.'],
  ['Organelles', 'The nucleus stores genetic information.'],
  ['Organelles', 'Chloroplasts absorb light energy.'],
  ['Transport', 'Diffusion moves particles down a concentration gradient.'],
  ['Transport', 'Active transport consumes ATP.'],
  ['Transport', 'Osmosis moves water across a membrane.'],
  ['Transport', 'Endocytosis imports large molecules.'],
  ['Protocols', 'TCP guarantees ordered delivery.'],
  ['Protocols', 'UDP sends datagrams without a handshake.'],
  ['Protocols', 'A synchronous call blocks the client until the server responds.'],
  ['Protocols', 'Gzip compresses responses before transfer.'],
  ['Protocols', 'DNS maps names to addresses.'],
  ['Storage', 'RAM holds data while the machine is running.'],
  ['Storage', 'ROM is permanent storage.'],
  ['Storage', 'A cache stores recent results.'],
  ['Storage', 'An index speeds up lookups.'],
  ['Markets', 'Inflation reduces purchasing power.'],
  ['Markets', 'Central banks raise interest rates.'],
  ['Markets', 'Exports increase national income.'],
  ['Markets', 'Tariffs restrict imports.'],
]
const ROOTS = [...new Set(STATEMENTS.map(([root]) => root))]
const ITEMS = STATEMENTS.map(([root, text], i) => ({
  id: `i${i}`,
  nodeId: `n${ROOTS.indexOf(root)}`,
  nodeTitle: root,
  prompt: root,
  correctStmt: text,
  trapRules: {},
  siblingStatements: STATEMENTS.filter(([r, t]) => r === root && t !== text).map(([, t]) => t),
  path: ['Tree', root],
  ancestry: ['top', `n${ROOTS.indexOf(root)}`],
}))
const deck = prepareDeck(ITEMS.map(toDeckNote))

beforeEach(() => {
  vi.mocked(listDrillItems).mockResolvedValue({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'tree', title: 'Tree', treeType: 'oak', ownerId: OWNER, isPublic: false, isTournamentOpen: false },
      nodes: [{ id: 'top', parentId: null, title: 'Tree' }, ...ROOTS.map((title, i) => ({ id: `n${i}`, parentId: 'top', title }))],
      items: ITEMS,
    },
  } as never)
})

async function round(sessionId: string, extra: { nodeId?: string } = {}) {
  const res = await buildDrillSession({} as never, { slug: 'tree', limit: 20, includeMastered: false, ...extra }, sessionId, { viewerId: OWNER })
  if (!res.success) throw new Error(res.error.message)
  return res.data.questions
}
const typeOf = (q: { kind: Parameters<typeof trapTypeOf>[0] }) => trapTypeOf(q.kind)

describe('a watering round is scheduled by trapSchedule', () => {
  it('the session builder calls scheduleTrapTypes and carries each type in the question seed', () => {
    const source = readFileSync(join(__dirname, '..', 'services', 'drillSession.ts'), 'utf8')
    expect(source).toContain("import { scheduleTrapTypes } from '../lib/trapSchedule'")
    expect(source).toMatch(/scheduleTrapTypes\(\s*order\.map\(\(item\) => \(\{ item, eligible: trapTypes\(deck, item\.itemId\) \}\)\)/)
    expect(source).toContain('typedSeed(type, base)')
  })

  it('every question is asked as the type its seed carries, one it is eligible for', async () => {
    const questions = await round('water-1')
    expect(questions).toHaveLength(20)
    for (const q of questions) {
      const type = seedTrapType(q.seed)
      expect(type, q.seed).not.toBeNull()
      expect(typeOf(q)).toBe(type)
      expect(trapTypes(deck, q.itemId)).toContain(type)
      // Grading rebuilds the very same question from that seed.
      const again = buildQuestion(deck, q.itemId, q.seed)
      expect(again.ok && again.question.choices).toEqual(q.choices)
    }
  })

  it('no type repeats within 2 questions, in every round', async () => {
    for (let n = 0; n < 12; n++) {
      const types = (await round(`water-${n}`)).map(typeOf)
      for (let i = 1; i < types.length; i++) {
        for (let k = 1; k <= TRAP_HISTORY && i - k >= 0; k++) expect(types[i], `round ${n}, question ${i}: ${types.join('')}`).not.toBe(types[i - k])
      }
    }
  })

  it('a round is balanced: seven types on plain statements, none more than one above its even share', async () => {
    for (let n = 0; n < 12; n++) {
      const counts = typeCounts((await round(`balance-${n}`)).map(typeOf))
      // No formula in this tree, so type 8 is never eligible; the other seven all appear.
      expect([...counts.keys()].sort()).toEqual(TRAP_TYPES.filter((t) => t !== 8))
      const values = [...counts.values()]
      expect(Math.max(...values) - Math.min(...values), `round ${n}: ${JSON.stringify([...counts])}`).toBeLessThanOrEqual(2)
    }
  })

  it('is exactly what scheduleTrapTypes plans for that round’s order and session', async () => {
    const questions = await round('water-plan')
    const plan = scheduleTrapTypes(
      questions.map((q) => ({ item: q.itemId, eligible: trapTypes(deck, q.itemId) })),
      seededRandom('unused'),
    )
    // Re-planning the served order changes no statement's place: it already avoids every repeat.
    expect(plan.map((p) => p.item)).toEqual(questions.map((q) => q.itemId))
  })

  it('a one-branch round is scheduled the same way', async () => {
    const types = (await round('branch-1', { nodeId: 'n2' })).map(typeOf)
    expect(types).toHaveLength(5)
    expect(new Set(types).size).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < types.length; i++) {
      for (let k = 1; k <= TRAP_HISTORY && i - k >= 0; k++) expect(types[i]).not.toBe(types[i - k])
    }
  })

  it('plain statements keep the schedule free: almost every one is eligible for 5 or more types', () => {
    const eligible = ITEMS.map((i) => trapTypes(deck, i.id) as TrapType[])
    expect(eligible.filter((t) => t.length >= 5).length / ITEMS.length).toBeGreaterThanOrEqual(0.9)
    for (const type of [4, 5, 6, 7] as const) expect(eligible.filter((t) => t.includes(type)).length / ITEMS.length, `type ${type}`).toBeGreaterThanOrEqual(0.9)
  })
})

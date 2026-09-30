import { describe, expect, it } from 'vitest'
import { calculateWoodshopRefund, treeBuff } from '../lib/farmBuffs'
import { streamLinks, type Placement } from '../lib/farmGrid'
import { applyOps, choppedDecks, confirmAdd, isPendingId, PENDING_PREFIX, rollback, splitTrees, type FarmOp } from '../lib/optimistic'

const at = (id: string, itemType: Placement['itemType'], x: number, y: number, deckId: string | null = null): Placement => ({
  id,
  itemType,
  deckId,
  x,
  y,
  width: 1,
  height: 1,
  variant: null,
})

const server = [at('s1', 'stream', 2, 2), at('t1', 'tree', 5, 5, 'deck-a'), at('r1', 'rockery', 8, 8)]

describe('applyOps', () => {
  it('shows adds, moves and removals at once, in order, without touching the server data', () => {
    const ops: FarmOp[] = [
      { key: 'a', kind: 'add', placement: at(`${PENDING_PREFIX}a`, 'stream', 3, 2) },
      { key: 'b', kind: 'move', id: 't1', to: { x: 6, y: 5 } },
      { key: 'c', kind: 'remove', id: 'r1' },
    ]
    const farm = applyOps(server, ops)
    expect(farm.map((p) => [p.id, p.x, p.y])).toEqual([
      ['s1', 2, 2],
      ['t1', 6, 5],
      [`${PENDING_PREFIX}a`, 3, 2],
    ])
    expect(server).toHaveLength(3)
    expect(server[1]).toMatchObject({ x: 5, y: 5 })
  })

  it('re-tiles instantly: an optimistic stream joins its neighbour before the server answers', () => {
    const farm = applyOps(server, [{ key: 'a', kind: 'add', placement: at('p', 'stream', 3, 2) }])
    expect(streamLinks(server, { x: 2, y: 2 }).east).toBe(false)
    expect(streamLinks(farm, { x: 2, y: 2 }).east).toBe(true)
  })

  it('moves the buffs instantly too', () => {
    const farm = applyOps(server, [{ key: 'm', kind: 'move', id: 's1', to: { x: 5, y: 6 } }])
    expect(treeBuff(5, 5, server).multiplier).toBe(1)
    expect(treeBuff(5, 5, farm).multiplier).toBe(1.2)
  })
})

describe('confirm / roll back', () => {
  const ops: FarmOp[] = [
    { key: 'a', kind: 'add', placement: at(`${PENDING_PREFIX}a`, 'fence', 1, 1) },
    { key: 'b', kind: 'move', id: 't1', to: { x: 6, y: 5 } },
  ]

  it('gives a confirmed add its real id (then it can be moved or picked up)', () => {
    const confirmed = confirmAdd(ops, 'a', 'real-id')
    expect(applyOps(server, confirmed).some((p) => p.id === 'real-id')).toBe(true)
    expect(isPendingId(`${PENDING_PREFIX}a`)).toBe(true)
    expect(isPendingId('real-id')).toBe(false)
  })

  it('rolls a refused edit back and keeps the others', () => {
    const farm = applyOps(server, rollback(ops, 'b'))
    expect(farm.find((p) => p.id === 't1')).toMatchObject({ x: 5, y: 5 })
    expect(farm.some((p) => p.id === `${PENDING_PREFIX}a`)).toBe(true)
    expect(applyOps(server, rollback(rollback(ops, 'a'), 'b'))).toEqual(server)
  })
})

describe('splitTrees', () => {
  const trees = [
    { id: 'deck-a', isOwner: true, title: 'A' },
    { id: 'deck-b', isOwner: true, title: 'B' },
    { id: 'deck-c', isOwner: false, title: 'C' },
  ]

  it('plants trees on their tiles with their buff, and sends the owner’s others to the Shop', () => {
    const farm = [...server, at('s2', 'stream', 5, 6)]
    const { planted, unplanted } = splitTrees(trees, farm)
    expect(planted).toEqual([{ id: 'deck-a', isOwner: true, title: 'A', placementId: 't1', buff: 1.2 }])
    expect(unplanted.map((t) => t.id)).toEqual(['deck-b'])
  })

  it('follows optimistic edits: planting moves a tree out of the Shop, picking up puts it back', () => {
    const planted = applyOps(server, [{ key: 'p', kind: 'add', placement: at('new', 'tree', 1, 1, 'deck-b') }])
    expect(splitTrees(trees, planted).unplanted).toEqual([])
    const removed = applyOps(server, [{ key: 'r', kind: 'remove', id: 't1' }])
    expect(splitTrees(trees, removed).unplanted.map((t) => t.id)).toEqual(['deck-a', 'deck-b'])
  })
})

describe('chop', () => {
  const trees = [
    { id: 'deck-a', isOwner: true },
    { id: 'deck-b', isOwner: true },
  ]
  const ops: FarmOp[] = [{ key: 'c', kind: 'chop', deckId: 'deck-a' }]

  it('clears the tree off the farm at once and keeps it out of the Shop', () => {
    const farm = applyOps(server, ops)
    expect(farm.some((p) => p.deckId === 'deck-a')).toBe(false)
    expect(farm).toHaveLength(2)
    const gone = choppedDecks(ops)
    const { planted, unplanted } = splitTrees(
      trees.filter((t) => !gone.has(t.id)),
      farm,
    )
    expect(planted).toEqual([])
    expect(unplanted.map((t) => t.id)).toEqual(['deck-b'])
  })

  it('credits the same Woodshop refund the database pays, and nothing without one', () => {
    expect(calculateWoodshopRefund(40, [...server, { ...server[2], id: 'w', itemType: 'woodshop' }])).toBe(10)
    expect(calculateWoodshopRefund(40, server)).toBe(0)
  })

  it('rolls back: a refused chop puts the tree back on its tile', () => {
    expect(applyOps(server, rollback(ops, 'c'))).toEqual(server)
    expect(choppedDecks(rollback(ops, 'c')).size).toBe(0)
  })
})

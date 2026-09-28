import { describe, expect, it } from 'vitest'
import { CreateDeckDto } from '../dto/CreateDeckDto'
import { CreateKnowledgeItemDto } from '../dto/CreateKnowledgeItemDto'
import { CreateMindmapNodeDto } from '../dto/CreateMindmapNodeDto'
import { DEFAULT_TRAP_RULES, isDrillable } from '../lib/drillable'

const ID = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'

describe('CreateDeckDto', () => {
  it('fills the documented defaults and turns an empty description into null', () => {
    expect(CreateDeckDto.parse({ title: '  Sinh học  ', description: '' })).toEqual({
      title: 'Sinh học',
      description: null,
      treeType: 'oak',
      isPublic: true,
    })
  })

  it('rejects an empty title and unknown tree skins', () => {
    expect(CreateDeckDto.safeParse({ title: '   ' }).success).toBe(false)
    expect(CreateDeckDto.safeParse({ title: 'x', treeType: 'palm' }).success).toBe(false)
  })

  it('does not accept a client-chosen owner or slug', () => {
    const parsed = CreateDeckDto.parse({ title: 'x', userId: ID, slug: 'mine' })
    expect(parsed).not.toHaveProperty('userId')
    expect(parsed).not.toHaveProperty('slug')
  })
})

describe('CreateMindmapNodeDto', () => {
  it('defaults to a top-level root', () => {
    expect(CreateMindmapNodeDto.parse({ deckId: ID, title: 'Ty thể' })).toEqual({ deckId: ID, title: 'Ty thể', parentId: null })
  })

  it('requires a title', () => {
    expect(CreateMindmapNodeDto.safeParse({ deckId: ID, title: ' ' }).success).toBe(false)
  })
})

describe('CreateKnowledgeItemDto', () => {
  it('accepts a plain-text Vietnamese statement', () => {
    const r = CreateKnowledgeItemDto.parse({ nodeId: ID, statement: ' Khi nhiệt độ tăng, áp suất khí lớn hơn. ' })
    expect(r.statement).toBe('Khi nhiệt độ tăng, áp suất khí lớn hơn.')
  })

  it('rejects LaTeX commands but allows ordinary math symbols', () => {
    expect(CreateKnowledgeItemDto.safeParse({ nodeId: ID, statement: 'v = \\frac{s}{t}' }).success).toBe(false)
    expect(CreateKnowledgeItemDto.safeParse({ nodeId: ID, statement: 'v = s / t' }).success).toBe(true)
  })

  it('has no trap configuration fields', () => {
    const r = CreateKnowledgeItemDto.parse({ nodeId: ID, statement: 'x', trapRules: { swaps: [] } })
    expect(r).toEqual({ nodeId: ID, statement: 'x' })
  })
})

describe('isDrillable with the default { negate: true }', () => {
  it('uses the documented default rules', () => {
    expect(DEFAULT_TRAP_RULES).toEqual({ negate: true })
  })

  it('is true with two mutations (3 choices) or one (2 choices)', () => {
    expect(isDrillable('Khi nhiệt độ tăng, áp suất khí lớn hơn.')).toBe(true)
    expect(isDrillable('Ty thể là bào quan.')).toBe(true)
    expect(isDrillable('Mitochondria produce ATP.')).toBe(true)
  })

  it('becomes true once a sibling statement exists in the same root', () => {
    expect(isDrillable('Ribosome tổng hợp protein.')).toBe(false)
    expect(isDrillable('Ribosome tổng hợp protein.', undefined, ['Ty thể sản sinh ATP.'])).toBe(true)
  })

  it('is false only when no trap can be made', () => {
    expect(isDrillable('Cells need water.')).toBe(false)
    expect(isDrillable('Ty thể của tế bào.')).toBe(false)
  })
})

describe('UpdateDeckDto', () => {
  it('accepts every species in the shared catalog', async () => {
    const { UpdateDeckDto } = await import('../dto/UpdateDeckDto')
    for (const treeType of ['oak', 'pine', 'sakura', 'bamboo', 'apple', 'saguaro']) {
      expect(UpdateDeckDto.safeParse({ deckId: ID, treeType }).success, treeType).toBe(true)
    }
  })

  it('rejects unknown species and empty updates', async () => {
    const { UpdateDeckDto } = await import('../dto/UpdateDeckDto')
    expect(UpdateDeckDto.safeParse({ deckId: ID, treeType: 'palm' }).success).toBe(false)
    expect(UpdateDeckDto.safeParse({ deckId: ID }).success).toBe(false)
  })

  it('turns an empty description into null and keeps unset fields undefined', async () => {
    const { UpdateDeckDto } = await import('../dto/UpdateDeckDto')
    expect(UpdateDeckDto.parse({ deckId: ID, description: '' })).toEqual({ deckId: ID, description: null })
  })
})

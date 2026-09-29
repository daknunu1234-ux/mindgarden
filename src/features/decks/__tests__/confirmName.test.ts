import { describe, expect, it } from 'vitest'
import { DeleteDeckDto } from '../dto/DeleteDeckDto'
import { matchesTreeName } from '../lib/confirmName'

describe('matchesTreeName', () => {
  it('accepts the exact name, ignoring case and extra spaces', () => {
    expect(matchesTreeName('Cell Biology 101', 'Cell Biology 101')).toBe(true)
    expect(matchesTreeName('  cell   biology 101 ', 'Cell Biology 101')).toBe(true)
  })

  it('treats composed and decomposed Vietnamese accents the same', () => {
    const composed = 'Sinh học Tế bào'
    const decomposed = composed.normalize('NFD')
    expect(decomposed).not.toBe(composed)
    expect(matchesTreeName(decomposed, composed)).toBe(true)
  })

  it('rejects partial names, missing accents and empty input', () => {
    expect(matchesTreeName('Cell Biology', 'Cell Biology 101')).toBe(false)
    expect(matchesTreeName('Sinh hoc Te bao', 'Sinh học Tế bào')).toBe(false)
    expect(matchesTreeName('', 'Cell Biology 101')).toBe(false)
    expect(matchesTreeName('', '   ')).toBe(false)
  })
})

describe('DeleteDeckDto', () => {
  it('takes only a deck id: the owner comes from the session', () => {
    const id = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'
    expect(DeleteDeckDto.parse({ deckId: id, userId: 'x' })).toEqual({ deckId: id })
    expect(DeleteDeckDto.safeParse({ deckId: 'nope' }).success).toBe(false)
  })
})

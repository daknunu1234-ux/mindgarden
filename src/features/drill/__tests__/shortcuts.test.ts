import { describe, expect, it } from 'vitest'
import { shortcutFor, shortcutKeyFor, tagForKey, type ShortcutContext } from '../lib/shortcuts'

const base: ShortcutContext = {
  status: 'answering',
  tags: ['A', 'B', 'C'],
  targetIsInteractive: false,
  targetIsEditable: false,
  blocked: false,
  withModifier: false,
  repeat: false,
}

describe('shortcutFor', () => {
  it('maps 1/2/3 and A/B/C (any case) to picks while answering', () => {
    expect(shortcutFor('1', base)).toEqual({ type: 'pick', tag: 'A' })
    expect(shortcutFor('2', base)).toEqual({ type: 'pick', tag: 'B' })
    expect(shortcutFor('3', base)).toEqual({ type: 'pick', tag: 'C' })
    expect(shortcutFor('b', base)).toEqual({ type: 'pick', tag: 'B' })
    expect(shortcutFor('C', base)).toEqual({ type: 'pick', tag: 'C' })
  })

  it('ignores C / 3 on a 2-choice question', () => {
    const twoChoice = { ...base, tags: ['A', 'B'] as const }
    expect(shortcutFor('3', twoChoice)).toBeNull()
    expect(shortcutFor('c', twoChoice)).toBeNull()
    expect(shortcutFor('2', twoChoice)).toEqual({ type: 'pick', tag: 'B' })
  })

  it('still picks when a choice button has focus (digits do nothing to buttons)', () => {
    expect(shortcutFor('1', { ...base, targetIsInteractive: true })).toEqual({ type: 'pick', tag: 'A' })
  })

  it('advances with Enter or Space during feedback', () => {
    const feedback = { ...base, status: 'feedback' as const }
    expect(shortcutFor('Enter', feedback)).toEqual({ type: 'next' })
    expect(shortcutFor(' ', feedback)).toEqual({ type: 'next' })
  })

  it('leaves Enter/Space to a focused button so the question is not skipped twice', () => {
    expect(shortcutFor('Enter', { ...base, status: 'feedback', targetIsInteractive: true })).toBeNull()
  })

  it('does nothing while checking, on errors, or after the round', () => {
    for (const status of ['checking', 'error', 'done'] as const) {
      expect(shortcutFor('1', { ...base, status })).toBeNull()
      expect(shortcutFor('Enter', { ...base, status })).toBeNull()
    }
    expect(shortcutFor('Enter', base)).toBeNull() // no answer yet
  })

  it('stays out of the way of typing, dialogs, modifiers and key repeat', () => {
    expect(shortcutFor('1', { ...base, targetIsEditable: true })).toBeNull()
    expect(shortcutFor('1', { ...base, blocked: true })).toBeNull()
    expect(shortcutFor('c', { ...base, withModifier: true })).toBeNull() // Ctrl+C copies
    expect(shortcutFor('1', { ...base, repeat: true })).toBeNull()
    expect(shortcutFor('x', base)).toBeNull()
  })
})

describe('four choices: 1–4 and A–D', () => {
  const four = { ...base, tags: ['A', 'B', 'C', 'D'] as const }

  it('maps every digit and letter, either case, to its choice', () => {
    const expected = [
      ['1', 'a', 'A', 'A'],
      ['2', 'b', 'B', 'B'],
      ['3', 'c', 'C', 'C'],
      ['4', 'd', 'D', 'D'],
    ] as const
    for (const [digit, lower, upper, tag] of expected) {
      for (const key of [digit, lower, upper]) expect(shortcutFor(key, four), key).toEqual({ type: 'pick', tag })
    }
  })

  it('never picks with 0, 5 or E, and ignores 4 / D when the question has fewer choices', () => {
    for (const key of ['0', '5', 'e', 'E']) expect(shortcutFor(key, four), key).toBeNull()
    expect(shortcutFor('4', base)).toBeNull()
    expect(shortcutFor('d', base)).toBeNull()
  })

  it('falls back to the physical digit key: keypad, AZERTY (1 types &), Vietnamese VNI (4 is a tone mark)', () => {
    expect(shortcutFor('4', { ...four, code: 'Numpad4' })).toEqual({ type: 'pick', tag: 'D' })
    expect(shortcutFor('&', { ...four, code: 'Digit1' })).toEqual({ type: 'pick', tag: 'A' })
    expect(shortcutFor("'", { ...four, code: 'Digit4' })).toEqual({ type: 'pick', tag: 'D' })
    expect(shortcutFor('Process', { ...four, code: 'Digit4' })).toEqual({ type: 'pick', tag: 'D' })
  })

  it('uses the physical letter key only while an IME holds it (Telex d → đ), never on other layouts', () => {
    expect(shortcutFor('Process', { ...four, code: 'KeyD' })).toEqual({ type: 'pick', tag: 'D' })
    // AZERTY: the key in the A position types "q"; it must not pick A.
    expect(tagForKey('q', 'KeyA')).toBeNull()
    expect(tagForKey('a', 'KeyQ')).toBe('A')
  })
})

describe('shortcutKeyFor', () => {
  it('labels A/B/C/D as 1/2/3/4 (never 0)', () => {
    expect((['A', 'B', 'C', 'D'] as const).map(shortcutKeyFor)).toEqual(['1', '2', '3', '4'])
  })

  it('the label is the key that picks it', () => {
    const four = { ...base, tags: ['A', 'B', 'C', 'D'] as const }
    for (const tag of four.tags) expect(shortcutFor(shortcutKeyFor(tag), four)).toEqual({ type: 'pick', tag })
  })
})

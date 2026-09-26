import { describe, expect, it } from 'vitest'
import { shortcutFor, shortcutKeyFor, type ShortcutContext } from '../lib/shortcuts'

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

describe('shortcutKeyFor', () => {
  it('labels A/B/C as 1/2/3', () => {
    expect(['A', 'B', 'C'].map((t) => shortcutKeyFor(t as 'A' | 'B' | 'C'))).toEqual(['1', '2', '3'])
  })
})

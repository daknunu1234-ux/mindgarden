import { describe, expect, it } from 'vitest'
import { outlineKey } from '../lib/outline'

describe('outlineKey', () => {
  it('maps Enter, Shift+Enter, Tab and Shift+Tab and ignores other keys', () => {
    expect(outlineKey({ key: 'Enter', shiftKey: false })).toBe('enter')
    expect(outlineKey({ key: 'Enter', shiftKey: true })).toBe('shift-enter')
    expect(outlineKey({ key: 'Tab', shiftKey: false })).toBe('tab')
    expect(outlineKey({ key: 'Tab', shiftKey: true })).toBe('shift-tab')
    expect(outlineKey({ key: 'Enter', shiftKey: true, isComposing: true })).toBeNull()
    expect(outlineKey({ key: 'x', shiftKey: false })).toBeNull()
  })

  it('waits while an IME composes (Vietnamese Telex / VNI)', () => {
    expect(outlineKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBeNull()
  })
})

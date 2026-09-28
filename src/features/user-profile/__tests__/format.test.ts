import { describe, expect, it } from 'vitest'
import { formatJoined, gardenerName, plural } from '../lib/format'

describe('formatJoined', () => {
  it('formats an ISO timestamp as a UTC date', () => {
    expect(formatJoined('2026-09-26T23:30:00Z')).toBe('Joined 26 September 2026')
  })

  it('does not crash on a bad date', () => {
    expect(formatJoined('not-a-date')).toBe('Joined recently')
  })
})

describe('gardenerName / plural', () => {
  it('uses the part of the email before @', () => {
    expect(gardenerName('linh.nguyen@example.com')).toBe('linh.nguyen')
    expect(gardenerName('')).toBe('Gardener')
  })

  it('pluralizes counts', () => {
    expect(plural(1, 'tree', 'trees')).toBe('1 tree')
    expect(plural(3, 'tree', 'trees')).toBe('3 trees')
    expect(plural(0, 'tree', 'trees')).toBe('0 trees')
  })
})

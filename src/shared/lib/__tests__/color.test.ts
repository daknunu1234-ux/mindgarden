import { describe, expect, it } from 'vitest'
import { mix, shade } from '../color'

describe('mix', () => {
  it('interpolates between two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('accepts 3-digit hex and clamps t', () => {
    expect(mix('#f00', '#00f', 2)).toBe('#0000ff')
    expect(mix('#f00', '#00f', -1)).toBe('#ff0000')
  })

  it('returns the first colour for invalid input', () => {
    expect(mix('nope', '#fff', 0.5)).toBe('nope')
    expect(mix('#123456', 'bad', 0.5)).toBe('#123456')
  })
})

describe('shade', () => {
  it('lightens and darkens', () => {
    expect(shade('#808080', 1)).toBe('#ffffff')
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('#22c55e', 0)).toBe('#22c55e')
  })
})

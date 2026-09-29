import { describe, expect, it } from 'vitest'
import { gaugePercent, notchOffsets } from '../gauge'
import { burstParticles } from '../particles'

describe('gaugePercent', () => {
  it('maps value/max to 0–100', () => {
    expect(gaugePercent(30, 120)).toBe(25)
    expect(gaugePercent(0, 10)).toBe(0)
    expect(gaugePercent(10, 10)).toBe(100)
  })

  it('clamps overflow and negatives', () => {
    expect(gaugePercent(15, 10)).toBe(100)
    expect(gaugePercent(-3, 10)).toBe(0)
  })

  it('returns 0 for an empty or invalid max', () => {
    expect(gaugePercent(5, 0)).toBe(0)
    expect(gaugePercent(5, -1)).toBe(0)
    expect(gaugePercent(Number.NaN, 10)).toBe(0)
    expect(gaugePercent(5, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('notchOffsets', () => {
  it('splits a gauge into equal segments', () => {
    expect(notchOffsets(4)).toEqual([25, 50, 75])
    expect(notchOffsets(2)).toEqual([50])
  })

  it('has no notches for 0 or 1 segment, or absurd counts', () => {
    expect(notchOffsets(0)).toEqual([])
    expect(notchOffsets(1)).toEqual([])
    expect(notchOffsets(500)).toEqual([])
  })
})

describe('burstParticles', () => {
  it('is deterministic', () => {
    expect(burstParticles(12)).toEqual(burstParticles(12))
  })

  it('caps the count and stays within the radius', () => {
    expect(burstParticles(1000)).toHaveLength(48)
    expect(burstParticles(-2)).toHaveLength(0)
    for (const p of burstParticles(24, 100)) {
      // Upward bias shifts dy by at most 0.2 × radius.
      expect(Math.hypot(p.dx, p.dy + 20)).toBeLessThanOrEqual(101)
    }
  })

  it('fans out in all directions', () => {
    const ps = burstParticles(16)
    expect(ps.some((p) => p.dx > 0)).toBe(true)
    expect(ps.some((p) => p.dx < 0)).toBe(true)
    expect(ps.some((p) => p.dy < 0)).toBe(true)
  })
})

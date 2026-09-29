// Pure helpers for game gauges (unit-tested).

// 0–100 fill for a value out of max; NaN, negatives and overflow are clamped.
export function gaugePercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, Math.max(0, (value / max) * 100))
}

// Positions (in %) of the notch dividers that split a gauge into `segments` equal parts.
export function notchOffsets(segments: number): number[] {
  const n = Math.floor(segments)
  if (n < 2 || n > 40) return []
  return Array.from({ length: n - 1 }, (_, i) => ((i + 1) / n) * 100)
}

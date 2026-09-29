// Pure hex colour helpers for the cartoon illustrations (shading, outlines, highlights).

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)))

function parse(hex: string): [number, number, number] | null {
  // The '#' is required: without it, words like "bad" or "face" would parse as colours.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`

// Mix two colours: t = 0 → a, t = 1 → b. Invalid input returns `a` unchanged.
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a)
  const cb = parse(b)
  if (!ca || !cb) return a
  const k = Math.min(1, Math.max(0, t))
  return toHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k])
}

// amount > 0 lightens toward white, < 0 darkens toward black (−1 … 1).
export const shade = (hex: string, amount: number): string => (amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount))

// Pure, deterministic particle layout for celebration bursts (unit-tested). Same count → same burst,
// so server and client render identical markup.

export type BurstParticle = { dx: number; dy: number; spin: number; delay: number; glyph: string; size: number }

const GLYPHS = ['✨', '🍃', '⭐', '💧', '🌸']

export function burstParticles(count: number, radius = 110): BurstParticle[] {
  const n = Math.max(0, Math.min(48, Math.floor(count)))
  return Array.from({ length: n }, (_, i) => {
    // Golden-angle spread keeps particles evenly fanned without randomness.
    const angle = i * 2.399963 - Math.PI / 2
    const reach = radius * (0.55 + ((i * 37) % 45) / 100)
    return {
      dx: Math.round(Math.cos(angle) * reach),
      // Bias upward a little: it reads as "bursting out" of the card.
      dy: Math.round(Math.sin(angle) * reach - radius * 0.2),
      spin: ((i * 97) % 360) - 180,
      delay: (i % 6) * 0.03,
      glyph: GLYPHS[i % GLYPHS.length],
      size: 14 + ((i * 7) % 10),
    }
  })
}

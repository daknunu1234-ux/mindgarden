// Pure, deterministic particle layout for celebration bursts (unit-tested). Same count → same burst,
// so server and client render identical markup.

export type BurstParticle = { dx: number; dy: number; spin: number; delay: number; glyph: string; size: number }

const GLYPHS = ['✨', '🍃', '⭐', '💧', '🌸']
// Gold shower for coin rewards.
export const GOLD_GLYPHS = ['🪙', '✨', '⭐', '🪙', '💛'] as const

export function burstParticles(count: number, radius = 110, glyphs: readonly string[] = GLYPHS): BurstParticle[] {
  const set = glyphs.length > 0 ? glyphs : GLYPHS
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
      glyph: set[i % set.length],
      size: 14 + ((i * 7) % 10),
    }
  })
}

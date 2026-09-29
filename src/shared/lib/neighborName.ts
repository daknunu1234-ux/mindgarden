// Friendly gardener names (pure, tested via garden/__tests__/neighbors.test.ts). Players can't read each
// other's profiles (users RLS: self only), so a gardener without a public name is shown with a
// name derived from their id: stable for everyone, reveals nothing personal. Used by the Visited
// Gardens drawer and the Mind Tournament boards.

const ADJECTIVES = ['Sunny', 'Mossy', 'Breezy', 'Dewy', 'Golden', 'Misty', 'Cheery', 'Leafy', 'Rosy', 'Starry', 'Maple', 'Clover']
const CREATURES = ['Otter', 'Robin', 'Hedgehog', 'Fox', 'Bunny', 'Owl', 'Wren', 'Badger', 'Finch', 'Squirrel', 'Deer', 'Duckling']

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// "Mossy Owl" for a given gardener id, the same on every page and for every visitor.
export function neighborName(ownerId: string): string {
  const h = hash(ownerId)
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${CREATURES[Math.floor(h / ADJECTIVES.length) % CREATURES.length]}`
}

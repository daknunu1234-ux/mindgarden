import { seededRandom } from '@/shared/utils/seededRandom'
import { pointInPolygon, type Point } from './farmLayout'

// Pure helpers for the island's painted look (unit-tested).

export type GrassPatch = { x: number; y: number; rx: number; ry: number; tone: 'lime' | 'deep' | 'sun' }

// Soft painterly patches scattered over the grass top: lime sun patches and deep-green shade
// patches, flattened for the isometric view. Deterministic for a given island + seed, and every
// patch centre lies on the island.
export function grassPatches(outline: Point[], seed: string, count = 18): GrassPatch[] {
  if (outline.length < 3 || count <= 0) return []
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const random = seededRandom(`grass:${seed}`)
  const tones: GrassPatch['tone'][] = ['lime', 'deep', 'lime', 'sun', 'deep']
  const patches: GrassPatch[] = []
  for (let attempt = 0; attempt < count * 12 && patches.length < count; attempt++) {
    const x = minX + random() * (maxX - minX)
    const y = minY + random() * (maxY - minY)
    if (!pointInPolygon([x, y], outline)) continue
    const r = 26 + random() * 46
    patches.push({ x, y, rx: r, ry: r * (0.42 + random() * 0.14), tone: tones[patches.length % tones.length] })
  }
  return patches
}

// Island outline points on the front (lower) half: where the cliff face shows. Used to scatter
// rocks embedded in the strata.
export function frontEdge(outline: Point[]): Point[] {
  if (outline.length === 0) return []
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length
  return outline.filter((p) => p[1] > cy)
}

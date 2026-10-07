// Prepares the island's building PNGs (raw-assets/structures/*.png, kept outside public/ so the heavy
// originals are never served) as light in-game sprites (public/assets/sprites/*.webp).
//
// The source renders have no real transparency: a checkerboard (and a small sparkle watermark in the
// bottom-right corner) is painted into the pixels. This script:
//   1. learns the checkerboard's two tones from the image border,
//   2. flood-fills the background from the border: neutral (grey) pixels near a checker tone, plus the
//      darker / lighter neutral pixels of the baked ground shadow, so building parts that happen to
//      be grey are kept unless they touch the outside directly,
//   3. drops small loose specks and anything that only lives in the watermark corner,
//   4. softens the cut edge by one pixel, crops to the building, and writes a WebP at most 640 px wide.
//
// Run: node scripts/prepare-building-sprites.mjs   (re-run after replacing a source PNG; uses `sharp`,
// which Next.js installs). Sources with real alpha are passed through untouched apart from the crop.
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCES = ['windmill_small', 'candy_factory', 'furniture_factory']
const IN = 'raw-assets/structures'
const OUT = 'public/assets/sprites'
const MAX_WIDTH = 640

const spread = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b)
const lum = (r, g, b) => (r + g + b) / 3

async function prepare(name) {
  const { data, info } = await sharp(join(IN, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]

  let hasAlpha = false
  for (let i = 0; i < w * h && !hasAlpha; i += 97) hasAlpha = data[i * 4 + 3] < 250
  const bg = new Uint8Array(w * h)
  // A looser test for checker squares (tinted by the render's glow, or at their soft edges): used for
  // enclosed holes and loose specks, never for the flood from the border.
  let loose = () => false

  if (!hasAlpha) {
    // 1. The checker tones: the two most common neutral brightnesses on the border.
    const counts = new Map()
    const borderIdx = []
    for (let x = 0; x < w; x++) borderIdx.push(x, (h - 1) * w + x)
    for (let y = 0; y < h; y++) borderIdx.push(y * w, y * w + w - 1)
    for (const i of borderIdx) {
      const [r, g, b] = px(i)
      if (spread(r, g, b) > 16) continue
      const k = Math.round(lum(r, g, b) / 6) * 6
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const tones = [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const t0 = tones[0]
    const t1 = tones.find((t) => Math.abs(t - t0) > 24) ?? t0
    const lo = Math.min(t0, t1)
    const hi = Math.max(t0, t1)
    const darkChecker = hi < 160
    const nearTone = (l, tol) => Math.abs(l - lo) < tol || Math.abs(l - hi) < tol
    const lumAt = (i) => lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    // The checker's square size: the median run of one tone along the top row.
    const runs = []
    let run = 1
    for (let x = 1; x < w; x++) {
      const same = Math.abs(lumAt(x) - lumAt(x - 1)) < (hi - lo) / 2
      if (same) run++
      else {
        runs.push(run)
        run = 1
      }
    }
    runs.sort((a, b) => a - b)
    const cell = runs.length ? runs[Math.floor(runs.length / 2)] : 0
    // The checker's signature: one square away (in any direction) lies the other tone. A flat grey
    // face of the building (a windmill hub) has its own grey all round instead.
    const checkered = (i) => {
      if (cell < 4) return true
      const l = lumAt(i)
      const other = Math.abs(l - lo) < Math.abs(l - hi) ? hi : lo
      const x = i % w
      for (const j of [x >= cell ? i - cell : -1, x + cell < w ? i + cell : -1, i - cell * w, i + cell * w]) {
        // The other square must be grey too (a teal wall can match a checker tone in brightness).
        if (j >= 0 && j < w * h && Math.abs(lumAt(j) - other) < 30 && spread(data[j * 4], data[j * 4 + 1], data[j * 4 + 2]) <= 45) return true
      }
      return false
    }
    // 2. A background pixel: checkerboard grey (or checkerboard under the render's warm glow), or the
    // baked shadow. For a dark checker the shadow darkens the checker further. For a light checker it
    // is a dark ellipse on the ground, so dark greys count only in the lower part of the image (a dark
    // chimney at the top stays).
    const isBg = (i) => {
      const [r, g, b] = px(i)
      const s = spread(r, g, b)
      const l = lum(r, g, b)
      // Warm-tinted checker: the render's glow spills over it (in the upper half only on a dark
      // checker, where ground and stone shades in the lower half look much the same).
      if (s > 22) return s <= 45 && b <= r && nearTone(l, 30) && (!darkChecker || Math.floor(i / w) < h * 0.5) && checkered(i)
      // Under a dark checker's shadow both tones darken (the dark squares stop looking checkered), so
      // any grey below the light tone is background there.
      if (darkChecker && l <= hi - 18) return true
      if (nearTone(l, 18)) return checkered(i)
      if (darkChecker) return false
      return l > lo - 18 || (l < lo && Math.floor(i / w) > h * 0.3)
    }
    loose = (i) => {
      const [r, g, b] = px(i)
      return spread(r, g, b) <= 60 && nearTone(lum(r, g, b), 35)
    }
    const flood = (seeds, mark, test = isBg) => {
      const stack = seeds.filter((i) => !mark[i] && test(i))
      for (const i of stack) mark[i] = 1
      const region = [...stack]
      while (stack.length) {
        const i = stack.pop()
        const x = i % w
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= w * h || mark[j] || !test(j)) continue
          mark[j] = 1
          stack.push(j)
          region.push(j)
        }
      }
      return region
    }
    flood(borderIdx, bg)
    // Enclosed holes (between a crane's beams, behind a chimney): a closed region of background-like
    // pixels counts as background only if it shows the checkerboard: almost all of it on the two
    // tones, both in good measure (shaded metal, like a windmill hub, has every shade in between).
    const seen = Uint8Array.from(bg)
    let holes = 0
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || !loose(i)) continue
      const region = flood([i], seen, loose)
      if (region.length < 60) continue
      // A grey pipe or a dark doorway is a flat run of one shade: no checker pattern in it.
      if (region.length > w * h * 0.01) continue
      if (region.filter(checkered).length < region.length * 0.4) continue
      let nearLo = 0
      let nearHi = 0
      for (const j of region) {
        const [r, g, b] = px(j)
        const l = lum(r, g, b)
        // Grey squares count within a narrow band; squares tinted by the warm glow within a wider one.
        const s = spread(r, g, b)
        const tol = s <= 22 ? 14 : s <= 45 && b <= r ? 30 : -1
        if (Math.abs(l - lo) < tol) nearLo++
        else if (Math.abs(l - hi) < tol) nearHi++
      }
      if (nearLo > region.length * 0.2 && nearHi > region.length * 0.2 && nearLo + nearHi > region.length * 0.85) {
        for (const j of region) bg[j] = 1
        holes++
      }
    }
    console.log(`${name}: checker tones ${lo} / ${hi}, squares ${cell} px, ${holes} enclosed holes cleared`)
  } else {
    for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] < 16) bg[i] = 1
  }

  // 3. Connected pieces of what is left: keep the building and anything sizeable (smoke puffs), drop
  // specks, leftover patches of checker, and pieces sitting wholly in the bottom-right watermark corner.
  const label = new Int32Array(w * h).fill(-1)
  const pieces = []
  for (let s = 0; s < w * h; s++) {
    if (bg[s] || label[s] >= 0) continue
    const id = pieces.length
    const piece = { id, area: 0, checker: 0, minX: w, minY: h, maxX: 0, maxY: 0 }
    const stack = [s]
    label[s] = id
    while (stack.length) {
      const i = stack.pop()
      const x = i % w
      const y = (i - x) / w
      piece.area++
      if (loose(i)) piece.checker++
      piece.minX = Math.min(piece.minX, x)
      piece.maxX = Math.max(piece.maxX, x)
      piece.minY = Math.min(piece.minY, y)
      piece.maxY = Math.max(piece.maxY, y)
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || bg[j] || label[j] >= 0) continue
        label[j] = id
        stack.push(j)
      }
    }
    pieces.push(piece)
  }
  const biggest = Math.max(...pieces.map((p) => p.area))
  const keep = new Set(
    pieces
      .filter((p) => p.area >= Math.max(400, biggest * 0.002))
      .filter((p) => p.area === biggest || p.checker < p.area * 0.5)
      .filter((p) => !(p.minX > w * 0.82 && p.minY > h * 0.78))
      .map((p) => p.id),
  )

  // 4. Alpha: kept pixels opaque, a one-pixel soft edge where they meet the background; crop.
  const out = Buffer.from(data)
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let i = 0; i < w * h; i++) {
    const kept = label[i] >= 0 && keep.has(label[i])
    if (!kept) {
      out[i * 4 + 3] = 0
      continue
    }
    const x = i % w
    const y = (i - x) / w
    const edge = [i - 1, i + 1, i - w, i + w].some((j) => j < 0 || j >= w * h || !(label[j] >= 0 && keep.has(label[j])))
    if (edge) out[i * 4 + 3] = Math.min(out[i * 4 + 3], 140)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const crop = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  const width = Math.min(MAX_WIDTH, crop.width)
  const file = join(OUT, `${name}.webp`)
  const result = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract(crop)
    .resize({ width })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(file)
  console.log(`${name}: crop ${crop.width}×${crop.height} at (${crop.left}, ${crop.top}) → ${file} ${result.width}×${result.height}, ${(result.size / 1024).toFixed(0)} KB`)
}

await mkdir(OUT, { recursive: true })
for (const name of SOURCES) await prepare(name)

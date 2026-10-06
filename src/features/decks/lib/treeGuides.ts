// Tree connector lines for the Workshop outline (pure, unit-tested). Given the levels of the lines
// as shown (collapsed branches already left out; level 0 = the root the outline is showing), says
// what each line draws, column by column:
//   through[k]  a straight │ in column k (k < level - 1): an ancestor at level k + 1 still has a
//               sibling further down, so its parent's line passes by this row
//   elbow       in column level - 1: 'tee' ├ when a sibling follows, 'last' └ for the last child
//   stem        the line has children shown right below it: a │ drops from its bullet to the row's
//               bottom, so the children's elbows join it without a gap
// Column k sits under the bullet of the level-k node, so every line meets its parent's bullet.

export type TreeGuide = {
  through: boolean[]
  elbow: 'tee' | 'last' | null
  stem: boolean
}

export function treeGuides(levels: readonly number[]): TreeGuide[] {
  // Walking up from the bottom, `open[k]` = a later line sits at level k + 1 before any line above
  // level k + 1 closes that group (a line at level ≤ k).
  const out: TreeGuide[] = new Array(levels.length)
  const open: boolean[] = []
  for (let i = levels.length - 1; i >= 0; i--) {
    const level = Math.max(0, levels[i])
    const through = Array.from({ length: Math.max(0, level - 1) }, (_, k) => open[k] === true)
    out[i] = {
      through,
      elbow: level === 0 ? null : open[level - 1] ? 'tee' : 'last',
      stem: i + 1 < levels.length && levels[i + 1] > level,
    }
    // This line opens its own group for the lines above it, and closes every deeper one.
    open.length = level + 1
    if (level > 0) open[level - 1] = true
    open[level] = false
  }
  return out
}

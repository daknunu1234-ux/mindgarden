import type { StagedOutlineItem, VisualTextLine } from './types'

// Visual text lines → a three-level outline (pure, unit-tested): 1 = root, 2 = sub-root,
// 3 = statement. Every format goes through the same rules.
//
// 1. Each line gets a heading score from what it shows, strongest signal wins:
//      Word Heading 1 / 2 / 3 ........................ 90 / 80 / 70
//      PowerPoint title, isolated PDF header block ... 70–79 (75 without sizes; bigger = higher)
//      "I." Roman numbering .......................... 62   (≤ 20 words)
//      "A." capital letter ........................... 57   (≤ 20 words, not a sentence)
//      "1." number ................................... 52   (≤ 14 words, not a sentence)
//      "1.1" sub-number .............................. 47   (≤ 14 words, not a sentence)
//      larger than the body text ..................... 43–54 (bigger = higher; ≤ 20 words)
//      bold, short, not indented ..................... 30
//      a line whose next lines are indented under it . 20 − 2 per indent level (≤ 25 words, not a sentence)
//    Bullets and sentences are body text (no score) unless indented lines hang under them.
// 2. The highest score present makes the roots, the next one the sub-roots; every other line, scored
//    or not, is a statement under the nearest root or sub-root above it. So whatever a document
//    uses for its top two levels (I / A, Heading 1 / 2, slide titles / top bullets, big / bold
//    lines), they become roots and sub-roots, and everything deeper is drilled.
// 3. Clean-up: statements shorter than 5 characters are dropped, longer than 500 are split at sentence
//    ends, headings longer than 150 characters become statements, a document with no top level is
//    lifted one level, and lines before the first root go under a root named after the file.

export const ROOT_MAX_LENGTH = 150
export const STATEMENT_MIN_LENGTH = 5
export const STATEMENT_MAX_LENGTH = 500
// Most lines one import may stage (the server takes the same).
export const MAX_OUTLINE_ITEMS = 1000

const SENTENCE = /[.!?…]["”’)]?$/u
const len = (s: string) => [...s].length
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

// The size most characters are set in.
function bodySizeOf(lines: readonly VisualTextLine[]): number | undefined {
  const bySize = new Map<number, number>()
  for (const l of lines) if (l.fontSize) bySize.set(l.fontSize, (bySize.get(l.fontSize) ?? 0) + len(l.cleanText))
  return [...bySize.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
}

export function headingScore(line: VisualTextLine, next: VisualTextLine | undefined, bodySize: number | undefined): number | null {
  if (line.wordHeadingLevel) return 100 - line.wordHeadingLevel * 10
  // Header blocks rank by size, so a chapter title outranks a section title.
  if (line.isIsolatedHeaderBox) return 70 + (line.fontSize && bodySize ? Math.max(0, Math.min(9, Math.round((line.fontSize / bodySize - 1) * 10))) : 5)
  const text = line.cleanText
  const words = wordCount(text)
  const sentence = SENTENCE.test(text)
  const short = words <= 14 && !sentence
  let score: number | null = null
  const raise = (s: number) => {
    score = Math.max(score ?? 0, s)
  }
  if (line.prefixType === 'roman' && words <= 20) raise(62)
  else if (line.prefixType === 'capital' && words <= 20 && !sentence) raise(57)
  else if (line.prefixType === 'decimal' && short) raise(52)
  else if (line.prefixType === 'subdecimal' && short) raise(47)
  if (line.fontSize && bodySize && line.fontSize >= bodySize * 1.15 && words <= 20) raise(43 + Math.min(11, Math.round((line.fontSize / bodySize - 1) * 20)))
  if (line.isBold && short && line.indentLevel === 0 && line.prefixType !== 'bullet') raise(30)
  if (score === null && next && next.indentLevel > line.indentLevel && words <= 25 && !sentence) raise(20 - Math.min(line.indentLevel, 5) * 2)
  return score
}

// Sentence-sized pieces of at most `max` characters (a word is never cut unless it alone is longer).
export function splitLong(text: string, max = STATEMENT_MAX_LENGTH): string[] {
  if (len(text) <= max) return [text]
  const sentences = text.match(/[^.!?…]+[.!?…]+["”’)]?\s*|[^.!?…]+$/gu) ?? [text]
  const out: string[] = []
  let cur = ''
  const push = () => {
    if (cur.trim()) out.push(cur.trim())
    cur = ''
  }
  for (const s of sentences) {
    if (len(cur) + len(s) <= max) {
      cur += s
      continue
    }
    push()
    if (len(s) <= max) cur = s
    else
      for (const w of s.split(/\s+/)) {
        if (len(cur) + len(w) + 1 > max) push()
        cur += cur ? ` ${w}` : w
      }
  }
  push()
  return out
}

export type ClassifiedOutline = { items: StagedOutlineItem[]; notes: string[] }

export function classifyOutline(lines: readonly VisualTextLine[], fallbackTitle = 'Imported document'): ClassifiedOutline {
  const notes: string[] = []
  const bodySize = bodySizeOf(lines)
  const scores = lines.map((l, i) => headingScore(l, lines[i + 1], bodySize))
  const ranks = [...new Set(scores.filter((s): s is number => s !== null))].sort((a, b) => b - a)
  const levelOf = (score: number | null): 1 | 2 | 3 => (score === null ? 3 : score === ranks[0] ? 1 : score === ranks[1] ? 2 : 3)

  let draft = lines.map((l, i) => ({ text: l.cleanText, level: levelOf(scores[i]) }))

  // Headings too long to be a root's name read as statements.
  let demoted = 0
  draft = draft.map((d) => (d.level < 3 && len(d.text) > ROOT_MAX_LENGTH ? (demoted++, { ...d, level: 3 as const }) : d))
  if (demoted > 0) notes.push(`${demoted} heading${demoted === 1 ? '' : 's'} longer than ${ROOT_MAX_LENGTH} characters became statements`)

  // No root at all but sub-roots: lift them.
  if (!draft.some((d) => d.level === 1) && draft.some((d) => d.level === 2)) draft = draft.map((d) => (d.level === 2 ? { ...d, level: 1 as const } : d))

  const items: StagedOutlineItem[] = []
  let tooShort = 0
  let split = 0
  let previous = ''
  for (const d of draft) {
    if (!d.text) continue
    if (d.level === 3) {
      if (len(d.text) < STATEMENT_MIN_LENGTH) {
        tooShort++
        continue
      }
      const parts = splitLong(d.text)
      if (parts.length > 1) split++
      for (const text of parts) {
        if (text === previous) continue
        items.push({ id: `item-${items.length + 1}`, text, level: 3 })
        previous = text
      }
      continue
    }
    if (d.text === previous) continue
    items.push({ id: `item-${items.length + 1}`, text: d.text, level: d.level })
    previous = d.text
  }
  if (tooShort > 0) notes.push(`${tooShort} line${tooShort === 1 ? '' : 's'} shorter than ${STATEMENT_MIN_LENGTH} characters left out`)
  if (split > 0) notes.push(`${split} long paragraph${split === 1 ? ' was' : 's were'} split into statements of at most ${STATEMENT_MAX_LENGTH} characters`)

  // Everything needs a root above it: lines before the first one go under a root named after the file.
  if (items.length > 0 && items[0].level !== 1) {
    items.unshift({ id: 'item-0', text: fallbackTitle.slice(0, ROOT_MAX_LENGTH).trim() || 'Imported document', level: 1 })
    notes.push(`Lines before the first heading were put under a root named “${items[0].text}”`)
  }
  if (items.length > MAX_OUTLINE_ITEMS) {
    notes.push(`Only the first ${MAX_OUTLINE_ITEMS} of ${items.length} lines can be imported at once`)
    items.length = MAX_OUTLINE_ITEMS
  }
  return { items, notes }
}

// The staged list keeps its shape rules while the user edits it: the first line is a root, a
// sub-root needs a root above it (else it becomes one).
export function normalizeStaged(items: readonly StagedOutlineItem[]): StagedOutlineItem[] {
  let seenRoot = false
  return items.map((it, i) => {
    let level = it.level
    if (i === 0) level = 1
    if (level === 2 && !seenRoot) level = 1
    if (level === 1) seenRoot = true
    return level === it.level ? it : { ...it, level }
  })
}

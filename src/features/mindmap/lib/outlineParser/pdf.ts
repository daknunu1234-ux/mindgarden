import { collapse, detectPrefix } from './prefix'
import type { VisualTextLine } from './types'

// PDF → visual text lines (pure: takes the positioned text items pdf.js reports, so tests need no
// PDF). A PDF has no paragraphs or headings, only glyph runs at positions, so they are rebuilt:
//   1. items on the same baseline (within half a glyph height) form one line, left to right;
//   2. the left edges used by several lines become indent levels (leftmost = 0);
//   3. a line continues the previous one when it starts at the same indent with the same size and
//      no numbering or bullet, sits close below it, and the previous one didn't end a sentence;
//   4. lines repeated at the same height on most pages (running headers, footers) and bare page
//      numbers are dropped;
//   5. a short line with clear space above and below, larger than the body text, is an isolated
//      header block.

export type PdfTextItem = {
  str: string
  // Left edge and baseline in PDF points (y grows upwards, from the bottom of the page).
  x: number
  y: number
  width: number
  // Glyph height ≈ font size.
  height: number
  fontName?: string
  bold?: boolean
}
export type PdfPage = { width: number; height: number; items: PdfTextItem[] }

type RawLine = { page: number; x: number; y: number; size: number; bold: boolean; text: string; pageHeight: number }

const BOLD_FONT = /bold|black|heavy|semibold|demi/i
const SENTENCE_END = /[.!?;:…]["”’)]?$/u

function rawLines(pages: PdfPage[]): RawLine[] {
  const out: RawLine[] = []
  pages.forEach((page, p) => {
    const items = page.items.filter((i) => i.str.trim() !== '' && i.height > 0)
    // Top to bottom, then left to right.
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    let current: PdfTextItem[] = []
    const flush = () => {
      if (current.length === 0) return
      current.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const it of current) {
        // A visible gap between two runs is a space (pdf.js often leaves spaces out).
        if (text && it.x - end > it.height * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' '
        text += it.str
        end = it.x + it.width
      }
      const size = Math.max(...current.map((i) => i.height))
      const boldShare = current.filter((i) => i.bold || BOLD_FONT.test(i.fontName ?? '')).reduce((n, i) => n + i.str.length, 0) / Math.max(1, current.reduce((n, i) => n + i.str.length, 0))
      out.push({ page: p, x: current[0].x, y: current[0].y, size, bold: boldShare >= 0.8, text: collapse(text), pageHeight: page.height })
      current = []
    }
    for (const it of items) {
      const ref = current[0]
      if (ref && Math.abs(ref.y - it.y) > Math.max(ref.height, it.height) * 0.5) flush()
      current.push(it)
    }
    flush()
  })
  return out.filter((l) => l.text !== '')
}

// Running headers / footers: the same text at about the same height on at least half of the pages
// (and on 3+ pages), and page numbers ("12", "- 12 -", "Page 3 of 9", "Trang 4").
function isFurniture(line: RawLine, all: RawLine[], pageCount: number): boolean {
  if (/^(?:[-–—]?\s*\d{1,4}\s*[-–—]?|(?:page|trang)\s+\d{1,4}(?:\s*(?:of|\/|trên)\s*\d{1,4})?)$/iu.test(line.text)) return true
  if (pageCount < 3) return false
  const same = all.filter((o) => o.text === line.text && Math.abs(o.y - line.y) < 6)
  const pages = new Set(same.map((o) => o.page))
  return pages.size >= 3 && pages.size >= pageCount / 2
}

export function linesFromPdf(pages: PdfPage[]): VisualTextLine[] {
  const raw = rawLines(pages)
  const body = raw.filter((l) => !isFurniture(l, raw, pages.length))
  if (body.length === 0) return []

  // Indent levels: left edges (2 pt buckets) that start at least two lines, leftmost first.
  const bucket = (x: number) => Math.round(x / 2) * 2
  const counts = new Map<number, number>()
  for (const l of body) counts.set(bucket(l.x), (counts.get(bucket(l.x)) ?? 0) + 1)
  const margins = [...counts.entries()].filter(([, n]) => n >= 2).map(([x]) => x).sort((a, b) => a - b)
  const indentOf = (x: number) => {
    if (margins.length === 0) return 0
    // The deepest margin at or left of this line (a few points of slack).
    let level = 0
    margins.forEach((m, i) => {
      if (bucket(x) >= m - 3) level = i
    })
    return Math.min(level, 6)
  }

  // Body text size: the size most characters are set in.
  const bySize = new Map<number, number>()
  for (const l of body) bySize.set(Math.round(l.size * 2) / 2, (bySize.get(Math.round(l.size * 2) / 2) ?? 0) + l.text.length)
  const bodySize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0]

  // Merge wrapped lines into paragraphs.
  // lastY: the baseline of the paragraph's last line (its gap to the next one).
  type Para = RawLine & { indent: number; gapAbove: number; gapBelow: number; lastY: number }
  const paras: Para[] = []
  body.forEach((l, i) => {
    const prev = paras[paras.length - 1]
    const prevRaw = body[i - 1]
    const gap = prevRaw && prevRaw.page === l.page ? prevRaw.y - l.y : Infinity
    const indent = indentOf(l.x)
    const continues =
      prev &&
      prev.page === l.page &&
      gap <= l.size * 1.8 &&
      Math.abs(prev.size - l.size) < 0.6 &&
      prev.bold === l.bold &&
      detectPrefix(l.text).prefixType === 'none' &&
      !SENTENCE_END.test(prev.text) &&
      // A wrapped line starts at the paragraph's own margin or its hanging indent.
      (indentOf(l.x) === prev.indent || (indent === prev.indent + 1 && detectPrefix(prev.text).prefixType !== 'none'))
    if (continues) {
      prev.text = `${prev.text} ${l.text}`
      prev.lastY = l.y
      return
    }
    if (prev) prev.gapBelow = prev.page === l.page ? prev.lastY - l.y : Infinity
    paras.push({ ...l, indent, gapAbove: gap, gapBelow: Infinity, lastY: l.y })
  })

  return paras.map((para, i) => {
    const { prefixType, cleanText } = detectPrefix(para.text)
    const larger = para.size >= bodySize * 1.15
    const words = cleanText.split(' ').length
    const isolated = larger && words <= 14 && para.gapAbove >= para.size * 1.6 && para.gapBelow >= para.size * 1.2
    return {
      id: `pdf-${para.page + 1}-${i + 1}`,
      rawText: para.text,
      cleanText,
      fontSize: Math.round(para.size * 10) / 10,
      isBold: para.bold,
      indentLevel: para.indent,
      prefixType,
      yPositionPercent: Math.max(0, Math.min(100, ((para.pageHeight - para.y) / para.pageHeight) * 100)),
      isIsolatedHeaderBox: isolated,
    }
  })
}

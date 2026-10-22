import { collapse, detectPrefix, prefixFromNumberFormat } from './prefix'
import type { PrefixType, VisualTextLine } from './types'
import { attr, elements, onOff, startTag, texts } from './xml'

// Word (.docx) → visual text lines (pure: takes the XML parts, so tests need no zip). Reads, per
// paragraph of word/document.xml:
//   • the heading level: a Heading 1–3 / Title style (by its name in styles.xml, so renamed or
//     localised style ids still work) or an explicit outline level;
//   • the list level (w:ilvl) and the list's numbering format from numbering.xml (I, A, 1, 1.1, •),
//     since Word stores automatic numbers as formatting, not text;
//   • the indentation (w:ind, 720 twips = one level) when the paragraph is not in a list;
//   • bold (most of the text in bold runs) and the largest font size (w:sz is in half-points).

export type DocxParts = { document: string; styles?: string; numbering?: string }

type StyleInfo = { name: string; outline?: number; basedOn?: string }
type Numbering = Map<string, Map<number, { format: string; text?: string }>>

const TWIPS_PER_LEVEL = 720

function readStyles(xml: string | undefined): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  if (!xml) return styles
  for (const style of elements(xml, 'w:style')) {
    const id = attr(startTag(style, 'w:style'), 'w:styleId')
    if (!id) continue
    const outline = attr(startTag(style, 'w:outlineLvl'), 'w:val')
    styles.set(id, {
      name: (attr(startTag(style, 'w:name'), 'w:val') ?? id).toLowerCase(),
      outline: outline === undefined ? undefined : Number(outline),
      basedOn: attr(startTag(style, 'w:basedOn'), 'w:val'),
    })
  }
  return styles
}

function readNumbering(xml: string | undefined): Numbering {
  const out: Numbering = new Map()
  if (!xml) return out
  const abstracts = new Map<string, Map<number, { format: string; text?: string }>>()
  for (const abs of elements(xml, 'w:abstractNum')) {
    const id = attr(startTag(abs, 'w:abstractNum'), 'w:abstractNumId')
    if (id === undefined) continue
    const levels = new Map<number, { format: string; text?: string }>()
    for (const lvl of elements(abs, 'w:lvl')) {
      const ilvl = Number(attr(startTag(lvl, 'w:lvl'), 'w:ilvl') ?? 0)
      levels.set(ilvl, { format: attr(startTag(lvl, 'w:numFmt'), 'w:val') ?? 'decimal', text: attr(startTag(lvl, 'w:lvlText'), 'w:val') })
    }
    abstracts.set(id, levels)
  }
  for (const num of elements(xml, 'w:num')) {
    const numId = attr(startTag(num, 'w:num'), 'w:numId')
    const absId = attr(startTag(num, 'w:abstractNumId'), 'w:val')
    if (numId !== undefined && absId !== undefined && abstracts.has(absId)) out.set(numId, abstracts.get(absId)!)
  }
  return out
}

// Heading level of a style: its name ("heading 2", "title") or its outline level, following basedOn.
function headingOf(styles: Map<string, StyleInfo>, id: string | undefined, depth = 0): 1 | 2 | 3 | undefined {
  if (!id || depth > 5) return undefined
  const style = styles.get(id)
  const name = style?.name ?? id.toLowerCase()
  if (name === 'title') return 1
  const m = /^heading\s*(\d)$/.exec(name)
  const level = m ? Number(m[1]) : style?.outline !== undefined ? style.outline + 1 : undefined
  if (level !== undefined) return level >= 1 && level <= 3 ? (level as 1 | 2 | 3) : undefined
  return headingOf(styles, style?.basedOn, depth + 1)
}

export function linesFromDocx({ document, styles, numbering }: DocxParts): VisualTextLine[] {
  const styleMap = readStyles(styles)
  const lists = readNumbering(numbering)
  const body = /<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(document)?.[1] ?? document
  const lines: VisualTextLine[] = []

  for (const p of elements(body, 'w:p')) {
    const pPr = elements(p, 'w:pPr')[0] ?? ''
    // Text of every run: w:t, tabs and breaks as spaces.
    const runs = elements(p, 'w:r')
    let raw = ''
    let boldChars = 0
    let fontSize: number | undefined
    for (const r of runs) {
      const t = texts(r.replace(/<w:(tab|br|cr)\b[^>]*\/>/g, '<w:t> </w:t>'), 'w:t')
      if (!t) continue
      raw += t
      const rPr = elements(r, 'w:rPr')[0] ?? ''
      const b = startTag(rPr, 'w:b')
      if (onOff(attr(b, 'w:val'), b !== null)) boldChars += t.replace(/\s/g, '').length
      const sz = attr(startTag(rPr, 'w:sz'), 'w:val')
      if (sz) fontSize = Math.max(fontSize ?? 0, Number(sz) / 2)
    }
    const text = collapse(raw)
    if (!text) continue

    const styleId = attr(startTag(pPr, 'w:pStyle'), 'w:val')
    const outline = attr(startTag(pPr, 'w:outlineLvl'), 'w:val')
    const explicit = outline !== undefined && Number(outline) <= 2 ? ((Number(outline) + 1) as 1 | 2 | 3) : undefined
    const wordHeadingLevel = explicit ?? headingOf(styleMap, styleId)

    // A list paragraph: its level and the list's number format.
    const numPr = elements(pPr, 'w:numPr')[0]
    const ilvl = numPr ? Number(attr(startTag(numPr, 'w:ilvl'), 'w:val') ?? 0) : undefined
    const numId = numPr ? attr(startTag(numPr, 'w:numId'), 'w:val') : undefined
    const listLevel = numId !== undefined && numId !== '0' ? lists.get(numId)?.get(ilvl ?? 0) : undefined
    const left = Number(attr(startTag(pPr, 'w:ind'), 'w:left') ?? attr(startTag(pPr, 'w:ind'), 'w:start') ?? 0)
    const indentLevel = Math.min(6, ilvl ?? Math.max(0, Math.round(left / TWIPS_PER_LEVEL)))

    const typed = detectPrefix(text)
    const prefixType: PrefixType = listLevel ? prefixFromNumberFormat(listLevel.format, listLevel.text) : typed.prefixType
    const total = text.replace(/\s/g, '').length
    lines.push({
      id: `docx-${lines.length + 1}`,
      rawText: text,
      cleanText: typed.cleanText,
      fontSize,
      isBold: total > 0 && boldChars / total >= 0.8,
      indentLevel,
      prefixType,
      wordHeadingLevel,
    })
  }
  return lines
}

import { collapse, detectPrefix, prefixFromNumberFormat } from './prefix'
import type { PrefixType, VisualTextLine } from './types'
import { attr, elements, onOff, startTag, texts } from './xml'

// PowerPoint (.pptx) → visual text lines (pure: takes the slide XML in presentation order). Per slide,
// every text shape (p:sp, also inside groups) in reading order (top to bottom, then left to right):
//   • a title placeholder (title / ctrTitle) is an isolated header box: the slide's heading;
//   • each paragraph (a:p) keeps its bullet level (a:pPr lvl), bold, size (sz in 1/100 pt), its
//     automatic numbering (a:buAutoNum: I, A, 1) and the shape's height on the slide (0–100 %).
// Speaker notes, tables and charts are not read.

export type PptxSlide = { xml: string }
export type PptxParts = { slides: PptxSlide[]; slideHeightEmu?: number }

const DEFAULT_SLIDE_HEIGHT_EMU = 6_858_000 // 7.5 in, the 16:9 and 4:3 default height

type Shape = { xml: string; y: number; x: number; placeholder?: string }

function shapesOf(slide: string): Shape[] {
  return elements(slide, 'p:sp').map((xml) => {
    const off = startTag(xml, 'a:off')
    return {
      xml,
      x: Number(attr(off, 'x') ?? 0),
      y: Number(attr(off, 'y') ?? Number.MAX_SAFE_INTEGER),
      placeholder: attr(startTag(xml, 'p:ph'), 'type') ?? (startTag(xml, 'p:ph') ? 'body' : undefined),
    }
  })
}

export function linesFromPptx({ slides, slideHeightEmu = DEFAULT_SLIDE_HEIGHT_EMU }: PptxParts): VisualTextLine[] {
  const lines: VisualTextLine[] = []
  slides.forEach((slide, s) => {
    // Titles first, then the rest top to bottom: a title placed low on a slide is still its heading.
    const shapes = shapesOf(slide.xml).sort((a, b) => Number(isTitle(b)) - Number(isTitle(a)) || a.y - b.y || a.x - b.x)
    for (const shape of shapes) {
      const title = isTitle(shape)
      const body = elements(shape.xml, 'p:txBody')[0]
      if (!body) continue
      for (const p of elements(body, 'a:p')) {
        let raw = ''
        let boldChars = 0
        let fontSize: number | undefined
        // Runs, fields (slide numbers, dates) and line breaks, in order; a break reads as a space.
        for (const piece of p.match(/<a:r(?=[\s>])[\s\S]*?<\/a:r>|<a:fld(?=[\s>])[\s\S]*?<\/a:fld>|<a:br\b[^>]*?(?:\/>|>[\s\S]*?<\/a:br>)/g) ?? []) {
          if (piece.startsWith('<a:br')) {
            raw += ' '
            continue
          }
          const t = texts(piece, 'a:t')
          if (!t) continue
          raw += t
          const rPr = startTag(piece, 'a:rPr')
          if (onOff(attr(rPr, 'b'), attr(rPr, 'b') !== undefined)) boldChars += t.replace(/\s/g, '').length
          const sz = attr(rPr, 'sz')
          if (sz) fontSize = Math.max(fontSize ?? 0, Number(sz) / 100)
        }
        const text = collapse(raw)
        if (!text) continue
        const pPr = startTag(p, 'a:pPr')
        const autoNum = attr(startTag(p, 'a:buAutoNum'), 'type')
        const hasChar = startTag(p, 'a:buChar') !== null
        const typed = detectPrefix(text)
        const prefixType: PrefixType = autoNum ? numberFormat(autoNum) : typed.prefixType !== 'none' ? typed.prefixType : hasChar ? 'bullet' : 'none'
        const total = text.replace(/\s/g, '').length
        lines.push({
          id: `slide${s + 1}-${lines.length + 1}`,
          rawText: text,
          cleanText: typed.cleanText,
          fontSize,
          isBold: total > 0 && boldChars / total >= 0.8,
          indentLevel: Math.min(6, Number(attr(pPr, 'lvl') ?? 0)),
          prefixType,
          yPositionPercent: Number.isFinite(shape.y) && shape.y !== Number.MAX_SAFE_INTEGER ? Math.max(0, Math.min(100, (shape.y / slideHeightEmu) * 100)) : undefined,
          isIsolatedHeaderBox: title,
        })
      }
    }
  })
  return lines
}

const isTitle = (shape: Shape) => shape.placeholder === 'title' || shape.placeholder === 'ctrTitle'

// a:buAutoNum types: romanUcPeriod, alphaUcParenR, arabicPeriod…
function numberFormat(type: string): PrefixType {
  if (type.startsWith('roman')) return 'roman'
  if (type.startsWith('alpha')) return 'capital'
  if (type.startsWith('arabic')) return 'decimal'
  return prefixFromNumberFormat(type)
}

// The slide files of a deck in presentation order: presentation.xml lists slide ids → relationship
// ids, presentation.xml.rels maps them to files. Falls back to the files' own numbering.
export function slideOrder(presentationXml: string | undefined, relsXml: string | undefined, slideFiles: string[]): string[] {
  const byNumber = [...slideFiles].sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0))
  if (!presentationXml || !relsXml) return byNumber
  const targets = new Map<string, string>()
  for (const rel of elements(relsXml, 'Relationship')) {
    const id = attr(rel, 'Id')
    const target = attr(rel, 'Target')
    if (id && target) targets.set(id, `ppt/${target.replace(/^\/?ppt\//, '').replace(/^\.\//, '')}`)
  }
  const ordered = elements(presentationXml, 'p:sldId')
    .map((s) => targets.get(attr(s, 'r:id') ?? ''))
    .filter((f): f is string => !!f && slideFiles.includes(f))
  return ordered.length > 0 ? ordered : byNumber
}

// The slide height from presentation.xml (p:sldSz cy, in EMU).
export const slideHeightOf = (presentationXml: string | undefined): number | undefined => {
  const cy = attr(startTag(presentationXml ?? '', 'p:sldSz'), 'cy')
  return cy ? Number(cy) : undefined
}

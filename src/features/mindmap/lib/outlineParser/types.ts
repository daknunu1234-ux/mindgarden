// Document → mindmap outline (pure types). Every format (.docx, .pptx, .pdf) is read into the same
// stream of visual text lines; one classifier (classify.ts) turns that stream into a three-level
// outline: 1 = root, 2 = sub-root, 3 = statement.

export type PrefixType = 'roman' | 'capital' | 'decimal' | 'subdecimal' | 'bullet' | 'none'

export interface VisualTextLine {
  id: string
  // The line as it reads in the document, numbering included ("II. Tế bào").
  rawText: string
  // The text without its numbering or bullet ("Tế bào"), whitespace collapsed.
  cleanText: string
  // Points (Word / PowerPoint run size, PDF glyph height).
  fontSize?: number
  isBold?: boolean
  // 0 for leftmost, 1, 2… derived from list levels, indentation or the x position.
  indentLevel: number
  prefixType: PrefixType
  // Word's own heading styles (Heading 1–3, or an outline level).
  wordHeadingLevel?: 1 | 2 | 3
  // 0 (top of the page / slide) to 100 (bottom).
  yPositionPercent?: number
  // A PowerPoint title placeholder, or a PDF line standing alone in a header block.
  isIsolatedHeaderBox?: boolean
}

export interface StagedOutlineItem {
  id: string
  text: string
  // 1: root, 2: sub-root, 3: statement.
  level: 1 | 2 | 3
}

export type OutlineFormat = 'docx' | 'pptx' | 'pdf'

export type ParsedOutline = {
  format: OutlineFormat
  lines: VisualTextLine[]
  items: StagedOutlineItem[]
  // What was dropped or reshaped on the way, for the staging dialog ("3 lines too short to drill").
  notes: string[]
}

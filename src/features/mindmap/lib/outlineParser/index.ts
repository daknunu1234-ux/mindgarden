import JSZip from 'jszip'
import { classifyOutline, normalizeStaged } from './classify'
import { linesFromDocx } from './docx'
import { linesFromPdf, type PdfPage, type PdfTextItem } from './pdf'
import { linesFromPptx, slideHeightOf, slideOrder } from './pptx'
import type { OutlineFormat, ParsedOutline, VisualTextLine } from './types'

// Document → staged mindmap outline, entirely in the browser's memory: the file is read with
// FileReader / ArrayBuffer, never uploaded and never stored. Only the outline the player confirms
// (text + level per line) is sent to the server. No AI, no external service.

export * from './types'
export { classifyOutline, headingScore, normalizeStaged, splitLong, MAX_OUTLINE_ITEMS, ROOT_MAX_LENGTH, STATEMENT_MAX_LENGTH, STATEMENT_MIN_LENGTH } from './classify'
export { detectPrefix } from './prefix'
export { linesFromDocx } from './docx'
export { linesFromPptx, slideOrder } from './pptx'
export { linesFromPdf } from './pdf'

export const MAX_OUTLINE_FILE_BYTES = 10 * 1024 * 1024
export const OUTLINE_FILE_ACCEPT = '.docx,.pptx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf'

export class OutlineFileError extends Error {}

export function formatOf(name: string, type = ''): OutlineFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  if (ext === 'docx' || type.includes('wordprocessingml')) return 'docx'
  if (ext === 'pptx' || type.includes('presentationml')) return 'pptx'
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf'
  return null
}

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()

// Word: the main document part, plus styles (heading names) and numbering (list formats).
export async function readDocx(data: ArrayBuffer | Uint8Array): Promise<VisualTextLine[]> {
  const zip = await JSZip.loadAsync(data)
  const document = await zip.file('word/document.xml')?.async('string')
  if (!document) throw new OutlineFileError('This is not a Word document (word/document.xml is missing)')
  return linesFromDocx({
    document,
    styles: await zip.file('word/styles.xml')?.async('string'),
    numbering: await zip.file('word/numbering.xml')?.async('string'),
  })
}

// PowerPoint: the slides in presentation order.
export async function readPptx(data: ArrayBuffer | Uint8Array): Promise<VisualTextLine[]> {
  const zip = await JSZip.loadAsync(data)
  const files = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  if (files.length === 0) throw new OutlineFileError('This presentation has no slides')
  const presentation = await zip.file('ppt/presentation.xml')?.async('string')
  const order = slideOrder(presentation, await zip.file('ppt/_rels/presentation.xml.rels')?.async('string'), files)
  const slides = await Promise.all(order.map(async (f) => ({ xml: (await zip.file(f)?.async('string')) ?? '' })))
  return linesFromPptx({ slides, slideHeightEmu: slideHeightOf(presentation) })
}

// PDF: positioned text runs from pdf.js (loaded only when a PDF is opened, its worker bundled with
// the app, so nothing is fetched from elsewhere). The legacy build: the default one needs very recent
// JavaScript (Uint8Array.prototype.toHex) that browsers before 2025 lack. Real font names (for bold) come from the page's
// fonts once its operators are loaded.
let pdfWorker: Worker | null = null
export async function readPdf(data: ArrayBuffer | Uint8Array): Promise<VisualTextLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfWorker && typeof Worker !== 'undefined') {
    pdfWorker = new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorker
  }
  // verbosity 0: errors only (text extraction needs no font files, so their warnings are noise).
  const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data), verbosity: 0 })
  const doc = await task.promise
  try {
    const pages: PdfPage[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const fonts = new Map<string, string>()
      try {
        await page.getOperatorList()
        for (const item of content.items) {
          if (!('fontName' in item) || fonts.has(item.fontName)) continue
          const font = page.commonObjs.has(item.fontName) ? (page.commonObjs.get(item.fontName) as { name?: string }) : null
          fonts.set(item.fontName, font?.name ?? content.styles[item.fontName]?.fontFamily ?? '')
        }
      } catch {
        // Font names are only a hint for bold.
      }
      const items: PdfTextItem[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue
        const [, , c, d, e, f] = item.transform as number[]
        items.push({ str: item.str, x: e, y: f, width: item.width, height: item.height || Math.hypot(c, d), fontName: fonts.get(item.fontName) ?? item.fontName })
      }
      pages.push({ width: viewport.width, height: viewport.height, items })
      page.cleanup()
    }
    const lines = linesFromPdf(pages)
    if (lines.length === 0) throw new OutlineFileError('No text could be read from this PDF (a scanned PDF has only pictures of text)')
    return lines
  } finally {
    // Frees the document; the shared worker (workerPort) stays for the next file.
    await task.destroy()
  }
}

// One file → its staged outline. Throws OutlineFileError with a message for the player.
export async function parseOutlineFile(file: File): Promise<ParsedOutline> {
  const format = formatOf(file.name, file.type)
  if (!format) throw new OutlineFileError('Choose a Word (.docx), PowerPoint (.pptx) or PDF file. Older .doc / .ppt files need to be saved as .docx / .pptx first')
  if (file.size > MAX_OUTLINE_FILE_BYTES) throw new OutlineFileError('The file is larger than 10 MB')
  const data = await file.arrayBuffer()
  let lines: VisualTextLine[]
  try {
    lines = format === 'docx' ? await readDocx(data) : format === 'pptx' ? await readPptx(data) : await readPdf(data)
  } catch (error) {
    if (error instanceof OutlineFileError) throw error
    console.error('[mindmap] outline parse failed', error)
    throw new OutlineFileError(format === 'pdf' ? 'This PDF could not be read (it may be damaged or password-protected)' : 'This file could not be read (it may be damaged)')
  }
  const { items, notes } = classifyOutline(lines, titleOf(file.name))
  if (items.length === 0) throw new OutlineFileError('No text to import was found in this file')
  return { format, lines, items: normalizeStaged(items), notes }
}

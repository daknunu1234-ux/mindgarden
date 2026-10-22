import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  classifyOutline,
  detectPrefix,
  formatOf,
  linesFromDocx,
  linesFromPdf,
  linesFromPptx,
  normalizeStaged,
  readDocx,
  readPptx,
  slideOrder,
  splitLong,
  type StagedOutlineItem,
  type VisualTextLine,
} from '../lib/outlineParser'
import type { PdfPage } from '../lib/outlineParser/pdf'

// Document → three-level outline, format by format, then the shared classifier. All in memory: no
// file system, no network, no AI.

const shape = (items: StagedOutlineItem[]) => items.map((i) => `${i.level} ${i.text}`)
const line = (cleanText: string, extra: Partial<VisualTextLine> = {}): VisualTextLine => ({
  id: cleanText,
  rawText: cleanText,
  cleanText,
  indentLevel: 0,
  prefixType: 'none',
  ...extra,
})

describe('numbering and bullets', () => {
  it('reads Roman, capital, number, sub-number and bullet markers, and strips them', () => {
    expect(detectPrefix('II. Tế bào nhân thực')).toEqual({ prefixType: 'roman', cleanText: 'Tế bào nhân thực' })
    expect(detectPrefix('B) Cơ chế vận chuyển')).toEqual({ prefixType: 'capital', cleanText: 'Cơ chế vận chuyển' })
    expect(detectPrefix('3. Ribosome tổng hợp protein.')).toEqual({ prefixType: 'decimal', cleanText: 'Ribosome tổng hợp protein.' })
    expect(detectPrefix('1.2 Lục lạp')).toEqual({ prefixType: 'subdecimal', cleanText: 'Lục lạp' })
    expect(detectPrefix('• Ty thể sản sinh ATP')).toEqual({ prefixType: 'bullet', cleanText: 'Ty thể sản sinh ATP' })
    expect(detectPrefix('-   Consumes ATP')).toEqual({ prefixType: 'bullet', cleanText: 'Consumes ATP' })
    expect(detectPrefix('Không có đánh số')).toEqual({ prefixType: 'none', cleanText: 'Không có đánh số' })
  })

  it('a "C." in a lettered list is a letter, not Roman 100; a bare marker is no marker', () => {
    expect(detectPrefix('C. Bào quan').prefixType).toBe('capital')
    expect(detectPrefix('IV. Năng lượng').prefixType).toBe('roman')
    expect(detectPrefix('I.').prefixType).toBe('none')
  })

  it('knows the three formats by extension or MIME type, and refuses the rest', () => {
    expect(formatOf('Bai giang.DOCX')).toBe('docx')
    expect(formatOf('slides.pptx')).toBe('pptx')
    expect(formatOf('notes', 'application/pdf')).toBe('pdf')
    expect(formatOf('old.doc')).toBeNull()
    expect(formatOf('photo.png', 'image/png')).toBeNull()
  })
})

// ── Word ──────────────────────────────────────────────────────────────────────────────────────

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const p = (text: string, { style, ilvl, numId, bold, size, left }: { style?: string; ilvl?: number; numId?: number; bold?: boolean; size?: number; left?: number } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${numId ? `<w:numPr><w:ilvl w:val="${ilvl ?? 0}"/><w:numId w:val="${numId}"/></w:numPr>` : ''}${left ? `<w:ind w:left="${left}"/>` : ''}</w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size * 2}"/>` : ''}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const docxXml = (paras: string[]) => `<?xml version="1.0"?><w:document ${W}><w:body>${paras.join('')}<w:sectPr/></w:body></w:document>`
// Heading styles with Vietnamese ids, as Word saves them in a Vietnamese install.
const STYLES = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="u1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="u2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="u3"><w:name w:val="heading 3"/></w:style><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`
const NUMBERING = `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%2."/></w:lvl><w:lvl w:ilvl="2"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`

describe('Word (.docx)', () => {
  it('Heading 1 → root, Heading 2 → sub-root, paragraphs and bullets → statements (style names, not ids)', () => {
    const lines = linesFromDocx({
      document: docxXml([
        p('Sinh học tế bào', { style: 'u1' }),
        p('Bào quan', { style: 'u2' }),
        p('Ty thể sản sinh ATP.', { numId: 1 }),
        p('Ribosome: tổng hợp protein', { numId: 1 }),
        p('Màng tế bào', { style: 'u2' }),
        p('Màng sinh chất có tính thấm chọn lọc.'),
        p('Năng lượng', { style: 'u1' }),
        p('Quang hợp - chuyển quang năng thành hóa năng', { numId: 1 }),
      ]),
      styles: STYLES,
      numbering: NUMBERING,
    })
    expect(lines.map((l) => [l.wordHeadingLevel ?? 0, l.prefixType])).toEqual([
      [1, 'none'],
      [2, 'none'],
      [0, 'bullet'],
      [0, 'bullet'],
      [2, 'none'],
      [0, 'none'],
      [1, 'none'],
      [0, 'bullet'],
    ])
    expect(shape(classifyOutline(lines).items)).toEqual([
      '1 Sinh học tế bào',
      '2 Bào quan',
      '3 Ty thể sản sinh ATP.',
      '3 Ribosome: tổng hợp protein',
      '2 Màng tế bào',
      '3 Màng sinh chất có tính thấm chọn lọc.',
      '1 Năng lượng',
      '3 Quang hợp - chuyển quang năng thành hóa năng',
    ])
  })

  it('automatic list numbering (I / A / 1.1.1) sets the levels even though Word stores no number text', () => {
    const lines = linesFromDocx({
      document: docxXml([
        p('Cấu trúc tế bào', { numId: 2, ilvl: 0 }),
        p('Nhân tế bào', { numId: 2, ilvl: 1 }),
        p('Chứa vật chất di truyền', { numId: 2, ilvl: 2 }),
        p('Điều khiển hoạt động sống', { numId: 2, ilvl: 2 }),
        p('Tế bào chất', { numId: 2, ilvl: 1 }),
        p('Nơi diễn ra phần lớn phản ứng', { numId: 2, ilvl: 2 }),
      ]),
      numbering: NUMBERING,
    })
    expect(lines.map((l) => `${l.prefixType}:${l.indentLevel}`)).toEqual(['roman:0', 'capital:1', 'subdecimal:2', 'subdecimal:2', 'capital:1', 'subdecimal:2'])
    expect(shape(classifyOutline(lines).items).map((s) => s[0])).toEqual(['1', '2', '3', '3', '2', '3'])
  })

  it('without styles, typed numbering (I., A., 1.) and bold / large lines still give the outline', () => {
    const typed = linesFromDocx({
      document: docxXml([
        p('I. Di truyền học', { bold: true, size: 16 }),
        p('A. Gen và mã di truyền', { bold: true }),
        p('1. Gen là một đoạn ADN mang thông tin mã hóa.'),
        p('2. Mã di truyền là mã bộ ba.'),
        p('B. Nhân đôi ADN', { bold: true }),
        p('Diễn ra theo nguyên tắc bán bảo toàn.'),
      ]),
    })
    expect(typed[0]).toMatchObject({ prefixType: 'roman', cleanText: 'Di truyền học', isBold: true, fontSize: 16 })
    expect(shape(classifyOutline(typed).items)).toEqual([
      '1 Di truyền học',
      '2 Gen và mã di truyền',
      '3 Gen là một đoạn ADN mang thông tin mã hóa.',
      '3 Mã di truyền là mã bộ ba.',
      '2 Nhân đôi ADN',
      '3 Diễn ra theo nguyên tắc bán bảo toàn.',
    ])
  })

  it('decodes entities, tabs and breaks, and skips empty paragraphs', () => {
    const lines = linesFromDocx({ document: docxXml(['<w:p/>', `<w:p><w:r><w:t>A &amp; B</w:t></w:r><w:r><w:tab/><w:t>&lt;C&gt;</w:t></w:r></w:p>`, '<w:p><w:pPr/></w:p>']) })
    expect(lines.map((l) => l.cleanText)).toEqual(['A & B <C>'])
  })

  it('reads a real .docx archive in memory (no file system)', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', docxXml([p('Chương 1', { style: 'Heading1' }), p('Ý chính một của chương.'), p('Mục 1.1', { style: 'Heading2' }), p('Một ý nhỏ của mục.')]))
    const data = await zip.generateAsync({ type: 'uint8array' })
    const lines = await readDocx(data)
    expect(shape(classifyOutline(lines).items)).toEqual(['1 Chương 1', '3 Ý chính một của chương.', '2 Mục 1.1', '3 Một ý nhỏ của mục.'])
  })
})

// ── PowerPoint ────────────────────────────────────────────────────────────────────────────────

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const sp = (paras: string[], { ph, y = 1_500_000 }: { ph?: string; y?: number } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : '<p:ph idx="1"/>'}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="${y}"/><a:ext cx="8229600" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${paras.join('')}</p:txBody></p:sp>`
const ap = (text: string, lvl = 0, extra = '') => `<a:p><a:pPr lvl="${lvl}">${extra}</a:pPr><a:r><a:rPr lang="vi-VN"/><a:t>${text}</a:t></a:r></a:p>`
const slide = (shapes: string[]) => `<p:sld ${A}><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`

describe('PowerPoint (.pptx)', () => {
  const slides = [
    { xml: slide([sp([ap('Hô hấp tế bào')], { ph: 'ctrTitle', y: 2_000_000 }), sp([ap('Bài giảng Sinh học 10')], { ph: 'subTitle', y: 4_000_000 })]) },
    // Body above the title in the file, and placed low: the title still leads the slide.
    {
      xml: slide([
        sp([ap('Đường phân'), ap('Diễn ra ở tế bào chất', 1), ap('Tạo 2 ATP', 1), ap('Chu trình Krebs'), ap('Diễn ra ở chất nền ty thể', 1)], { y: 1_600_000 }),
        sp([ap('Các giai đoạn')], { ph: 'title', y: 300_000 }),
      ]),
    },
    { xml: slide([sp([ap('Chuỗi truyền electron')], { ph: 'title', y: 300_000 }), sp([ap('Tạo nhiều ATP nhất'), ap('Cần oxy')])]) },
  ]

  it('slide titles → roots, top bullets with bullets under them → sub-roots, the rest → statements', () => {
    const lines = linesFromPptx({ slides })
    expect(lines.filter((l) => l.isIsolatedHeaderBox).map((l) => l.cleanText)).toEqual(['Hô hấp tế bào', 'Các giai đoạn', 'Chuỗi truyền electron'])
    expect(lines[1]).toMatchObject({ cleanText: 'Bài giảng Sinh học 10', isIsolatedHeaderBox: false })
    expect(lines.find((l) => l.cleanText === 'Tạo 2 ATP')).toMatchObject({ indentLevel: 1 })
    expect(Math.round(lines.find((l) => l.cleanText === 'Các giai đoạn')!.yPositionPercent!)).toBe(4)
    expect(shape(classifyOutline(lines).items)).toEqual([
      '1 Hô hấp tế bào',
      '3 Bài giảng Sinh học 10',
      '1 Các giai đoạn',
      '2 Đường phân',
      '3 Diễn ra ở tế bào chất',
      '3 Tạo 2 ATP',
      '2 Chu trình Krebs',
      '3 Diễn ra ở chất nền ty thể',
      '1 Chuỗi truyền electron',
      '3 Tạo nhiều ATP nhất',
      '3 Cần oxy',
    ])
  })

  it('reads bold, size, automatic numbering, line breaks and fields', () => {
    const [l] = linesFromPptx({
      slides: [{ xml: slide([sp([`<a:p><a:pPr><a:buAutoNum type="romanUcPeriod"/></a:pPr><a:r><a:rPr b="1" sz="3200"/><a:t>Phần</a:t></a:r><a:br/><a:fld type="slidenum"><a:t>2</a:t></a:fld></a:p>`])])}],
    })
    expect(l).toMatchObject({ cleanText: 'Phần 2', prefixType: 'roman', isBold: true, fontSize: 32 })
  })

  it('follows the presentation order, not the file names', () => {
    const presentation = `<p:presentation ${A} xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`
    const rels = `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`
    expect(slideOrder(presentation, rels, ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml'])
    expect(slideOrder(undefined, undefined, ['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml'])).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide10.xml'])
  })

  it('reads a real .pptx archive in memory', async () => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', slides[2].xml)
    const lines = await readPptx(await zip.generateAsync({ type: 'uint8array' }))
    expect(shape(classifyOutline(lines).items)).toEqual(['1 Chuỗi truyền electron', '3 Tạo nhiều ATP nhất', '3 Cần oxy'])
  })
})

// ── PDF ───────────────────────────────────────────────────────────────────────────────────────

// A text item at (x, y from the top of an A4 page), in points.
const item = (str: string, x: number, top: number, size = 11, fontName = 'Times-Roman') => ({ str, x, y: 842 - top, width: str.length * size * 0.5, height: size, fontName })

describe('PDF', () => {
  const page1: PdfPage = {
    width: 595,
    height: 842,
    items: [
      item('Giáo trình Sinh học', 72, 30, 9),
      item('CHƯƠNG 1. TẾ BÀO', 72, 90, 18, 'Arial-BoldMT'),
      item('1.1 Bào quan', 72, 130, 13, 'Arial-BoldMT'),
      item('Ty thể là nhà máy năng lượng của tế bào, nơi diễn ra hô', 72, 155),
      item('hấp tế bào và tạo ra phần lớn ATP.', 72, 169),
      item('• Ribosome tổng hợp protein.', 90, 190),
      item('• Lục lạp thực hiện quang hợp.', 90, 204),
      item('1', 297, 810, 9),
    ],
  }
  const page2: PdfPage = {
    width: 595,
    height: 842,
    items: [item('Giáo trình Sinh học', 72, 30, 9), item('1.2 Màng tế bào', 72, 90, 13, 'Arial-BoldMT'), item('Màng sinh chất có tính thấm chọn lọc.', 72, 115), item('2', 297, 810, 9)],
  }
  const page3: PdfPage = {
    width: 595,
    height: 842,
    items: [item('Giáo trình Sinh học', 72, 30, 9), item('CHƯƠNG 2. NĂNG LƯỢNG', 72, 90, 18, 'Arial-BoldMT'), item('ATP là đồng tiền năng lượng.', 72, 130), item('3', 297, 810, 9)],
  }

  it('rebuilds lines and paragraphs, drops running headers and page numbers, keeps bullets indented', () => {
    const lines = linesFromPdf([page1, page2, page3])
    expect(lines.map((l) => l.cleanText)).toEqual([
      'CHƯƠNG 1. TẾ BÀO',
      'Bào quan',
      'Ty thể là nhà máy năng lượng của tế bào, nơi diễn ra hô hấp tế bào và tạo ra phần lớn ATP.',
      'Ribosome tổng hợp protein.',
      'Lục lạp thực hiện quang hợp.',
      'Màng tế bào',
      'Màng sinh chất có tính thấm chọn lọc.',
      'CHƯƠNG 2. NĂNG LƯỢNG',
      'ATP là đồng tiền năng lượng.',
    ])
    expect(lines[0]).toMatchObject({ isBold: true, fontSize: 18, isIsolatedHeaderBox: true, indentLevel: 0 })
    expect(lines[3]).toMatchObject({ prefixType: 'bullet', indentLevel: 1 })
    expect(lines[0].yPositionPercent).toBeGreaterThan(9)
    expect(lines[0].yPositionPercent).toBeLessThan(12)
  })

  it('big chapter titles → roots, numbered sections → sub-roots, text → statements', () => {
    expect(shape(classifyOutline(linesFromPdf([page1, page2, page3])).items)).toEqual([
      '1 CHƯƠNG 1. TẾ BÀO',
      '2 Bào quan',
      '3 Ty thể là nhà máy năng lượng của tế bào, nơi diễn ra hô hấp tế bào và tạo ra phần lớn ATP.',
      '3 Ribosome tổng hợp protein.',
      '3 Lục lạp thực hiện quang hợp.',
      '2 Màng tế bào',
      '3 Màng sinh chất có tính thấm chọn lọc.',
      '1 CHƯƠNG 2. NĂNG LƯỢNG',
      '3 ATP là đồng tiền năng lượng.',
    ])
  })

  it('joins runs on one baseline with spaces where pdf.js left a gap', () => {
    const [l] = linesFromPdf([{ width: 595, height: 842, items: [item('Màng', 72, 100), item('tế bào', 102, 100.4)] }])
    expect(l.cleanText).toBe('Màng tế bào')
  })
})

// ── The classifier ────────────────────────────────────────────────────────────────────────────

describe('classifier: three levels whatever the document uses', () => {
  it('only one kind of heading: those are roots, the rest statements', () => {
    const lines = [line('Tế bào', { isBold: true }), line('Ty thể sản sinh ATP.'), line('Năng lượng', { isBold: true }), line('ATP: đồng tiền năng lượng')]
    expect(shape(classifyOutline(lines).items)).toEqual(['1 Tế bào', '3 Ty thể sản sinh ATP.', '1 Năng lượng', '3 ATP: đồng tiền năng lượng'])
  })

  it('a third heading level reads as statements (only roots and sub-roots exist)', () => {
    const lines = [line('Chương', { wordHeadingLevel: 1 }), line('Mục', { wordHeadingLevel: 2 }), line('Tiểu mục chi tiết', { wordHeadingLevel: 3 }), line('Một ý cụ thể.')]
    expect(shape(classifyOutline(lines).items)).toEqual(['1 Chương', '2 Mục', '3 Tiểu mục chi tiết', '3 Một ý cụ thể.'])
  })

  it('text before the first heading goes under a root named after the file', () => {
    const { items, notes } = classifyOutline([line('Lời mở đầu của tài liệu.'), line('Phần một', { wordHeadingLevel: 1 }), line('Nội dung phần một.')], 'Bai giang Sinh hoc')
    expect(shape(items)).toEqual(['1 Bai giang Sinh hoc', '3 Lời mở đầu của tài liệu.', '1 Phần một', '3 Nội dung phần một.'])
    expect(notes.join(' ')).toContain('Bai giang Sinh hoc')
  })

  it('a document with only sub-level headings is lifted so it has roots', () => {
    const lines = [line('Mục A', { wordHeadingLevel: 2 }), line('Ý của mục A.'), line('Mục B', { wordHeadingLevel: 3 }), line('Ý của mục B.')]
    expect(shape(classifyOutline(lines).items)).toEqual(['1 Mục A', '3 Ý của mục A.', '2 Mục B', '3 Ý của mục B.'])
  })

  it('drops too-short statements, splits very long ones, demotes over-long headings, skips repeats', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Câu thứ ${i + 1} nói về một ý trong đoạn văn dài.`).join(' ')
    const heading = 'X'.repeat(160)
    const { items, notes } = classifyOutline([line('Gốc', { wordHeadingLevel: 1 }), line('abc'), line(long), line(heading, { wordHeadingLevel: 2 }), line('Ý lặp lại.'), line('Ý lặp lại.')])
    expect(items.filter((i) => i.text === 'abc')).toHaveLength(0)
    const pieces = items.filter((i) => i.text.startsWith('Câu thứ'))
    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) expect([...piece.text].length).toBeLessThanOrEqual(500)
    expect(pieces.map((p) => p.text).join(' ')).toBe(long)
    expect(items.find((i) => i.text === heading)).toMatchObject({ level: 3 })
    expect(items.filter((i) => i.text === 'Ý lặp lại.')).toHaveLength(1)
    expect(notes).toHaveLength(3)
  })

  it('keeps shorthand intact for the drill engine ("Term: explanation", "Term - explanation")', () => {
    const items = classifyOutline([line('Mua lại', { wordHeadingLevel: 1 }), line('MBIs: người ngoài mua lại', { prefixType: 'bullet' }), line('LBO - mua lại bằng vốn vay', { prefixType: 'bullet' })]).items
    expect(shape(items)).toEqual(['1 Mua lại', '3 MBIs: người ngoài mua lại', '3 LBO - mua lại bằng vốn vay'])
  })

  it('splitLong never loses or reorders words', () => {
    const text = `${'a'.repeat(300)} ${'b'.repeat(300)}`
    expect(splitLong(text)).toEqual(['a'.repeat(300), 'b'.repeat(300)])
    expect(splitLong('Ngắn.')).toEqual(['Ngắn.'])
  })

  it('normalizeStaged keeps edits valid: the first line is a root, a sub-root needs a root above it', () => {
    const fixed = normalizeStaged([
      { id: 'a', text: 'x', level: 3 },
      { id: 'b', text: 'y', level: 2 },
      { id: 'c', text: 'z', level: 2 },
    ])
    expect(fixed.map((i) => i.level)).toEqual([1, 2, 2])
    expect(normalizeStaged([{ id: 'a', text: 'x', level: 2 }]).map((i) => i.level)).toEqual([1])
  })
})

// ── The privacy guarantees (the staging editor's own tests: decks/__tests__/outlineStaging.test.ts) ──

describe('zero upload, zero storage, zero AI', () => {
  const dir = path.join(__dirname, '..', 'lib', 'outlineParser')
  const sources = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  const dialog = fs.readFileSync(path.join(__dirname, '..', 'components', 'OutlineImportDialog.tsx'), 'utf8')

  it('the parser never sends or stores anything: no fetch, no Supabase, no storage, no AI service', () => {
    for (const src of [...sources, dialog]) {
      expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|supabase|\.storage\b|localStorage|indexedDB|anthropic|openai|gemini/i)
    }
  })

  it('the dialog hands the review step only levels and text, and loads the parsers only when a file is picked', () => {
    expect(dialog).toContain('lines: parsed.items.map(({ level, text }) => ({ level, text }))')
    expect(dialog).toContain("await import('../lib/outlineParser')")
    // jszip and pdf.js are not in the page's own bundle.
    expect(dialog).not.toMatch(/from 'jszip'|from 'pdfjs-dist'|from '\.\.\/lib\/outlineParser'(?!\/)/)
  })

  it('refuses files over 10 MB before reading them', async () => {
    const { parseOutlineFile, MAX_OUTLINE_FILE_BYTES } = await import('../lib/outlineParser')
    expect(MAX_OUTLINE_FILE_BYTES).toBe(10 * 1024 * 1024)
    const big = { name: 'big.pdf', type: 'application/pdf', size: MAX_OUTLINE_FILE_BYTES + 1, arrayBuffer: () => Promise.reject(new Error('must not be read')) } as unknown as File
    await expect(parseOutlineFile(big)).rejects.toThrow('larger than 10 MB')
    const doc = { name: 'old.doc', type: 'application/msword', size: 10, arrayBuffer: () => Promise.reject(new Error('must not be read')) } as unknown as File
    await expect(parseOutlineFile(doc)).rejects.toThrow(/\.docx/)
  })
})

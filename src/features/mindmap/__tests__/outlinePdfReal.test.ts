import { describe, expect, it } from 'vitest'
import { classifyOutline, readPdf } from '../lib/outlineParser'

// A real PDF written by hand: a bold 18 pt title, a bold 13 pt section, two 11 pt body lines.
function minimalPdf(): Uint8Array {
  const content = [
    'BT /F2 18 Tf 72 760 Td (Chapter 1. The Cell) Tj ET',
    'BT /F2 13 Tf 72 720 Td (1.1 Organelles) Tj ET',
    'BT /F1 11 Tf 72 696 Td (Mitochondria produce ATP for the cell.) Tj ET',
    'BT /F1 11 Tf 72 682 Td (Ribosomes synthesize proteins.) Tj ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

describe('a real PDF through pdf.js (the legacy build, as in the browser)', () => {
  it('reads sizes, positions and numbering, and gives the outline', async () => {
    const lines = await readPdf(minimalPdf())
    expect(lines.map((l) => [l.cleanText, l.fontSize, l.prefixType, l.isIsolatedHeaderBox])).toEqual([
      ['Chapter 1. The Cell', 18, 'none', true],
      ['Organelles', 13, 'subdecimal', true],
      ['Mitochondria produce ATP for the cell.', 11, 'none', false],
      ['Ribosomes synthesize proteins.', 11, 'none', false],
    ])
    expect(classifyOutline(lines).items.map((i) => `${i.level} ${i.text}`)).toEqual(['1 Chapter 1. The Cell', '2 Organelles', '3 Mitochondria produce ATP for the cell.', '3 Ribosomes synthesize proteins.'])
  }, 60_000)
})

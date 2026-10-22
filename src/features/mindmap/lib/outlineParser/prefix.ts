import type { PrefixType } from './types'

// Numbering and bullets at the start of a line (pure). "II. Tế bào" → roman, "B) Cơ chế" → capital,
// "3. Ribosome…" → decimal, "1.2 Lục lạp" → subdecimal, "• ATP" → bullet. The marker is removed from
// the clean text; the rest is kept as written.

// I to XXXIX: built from I, V and X only, so a "C." or "L." in an A, B, C… list stays a letter.
const ROMAN = /^(?=[IVX])(X{0,3})(IX|IV|V?I{0,3})[.)]\s+/u
const CAPITAL = /^[A-Z][.)]\s+/u
const SUBDECIMAL = /^\d{1,3}(?:\.\d{1,3})+\.?\)?\s+/u
const DECIMAL = /^(?:\d{1,3}[.)]|\(\d{1,3}\)|\[\d{1,3}\])\s+/u
const BULLET = /^[-*+•‣⁃–—◦▪▫●○■□➢➤►▶✓✔→◆◇❖]\s*/u
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

export const collapse = (s: string) => s.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim()

export function detectPrefix(raw: string): { prefixType: PrefixType; cleanText: string } {
  const text = collapse(raw)
  // A bare "I." or "A." (nothing after) is no outline marker.
  const tries: [PrefixType, RegExp][] = [
    ['subdecimal', SUBDECIMAL],
    ['roman', ROMAN],
    ['capital', CAPITAL],
    ['decimal', DECIMAL],
    ['bullet', BULLET],
  ]
  for (const [prefixType, re] of tries) {
    const m = re.exec(text)
    if (m && m[0].length < text.length) return { prefixType, cleanText: text.slice(m[0].length).trim() }
  }
  return { prefixType: 'none', cleanText: text }
}

// A numbering format from Word's numbering.xml or PowerPoint's autonumber, as a prefix type.
export function prefixFromNumberFormat(format: string | undefined, levelText?: string): PrefixType {
  if (!format) return 'none'
  const f = format.toLowerCase()
  if (f === 'bullet' || f === 'none') return f === 'bullet' ? 'bullet' : 'none'
  if (f.includes('roman')) return 'roman'
  if (f.includes('letter') || f.startsWith('alpha')) return 'capital'
  // "%1.%2." is a sub-number of its parent list.
  if (levelText && /%\d[^%]*%\d/.test(levelText)) return 'subdecimal'
  if (f.includes('decimal') || f.startsWith('arabic')) return 'decimal'
  return 'bullet'
}

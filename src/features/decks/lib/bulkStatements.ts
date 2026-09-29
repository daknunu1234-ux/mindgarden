// Bulk statement import (pure, unit-tested): turns pasted notes into one statement per bullet / line.

// Shortest line kept as a statement (code points): "- ok" or a stray "12" is noise, not a fact.
export const MIN_BULK_STATEMENT_LENGTH = 5
// Same limit as one statement typed by hand (CreateKnowledgeItemDto).
export const MAX_STATEMENT_LENGTH = 500
// Most statements one import may add.
export const MAX_BULK_STATEMENTS = 100

// Plain text only (hard rule 1): backslash commands like \frac or \sqrt are LaTeX.
export const LATEX_COMMAND = /\\[a-zA-Z]+/

// One leading list marker, followed by at least one space:
//   - * +            Markdown bullets
//   • ‣ ⁃ – — ◦ ▪    Unicode bullets and dashes
//   1. 1) [1] (1)    numbered lists
const LIST_MARKER = /^(?:[-*+•‣⁃–—◦▪]|\d{1,3}[.)]|\[\d{1,3}\]|\(\d{1,3}\))\s+/u
// Invisible / control characters that sneak in with copy-paste (zero-width spaces, BOM, tabs…).
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

// Cleans one statement the way the server stores it: NFC, invisible characters → spaces, runs of
// spaces collapsed, trimmed. Punctuation and capitalization are kept as written.
export function cleanStatement(raw: string): string {
  return raw.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim()
}

// "- Ty thể sản sinh ATP.\n\n2) Ribosome tổng hợp protein." → ["Ty thể sản sinh ATP.", "Ribosome tổng hợp protein."]
// Splits on line breaks (\n, \r\n, \r), strips one list marker per line, trims, drops empty and
// too-short lines, and keeps the first of identical statements.
export function parseBulletedText(rawText: string): string[] {
  const seen = new Set<string>()
  const statements: string[] = []
  for (const line of rawText.split(/\r\n|\r|\n/)) {
    const text = cleanStatement(line.trim().replace(LIST_MARKER, ''))
    if ([...text].length < MIN_BULK_STATEMENT_LENGTH || seen.has(text)) continue
    seen.add(text)
    statements.push(text)
  }
  return statements
}

export type BulkPreviewItem = {
  statement: string
  // Why it won't be imported, or null when it will.
  problem: 'too-long' | 'latex' | 'exists' | null
}

// The live preview: every parsed statement, flagged when it would be refused (over 500 characters,
// LaTeX) or is already in this root. Only the unflagged ones are imported.
export function previewBulkStatements(rawText: string, existing: readonly string[] = []): BulkPreviewItem[] {
  const already = new Set(existing.map(cleanStatement))
  return parseBulletedText(rawText).map((statement) => ({
    statement,
    problem: [...statement].length > MAX_STATEMENT_LENGTH ? 'too-long' : LATEX_COMMAND.test(statement) ? 'latex' : already.has(statement) ? 'exists' : null,
  }))
}

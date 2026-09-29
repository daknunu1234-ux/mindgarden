// Display name rules (pure, unit-tested). The same limits live in the database
// (users_display_name_check, migration 20260928001000).

export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 30

// Invisible and control characters (zero-width joiners, bidi overrides, newlines…).
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu
// Characters that could build HTML / break out of quotes if a name ever reached raw markup. React
// escapes text anyway; stripping them keeps names plain everywhere (emails, logs, exports).
const UNSAFE = /[<>&"'`\\]/g

// "  <b>Linh</b>   Nguyễn​ " → "bLinh/b Nguyễn": NFC, no invisible or unsafe characters, single
// spaces, trimmed. Vietnamese letters and diacritics are kept.
export function sanitizeDisplayName(raw: string): string {
  return raw.normalize('NFC').replace(INVISIBLE, ' ').replace(UNSAFE, '').replace(/\s+/g, ' ').trim()
}

// Length as people count it: code points, so "Nguyễn" is 6, not 7 UTF-16 units.
export const displayNameLength = (name: string): number => [...name].length

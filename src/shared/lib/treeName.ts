// A tree's (deck's) name: the rules every place that names a tree shares (pure, tested). The farm's
// tree popover, the deck page header, the Tree Workshop and the post-purchase naming prompt all go
// through these; decks' RenameDeckDto checks the same on the server.

// 1–100 characters after cleaning. (decks.title is VARCHAR(150): older, longer names still show; a
// rename has to fit this.)
export const TREE_NAME_MIN = 1
export const TREE_NAME_MAX = 100

// Unicode NFC, invisible characters removed, runs of whitespace (line breaks included) as one space,
// trimmed. Vietnamese diacritics are kept as typed.
export function cleanTreeName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Why a (cleaned) name can't be used, or null when it can. Lengths count characters as people see
// them (code points), so "Sinh học" is 8.
export function treeNameError(name: string): string | null {
  const length = [...name].length
  if (length < TREE_NAME_MIN) return 'Give your tree a name'
  if (length > TREE_NAME_MAX) return `Keep the name under ${TREE_NAME_MAX + 1} characters`
  return null
}

// What a key does while a name is being edited inline: Enter saves, Esc puts the old name back.
// Composition (Vietnamese Telex / VNI confirming letters) is never a command.
export function nameEditKey(e: { key: string; isComposing?: boolean }): 'save' | 'cancel' | null {
  if (e.isComposing) return null
  if (e.key === 'Enter') return 'save'
  if (e.key === 'Escape') return 'cancel'
  return null
}

// The outcome of finishing an edit (Enter or clicking away): nothing to do (unchanged), a reason it
// can't be saved, or the cleaned name to save.
export function finishNameEdit(previous: string, typed: string): { kind: 'unchanged' } | { kind: 'invalid'; error: string } | { kind: 'save'; name: string } {
  const name = cleanTreeName(typed)
  const error = treeNameError(name)
  if (error) return { kind: 'invalid', error }
  if (name === previous) return { kind: 'unchanged' }
  return { kind: 'save', name }
}

// A suggested name for a newly bought tree: "Oak Tree", then "Oak Tree 2", "Oak Tree 3"… skipping
// names the player already uses (compared cleaned and case-insensitively).
export function defaultTreeName(speciesLabel: string, existing: readonly string[]): string {
  const base = cleanTreeName(`${speciesLabel} Tree`)
  const taken = new Set(existing.map((t) => cleanTreeName(t).toLocaleLowerCase()))
  if (!taken.has(base.toLocaleLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate
  }
}

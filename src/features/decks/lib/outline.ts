// The Tree Workshop's keyboard (pure, unit-tested). Rows are content nodes (lib/contentTree.ts does
// the edits); this file only says which command a key is and lists the shortcuts:
//   Enter        → THE only key that creates: save, then a sibling of the same type right below
//                  (Enter on an empty line closes it)
//   Shift+Enter  → save and close (no new line)
//   Tab / ⇧Tab   → change the level of the current row IN PLACE (contentTree indentRow / indentSlot)
//   Alt          → node_type root ↔ statement, in place (contentTree toggleRow / toggleSlot)
//   Ctrl+Enter   → save, then open the bulk importer for the line's parent
//   Esc          → close

export type OutlineKey = 'enter' | 'shift-enter' | 'tab' | 'shift-tab'

// How an inline edit ends: the fast-entry keys, Esc and leaving the field save; ✕ discards.
export type EditEnd = OutlineKey | 'escape' | 'blur' | 'cancel'

export const OUTLINE_LIMITS = { node: 150, statement: 500 } as const

export type OutlineCommand = OutlineKey | 'toggle' | 'bulk' | 'escape'

type KeyLike = { key: string; shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean }

// Which command a keydown is (null for any other key, or while an IME is composing: Vietnamese
// Telex / VNI input confirms its letters with Enter-like keys).
export function outlineKey(e: KeyLike): OutlineCommand | null {
  if (e.isComposing) return null
  if (e.key === 'Enter') {
    if (e.ctrlKey || e.metaKey) return 'bulk'
    if (e.altKey) return 'toggle'
    return e.shiftKey ? 'shift-enter' : 'enter'
  }
  if (e.key === 'Tab') return e.shiftKey ? 'shift-tab' : 'tab'
  if (e.key === 'Escape') return 'escape'
  return null
}

// One inline row's keyboard handling (the Workshop's InlineInput is a thin wrapper around it).
// `altArmed`: Alt went down alone and nothing else has been pressed since. A bare Alt converts only
// on a clean TAP (down then up, no other key between), so Alt+Tab, Alt+letter shortcuts and AltGr
// (which Windows sends as Ctrl+Alt) never convert anything. Alt+Enter converts at once. Every Alt
// the row uses is preventDefault-ed (no browser menu bar / menu button focus on Windows) and the
// conversion and bulk commands stop propagating (a dialog around the row never sees them).
export type RowKeyEvent = KeyLike & { type: 'keydown' | 'keyup'; repeat?: boolean }
export type RowKeyResult = { command: OutlineCommand | null; preventDefault: boolean; stopPropagation: boolean; altArmed: boolean }

export function rowKey(e: RowKeyEvent, altArmed: boolean): RowKeyResult {
  const none = (armed: boolean): RowKeyResult => ({ command: null, preventDefault: false, stopPropagation: false, altArmed: armed })
  if (e.isComposing) return none(false)
  const lonelyAlt = e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey
  if (e.type === 'keyup') {
    if (e.key !== 'Alt') return none(altArmed)
    return altArmed && lonelyAlt
      ? { command: 'toggle', preventDefault: true, stopPropagation: true, altArmed: false }
      : none(false)
  }
  if (e.key === 'Alt') {
    // Held down (auto-repeat) keeps the tap armed; Ctrl / ⌘ / Shift with it (AltGr…) disarm it.
    return lonelyAlt ? { command: null, preventDefault: true, stopPropagation: false, altArmed: e.repeat ? altArmed : true } : none(false)
  }
  const command = outlineKey(e)
  if (!command) return none(false)
  return { command, preventDefault: true, stopPropagation: command === 'toggle' || command === 'bulk', altArmed: false }
}

// The Workshop's cheat sheet, compact: one key badge and a 1–2 word label per shortcut, with the
// full description (and the alternative keys the badge leaves out) as `hint`, shown on hover.
// `combos` = every key combo that does it (each combo is its keys in order), for the tests.
export type OutlineShortcut = { badge: string; label: string; hint: string; combos: readonly (readonly string[])[]; highlight?: boolean }

export const OUTLINE_SHORTCUTS: readonly OutlineShortcut[] = [
  { badge: 'Enter', label: 'New item', hint: 'Enter: new item at the same level', combos: [['Enter']] },
  { badge: 'Tab', label: 'Indent', hint: 'Tab: indent one level (nest under the item above)', combos: [['Tab']] },
  { badge: '⇧Tab', label: 'Outdent', hint: 'Shift+Tab: outdent one level', combos: [['Shift', 'Tab']] },
  {
    badge: 'Alt',
    label: 'Root ↔ Stmt',
    hint: 'Alt (or Alt+Enter): toggle between Root and Statement',
    combos: [['Alt'], ['Alt', 'Enter']],
    highlight: true,
  },
  { badge: 'Ctrl+↵', label: 'Bulk add', hint: 'Ctrl+Enter (⌘+Enter on Mac): bulk add statements', combos: [['Ctrl', 'Enter'], ['⌘', 'Enter']] },
  { badge: 'Esc', label: 'Done', hint: 'Esc: done, save changes without a new line', combos: [['Esc']] },
]

// Whether an edit that ends this way saves what was typed (only ✕ discards).
export const editSaves = (end: EditEnd): boolean => end !== 'cancel'

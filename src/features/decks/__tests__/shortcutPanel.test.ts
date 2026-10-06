import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseShortcutPanel,
  readShortcutPanel,
  SHORTCUT_PANEL_KEY,
  shortcutPanelClasses,
  shortcutPanelOpen,
  writeShortcutPanel,
} from '../lib/shortcutPanel'

// The Workshop's "⌨️ Phím tắt" panel: beside the outline (sticky) from lg up, minimized to a "?"
// trigger below it on smaller screens, open / minimized remembered per browser.

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}
const blocked = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('shortcut panel preference', () => {
  it('reads only the two saved values; anything else means "not chosen" (the screen decides)', () => {
    expect(parseShortcutPanel('open')).toBe(true)
    expect(parseShortcutPanel('closed')).toBe(false)
    for (const v of [null, undefined, '', 'true', 'OPEN']) expect(parseShortcutPanel(v)).toBeNull()
  })

  it('round-trips through storage under its own key, and survives blocked or missing storage', () => {
    const store = memory()
    expect(writeShortcutPanel(store, false)).toBe(true)
    expect(store.data.get(SHORTCUT_PANEL_KEY)).toBe('closed')
    expect(readShortcutPanel(store)).toBe(false)
    writeShortcutPanel(store, true)
    expect(readShortcutPanel(store)).toBe(true)
    expect(readShortcutPanel(blocked)).toBeNull()
    expect(writeShortcutPanel(blocked, true)).toBe(false)
    expect(readShortcutPanel(null)).toBeNull()
    expect(writeShortcutPanel(undefined, true)).toBe(false)
  })

  it('with no choice it is open on large screens and minimized on small ones; a choice wins everywhere', () => {
    expect(shortcutPanelOpen(null, true)).toBe(true)
    expect(shortcutPanelOpen(null, false)).toBe(false)
    expect(shortcutPanelOpen(false, true)).toBe(false)
    expect(shortcutPanelOpen(true, false)).toBe(true)
  })
})

describe('shortcut panel layout', () => {
  const tokens = (s: string) => s.split(/\s+/)

  it('no choice yet: the breakpoint switches list and "?" trigger in CSS alone (same markup on server and client)', () => {
    const c = shortcutPanelClasses(null)
    expect(tokens(c.body)).toEqual(['hidden', 'lg:block'])
    expect(tokens(c.trigger)).toEqual(['flex', 'lg:hidden'])
    // Compact: at most w-48 when stacked under the outline, a w-44 column beside it.
    expect(tokens(c.aside)).toEqual(['w-full', 'max-w-48', 'lg:w-44'])
  })

  it('open / minimized by choice: exactly one of list and trigger shows, at every width', () => {
    const open = shortcutPanelClasses(true)
    expect([open.body, open.trigger]).toEqual(['block', 'hidden'])
    const closed = shortcutPanelClasses(false)
    expect([closed.body, closed.trigger]).toEqual(['hidden', 'flex'])
    // Minimized, the column shrinks to the badge and the outline takes the room.
    expect(tokens(closed.aside)).toEqual(['w-auto'])
    expect(tokens(open.aside)).toEqual(['w-full', 'max-w-48', 'lg:w-44'])
  })

  it('is compact: tight padding, small type, one badge + label per row with dividers, no big header', () => {
    const panel = readFileSync(join(__dirname, '..', 'components', 'ShortcutPanel.tsx'), 'utf8')
    expect(panel).toContain('p-2.5')
    expect(panel).toContain('divide-y')
    expect(panel).toMatch(/<kbd[\s\S]*?text-\[10px\]/)
    expect(panel).toMatch(/<dd[^>]*text-\[11px\]/)
    expect(panel).not.toMatch(/text-(sm|base|lg)\b/)
    expect(panel).not.toMatch(/\bw-(64|72)\b/)
  })

  it('the Workshop puts the outline and the panel in a responsive two-column row, the panel sticky and compact', () => {
    const editor = readFileSync(join(__dirname, '..', 'components', 'ContentOutline.tsx'), 'utf8')
    const panel = readFileSync(join(__dirname, '..', 'components', 'ShortcutPanel.tsx'), 'utf8')
    expect(editor).toMatch(/className="mt-2 flex flex-col items-start gap-4 lg:flex-row lg:gap-6"/)
    expect(editor).toMatch(/className="w-full min-w-0 flex-1"/)
    // The panel comes after the outline: below it when stacked, on its right in the row.
    expect(editor.indexOf('<ShortcutPanel />')).toBeGreaterThan(editor.indexOf('aria-label={`Outline of ${selected.content}`}'))
    expect(panel).toMatch(/'shrink-0 lg:sticky lg:top-6'/)
    expect(panel).toMatch(/aria-label="Keyboard shortcuts"/)
  })
})

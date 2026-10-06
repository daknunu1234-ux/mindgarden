import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toggleRow, toggleSlot } from '../lib/contentTree'
import { applyDeckOps, type DeckOp } from '../lib/draft'
import { OUTLINE_SHORTCUTS, outlineKey, rowKey, type RowKeyEvent, type RowKeyResult } from '../lib/outline'
import type { ContentRow, DeckDetail, DeckEditor } from '../types'

// The Workshop row editor's keyboard (DeckEditor InlineInput applies lib/outline rowKey verbatim:
// preventDefault / stopPropagation / the command), replayed here event by event.

type Mods = Partial<Pick<RowKeyEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'isComposing'>>
const down = (key: string, mods: Mods = {}): RowKeyEvent => ({ type: 'keydown', key, shiftKey: false, ...mods })
const up = (key: string, mods: Mods = {}): RowKeyEvent => ({ type: 'keyup', key, shiftKey: false, ...mods })

// Feeds a sequence through rowKey, carrying the Alt state like the input's ref does.
function replay(events: RowKeyEvent[]): RowKeyResult[] {
  let armed = false
  return events.map((e) => {
    const res = rowKey(e, armed)
    armed = res.altArmed
    return res
  })
}
const commands = (events: RowKeyEvent[]) => replay(events).map((r) => r.command).filter(Boolean)

describe('Alt in the row editor: switch statement ↔ root', () => {
  it('a clean Alt tap (down, up) converts, once, on release', () => {
    const [pressed, released] = replay([down('Alt', { altKey: true }), up('Alt')])
    expect(pressed).toEqual({ command: null, preventDefault: true, stopPropagation: false, altArmed: true })
    expect(released).toEqual({ command: 'toggle', preventDefault: true, stopPropagation: true, altArmed: false })
  })

  it('keeps the browser out of it: Alt down and the converting Alt up are both preventDefault-ed (no menu bar / menu button focus)', () => {
    const results = replay([down('Alt', { altKey: true }), up('Alt')])
    expect(results.every((r) => r.preventDefault)).toBe(true)
    // The conversion never bubbles to a surrounding dialog or page shortcut.
    expect(results[1].stopPropagation).toBe(true)
  })

  it('Alt+Enter converts at once, on keydown', () => {
    const [alt, enter, enterUp, altUp] = replay([down('Alt', { altKey: true }), down('Enter', { altKey: true }), up('Enter', { altKey: true }), up('Alt')])
    expect(alt.command).toBeNull()
    expect(enter).toEqual({ command: 'toggle', preventDefault: true, stopPropagation: true, altArmed: false })
    // Releasing Alt afterwards does not convert a second time.
    expect(enterUp.command).toBeNull()
    expect(altUp.command).toBeNull()
  })

  it('holding Alt (auto-repeat) still converts once on release', () => {
    expect(commands([down('Alt', { altKey: true }), down('Alt', { altKey: true, repeat: true }), down('Alt', { altKey: true, repeat: true }), up('Alt')])).toEqual(['toggle'])
  })

  it('never converts on Alt combos: Alt+Tab, Alt+letter (macOS Option characters), Alt+Shift (keyboard layout switch)', () => {
    expect(commands([down('Alt', { altKey: true }), down('Tab', { altKey: true }), up('Tab', { altKey: true }), up('Alt')])).toEqual(['tab'])
    expect(commands([down('Alt', { altKey: true }), down('ø', { altKey: true }), up('ø', { altKey: true }), up('Alt')])).toEqual([])
    expect(commands([down('Alt', { altKey: true }), down('Shift', { altKey: true, shiftKey: true }), up('Shift', { altKey: true }), up('Alt')])).toEqual([])
    expect(commands([down('Shift', { shiftKey: true }), down('Alt', { altKey: true, shiftKey: true }), up('Alt', { shiftKey: true })])).toEqual([])
  })

  it('never converts on AltGr (Windows sends Ctrl+Alt) or Ctrl / ⌘ + Alt', () => {
    expect(commands([down('Control', { ctrlKey: true }), down('Alt', { ctrlKey: true, altKey: true }), up('Alt', { ctrlKey: true }), up('Control')])).toEqual([])
    expect(commands([down('AltGraph'), up('AltGraph')])).toEqual([])
    expect(commands([down('Meta', { metaKey: true }), down('Alt', { metaKey: true, altKey: true }), up('Alt', { metaKey: true })])).toEqual([])
    // Such an Alt is not preventDefault-ed: the OS / layout keeps it.
    expect(replay([down('Alt', { ctrlKey: true, altKey: true })])[0].preventDefault).toBe(false)
  })

  it('waits while an IME composes (Vietnamese Telex / VNI)', () => {
    expect(replay([down('Alt', { altKey: true, isComposing: true }), up('Alt', { isComposing: true })]).map((r) => r.command)).toEqual([null, null])
    expect(rowKey(down('Enter', { altKey: true, isComposing: true }), false).command).toBeNull()
  })

  it('a stray Alt release (pressed elsewhere) does nothing; ordinary keys pass through untouched', () => {
    expect(rowKey(up('Alt'), false)).toEqual({ command: null, preventDefault: false, stopPropagation: false, altArmed: false })
    expect(rowKey(down('a'), false)).toEqual({ command: null, preventDefault: false, stopPropagation: false, altArmed: false })
    // Typing after Alt went down disarms it.
    expect(rowKey(down('a', { altKey: true }), true).altArmed).toBe(false)
  })
})

describe('the other row keys', () => {
  it('Enter, Shift+Enter, Tab, Shift+Tab move the line and are preventDefault-ed, but bubble', () => {
    for (const [e, cmd] of [
      [down('Enter'), 'enter'],
      [down('Enter', { shiftKey: true }), 'shift-enter'],
      [down('Tab'), 'tab'],
      [down('Tab', { shiftKey: true }), 'shift-tab'],
    ] as const) {
      expect(rowKey(e, false)).toEqual({ command: cmd, preventDefault: true, stopPropagation: false, altArmed: false })
    }
  })

  it('Esc ends the row (an edit saves, a new line closes), disarming a pending Alt tap', () => {
    expect(rowKey(down('Escape'), false)).toEqual({ command: 'escape', preventDefault: true, stopPropagation: false, altArmed: false })
    expect(commands([down('Alt', { altKey: true }), down('Escape', { altKey: true }), up('Escape'), up('Alt')])).toEqual(['escape'])
  })

  it('Ctrl+Enter (⌘+Enter on macOS) opens bulk statements, and never also makes a new line', () => {
    expect(rowKey(down('Enter', { ctrlKey: true }), false)).toEqual({ command: 'bulk', preventDefault: true, stopPropagation: true, altArmed: false })
    expect(outlineKey({ key: 'Enter', shiftKey: false, metaKey: true })).toBe('bulk')
    expect(outlineKey({ key: 'Enter', shiftKey: true, ctrlKey: true })).toBe('bulk')
  })
})

describe('Alt on a new line: the line flips type where it stands', () => {
  it('statement line ↔ root line under the same parent; a top-level line stays a root', () => {
    expect(toggleSlot({ parentId: 'cell', afterId: 's1', type: 'statement' })).toEqual({ parentId: 'cell', afterId: 's1', type: 'root' })
    expect(toggleSlot({ parentId: 'cell', afterId: null, type: 'root' })).toEqual({ parentId: 'cell', afterId: null, type: 'statement' })
    expect(toggleSlot({ parentId: null, afterId: 'cell', type: 'root' })).toBeNull()
  })
})

describe('Alt on a row: node_type flips in place (no row moved, added or removed)', () => {
  // cell: s1, nucleus (a root with n1)
  const rows: ContentRow[] = [
    { id: 'cell', parentId: null, type: 'root', content: 'Tế bào', depth: 0 },
    { id: 's1', parentId: 'cell', type: 'statement', content: 'Ty thể', depth: 1 },
    { id: 'nucleus', parentId: 'cell', type: 'root', content: 'Nhân', depth: 1 },
    { id: 'n1', parentId: 'nucleus', type: 'statement', content: 'Nhân chứa DNA.', depth: 2 },
  ]
  const shape = (r: readonly ContentRow[]) => r.map((x) => [x.id, x.parentId, x.depth])

  it('a statement becomes a root and back, same place, same children', () => {
    const once = toggleRow(rows, 's1') as ContentRow[]
    expect(once.find((r) => r.id === 's1')?.type).toBe('root')
    expect(shape(once)).toEqual(shape(rows))
    expect(toggleRow(once, 's1')).toEqual(rows)
    // A root with statements under it becomes a statement with statements under it.
    expect((toggleRow(rows, 'nucleus') as ContentRow[]).map((r) => r.type)).toEqual(['root', 'statement', 'statement', 'statement'])
  })

  it('a top-level root stays a root', () => {
    expect(toggleRow(rows, 'cell')).toMatch(/top-level/)
  })

  it('pressing Alt twice before the server answered: the draft shows the row back as it was', () => {
    const detail: DeckDetail = {
      deck: { id: 'deck', userId: 'me', title: 'Sinh học', slug: 'sinh-hoc', description: null, isPublic: false, treeType: 'oak', createdAt: '2026-10-01', isTournamentOpen: false },
      tree: [],
    }
    const editor: DeckEditor = { deckId: 'deck', treeType: 'oak', nodes: [], rows }
    const ops: DeckOp[] = [
      { key: 'a', kind: 'toggle', id: 's1' },
      { key: 'b', kind: 'toggle', id: 's1' },
    ]
    expect(applyDeckOps(detail, editor, ops.slice(0, 1)).editor?.rows.find((r) => r.id === 's1')?.type).toBe('root')
    const both = applyDeckOps(detail, editor, ops)
    expect(both.editor?.rows).toEqual(rows)
    // Roots are what the canvas draws: s1 as a root showed there, then went back to nucleus's sibling statement.
    expect(applyDeckOps(detail, editor, ops.slice(0, 1)).detail.tree[0].children.map((c) => c.id)).toEqual(['s1', 'nucleus'])
    expect(both.detail.tree[0].children.map((c) => c.id)).toEqual(['nucleus'])
  })
})

describe('the Workshop cheat sheet', () => {
  const combos = (s: (typeof OUTLINE_SHORTCUTS)[number]) => s.combos.map((c) => c.join('+')).join(' or ')

  it('lists six compact badge + 1–2 word label rows, Alt highlighted', () => {
    expect(OUTLINE_SHORTCUTS.map((s) => [s.badge, s.label])).toEqual([
      ['Enter', 'New item'],
      ['Tab', 'Indent'],
      ['⇧Tab', 'Outdent'],
      ['Alt', 'Root ↔ Stmt'],
      ['Ctrl+↵', 'Bulk add'],
      ['Esc', 'Done'],
    ])
    for (const s of OUTLINE_SHORTCUTS) expect(s.label.split(/\s+/).filter((w) => w !== '↔').length, s.label).toBeLessThanOrEqual(2)
    expect(OUTLINE_SHORTCUTS.filter((s) => s.highlight).map((s) => s.badge)).toEqual(['Alt'])
  })

  it('keeps the alternative keys the badges leave out in the hover hint', () => {
    expect(OUTLINE_SHORTCUTS.map(combos)).toEqual(['Enter', 'Tab', 'Shift+Tab', 'Alt or Alt+Enter', 'Ctrl+Enter or ⌘+Enter', 'Esc'])
    const hint = (badge: string) => OUTLINE_SHORTCUTS.find((s) => s.badge === badge)!.hint
    expect(hint('Alt')).toContain('Alt+Enter')
    expect(hint('Ctrl+↵')).toContain('⌘+Enter')
    expect(hint('⇧Tab')).toContain('Shift+Tab')
  })

  it('every listed key combo is one the row editor actually handles, as the command it describes', () => {
    const asEvents: Record<string, RowKeyEvent[]> = {
      Enter: [down('Enter')],
      Tab: [down('Tab')],
      'Shift+Tab': [down('Tab', { shiftKey: true })],
      Alt: [down('Alt', { altKey: true }), up('Alt')],
      'Alt+Enter': [down('Alt', { altKey: true }), down('Enter', { altKey: true })],
      'Ctrl+Enter': [down('Enter', { ctrlKey: true })],
      '⌘+Enter': [down('Enter', { metaKey: true })],
      Esc: [down('Escape')],
    }
    const expected = ['enter', 'tab', 'shift-tab', 'toggle', 'bulk', 'escape']
    OUTLINE_SHORTCUTS.forEach((shortcut, i) => {
      for (const combo of shortcut.combos) expect(commands(asEvents[combo.join('+')]), combo.join('+')).toEqual([expected[i]])
    })
  })

  it('the panel is English only (no Vietnamese diacritics in its copy)', () => {
    const panel = readFileSync(join(__dirname, '..', 'components', 'ShortcutPanel.tsx'), 'utf8')
    const copy = [...OUTLINE_SHORTCUTS.flatMap((s) => [s.label, s.hint]), panel].join('\n')
    expect(copy).not.toMatch(/[ăâđêôơưĂÂĐÊÔƠƯạ-ỹ]/u)
    for (const text of ['⌨️ Shortcuts', 'Collapse keyboard shortcuts', 'Show keyboard shortcuts']) expect(panel).toContain(text)
  })
})

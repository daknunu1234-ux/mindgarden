// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Deletes without a confirmation, and undo / redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, the toast's Undo)
// on the deck page: the real deck draft (useDeckDraft) and the real Tree Workshop outline, with the
// server actions faked. Pure parts first (lib/history.ts), then the page.

type ToastCall = { message: string; action?: { label: string; onClick: () => void } }
const server = vi.hoisted(() => ({
  deletes: [] as string[],
  creates: [] as { parentId: string | null; afterId: string | null; first?: boolean; type: string; content: string }[],
  edits: [] as string[],
  indents: [] as string[],
  toasts: [] as ToastCall[],
  dismissed: [] as number[],
  nextId: 1,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }))
vi.mock('@/shared/stores/ToastProvider', () => ({
  useToast: () => ({
    toast: (t: ToastCall) => server.toasts.push(t),
    dismiss: (id: number) => server.dismissed.push(id),
  }),
}))
vi.mock('@/shared/stores/CoinsProvider', () => ({ useCoins: () => ({ setCoins: () => undefined }) }))
vi.mock('../actions/deleteKnowledgeItem', () => ({
  deleteKnowledgeItem: async ({ itemId }: { itemId: string }) => {
    server.deletes.push(itemId)
    return { success: true, data: { id: itemId } }
  },
}))
vi.mock('../actions/contentNodes', () => ({
  createContentNode: async (input: (typeof server.creates)[number]) => {
    server.creates.push(input)
    return { success: true, data: { id: `new-${server.nextId++}`, drillable: true, slug: 'sinh-hoc' } }
  },
  indentContentNode: async ({ nodeId, direction }: { nodeId: string; direction: string }) => {
    server.indents.push(`${nodeId} ${direction}`)
    return { success: true, data: {} }
  },
  toggleNodeType: async () => ({ success: true, data: {} }),
}))
vi.mock('../actions/updateKnowledgeItem', () => ({
  updateKnowledgeItem: async ({ text }: { text: string }) => {
    server.edits.push(text)
    return { success: true, data: {} }
  },
}))
vi.mock('../actions/updateMindmapNode', () => ({ updateMindmapNode: async () => ({ success: true, data: {} }) }))
vi.mock('../actions/createKnowledgeItems', () => ({ createKnowledgeItems: async () => ({ success: true, data: { created: [], skipped: 0 } }) }))
vi.mock('../actions/moveKnowledgeItem', () => ({ moveKnowledgeItem: async () => ({ success: true, data: {} }) }))
vi.mock('../actions/renameDeck', () => ({ renameDeck: async () => ({ success: true, data: {} }) }))
vi.mock('../actions/updateDeck', () => ({ updateDeck: async () => ({ success: true, data: { remainingCoins: null } }) }))

import { ContentOutline } from '../components/ContentOutline'
import { DELETE_GRACE_MS, DeckDraftProvider, useDeckDraft } from '../components/DeckDraft'
import { indentRow, insertRow, outlineRows, removeRow, toDeckTree, toEditorNodes, type StoredNode } from '../lib/contentTree'
import { branchSnapshot, HISTORY_LIMIT, outdentFollowers, pushEntry, emptyHistory, restoreSteps } from '../lib/history'
import type { ContentRow, DeckDetail, DeckEditor } from '../types'

// cell ─┬ s1
//       ├ organelles ─┬ m1
//       │             └ m2 ── m2a
//       └ s2
const stored: StoredNode[] = [
  { id: 'cell', parentId: null, type: 'root', content: 'Tế bào', sortOrder: 1 },
  { id: 's1', parentId: 'cell', type: 'statement', content: 'Ty thể sản sinh ATP.', sortOrder: 1 },
  { id: 'organelles', parentId: 'cell', type: 'root', content: 'Bào quan', sortOrder: 2 },
  { id: 'm1', parentId: 'organelles', type: 'statement', content: 'Lục lạp quang hợp.', sortOrder: 1 },
  { id: 'm2', parentId: 'organelles', type: 'statement', content: 'Ribosome tổng hợp protein.', sortOrder: 2 },
  { id: 'm2a', parentId: 'm2', type: 'statement', content: 'Ribosome có ở tế bào nhân sơ.', sortOrder: 1 },
  { id: 's2', parentId: 'cell', type: 'statement', content: 'Màng tế bào có tính thấm chọn lọc.', sortOrder: 3 },
]
const ROWS = outlineRows(stored)
const shape = (rows: readonly ContentRow[]) => rows.map((r) => `${'  '.repeat(r.depth)}${r.content}`)

describe('history: put a deleted branch back exactly', () => {
  // Rebuild a snapshot with insertRow, as the draft does (the old ids reused, so shapes compare).
  const rebuild = (rows: readonly ContentRow[], id: string) => {
    const snap = branchSnapshot(rows, id)!
    let next = removeRow(rows, id)
    for (const s of restoreSteps(snap)) next = insertRow(next, { id: s.id, parentId: s.parentId, type: s.type, content: s.content }, s.afterId, s.first) as ContentRow[]
    return next
  }

  it('a middle node with nested children, a first child, a last child and a top-level root', () => {
    for (const id of ['organelles', 's1', 'm1', 'm2', 'm2a', 's2', 'cell']) expect(rebuild(ROWS, id), id).toEqual(ROWS)
    const twoTops = outlineRows([...stored, { id: 'energy', parentId: null, type: 'root', content: 'Năng lượng', sortOrder: 2 }])
    expect(rebuild(twoTops, 'cell')).toEqual(twoTops)
  })

  it('remembers the place: the sibling above, or first among the children', () => {
    expect(branchSnapshot(ROWS, 'organelles')).toMatchObject({ parentId: 'cell', afterId: 's1', first: false })
    expect(branchSnapshot(ROWS, 's2')).toMatchObject({ parentId: 'cell', afterId: 'organelles', first: false })
    expect(branchSnapshot(ROWS, 'm1')).toMatchObject({ parentId: 'organelles', afterId: null, first: true })
    expect(branchSnapshot(ROWS, 'organelles')!.rows.map((r) => r.id)).toEqual(['organelles', 'm1', 'm2', 'm2a'])
  })

  it('undoing Shift+Tab: back under the old parent, then the adopted rows back out, last first', () => {
    const followers = outdentFollowers(ROWS, 'm1')
    expect(followers).toEqual(['m2'])
    let rows = indentRow(ROWS, 'm1', 'out') as ContentRow[]
    expect(rows.find((r) => r.id === 'm2')!.parentId).toBe('m1')
    rows = indentRow(rows, 'm1', 'in') as ContentRow[]
    for (const f of [...followers].reverse()) rows = indentRow(rows, f, 'out') as ContentRow[]
    expect(rows).toEqual(ROWS)
  })

  it('keeps the last HISTORY_LIMIT changes, and a new change clears redo', () => {
    let h = emptyHistory()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushEntry(h, { kind: 'toggle', id: `n${i}` })
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toEqual({ kind: 'toggle', id: 'n5' })
    h = pushEntry({ ...h, future: [{ kind: 'toggle', id: 'x' }] }, { kind: 'toggle', id: 'y' })
    expect(h.future).toEqual([])
  })
})

// ── The deck page: the real draft and outline ─────────────────────────────────────────────────

const detail: DeckDetail = {
  deck: { id: 'deck', userId: 'me', title: 'Sinh học', slug: 'sinh-hoc', description: null, isPublic: false, treeType: 'oak', createdAt: '', isTournamentOpen: false },
  tree: toDeckTree(ROWS),
}
const editor: DeckEditor = { deckId: 'deck', treeType: 'oak', rows: ROWS, nodes: toEditorNodes(ROWS) }

function Page() {
  const { view, actions } = useDeckDraft(detail, editor)
  return createElement(DeckDraftProvider, { value: actions }, createElement(ContentOutline, { editor: view.editor! }))
}

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(server, { deletes: [], creates: [], edits: [], indents: [], toasts: [], dismissed: [], nextId: 1 })
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  host?.remove()
  vi.useRealTimers()
})

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Page)))
}
// Let the background writes (one at a time, in order) finish.
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => await Promise.resolve())
}
const wait = async (ms: number) => {
  await act(async () => void vi.advanceTimersByTime(ms))
  await settle()
}
const shown = () =>
  [...host.querySelectorAll('ul[aria-label^="Outline of"] > li')].map((li) => {
    const level = Math.round(parseFloat((li as HTMLElement).style.paddingLeft || '0') / 18)
    return `${'  '.repeat(level)}${[...li.querySelectorAll('span.min-w-0')].map((s) => s.textContent).join('')}`
  })
const pageKey = (key: string, mods: KeyboardEventInit = {}) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }))
  })
const trash = (text: string) =>
  act(() => {
    const button = host.querySelector(`button[aria-label="Delete ${text}"]`) as HTMLButtonElement | null
    if (!button) throw new Error(`No 🗑️ for “${text}”`)
    button.click()
  })
const field = () => host.querySelector('input')!
const fieldKey = (key: string, mods: KeyboardEventInit = {}) =>
  act(() => {
    field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }))
  })
const type = (value: string) =>
  act(() => {
    const input = field()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const edit = (text: string) =>
  act(() => {
    const span = [...host.querySelectorAll('span')].find((s) => s.textContent === text)
    if (!span) throw new Error(`No row “${text}”`)
    span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
const FULL = shape(ROWS)

describe('deleting on the deck page: at once, no confirmation, undoable', () => {
  it('🗑️ removes the node and its branch at once, with no dialog, and a bottom toast that offers Undo', async () => {
    mount()
    expect(shown()).toEqual(FULL)
    trash('Bào quan')
    expect(shown()).toEqual(['Tế bào', '  Ty thể sản sinh ATP.', '  Màng tế bào có tính thấm chọn lọc.'])
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
    expect(server.toasts.at(-1)).toMatchObject({ message: expect.stringMatching(/^Deleted “Bào quan”\. Press Ctrl\+Z or Undo to restore\.$/), action: { label: 'Undo' } })
    // The server delete waits for the grace period.
    await settle()
    expect(server.deletes).toEqual([])
  })

  it('Ctrl+Z inside the grace period puts the whole branch back in its order, and nothing reaches the server', async () => {
    mount()
    trash('Bào quan')
    pageKey('z', { ctrlKey: true })
    expect(shown()).toEqual(FULL)
    expect(server.dismissed).toHaveLength(1) // its toast goes
    await wait(DELETE_GRACE_MS * 2)
    expect(server.deletes).toEqual([])
    expect(server.creates).toEqual([])
  })

  it('the toast’s Undo button does the same; Ctrl+Shift+Z / Ctrl+Y redo the delete', async () => {
    mount()
    trash('Ribosome tổng hợp protein.')
    act(() => server.toasts.at(-1)!.action!.onClick())
    expect(shown()).toEqual(FULL)
    pageKey('Z', { ctrlKey: true, shiftKey: true })
    expect(shown()).not.toContain('    Ribosome tổng hợp protein.')
    expect(shown()).not.toContain('      Ribosome có ở tế bào nhân sơ.')
    pageKey('z', { metaKey: true })
    expect(shown()).toEqual(FULL)
    pageKey('y', { ctrlKey: true })
    expect(shown()).toHaveLength(FULL.length - 2)
    await wait(DELETE_GRACE_MS + 1)
    expect(server.deletes).toEqual(['m2'])
  })

  it('after the grace period the delete is sent; Ctrl+Z then re-creates the branch node by node, in place', async () => {
    mount()
    trash('Bào quan')
    await wait(DELETE_GRACE_MS + 1)
    expect(server.deletes).toEqual(['organelles'])
    pageKey('z', { ctrlKey: true })
    expect(shown()).toEqual(FULL)
    await settle()
    // Parent first (after s1), then its children: each under the new id of the node made before it.
    expect(server.creates.map(({ parentId, afterId, first, type, content }) => ({ parentId, afterId, first, type, content }))).toEqual([
      { parentId: 'cell', afterId: 's1', first: undefined, type: 'root', content: 'Bào quan' },
      { parentId: 'new-1', afterId: null, first: true, type: 'statement', content: 'Lục lạp quang hợp.' },
      { parentId: 'new-1', afterId: 'new-2', first: undefined, type: 'statement', content: 'Ribosome tổng hợp protein.' },
      { parentId: 'new-3', afterId: null, first: true, type: 'statement', content: 'Ribosome có ở tế bào nhân sơ.' },
    ])
    expect(server.toasts.at(-1)!.message).toMatch(/progress on its statements starts over/)
    expect(shown()).toEqual(FULL)
  })

  it('Backspace on an emptied row deletes it at once (Ctrl+Z brings it back); on a new empty line it just closes', async () => {
    mount()
    edit('Ty thể sản sinh ATP.')
    type('')
    fieldKey('Backspace')
    expect(shown()).not.toContain('  Ty thể sản sinh ATP.')
    expect(host.querySelector('input')).toBeNull()
    pageKey('z', { ctrlKey: true })
    expect(shown()).toEqual(FULL)
  })
})

describe('undo / redo of edits and moves', () => {
  it('a text edit goes back and forth; Ctrl+Z inside a text field is left to the field', async () => {
    mount()
    edit('Ty thể sản sinh ATP.')
    type('Ty thể tạo ra ATP cho tế bào.')
    fieldKey('z', { ctrlKey: true }) // the field's own undo: the tree is untouched
    fieldKey('Enter', { shiftKey: true })
    expect(shown()[1]).toBe('  Ty thể tạo ra ATP cho tế bào.')
    pageKey('z', { ctrlKey: true })
    expect(shown()[1]).toBe('  Ty thể sản sinh ATP.')
    pageKey('z', { ctrlKey: true, shiftKey: true })
    expect(shown()[1]).toBe('  Ty thể tạo ra ATP cho tế bào.')
    await settle()
    expect(server.edits).toEqual(['Ty thể tạo ra ATP cho tế bào.', 'Ty thể sản sinh ATP.', 'Ty thể tạo ra ATP cho tế bào.'])
  })

  it('Tab and Shift+Tab are undone in place, adopted rows included', async () => {
    mount()
    edit('Lục lạp quang hợp.')
    fieldKey('Tab', { shiftKey: true }) // m1 up a level; m2 (below it) becomes its child
    fieldKey('Enter', { shiftKey: true })
    expect(shown()).toContain('  Lục lạp quang hợp.')
    expect(shown()).toContain('    Ribosome tổng hợp protein.')
    pageKey('z', { ctrlKey: true })
    expect(shown()).toEqual(FULL)
    await settle()
    expect(server.indents).toEqual(['m1 out', 'm1 in', 'm2 out'])
  })
})

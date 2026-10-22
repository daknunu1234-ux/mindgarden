// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The document import's staging editor: the parsed outline as Tree Workshop rows, edited in memory by
// the Workshop's own editor (ContentOutline) with the Workshop's keys, then sent by "Done".

const calls = vi.hoisted(() => ({ imports: [] as unknown[], toasts: [] as string[], refreshes: 0 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => (calls.refreshes += 1), push: () => undefined }) }))
vi.mock('@/shared/stores/ToastProvider', () => ({ useToast: () => ({ toast: ({ message }: { message: string }) => calls.toasts.push(message) }) }))
vi.mock('../actions/importOutline', () => ({
  importOutline: async (input: unknown) => {
    calls.imports.push(input)
    return { success: true, data: { slug: 'sinh-hoc', roots: 1, subRoots: 2, statements: 1 } }
  },
}))

import { OutlineStagingEditor } from '../components/OutlineStagingEditor'
import { ImportOutlineDto } from '../dto/ImportOutlineDto'
import { indentRow, toggleRow } from '../lib/contentTree'
import { addStagedStatements, importLines, stagedRows, stagingBlocker, stagingIssues, type DocumentLine } from '../lib/outlineStaging'
import { MAX_OUTLINE_DEPTH, planOutline } from '../lib/outlinePlan'
import type { ContentRow } from '../types'

const DECK = '11111111-1111-4111-8111-111111111111'
const DOC: DocumentLine[] = [
  { level: 1, text: 'Tế bào' },
  { level: 3, text: 'Mọi sinh vật đều cấu tạo từ tế bào.' },
  { level: 2, text: 'Bào quan' },
  { level: 3, text: 'Ty thể sản sinh ATP.' },
  { level: 3, text: 'Ribosome tổng hợp protein.' },
  { level: 1, text: 'Năng lượng' },
  { level: 3, text: 'ATP là đồng tiền năng lượng.' },
]
const shape = (rows: readonly ContentRow[]) => rows.map((r) => `${'  '.repeat(r.depth)}${r.type === 'root' ? '#' : '-'} ${r.content}`)

describe('stagedRows: a document outline as Workshop rows', () => {
  it('roots at the top, sub-roots under their root, statements under the nearest sub-root (else the root)', () => {
    const rows = stagedRows(DOC)
    expect(shape(rows)).toEqual([
      '# Tế bào',
      '  - Mọi sinh vật đều cấu tạo từ tế bào.',
      '  # Bào quan',
      '    - Ty thể sản sinh ATP.',
      '    - Ribosome tổng hợp protein.',
      '# Năng lượng',
      '  - ATP là đồng tiền năng lượng.',
    ])
    // Local ids only: never the "pending-" ids the deck draft treats as unsaved server nodes.
    expect(rows.every((r) => r.id.startsWith('staged-'))).toBe(true)
  })
})

describe('Done: what the staging outline sends', () => {
  it('Workshop edits (Tab, Shift+Tab, Alt) give a hierarchy the server accepts and places as shown', () => {
    let rows = stagedRows(DOC)
    const id = (text: string) => rows.find((r) => r.content === text)!.id
    rows = indentRow(rows, id('Ribosome tổng hợp protein.'), 'in') as ContentRow[] // a sub-statement
    rows = toggleRow(rows, id('Mọi sinh vật đều cấu tạo từ tế bào.')) as ContentRow[] // now a sub-root
    rows = indentRow(rows, id('Năng lượng'), 'in') as ContentRow[] // a top-level root nested
    const items = importLines(rows)
    expect(items.map((i) => [i.depth, i.type])).toEqual([
      [0, 'root'],
      [1, 'root'],
      [1, 'root'],
      [2, 'statement'],
      [3, 'statement'],
      [1, 'root'],
      [2, 'statement'],
    ])
    const parsed = ImportOutlineDto.safeParse({ deckId: DECK, items })
    expect(parsed.success).toBe(true)
    // The server's plan puts every node under the same parent the editor showed.
    const plan = planOutline(items)
    expect(plan.map((l) => (l.parent === null ? null : rows[l.parent].id))).toEqual(rows.map((r) => r.parentId))
  })

  it('sends depth, type and cleaned text only (no ids)', () => {
    expect(importLines([{ id: 'staged-0', parentId: null, type: 'root', content: '  Tế   bào ', depth: 0 }])).toEqual([{ depth: 0, type: 'root', text: 'Tế bào' }])
  })

  it('flags each row the server would refuse, and the outline as a whole when it is empty or too big', () => {
    const rows: ContentRow[] = [
      { id: 'a', parentId: null, type: 'root', content: 'R'.repeat(151), depth: 0 },
      { id: 'b', parentId: 'a', type: 'statement', content: 'abc', depth: 1 },
      { id: 'c', parentId: 'a', type: 'statement', content: String.raw`Có \sqrt{2} ở đây`, depth: 1 },
      { id: 'd', parentId: 'a', type: 'root', content: '   ', depth: 1 },
      { id: 'e', parentId: 'a', type: 'statement', content: 'Ty thể sản sinh ATP.', depth: MAX_OUTLINE_DEPTH + 1 },
      { id: 'f', parentId: 'a', type: 'statement', content: 'Ty thể sản sinh ATP.', depth: 1 },
    ]
    const issues = stagingIssues(rows)
    expect([...issues.keys()]).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(issues.get('a')).toMatch(/150/)
    expect(issues.get('b')).toMatch(/at least 5/)
    expect(issues.get('c')).toMatch(/LaTeX/)
    expect(issues.get('d')).toMatch(/Name/)
    expect(issues.get('e')).toMatch(/levels deep/)
    expect(stagingBlocker([])).toMatch(/nothing/)
    expect(stagingBlocker(rows)).toBeNull()
  })

  it('the bulk importer appends statements under a node and skips ones already there', () => {
    const rows = stagedRows(DOC)
    let n = 0
    const res = addStagedStatements(rows, 'staged-2', ['Ty thể sản sinh ATP.', 'Lục lạp quang hợp.'], () => `staged-new-${n++}`)
    expect(res.skipped).toBe(1)
    expect(res.created).toEqual([{ id: 'staged-new-0', statement: 'Lục lạp quang hợp.' }])
    expect(shape(res.rows).slice(2, 6)).toEqual(['  # Bào quan', '    - Ty thể sản sinh ATP.', '    - Ribosome tổng hợp protein.', '    - Lục lạp quang hợp.'])
  })
})

// ── The editor itself, driven with the Workshop's keys ────────────────────────────────────────

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  calls.imports = []
  calls.toasts = []
  calls.refreshes = 0
})
afterEach(() => {
  if (!root) return
  act(() => root!.unmount())
  root = null
  host.remove()
})

function mount(lines: DocumentLine[], onDone: () => void = () => undefined) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(createElement(OutlineStagingEditor, { deckId: DECK, treeType: 'oak', lines, onDone })))
}
const field = () => host.querySelector('input')!
const key = (k: string, opts: KeyboardEventInit = {}, type: 'keydown' | 'keyup' = 'keydown') =>
  act(() => {
    field().dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...opts }))
  })
const altTap = () => {
  key('Alt', { altKey: true })
  key('Alt', {}, 'keyup')
}
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
const doneButton = () => [...host.querySelectorAll('button')].find((b) => /Done|Fix/.test(b.textContent ?? ''))!
// The outline's rows as shown: indentation from the line's padding, 🌱/🌿 roots, • statements.
const shown = () =>
  [...host.querySelectorAll('ul[aria-label^="Outline of"] > li')].map((li) => {
    const level = Math.round(parseFloat((li as HTMLElement).style.paddingLeft || '0') / 18)
    const text = [...li.querySelectorAll('span.min-w-0')].map((s) => s.textContent).join('')
    const icon = li.textContent!.includes('🌱') || li.textContent!.includes('🌿') ? '#' : '-'
    return `${'  '.repeat(level)}${icon} ${text}`
  })

describe('OutlineStagingEditor: the Tree Workshop editor, in memory', () => {
  it('Tab nests, Alt switches type, Enter adds a line of the same type below, Shift+Tab outdents it, Esc closes; Done sends that hierarchy', async () => {
    let closed = 0
    mount(
      [
        { level: 1, text: 'Tế bào' },
        { level: 3, text: 'Ty thể sản sinh ATP.' },
        { level: 3, text: 'Ribosome tổng hợp protein.' },
      ],
      () => (closed += 1),
    )
    expect(shown()).toEqual(['# Tế bào', '  - Ty thể sản sinh ATP.', '  - Ribosome tổng hợp protein.'])

    edit('Ribosome tổng hợp protein.')
    key('Tab') // nest under the statement above
    altTap() // statement → root, in place
    expect(calls.toasts).toContain('Converted to Root')
    key('Enter') // save, then a new line right below: same parent, same type (a root)
    key('Tab', { shiftKey: true }) // the new line goes up a level, right below its old parent
    type('Bào quan')
    key('Enter')
    key('Escape') // the next new line closes, nothing added
    expect(host.querySelector('input')).toBeNull()

    // Every change is local: nothing was sent while editing.
    expect(calls.imports).toEqual([])
    expect(doneButton().disabled).toBe(false)
    await act(async () => doneButton().click())
    expect(calls.imports).toEqual([
      {
        deckId: DECK,
        items: [
          { depth: 0, type: 'root', text: 'Tế bào' },
          { depth: 1, type: 'statement', text: 'Ty thể sản sinh ATP.' },
          { depth: 2, type: 'root', text: 'Ribosome tổng hợp protein.' },
          { depth: 1, type: 'root', text: 'Bào quan' },
        ],
      },
    ])
    expect(ImportOutlineDto.safeParse(calls.imports[0]).success).toBe(true)
    expect(closed).toBe(1)
    expect(calls.refreshes).toBe(1)
  })

  it('a line the server would refuse is marked ⚠️ and Done waits until it is fixed', async () => {
    mount([
      { level: 1, text: 'Tế bào' },
      { level: 3, text: 'Ty thể sản sinh ATP.' },
    ])
    edit('Ty thể sản sinh ATP.')
    type('abc')
    key('Enter', { shiftKey: true }) // save and close
    expect(host.querySelector('[role="img"][aria-label*="at least 5"]')).not.toBeNull()
    expect(doneButton().disabled).toBe(true)
    expect(doneButton().textContent).toMatch(/Fix 1 line first/)

    edit('abc')
    type('Ty thể có DNA riêng.')
    key('Enter', { shiftKey: true })
    expect(doneButton().disabled).toBe(false)
    await act(async () => doneButton().click())
    expect((calls.imports[0] as { items: unknown[] }).items).toEqual([
      { depth: 0, type: 'root', text: 'Tế bào' },
      { depth: 1, type: 'statement', text: 'Ty thể có DNA riêng.' },
    ])
  })

})

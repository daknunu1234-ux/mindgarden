// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Counts how often outline rows render: every row that isn't being edited renders exactly one
// HoverActions (its tools), so counting HoverActions renders counts row renders.
const rowRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/shared/components/game', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/components/game')>()
  return {
    ...actual,
    HoverActions: (props: { children: ReactNode }) => {
      rowRenders.count++
      return createElement('span', { 'data-tools': '' }, props.children)
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }))
vi.mock('@/shared/stores/ToastProvider', () => ({ useToast: () => ({ toast: () => undefined }) }))

import { ContentOutline } from '../components/ContentOutline'
import { DeckDraftProvider, type DeckDraftActions } from '../components/DeckDraft'
import { outlineRows, toEditorNodes, type StoredNode } from '../lib/contentTree'
import type { DeckEditor } from '../types'

// One root with 200 statements: a big outline, as a long-used tree has.
const ROWS = 200
const stored: StoredNode[] = [
  { id: 'root', parentId: null, type: 'root', content: 'Sinh học', sortOrder: 1 },
  ...Array.from({ length: ROWS }, (_, i) => ({ id: `s${i}`, parentId: 'root', type: 'statement' as const, content: `Câu số ${i} về tế bào.`, sortOrder: i + 1 })),
]
const rows = outlineRows(stored)
const editor: DeckEditor = { deckId: 'deck', treeType: 'oak', rows, nodes: toEditorNodes(rows) }
const noop = () => undefined
const actions = {
  addNode: () => ({ id: 'pending-x', done: new Promise(() => undefined) }),
  editNode: noop,
  indentNode: noop,
  toggleType: noop,
  isPending: () => false,
  resolveId: (id: string) => id,
} as unknown as DeckDraftActions

let root: Root
let host: HTMLDivElement
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(createElement(DeckDraftProvider, { value: actions }, createElement(ContentOutline, { editor }))))
}

// Types into the focused field the way a browser does (React listens for `input`).
function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      setValue.call(input, input.value + text[i - 1])
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}

describe('the Tree Workshop outline renders only what changes', () => {
  it('draws every row once on mount', () => {
    rowRenders.count = 0
    mount()
    // The root and its 200 statements.
    expect(rowRenders.count).toBe(ROWS + 1)
  })

  it('typing in a row re-renders no other row, however long the outline', () => {
    mount()
    const text = [...host.querySelectorAll('span[title="Double-click to edit"]')].find((el) => el.textContent === 'Câu số 7 về tế bào.')!
    rowRenders.count = 0
    act(() => {
      text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    // Opening the edit: only that row changes (its tools give way to the field).
    expect(rowRenders.count).toBe(0)
    const input = host.querySelector('input')!
    expect(input.value).toBe('Câu số 7 về tế bào.')
    rowRenders.count = 0
    type(input, ' Thêm chữ')
    // 9 keystrokes, 200 other rows: not one of them re-rendered.
    expect(input.value).toBe('Câu số 7 về tế bào. Thêm chữ')
    expect(rowRenders.count).toBe(0)
  })

  it('collapsing the root re-renders only the root (the hidden rows go away)', () => {
    mount()
    rowRenders.count = 0
    const toggle = host.querySelector('button[aria-expanded="true"]')!
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rowRenders.count).toBe(1)
    expect(host.querySelectorAll('[data-tools]')).toHaveLength(1)
  })
})

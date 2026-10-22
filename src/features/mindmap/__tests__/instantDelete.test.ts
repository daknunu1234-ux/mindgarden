// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RootChart } from '../components/RootChart'
import type { RootNodeView } from '../types'

// The mindmap's 🗑️ deletes at once: it calls the page's owner tool straight away (the page wires it
// to the deck draft's removeNode: gone at once, Undo toast, Ctrl+Z), and no confirmation opens.

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({ id, title: id, items: items.map((i) => ({ id: i })), children })
const TREE = [node('cell', ['i1'], [node('nucleus', ['i3'], [node('dna', ['i4'])])]), node('energy', ['i5'])]

let root: Root
let host: HTMLDivElement
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('deleting from the mindmap', () => {
  it('🗑️ on a root card calls onDeleteRoot at once, with no dialog in between', () => {
    const onDeleteRoot = vi.fn()
    const ownerTools = { onEditStatement: vi.fn(), onDeleteStatement: vi.fn(), onEditRoot: vi.fn(), onDeleteRoot }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(createElement(RootChart, { nodes: TREE, levels: {}, treeType: 'oak', title: 'Sinh học', ownerTools })))
    act(() => (host.querySelector('button[aria-label="Delete root dna"]') as HTMLButtonElement).click())
    expect(onDeleteRoot).toHaveBeenCalledTimes(1)
    expect(onDeleteRoot).toHaveBeenCalledWith('dna')
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
  })

  it('the page wires every delete straight to the deck draft (no confirmation dialogs are left)', () => {
    const root = join(__dirname, '..', '..', '..')
    const panel = readFileSync(join(root, 'app', 'deck', '[slug]', '_components', 'DeckRootsPanel.tsx'), 'utf8')
    expect(panel).toMatch(/onDeleteStatement:[^\n]*removeNode\(/)
    expect(panel).toMatch(/onDeleteRoot:[\s\S]{0,120}removeNode\(/)
    expect(panel).not.toMatch(/Delete(Root|Statement|Node)Dialog/)
    const decks = readFileSync(join(root, 'features', 'decks', 'index.ts'), 'utf8')
    expect(decks).not.toMatch(/Delete(Root|Statement|Node)Dialog/)
  })
})

'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { undoKey } from '../lib/outline'

type UndoHandlers = { undo: () => void; redo: () => void }

// Ctrl+Z / ⌘Z (undo) and Ctrl+Shift+Z / ⌘⇧Z / Ctrl+Y (redo) for the whole page. One window listener
// serves a stack of scopes: the latest one mounted wins, so the document import's staging editor (a
// dialog over the deck page) takes the keys while it is open and hands them back when it closes.
// Inside a text field the keys stay the field's own (undo the typing, not the tree).
const scopes: { current: UndoHandlers }[] = []

const TEXT_INPUTS = new Set(['', 'text', 'search', 'url', 'email', 'number', 'password', 'tel'])

export function isTextField(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && TEXT_INPUTS.has(((el as HTMLInputElement).getAttribute('type') ?? '').toLowerCase())
}

function onKeyDown(e: KeyboardEvent) {
  const scope = scopes.at(-1)
  if (!scope || e.defaultPrevented || e.isComposing) return
  const command = undoKey(e)
  if (!command || isTextField(e.target)) return
  e.preventDefault()
  scope.current[command]()
}

export function useUndoShortcuts(handlers: UndoHandlers, enabled = true) {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    if (!enabled) return
    const scope = latest
    scopes.push(scope)
    if (scopes.length === 1) window.addEventListener('keydown', onKeyDown)
    return () => {
      const at = scopes.lastIndexOf(scope)
      if (at >= 0) scopes.splice(at, 1)
      if (scopes.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}

'use client'

import { useEffect, useRef } from 'react'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { shortcutFor, type ShortcutContext } from '../lib/shortcuts'
import type { DrillTag } from '../types'

type Options = {
  status: ShortcutContext['status']
  tags: readonly DrillTag[]
  onPick: (tag: DrillTag) => void
  onNext: () => void
}

const INTERACTIVE = 'a, button, input, select, textarea, summary, [role="button"], [contenteditable="true"]'
const EDITABLE = 'input, select, textarea, [contenteditable="true"]'

// 1–4 or A–D to answer, Enter/Space for the next question. Rules live in lib/shortcuts.ts.
export function useDrillShortcuts({ status, tags, onPick, onNext }: Options) {
  const { isOpen: loginOpen } = useLoginDialog()
  // Keep the listener stable while always reading the latest state and callbacks.
  const latest = useRef({ status, tags, onPick, onNext, loginOpen })
  useEffect(() => {
    latest.current = { status, tags, onPick, onNext, loginOpen }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { status, tags, onPick, onNext, loginOpen } = latest.current
      const target = event.target instanceof Element ? event.target : null
      const action = shortcutFor(event.key, {
        status,
        tags,
        targetIsInteractive: Boolean(target?.closest(INTERACTIVE)),
        targetIsEditable: Boolean(target?.closest(EDITABLE)),
        blocked: loginOpen || event.defaultPrevented,
        withModifier: event.ctrlKey || event.metaKey || event.altKey,
        repeat: event.repeat,
        code: event.code,
      })
      if (!action) return

      event.preventDefault() // Space would otherwise scroll the page
      if (action.type === 'pick') onPick(action.tag)
      else onNext()
    }

    // Capture phase: the drill hears the key before anything on the page can stop it.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

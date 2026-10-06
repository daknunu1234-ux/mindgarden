'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { rowKey, type OutlineKey } from '../lib/outline'

export type InlineInputProps = {
  initial?: string
  placeholder?: string
  label: string
  maxLength: number
  // Roots and sub-roots (🌱 / 🌿) and sub-statements (↳); statement fields start with the text.
  icon?: string
  // The key, the text and the caret position. 'keep' = the row stays (moved in place): keep its text.
  onKey: (key: OutlineKey, text: string, caret: number) => 'keep' | void
  // Esc (with the text as it stands): an edit saves it, a new-item input closes. Also ✕ unless onCancel is set.
  onClose: (text: string) => void
  // ✕ on an edit: discard the change.
  onCancel?: (text: string) => void
  // Edits save when the field loses focus; new-item inputs keep their text instead.
  onBlurSave?: (text: string) => void
  // Alt (statement ↔ root) and Ctrl+Enter (bulk); true = handled (the row moves on), false = the
  // field stays as it is (a refused conversion).
  onCommand?: (command: 'toggle' | 'bulk', text: string) => boolean
  // Every change of the text (edits keep it above the row, so a remounted row picks it up).
  onTextChange?: (text: string) => void
  // Select the starting text on focus (edits opened with ✏️), else put the caret at its end.
  selectInitial?: boolean
  // Put the caret here on arrival (a row that moved while being typed in), instead of the default.
  caret?: number | null
}

// The one inline field for adding and editing: compact, focused on arrival, IME-safe keys. All key
// handling is lib/outline `rowKey` (pure, tested); this only applies its verdict.
export function InlineInput({
  initial = '',
  placeholder,
  label,
  maxLength,
  icon,
  onKey,
  onClose,
  onCancel,
  onBlurSave,
  onCommand,
  onTextChange,
  selectInitial = true,
  caret,
}: InlineInputProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  // A key or ✕ already finished this edit: the blur that follows must not save it again.
  const finished = useRef(false)
  // Alt went down alone: a clean tap (released with no other key) switches statement ↔ root.
  const altArmed = useRef(false)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    if (caret != null) input.setSelectionRange(Math.min(caret, input.value.length), Math.min(caret, input.value.length))
    else if (initial && selectInitial) input.select()
    else input.setSelectionRange(input.value.length, input.value.length)
    // Only on arrival: later re-renders must not move the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyEvent = (e: KeyboardEvent<HTMLInputElement>, type: 'keydown' | 'keyup') => {
    const verdict = rowKey(
      { type, key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, isComposing: e.nativeEvent.isComposing },
      altArmed.current,
    )
    altArmed.current = verdict.altArmed
    if (verdict.preventDefault) e.preventDefault()
    if (verdict.stopPropagation) e.stopPropagation()
    const { command } = verdict
    if (!command) return
    if (command === 'escape') {
      finished.current = true
      onClose(value)
      return
    }
    if (command === 'toggle' || command === 'bulk') {
      if (!onCommand?.(command, value)) return
      // The row is converted / saved elsewhere: its blur must not save it again.
      finished.current = true
      return
    }
    const caretAt = e.currentTarget.selectionStart ?? value.length
    // Tab / Shift+Tab move the row in place: same row, same text, still being edited.
    if (onKey(command, value, caretAt) === 'keep') return
    if (onBlurSave) finished.current = true
    setValue('')
  }

  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border-2 border-dashed border-emerald-500 bg-emerald-50 pr-0.5 pl-1.5 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]">
      {icon && (
        <span aria-hidden className="text-[11px]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="Enter Shift+Enter Tab Shift+Tab Alt Alt+Enter Control+Enter Escape"
        enterKeyHint="next"
        onChange={(e) => {
          setValue(e.target.value)
          onTextChange?.(e.target.value)
        }}
        onKeyDown={(e) => onKeyEvent(e, 'keydown')}
        onKeyUp={(e) => onKeyEvent(e, 'keyup')}
        onBlur={() => {
          altArmed.current = false
          if (onBlurSave && !finished.current) {
            finished.current = true
            onBlurSave(value)
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-emerald-950 outline-none placeholder:text-emerald-800/50"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          finished.current = true
          const close = onCancel ?? onClose
          close(value)
        }}
        aria-label={onCancel ? 'Discard changes' : 'Close'}
        title={onCancel ? 'Discard changes' : 'Close (Esc)'}
        className="flex size-5 shrink-0 items-center justify-center rounded text-emerald-900/60 hover:bg-emerald-200 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        <X className="size-3" strokeWidth={3} />
      </button>
    </div>
  )
}

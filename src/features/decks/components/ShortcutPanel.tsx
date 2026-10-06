'use client'

import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { OUTLINE_SHORTCUTS } from '../lib/outline'
import {
  readShortcutPanel,
  SHORTCUT_PANEL_KEY,
  shortcutPanelClasses,
  shortcutPanelOpen,
  writeShortcutPanel,
  type ShortcutPanelChoice,
} from '../lib/shortcutPanel'

// Same-tab changes: the `storage` event only fires in other tabs.
const CHANGED = 'mindgarden:workshop-shortcuts'
const WIDE = '(min-width: 1024px)' // Tailwind `lg`

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SHORTCUT_PANEL_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, onChange)
  }
}

// The owner's open / minimized choice (lib/shortcutPanel.ts). Server and first client render use
// "not chosen" (the screen decides, in CSS); a saved choice applies right after. If storage is
// blocked, the toggle still works for this visit.
function useShortcutPanel(): { choice: ShortcutPanelChoice; toggle: () => void } {
  const stored = useSyncExternalStore(subscribe, () => readShortcutPanel(storage()), () => null)
  const [unsaved, setUnsaved] = useState<ShortcutPanelChoice>(null)
  const choice = unsaved ?? stored
  const toggle = useCallback(() => {
    const wide = typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches === true
    const next = !shortcutPanelOpen(choice, wide)
    if (writeShortcutPanel(storage(), next)) window.dispatchEvent(new Event(CHANGED))
    else setUnsaved(next)
  }, [choice])
  return { choice, toggle }
}

// The Workshop's keyboard cheat sheet, kept small so it never crowds the editor: a narrow cream card
// beside the outline on large screens (w-44, sticky down a long tree), one key badge + a 1–2 word
// label per row (the full description and alternative keys on hover). One click on × minimizes it to
// a "⌨️ Shortcuts" badge, which opens it again; the choice is remembered. Below lg it starts as that
// badge, under the outline. The rows are lib/outline OUTLINE_SHORTCUTS (tested against the row
// editor's keys).
function ShortcutPanel({ className }: { className?: string }) {
  const { choice, toggle } = useShortcutPanel()
  const classes = shortcutPanelClasses(choice)
  const bodyId = useId()
  return (
    <aside aria-label="Keyboard shortcuts" className={cn('shrink-0 lg:sticky lg:top-6', classes.aside, className)}>
      {/* Minimized: a small badge that opens the panel. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        aria-controls={bodyId}
        title="Show keyboard shortcuts"
        className={cn(
          classes.trigger,
          'items-center gap-1 rounded-full border border-[#dcb98c] bg-[#fff6e6] px-2 py-0.5 text-[11px] font-semibold text-amber-900 shadow-[0_1px_0_#c89b64] transition-colors hover:bg-amber-100 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none',
        )}
      >
        <span aria-hidden>⌨️</span>
        <span>Shortcuts</span>
      </button>

      <div id={bodyId} className={cn(classes.body, 'rounded-xl border border-[#dcb98c] bg-[#fffaf0] p-2.5 shadow-[0_2px_0_#e3c79d]')}>
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold tracking-wide text-amber-900/70 uppercase">⌨️ Shortcuts</h4>
          <button
            type="button"
            onClick={toggle}
            aria-expanded
            aria-controls={bodyId}
            aria-label="Collapse keyboard shortcuts"
            title="Collapse"
            className="-mr-1 flex size-5 items-center justify-center rounded text-amber-900/50 hover:bg-amber-200/60 hover:text-amber-950 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
          >
            <X aria-hidden className="size-3" strokeWidth={3} />
          </button>
        </div>
        <dl className="mt-1.5 divide-y divide-amber-800/10">
          {OUTLINE_SHORTCUTS.map(({ badge, label, hint, highlight }) => (
            <div key={badge} title={hint} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
              <dt>
                <kbd
                  className={cn(
                    'inline-flex min-w-7 items-center justify-center rounded border border-b-2 px-1 font-mono text-[10px] leading-4 font-bold',
                    highlight ? 'border-emerald-700/40 bg-emerald-100 text-emerald-900' : 'border-amber-800/25 bg-white text-amber-950',
                  )}
                >
                  {badge}
                </kbd>
              </dt>
              <dd className={cn('truncate text-right text-[11px] font-medium', highlight ? 'text-emerald-900' : 'text-amber-900/80')}>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}

export { ShortcutPanel }

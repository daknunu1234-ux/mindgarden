'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { GameButton, GameTextarea } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { useDeckDraftActions } from './DeckDraft'
import {
  MAX_BULK_STATEMENTS,
  MAX_STATEMENT_LENGTH,
  MIN_BULK_STATEMENT_LENGTH,
  reviewBulkStatements,
  type BulkEdits,
  type BulkReviewItem,
} from '../lib/bulkStatements'

type BulkStatementImporterProps = {
  deckId: string
  rootId: string
  rootTitle: string
  // The root's current statements: pasted duplicates of them are flagged and skipped.
  existing: readonly string[]
  className?: string
  // Start open (the Tree Workshop opens it from a root's 📋 tool); onCancel runs when Cancel closes it.
  defaultOpen?: boolean
  onCancel?: () => void
}

const PLACEHOLDER =
  'Paste your notes here with bullets (- or •) or line breaks. Each bullet will become an individual statement.\n\n- Ty thể sản sinh ATP.\n- Ribosome tổng hợp protein.\n1. Khi nhiệt độ tăng, áp suất khí lớn hơn.'

const PROBLEM_LABEL: Record<NonNullable<BulkReviewItem['problem']>, string> = {
  'too-short': `under ${MIN_BULK_STATEMENT_LENGTH} characters`,
  'too-long': `over ${MAX_STATEMENT_LENGTH} characters`,
  latex: 'LaTeX: use plain text',
  exists: 'already in this root',
  duplicate: 'same as another line',
}

// "📋 Bulk Add via Notes / Bullets": paste a block of notes, see it split into statements live, fix
// or discard lines in the preview (✏️ / double-click edits a line in place, 🗑️ drops it), then import
// them all into this root at once (createKnowledgeItems). Optimistic: the statements join the root at
// once (deck draft) and the importer closes; the server's tally (created / not drillable / skipped)
// arrives as a notice, and a refusal removes them again. Owner-only (Tree Workshop list and the
// root's manage dialog).
function BulkStatementImporter({ deckId, rootId, rootTitle, existing, className, defaultOpen = false, onCancel }: BulkStatementImporterProps) {
  const { addStatements } = useDeckDraftActions()
  const textareaId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  // Edits and discards made in the preview, keyed by the parsed line (lib/bulkStatements).
  const [edits, setEdits] = useState<BulkEdits>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'gold' | 'amber'; text: string } | null>(null)

  const { items: preview, discarded } = reviewBulkStatements(text, existing, edits)
  const importable = preview.filter((p) => p.problem === null).map((p) => p.statement)
  const tooMany = importable.length > MAX_BULK_STATEMENTS

  const setEdit = (key: string, value: string | null | undefined) =>
    setEdits((current) => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  const close = () => {
    setOpen(false)
    setText('')
    setEdits({})
    setEditingKey(null)
  }

  const importAll = () => {
    if (importable.length === 0 || tooMany) return
    const statements = importable
    const pasted = text
    const pastedEdits = edits
    setNotice({ tone: 'gold', text: `Adding ${statements.length} ${statements.length === 1 ? 'statement' : 'statements'} to ${rootTitle}…` })
    close()
    void addStatements(deckId, rootId, statements).then((res) => {
      if (!res.success) {
        // Nothing was saved: reopen with the notes (and the preview edits) so the owner can try again.
        setText(pasted)
        setEdits(pastedEdits)
        setOpen(true)
        setNotice({ tone: 'amber', text: `${res.message}. Nothing was imported.` })
        return
      }
      const { created, skipped } = res.data
      const ready = created.filter((c) => c.drillable).length
      setNotice({
        tone: ready === created.length ? 'gold' : 'amber',
        text: [
          `Imported ${created.length} ${created.length === 1 ? 'statement' : 'statements'} into ${rootTitle}`,
          ready < created.length ? `${created.length - ready} not drillable yet (add sibling statements or a word the engine can flip)` : 'all ready to drill ✨',
          skipped > 0 ? `${skipped} already there, skipped` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    })
  }

  return (
    <div className={cn('space-y-2', className)}>
      {!open ? (
        <GameButton
          type="button"
          tone="cream"
          size="sm"
          onClick={() => {
            setNotice(null)
            setOpen(true)
          }}
        >
          📋 Bulk Add via Notes / Bullets
        </GameButton>
      ) : (
        <div className="space-y-3 rounded-[18px] border-[2.5px] border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] p-3 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#d2ac7c]">
          <label htmlFor={textareaId} className="block font-game text-sm font-extrabold">
            📋 Bulk add to “{rootTitle}”
          </label>
          <GameTextarea
            id={textareaId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={7}
            autoFocus
            className="min-h-36 text-sm"
          />

          <div aria-live="polite">
            {preview.length === 0 && discarded === 0 ? (
              <p className="text-xs font-semibold text-amber-900/60">
                Nothing parsed yet. Each line or bullet (5+ characters) becomes a statement; empty lines are ignored.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-game text-sm font-bold">
                    Parsed {preview.length} {preview.length === 1 ? 'statement' : 'statements'}
                    {importable.length !== preview.length && ` · ${importable.length} to import`}:
                  </p>
                  {discarded > 0 && (
                    <button
                      type="button"
                      onClick={() => setEdits((current) => Object.fromEntries(Object.entries(current).filter(([, v]) => v !== null)))}
                      className="flex items-center gap-1 rounded-full px-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
                    >
                      <RotateCcw aria-hidden className="size-3" strokeWidth={3} />
                      Restore {discarded} discarded
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-900/55">✏️ or double-click a line to fix it · 🗑️ to leave it out</p>
                <ol className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {preview.map((item, i) => (
                    <li
                      key={item.key}
                      className={cn(
                        'group flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-sm',
                        item.problem ? 'border-amber-300 bg-amber-50/80 text-amber-900/70' : 'border-emerald-200 bg-white',
                      )}
                    >
                      <span className="pt-0.5 font-game text-xs font-bold text-amber-900/50 tabular-nums">#{i + 1}</span>
                      {editingKey === item.key ? (
                        <PreviewLineInput
                          initial={item.statement}
                          label={`Edit parsed statement ${i + 1}`}
                          onDone={(value) => {
                            setEditingKey(null)
                            if (value !== null) setEdit(item.key, value.trim() === item.key ? undefined : value)
                          }}
                        />
                      ) : (
                        <>
                          <span
                            className={cn('min-w-0 flex-1 whitespace-pre-wrap', item.problem && 'line-through decoration-amber-500/60')}
                            onDoubleClick={() => setEditingKey(item.key)}
                          >
                            {item.statement}
                            {item.edited && (
                              <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 align-middle text-[10px] font-bold text-sky-800" title={`Was: ${item.key}`}>
                                edited
                              </span>
                            )}
                          </span>
                          {item.problem && <span className="shrink-0 pt-0.5 text-[11px] font-bold text-amber-800">⚠️ {PROBLEM_LABEL[item.problem]}</span>}
                          <span className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              onClick={() => setEditingKey(item.key)}
                              aria-label={`Edit parsed statement ${i + 1}`}
                              title="Edit"
                              className="flex size-6 items-center justify-center rounded-md text-amber-900/60 hover:bg-sky-100 hover:text-sky-800 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
                            >
                              <Pencil aria-hidden className="size-3.5" strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEdit(item.key, null)}
                              aria-label={`Discard parsed statement ${i + 1}`}
                              title="Discard"
                              className="flex size-6 items-center justify-center rounded-md text-amber-900/60 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
                            >
                              <Trash2 aria-hidden className="size-3.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                {tooMany && (
                  <p role="alert" className="mt-1.5 text-xs font-semibold text-amber-900">
                    That&apos;s more than {MAX_BULK_STATEMENTS} at once: split the notes into smaller pastes.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <GameButton type="button" tone="leaf" size="sm" onClick={importAll} disabled={importable.length === 0 || tooMany}>
              {`Import All (${importable.length})`}
            </GameButton>
            <GameButton
              type="button"
              tone="cream"
              size="sm"
              onClick={() => {
                close()
                onCancel?.()
              }}
            >
              Cancel
            </GameButton>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className={notice.tone === 'gold' ? 'text-sm font-semibold text-amber-800' : 'text-sm text-amber-900'}>
          {notice.text}.
        </p>
      )}
    </div>
  )
}

// One parsed line edited in place: Enter or leaving the field keeps the new text, Esc keeps the old.
// IME-safe (Vietnamese Telex / VNI confirm letters with Enter-like keys).
function PreviewLineInput({ initial, label, onDone }: { initial: string; label: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(result)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Inside a dialog, Esc must not close the whole dialog too.
      e.stopPropagation()
      finish(null)
    }
  }
  return (
    <input
      ref={ref}
      value={value}
      maxLength={MAX_STATEMENT_LENGTH * 2}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value)}
      className="h-7 min-w-0 flex-1 rounded-md border-2 border-dashed border-emerald-500 bg-emerald-50 px-1.5 text-sm font-medium text-emerald-950 outline-none"
    />
  )
}

export { BulkStatementImporter }

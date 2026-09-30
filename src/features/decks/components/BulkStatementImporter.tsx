'use client'

import { useId, useState } from 'react'
import { GameButton, GameTextarea } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { useDeckDraftActions } from './DeckDraft'
import { MAX_BULK_STATEMENTS, MAX_STATEMENT_LENGTH, previewBulkStatements, type BulkPreviewItem } from '../lib/bulkStatements'

type BulkStatementImporterProps = {
  deckId: string
  rootId: string
  rootTitle: string
  // The root's current statements: pasted duplicates of them are flagged and skipped.
  existing: readonly string[]
  className?: string
}

const PLACEHOLDER =
  'Paste your notes here with bullets (- or •) or line breaks. Each bullet will become an individual statement.\n\n- Ty thể sản sinh ATP.\n- Ribosome tổng hợp protein.\n1. Khi nhiệt độ tăng, áp suất khí lớn hơn.'

const PROBLEM_LABEL: Record<NonNullable<BulkPreviewItem['problem']>, string> = {
  'too-long': `over ${MAX_STATEMENT_LENGTH} characters`,
  latex: 'LaTeX: use plain text',
  exists: 'already in this root',
}

// "📋 Bulk Add via Notes / Bullets": paste a block of notes, see it split into statements live, then
// import them all into this root at once (createKnowledgeItems). Optimistic: the statements join the
// root at once (deck draft) and the importer closes; the server's tally (created / not drillable /
// skipped) arrives as a notice, and a refusal removes them again. Owner-only (Tree Workshop list and
// the root's manage dialog).
function BulkStatementImporter({ deckId, rootId, rootTitle, existing, className }: BulkStatementImporterProps) {
  const { addStatements } = useDeckDraftActions()
  const textareaId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<{ tone: 'gold' | 'amber'; text: string } | null>(null)

  const preview = previewBulkStatements(text, existing)
  const importable = preview.filter((p) => p.problem === null).map((p) => p.statement)
  const tooMany = importable.length > MAX_BULK_STATEMENTS

  const close = () => {
    setOpen(false)
    setText('')
  }

  const importAll = () => {
    if (importable.length === 0 || tooMany) return
    const statements = importable
    const pasted = text
    setNotice({ tone: 'gold', text: `Adding ${statements.length} ${statements.length === 1 ? 'statement' : 'statements'} to ${rootTitle}…` })
    close()
    void addStatements(deckId, rootId, statements).then((res) => {
      if (!res.success) {
        // Nothing was saved: reopen with the notes so the owner can try again.
        setText(pasted)
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
            {preview.length === 0 ? (
              <p className="text-xs font-semibold text-amber-900/60">
                Nothing parsed yet. Each line or bullet (5+ characters) becomes a statement; empty lines are ignored.
              </p>
            ) : (
              <>
                <p className="font-game text-sm font-bold">
                  Parsed {preview.length} {preview.length === 1 ? 'statement' : 'statements'}
                  {importable.length !== preview.length && ` · ${importable.length} to import`}:
                </p>
                <ol className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {preview.map((item, i) => (
                    <li
                      key={item.statement}
                      className={cn(
                        'flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-sm',
                        item.problem ? 'border-amber-300 bg-amber-50/80 text-amber-900/70' : 'border-emerald-200 bg-white',
                      )}
                    >
                      <span className="font-game text-xs font-bold text-amber-900/50 tabular-nums">#{i + 1}</span>
                      <span className={cn('min-w-0 flex-1 whitespace-pre-wrap', item.problem && 'line-through decoration-amber-500/60')}>{item.statement}</span>
                      {item.problem && <span className="shrink-0 text-[11px] font-bold text-amber-800">⚠️ {PROBLEM_LABEL[item.problem]}</span>}
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
            <GameButton type="button" tone="cream" size="sm" onClick={close}>
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

export { BulkStatementImporter }

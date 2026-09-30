'use client'

import { useId, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent, GameInput, GameLabel, GameTextarea } from '@/shared/components/game'
import { updateKnowledgeItem } from '../actions/updateKnowledgeItem'
import { updateMindmapNode } from '../actions/updateMindmapNode'
import { cleanStatement, LATEX_COMMAND, MAX_STATEMENT_LENGTH, MIN_BULK_STATEMENT_LENGTH } from '../lib/bulkStatements'

// Owner-only editors opened from the hover tools (✏️ Edit) on statements and roots. Both refresh
// the page data in place on save, so the mindmap, lists and drawer show the change at once.

export type StatementToEdit = { id: string; text: string }
export type RootToEdit = { id: string; title: string }

const ROOT_TITLE_MAX = 150

type EditStatementDialogProps = {
  deckId: string
  // The statement being edited, or null when closed.
  statement: StatementToEdit | null
  onClose: () => void
}

function EditStatementDialog({ deckId, statement, onClose }: EditStatementDialogProps) {
  return (
    <GameDialog open={statement !== null} onOpenChange={(open) => !open && onClose()}>
      <GameDialogContent title="✏️ Edit Statement" ribbon="wood" tone="parchment">
        {/* Remount per statement: the draft starts from its current text. */}
        {statement && <StatementForm key={statement.id} deckId={deckId} statement={statement} onClose={onClose} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function StatementForm({ deckId, statement, onClose }: { deckId: string; statement: StatementToEdit; onClose: () => void }) {
  const router = useRouter()
  const inputId = useId()
  const [draft, setDraft] = useState(statement.text)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const clean = cleanStatement(draft)
  const length = [...clean].length
  const problem =
    length < MIN_BULK_STATEMENT_LENGTH
      ? `Use at least ${MIN_BULK_STATEMENT_LENGTH} characters`
      : length > MAX_STATEMENT_LENGTH
        ? `Keep it under ${MAX_STATEMENT_LENGTH} characters`
        : LATEX_COMMAND.test(clean)
          ? 'Use plain text, not LaTeX (no \\commands)'
          : null
  const unchanged = clean === cleanStatement(statement.text)

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (problem || unchanged || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await updateKnowledgeItem({ deckId, itemId: statement.id, text: draft })
      if (!res.success) {
        setError(`${res.error.message}.`)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <GameLabel htmlFor={inputId}>Statement</GameLabel>
        <GameTextarea id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus aria-invalid={problem !== null} />
        <p className="mt-1 text-xs font-semibold text-amber-900/65 tabular-nums" role={problem ? 'status' : undefined}>
          {problem ?? `${length}/${MAX_STATEMENT_LENGTH} characters`}
        </p>
      </div>
      <p className="text-xs text-amber-900/65">Traps are rebuilt from the new text on the next round. Progress on this statement is kept.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <GameButton type="button" tone="cream" onClick={onClose} disabled={isPending}>
          Cancel
        </GameButton>
        <GameButton type="submit" tone="leaf" disabled={problem !== null || unchanged || isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </GameButton>
      </div>
    </form>
  )
}

type EditRootDialogProps = {
  root: RootToEdit | null
  onClose: () => void
}

function EditRootDialog({ root, onClose }: EditRootDialogProps) {
  return (
    <GameDialog open={root !== null} onOpenChange={(open) => !open && onClose()}>
      <GameDialogContent title="✏️ Edit Root" ribbon="wood" tone="parchment">
        {root && <RootForm key={root.id} root={root} onClose={onClose} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function RootForm({ root, onClose }: { root: RootToEdit; onClose: () => void }) {
  const router = useRouter()
  const inputId = useId()
  const [title, setTitle] = useState(root.title)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const trimmed = title.trim()
  const invalid = trimmed.length === 0 || trimmed.length > ROOT_TITLE_MAX
  const unchanged = trimmed === root.title.trim()

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (invalid || unchanged || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await updateMindmapNode({ nodeId: root.id, title })
      if (!res.success) {
        setError(`${res.error.message}.`)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <GameLabel htmlFor={inputId}>Root name</GameLabel>
        <GameInput id={inputId} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ROOT_TITLE_MAX} required autoFocus />
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <GameButton type="button" tone="cream" onClick={onClose} disabled={isPending}>
          Cancel
        </GameButton>
        <GameButton type="submit" tone="leaf" disabled={invalid || unchanged || isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </GameButton>
      </div>
    </form>
  )
}

export { EditRootDialog, EditStatementDialog }

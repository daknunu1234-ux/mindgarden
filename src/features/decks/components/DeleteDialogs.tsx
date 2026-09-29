'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent } from '@/shared/components/game'
import { deleteKnowledgeItem } from '../actions/deleteKnowledgeItem'
import { deleteRootBranch } from '../actions/deleteRootBranch'

// Owner-only confirmations for deleting a statement or a whole root branch. Both refresh the
// page data in place on success: the mindmap re-lays out, a drawer showing a deleted root closes
// by itself, and the launch pop-up's question counts follow.

export type StatementToDelete = { id: string; text: string }
export type RootToDelete = { id: string; title: string; statements: number; subRoots: number }

type ConfirmProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<{ success: boolean; error?: { message: string } }>
  onClose: (deleted: boolean) => void
}

function ConfirmDelete({ open, title, children, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const confirm = () => {
    setError(null)
    startTransition(async () => {
      const res = await onConfirm()
      if (!res.success) {
        setError(`${res.error?.message ?? 'Something went wrong'}.`)
        return
      }
      onClose(true)
      router.refresh()
    })
  }

  return (
    <GameDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) {
          setError(null)
          onClose(false)
        }
      }}
    >
      <GameDialogContent title={title} ribbon="danger" tone="parchment">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-[20px] border-[2.5px] border-[#f5a3a3] bg-gradient-to-b from-[#fff5f5] to-[#ffe1e1] p-3.5 text-sm text-[#7f1d1d] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_4px_0_#f08c8c]">
            <span aria-hidden className="text-3xl leading-none">
              ⚠️
            </span>
            <div className="min-w-0 space-y-1.5">{children}</div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-amber-900">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <GameButton
              type="button"
              tone="cream"
              onClick={() => {
                setError(null)
                onClose(false)
              }}
              disabled={isPending}
            >
              Cancel
            </GameButton>
            <GameButton type="button" tone="danger" onClick={confirm} disabled={isPending} autoFocus>
              {isPending ? 'Deleting…' : confirmLabel}
            </GameButton>
          </div>
        </div>
      </GameDialogContent>
    </GameDialog>
  )
}

type DeleteStatementDialogProps = {
  deckId: string
  // The statement to confirm, or null when closed.
  statement: StatementToDelete | null
  onClose: (deleted: boolean) => void
}

// "Delete Statement": one statement and everyone's progress on it.
function DeleteStatementDialog({ deckId, statement, onClose }: DeleteStatementDialogProps) {
  return (
    <ConfirmDelete
      open={statement !== null}
      title="Delete Statement"
      confirmLabel="Delete Statement"
      onConfirm={() => deleteKnowledgeItem({ deckId, itemId: statement?.id })}
      onClose={onClose}
    >
      <p>Are you sure you want to delete this statement? This cannot be undone.</p>
      {statement && <p className="rounded-xl bg-white/70 px-2.5 py-1.5 font-medium whitespace-pre-wrap text-stone-800">“{statement.text}”</p>}
    </ConfirmDelete>
  )
}

type DeleteRootDialogProps = {
  deckId: string
  root: RootToDelete | null
  onClose: (deleted: boolean) => void
}

// "Delete Root Branch": the root, its sub-roots, all their statements and everyone's progress.
function DeleteRootDialog({ deckId, root, onClose }: DeleteRootDialogProps) {
  const statements = root?.statements ?? 0
  const subRoots = root?.subRoots ?? 0
  return (
    <ConfirmDelete
      open={root !== null}
      title="Delete Root Branch"
      confirmLabel="Delete Root"
      onConfirm={() => deleteRootBranch({ deckId, rootId: root?.id })}
      onClose={onClose}
    >
      <p>
        Are you sure you want to delete <strong className="font-game text-base">‘{root?.title}’</strong>? This will permanently delete{' '}
        {statements === 0 ? 'the root (it has no statements)' : `all ${statements} ${statements === 1 ? 'statement' : 'statements'} inside it and their progress`}
        {subRoots > 0 ? `, along with its ${subRoots} ${subRoots === 1 ? 'sub-root' : 'sub-roots'}` : ''}.
      </p>
      <p className="font-semibold">This cannot be undone.</p>
    </ConfirmDelete>
  )
}

export { DeleteRootDialog, DeleteStatementDialog }

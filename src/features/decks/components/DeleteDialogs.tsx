'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent } from '@/shared/components/game'
import { deleteRootBranch } from '../actions/deleteRootBranch'
import { useDeckDraftActions } from './DeckDraft'

// Owner-only confirmations for deleting a statement or a whole root branch. A statement goes at once
// (the deck draft removes it everywhere and deletes it in the background; an error puts it back with
// a toast). A root branch waits for the server, then refreshes the page data in place: the mindmap
// re-lays out, a drawer showing a deleted root closes by itself, and the launch counts follow.

// subStatements: how many sub-statements go with it (the database cascades them).
export type StatementToDelete = { id: string; text: string; subStatements?: number }
export type RootToDelete = { id: string; title: string; statements: number; subRoots: number }

type ConfirmProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<{ success: boolean; error?: { message: string } }>
  onClose: (deleted: boolean) => void
  // The change is already on screen (optimistic): close at once, no page refresh.
  instant?: boolean
}

function ConfirmDelete({ open, title, children, confirmLabel, onConfirm, onClose, instant = false }: ConfirmProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const confirm = () => {
    setError(null)
    if (instant) {
      void onConfirm()
      onClose(true)
      return
    }
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

// "Delete Statement": one statement, its sub-statements and everyone's progress on them. Confirming
// closes at once: they leave the list, the mindmap and the counts immediately (deck draft).
function DeleteStatementDialog({ statement, onClose }: DeleteStatementDialogProps) {
  const { removeStatement } = useDeckDraftActions()
  return (
    <ConfirmDelete
      open={statement !== null}
      title="Delete Statement"
      confirmLabel="Delete Statement"
      instant
      onConfirm={async () => {
        if (statement) removeStatement(statement)
        return { success: true }
      }}
      onClose={onClose}
    >
      <p>
        Are you sure you want to delete this statement
        {statement?.subStatements
          ? ` and its ${statement.subStatements} ${statement.subStatements === 1 ? 'sub-statement' : 'sub-statements'}`
          : ''}
        ? This cannot be undone.
      </p>
      {statement && <p className="rounded-xl bg-white/70 px-2.5 py-1.5 font-medium whitespace-pre-wrap text-stone-800">“{statement.text}”</p>}
    </ConfirmDelete>
  )
}

// A node of the outline (a root or a statement) with what its branch holds.
export type NodeToDelete = { id: string; text: string; type: 'root' | 'statement'; statements: number; roots: number }

// "Delete": any node of the Tree Workshop's outline, with its whole branch and everyone's progress on
// the statements in it. Goes at once (the deck draft removes it everywhere, the server catches up).
function DeleteNodeDialog({ node, onClose }: { node: NodeToDelete | null; onClose: (deleted: boolean) => void }) {
  const { removeNode } = useDeckDraftActions()
  const parts = node
    ? [node.statements > 0 && `${node.statements} ${node.statements === 1 ? 'statement' : 'statements'}`, node.roots > 0 && `${node.roots} ${node.roots === 1 ? 'sub-root' : 'sub-roots'}`].filter(Boolean)
    : []
  return (
    <ConfirmDelete
      open={node !== null}
      title={node?.type === 'root' ? 'Delete Root' : 'Delete Statement'}
      confirmLabel="Delete"
      instant
      onConfirm={async () => {
        if (node) removeNode({ id: node.id, text: node.text })
        return { success: true }
      }}
      onClose={onClose}
    >
      <p>
        Delete this {node?.type === 'root' ? 'root' : 'statement'}
        {parts.length > 0 ? ` and the ${parts.join(' and ')} under it` : ''}? Everyone&apos;s progress on them goes too. This cannot be undone.
      </p>
      {node && <p className="rounded-xl bg-white/70 px-2.5 py-1.5 font-medium whitespace-pre-wrap text-stone-800">“{node.text}”</p>}
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

export { DeleteNodeDialog, DeleteRootDialog, DeleteStatementDialog }

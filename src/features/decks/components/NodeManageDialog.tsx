'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, PencilLine, ScrollText, Trash2 } from 'lucide-react'
import {
  GameButton,
  GameDialog,
  GameDialogContent,
  GameInput,
  GameLabel,
  GameSlab,
  GameTabs,
  GameTabsContent,
  GameTabsList,
  GameTabsTrigger,
} from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { createMindmapNode } from '../actions/createMindmapNode'
import { updateMindmapNode } from '../actions/updateMindmapNode'
import { BulkStatementImporter } from './BulkStatementImporter'
import { DeleteRootDialog, DeleteStatementDialog, type StatementToDelete } from './DeleteDialogs'
import type { EditorItem } from '../types'

export type ManagedNode = {
  id: string
  title: string
  // Owner-only statement texts (from getDeckEditor); never shown to players.
  statements: EditorItem[]
  childCount: number
  // What deleting the root takes with it: statements and sub-roots in the whole branch.
  branchStatements: number
  subRoots: number
}

type NodeManageDialogProps = {
  deckId: string
  node: ManagedNode | null
  onOpenChange: (open: boolean) => void
}

type Notice = { tone: 'gold' | 'amber'; text: string } | null

// Owner tools for one root, opened from the mindmap, as a tabbed wooden drawer: Statements
// (add / bulk add / delete), Branches (add a sub-branch), Root (rename / delete the whole branch). Every change
// refreshes the page data in place, so the canvas keeps its zoom and pan.
function NodeManageDialog({ deckId, node, onOpenChange }: NodeManageDialogProps) {
  return (
    <GameDialog open={node !== null} onOpenChange={onOpenChange}>
      <GameDialogContent
        title={node ? `✏️ ${node.title}` : 'Manage root'}
        ribbon="wood"
        size="lg"
        description="Changes appear on the mindmap right away."
      >
        {node && <ManageBody key={node.id} deckId={deckId} node={node} onClose={() => onOpenChange(false)} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function ManageBody({ deckId, node, onClose }: { deckId: string; node: ManagedNode; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(node.title)
  const [branch, setBranch] = useState('')
  const [statement, setStatement] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  // Confirmation dialogs (DeleteDialogs): a statement, or this whole root branch.
  const [deleting, setDeleting] = useState<StatementToDelete | null>(null)
  const [deletingRoot, setDeletingRoot] = useState(false)

  // Run an action, show its result, refresh the page data in place.
  const run = (action: () => Promise<{ success: boolean; error?: { message: string } }>, done: string, after?: () => void) => {
    setNotice(null)
    startTransition(async () => {
      const res = await action()
      if (!res.success) {
        setNotice({ tone: 'amber', text: `${res.error?.message ?? 'Something went wrong'}.` })
        return
      }
      setNotice({ tone: 'gold', text: done })
      after?.()
      router.refresh()
    })
  }

  const rename = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim() === node.title) return
    run(() => updateMindmapNode({ nodeId: node.id, title }), 'Renamed ✨')
  }
  const addBranch = (e: FormEvent) => {
    e.preventDefault()
    run(() => createMindmapNode({ deckId, title: branch, parentId: node.id }), 'Sub-branch added 🌿', () => setBranch(''))
  }
  const addStatement = (e: FormEvent) => {
    e.preventDefault()
    setNotice(null)
    startTransition(async () => {
      const res = await createKnowledgeItem({ nodeId: node.id, statement })
      if (!res.success) return setNotice({ tone: 'amber', text: `${res.error.message}.` })
      setStatement('')
      setNotice(
        res.data.drillable
          ? { tone: 'gold', text: 'Statement added. Ready to drill ✨' }
          : { tone: 'amber', text: 'Added, but not drillable yet: add a sibling statement or use a word the trap engine can flip (tăng/giảm, là, is…).' },
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <GameTabs defaultValue="statements" onValueChange={() => setNotice(null)}>
        <GameTabsList>
          <GameTabsTrigger value="statements">
            <ScrollText aria-hidden /> Statements
            <span className="rounded-full bg-black/15 px-1.5 text-xs tabular-nums">{node.statements.length}</span>
          </GameTabsTrigger>
          <GameTabsTrigger value="branches">
            <GitBranch aria-hidden /> Branches
          </GameTabsTrigger>
          <GameTabsTrigger value="root">
            <PencilLine aria-hidden /> Root
          </GameTabsTrigger>
        </GameTabsList>

        <GameTabsContent value="statements" className="space-y-4">
          <form onSubmit={addStatement}>
            <GameLabel htmlFor="manage-statement">Add a statement</GameLabel>
            <div className="flex gap-2">
              <GameInput
                id="manage-statement"
                required
                maxLength={500}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="A true statement, e.g. Ty thể sản sinh ATP."
              />
              <GameButton type="submit" tone="leaf" disabled={isPending || !statement.trim()}>
                Add
              </GameButton>
            </div>
          </form>
          <BulkStatementImporter deckId={deckId} rootId={node.id} rootTitle={node.title} existing={node.statements.map((s) => s.statement)} />

          {node.statements.length === 0 ? (
            <p className="text-center text-sm text-amber-900/65">No statements yet. Add the first one above.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 pb-1">
              {node.statements.map((item, i) => (
                <li key={item.id}>
                  <GameSlab className="flex items-start gap-2 px-3 py-2 text-sm">
                    <span aria-hidden className="pt-0.5" title={item.drillable ? 'Ready to drill' : 'Not drillable yet'}>
                      {item.drillable ? '✅' : '💧'}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">
                      <span className="font-game text-xs font-bold text-amber-900/50">#{i + 1} </span>
                      {item.statement}
                    </span>
                    <GameButton
                      tone="cream"
                      size="icon-sm"
                      aria-label={`Delete statement ${i + 1}`}
                      title="Delete statement"
                      onClick={() => setDeleting({ id: item.id, text: item.statement })}
                    >
                      <Trash2 className="size-4" />
                    </GameButton>
                  </GameSlab>
                </li>
              ))}
            </ul>
          )}
          {node.statements.length > 0 && (
            <p className="text-xs text-amber-900/60">Deleting a statement also deletes everyone&apos;s progress on it.</p>
          )}
        </GameTabsContent>

        <GameTabsContent value="branches" className="space-y-3">
          <form onSubmit={addBranch}>
            <GameLabel htmlFor="manage-branch">Add a sub-branch</GameLabel>
            <div className="flex gap-2">
              <GameInput id="manage-branch" required maxLength={150} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Nhân tế bào" />
              <GameButton type="submit" tone="leaf" disabled={isPending || !branch.trim()}>
                Add
              </GameButton>
            </div>
          </form>
          <p className="text-sm text-amber-900/65">
            {node.childCount === 0
              ? 'No sub-branches yet.'
              : `${node.childCount} ${node.childCount === 1 ? 'sub-branch grows' : 'sub-branches grow'} from this root.`}
          </p>
        </GameTabsContent>

        <GameTabsContent value="root" className="space-y-5">
          <form onSubmit={rename}>
            <GameLabel htmlFor="manage-title">Root name</GameLabel>
            <div className="flex gap-2">
              <GameInput id="manage-title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
              <GameButton type="submit" tone="sun" disabled={isPending || title.trim() === node.title || !title.trim()}>
                Rename
              </GameButton>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-[#f08c8c] bg-[#fff5f5]/70 p-3">
            <p className="min-w-0 flex-1 text-xs text-[#7f1d1d]">
              Deletes this root, {node.subRoots > 0 ? `its ${node.subRoots} ${node.subRoots === 1 ? 'sub-root' : 'sub-roots'}, ` : ''}
              {node.branchStatements} {node.branchStatements === 1 ? 'statement' : 'statements'} and everyone&apos;s progress on them.
            </p>
            <GameButton tone="danger" size="sm" onClick={() => setDeletingRoot(true)}>
              <Trash2 className="size-4" /> Delete Root
            </GameButton>
          </div>
        </GameTabsContent>
      </GameTabs>

      {notice && (
        <p
          role="status"
          className={cn('rounded-xl px-3 py-2 text-sm font-semibold', notice.tone === 'gold' ? 'bg-yellow-100 text-amber-900' : 'bg-orange-100 text-amber-900')}
        >
          {notice.text}
        </p>
      )}

      <div className="flex justify-end">
        <GameButton tone="wood" onClick={onClose}>
          Done
        </GameButton>
      </div>

      <DeleteStatementDialog
        deckId={deckId}
        statement={deleting}
        onClose={(deleted) => {
          setDeleting(null)
          if (deleted) setNotice({ tone: 'gold', text: 'Statement deleted' })
        }}
      />
      <DeleteRootDialog
        deckId={deckId}
        root={deletingRoot ? { id: node.id, title: node.title, statements: node.branchStatements, subRoots: node.subRoots } : null}
        onClose={(deleted) => {
          setDeletingRoot(false)
          // The root is gone: close the manage dialog too (the page refresh removes it from the map).
          if (deleted) onClose()
        }}
      />
    </div>
  )
}

// Top-level root, from the mindmap toolbar.
function AddRootDialog({ deckId, open, onOpenChange }: { deckId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createMindmapNode({ deckId, title, parentId: null })
      if (!res.success) return setError(res.error.message)
      setTitle('')
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <GameDialog open={open} onOpenChange={onOpenChange}>
      <GameDialogContent title="🌱 Add a root" ribbon="leaf" description="A new top-level concept under your tree.">
        <form onSubmit={submit} className="space-y-4">
          <GameLabel htmlFor="add-root-title" className="sr-only">
            Root name
          </GameLabel>
          <GameInput id="add-root-title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ty thể" autoFocus />
          {error && (
            <p role="alert" className="text-sm font-medium text-amber-800">
              {error}.
            </p>
          )}
          <GameButton type="submit" tone="leaf" size="lg" className="w-full" disabled={isPending || !title.trim()}>
            {isPending ? 'Planting…' : 'Plant root'}
          </GameButton>
        </form>
      </GameDialogContent>
    </GameDialog>
  )
}

export { AddRootDialog, NodeManageDialog }

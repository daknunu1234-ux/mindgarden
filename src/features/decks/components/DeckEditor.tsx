'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_FIELD, GameButton, GameInput, GameLabel, GameSlab } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { createMindmapNode } from '../actions/createMindmapNode'
import { updateDeck } from '../actions/updateDeck'
import { flatBranchImpact } from '../lib/branch'
import { BulkStatementImporter } from './BulkStatementImporter'
import { DeleteRootDialog, DeleteStatementDialog, type RootToDelete, type StatementToDelete } from './DeleteDialogs'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'
import type { DeckEditor as DeckEditorData, EditorNode } from '../types'

const DRILL_TIP =
  'Not drillable yet. Add another statement about a sibling concept in this root (e.g. "Ribosome tổng hợp protein."), or use a word the engine can flip, like tăng/giảm, trước/sau, là or is.'

type DeckEditorProps = { editor: DeckEditorData }

// Owner-only: add roots (optionally under another root) and plain-text statements.
// Trap rules are never shown; items get { negate: true } on the server.
function DeckEditor({ editor }: DeckEditorProps) {
  // Confirmation dialogs for 🗑️ a statement / "Delete Root" (a root with its whole branch).
  const [deletingStatement, setDeletingStatement] = useState<StatementToDelete | null>(null)
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null)
  const rootNode = deletingRootId ? editor.nodes.find((n) => n.id === deletingRootId) : undefined
  const impact = deletingRootId ? flatBranchImpact(editor.nodes, deletingRootId) : null
  const rootToDelete: RootToDelete | null = rootNode && impact ? { id: rootNode.id, title: rootNode.title, ...impact } : null

  return (
    <div className="space-y-5">
      <SpeciesForm deckId={editor.deckId} treeType={editor.treeType} />
      <AddRootForm deckId={editor.deckId} nodes={editor.nodes} />
      {editor.nodes.length > 0 && (
        <ul className="space-y-4">
          {editor.nodes.map((node) => (
            <li key={node.id} style={{ marginLeft: `${Math.min(node.depth, 4) * 1.25}rem` }}>
              <NodeEditor deckId={editor.deckId} node={node} onDeleteStatement={setDeletingStatement} onDeleteRoot={() => setDeletingRootId(node.id)} />
            </li>
          ))}
        </ul>
      )}
      <DeleteStatementDialog deckId={editor.deckId} statement={deletingStatement} onClose={() => setDeletingStatement(null)} />
      <DeleteRootDialog deckId={editor.deckId} root={rootToDelete} onClose={() => setDeletingRootId(null)} />
    </div>
  )
}

// Change the tree species; the page refreshes so the scene redraws in the new species.
function SpeciesForm({ deckId, treeType }: { deckId: string; treeType: string }) {
  const router = useRouter()
  const [value, setValue] = useState(treeType)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const change = (next: string) => {
    if (next === value) return
    const previous = value
    setValue(next)
    setError(null)
    startTransition(async () => {
      const res = await updateDeck({ deckId, treeType: next })
      if (!res.success) {
        setValue(previous)
        setError(res.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <GameSlab className="p-4 text-amber-950">
      <TreeSpeciesPicker value={value} onChange={change} disabled={isPending} legend="Tree species" />
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-amber-800">
          {error}.
        </p>
      )}
    </GameSlab>
  )
}

function AddRootForm({ deckId, nodes }: { deckId: string; nodes: EditorNode[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createMindmapNode({ deckId, title, parentId: parentId || null })
      if (!res.success) return setError(res.error.message)
      setTitle('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit}>
    <GameSlab className="p-4 text-amber-950">
      <GameLabel htmlFor="root-title">Add a root</GameLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <GameInput id="root-title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ty thể" className="flex-1" />
        {nodes.length > 0 && (
          <select aria-label="Grow under" value={parentId} onChange={(e) => setParentId(e.target.value)} className={cn(GAME_FIELD, 'h-11 sm:w-48')}>
            <option value="">Top level</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {'  '.repeat(n.depth)}Under: {n.title}
              </option>
            ))}
          </select>
        )}
        <GameButton type="submit" tone="leaf" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add root'}
        </GameButton>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-amber-800">
          {error}.
        </p>
      )}
    </GameSlab>
    </form>
  )
}

type NodeEditorProps = {
  deckId: string
  node: EditorNode
  onDeleteStatement: (statement: StatementToDelete) => void
  onDeleteRoot: () => void
}

function NodeEditor({ deckId, node, onDeleteStatement, onDeleteRoot }: NodeEditorProps) {
  const router = useRouter()
  const [statement, setStatement] = useState('')
  const [notice, setNotice] = useState<{ tone: 'amber' | 'gold'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputId = `statement-${node.id}`

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(null)
    startTransition(async () => {
      const res = await createKnowledgeItem({ nodeId: node.id, statement })
      if (!res.success) return setNotice({ tone: 'amber', text: `${res.error.message}.` })
      setStatement('')
      setNotice(res.data.drillable ? { tone: 'gold', text: 'Added. Ready to drill ✨' } : { tone: 'amber', text: DRILL_TIP })
      router.refresh()
    })
  }

  return (
    <GameSlab tone="leaf" className="p-4 text-emerald-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-game text-lg font-bold">🌱 {node.title}</p>
        <GameButton type="button" tone="danger" size="sm" onClick={onDeleteRoot} aria-label={`Delete root ${node.title}`}>
          🗑️ Delete Root
        </GameButton>
      </div>

      {node.items.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {node.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <span aria-hidden className="pt-0.5">
                {item.drillable ? '✅' : '💧'}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {item.statement}
                {!item.drillable && <span className="sr-only"> (not drillable yet)</span>}
              </span>
              <button
                type="button"
                onClick={() => onDeleteStatement({ id: item.id, text: item.statement })}
                aria-label="Delete statement"
                title="Delete statement"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xs hover:bg-red-100 focus-visible:ring-4 focus-visible:ring-red-300 focus-visible:outline-none"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <GameLabel htmlFor={inputId} className="sr-only">
          New statement for {node.title}
        </GameLabel>
        <GameInput
          id={inputId}
          required
          maxLength={500}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Write a true statement, e.g. Khi nhiệt độ tăng, áp suất khí lớn hơn."
          className="flex-1"
        />
        <GameButton type="submit" tone="cream" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add statement'}
        </GameButton>
      </form>
      {notice && (
        <p role="status" className={notice.tone === 'gold' ? 'mt-2 text-sm font-semibold text-amber-800' : 'mt-2 text-sm text-amber-900'}>
          {notice.text}
        </p>
      )}
      {/* Many at once: paste notes, one statement per bullet / line. */}
      <BulkStatementImporter
        deckId={deckId}
        rootId={node.id}
        rootTitle={node.title}
        existing={node.items.map((i) => i.statement)}
        className="mt-3"
      />
    </GameSlab>
  )
}

export { DeckEditor }

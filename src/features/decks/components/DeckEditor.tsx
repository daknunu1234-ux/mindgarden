'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { createMindmapNode } from '../actions/createMindmapNode'
import type { DeckEditor as DeckEditorData, EditorNode } from '../types'

const DRILL_TIP =
  'Not drillable yet: the trap engine needs a word it can flip, like tăng/giảm, trước/sau, trong/ngoài, là, có, increases/decreases or is.'

type DeckEditorProps = { editor: DeckEditorData }

// Owner-only: add roots (optionally under another root) and plain-text statements.
// Trap rules are never shown; items get { negate: true } on the server.
function DeckEditor({ editor }: DeckEditorProps) {
  return (
    <div className="space-y-6">
      <AddRootForm deckId={editor.deckId} nodes={editor.nodes} />
      {editor.nodes.length > 0 && (
        <ul className="space-y-4">
          {editor.nodes.map((node) => (
            <li key={node.id} style={{ marginLeft: `${Math.min(node.depth, 4) * 1.25}rem` }}>
              <NodeEditor node={node} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <form onSubmit={submit} className="rounded-xl border bg-card p-4">
      <Label htmlFor="root-title">Add a root</Label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="root-title"
          required
          maxLength={150}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ty thể"
          className="flex-1"
        />
        {nodes.length > 0 && (
          <select
            aria-label="Grow under"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">Top level</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {'  '.repeat(n.depth)}Under: {n.title}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add root'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-800">
          {error}.
        </p>
      )}
    </form>
  )
}

function NodeEditor({ node }: { node: EditorNode }) {
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
    <div className="rounded-xl border border-dashed bg-amber-50/40 p-4">
      <p className="font-medium text-amber-950">{node.title}</p>

      {node.items.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {node.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <span aria-hidden className="pt-0.5">
                {item.drillable ? '✅' : '💧'}
              </span>
              <span className="whitespace-pre-wrap">
                {item.statement}
                {!item.drillable && <span className="sr-only"> (not drillable yet)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Label htmlFor={inputId} className="sr-only">
          New statement for {node.title}
        </Label>
        <Input
          id={inputId}
          required
          maxLength={500}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Write a true statement, e.g. Khi nhiệt độ tăng, áp suất khí lớn hơn."
          className="flex-1 bg-background"
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add statement'}
        </Button>
      </form>
      {notice && (
        <p role="status" className={notice.tone === 'gold' ? 'mt-2 text-sm text-yellow-800' : 'mt-2 text-sm text-amber-800'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}

export { DeckEditor }

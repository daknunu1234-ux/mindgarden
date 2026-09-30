'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useToast } from '@/shared/stores/ToastProvider'
import {
  branchImpact,
  DeleteRootDialog,
  DeleteStatementDialog,
  EditRootDialog,
  EditStatementDialog,
  isPendingItemId,
  NodeManageDialog,
  type DeckEditorData,
  type DeckTreeNode,
  type ManagedNode,
  type RootToDelete,
  type RootToEdit,
  type StatementToDelete,
  type StatementToEdit,
  useDeckDraftActions,
} from '@/features/decks'
import { useSessionLaunch } from '@/features/drill'
import {
  RootMap,
  type ItemLevels,
  type MindmapAuthoring,
  type MindmapOwnerTools,
  type MindmapPractice,
  type StatementStatus,
} from '@/features/mindmap'

type DeckRootsPanelProps = {
  deckId: string
  treeType: string
  tree: DeckTreeNode[]
  levels: ItemLevels
  // Owner-only editor data (statement texts); null for everyone else, who only inspect.
  editor: DeckEditorData | null
  // Root practice opens the page's launch pop-up (drill's SessionLaunchProvider): 'drill' for the
  // owner, 'compete' for a Mind Tournament contestant, null for a read-only visitor (clone to
  // practise). statements (item id → text): the owner's own texts or, for visitors, the shared tree's.
  practiceMode: MindmapPractice['mode'] | null
  statements?: Readonly<Record<string, string>>
  surface: { width: number; height: number; baseX: number; baseY: number; content: ReactNode }
  emptyLabel: string
}

// Route-level composition: the mindmap canvas (mindmap feature) + owner tools (decks feature).
// Everything the owner types on the canvas (roots, sub-roots, statements, renames) goes through the
// page's deck draft (optimistic): it shows at once, the canvas keeps its camera and re-lays out, and
// the server catches up in the background. Root deletes still refresh page data in place.
export function DeckRootsPanel({
  deckId,
  treeType,
  tree,
  levels,
  editor,
  practiceMode,
  statements,
  surface,
  emptyLabel,
}: DeckRootsPanelProps) {
  const [manageId, setManageId] = useState<string | null>(null)
  // Owner deletes from the root drawer (decks' confirmation dialogs). A deleted root that is open in
  // the drawer or the manage dialog closes by itself after the refresh (its id no longer resolves).
  const [deletingStatement, setDeletingStatement] = useState<StatementToDelete | null>(null)
  const [editingStatement, setEditingStatement] = useState<StatementToEdit | null>(null)
  const [editingRoot, setEditingRoot] = useState<RootToEdit | null>(null)
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null)
  const launch = useSessionLaunch()
  const { toast } = useToast()
  // Statements and roots still saving (deck draft) have no server id yet: their edit / delete wait for it.
  const { isPending, addNode, addStatement, renameNode, resolveId } = useDeckDraftActions()
  const practice: MindmapPractice | null = useMemo(
    () => (practiceMode && launch ? { mode: practiceMode, onPractice: (request) => launch.open(request) } : null),
    [practiceMode, launch],
  )

  const childCount = useMemo(() => {
    const counts = new Map<string, number>()
    const walk = (nodes: DeckTreeNode[]) =>
      nodes.forEach((n) => {
        counts.set(n.id, n.children.length)
        walk(n.children)
      })
    walk(tree)
    return counts
  }, [tree])

  // Rebuilt from fresh props after every refresh, so the dialog shows the latest statements.
  const managed: ManagedNode | null = useMemo(() => {
    const node = manageId ? editor?.nodes.find((n) => n.id === manageId) : undefined
    if (!node) return null
    const impact = branchImpact(tree, node.id)
    return {
      id: node.id,
      title: node.title,
      statements: node.items,
      childCount: childCount.get(node.id) ?? 0,
      branchStatements: impact?.statements ?? node.items.length,
      subRoots: impact?.subRoots ?? 0,
    }
  }, [manageId, editor, childCount, tree])

  const ownerTools: MindmapOwnerTools | undefined = useMemo(
    () =>
      editor
        ? {
            onEditStatement: (s: StatementToEdit) => !isPending(s.id) && setEditingStatement(s),
            onDeleteStatement: (s: StatementToDelete) => !isPending(s.id) && setDeletingStatement(s),
            onEditRoot: (r: RootToEdit) => !isPending(r.id) && setEditingRoot(r),
            onDeleteRoot: (id: string) => !isPending(id) && setDeletingRootId(id),
          }
        : undefined,
    [editor, isPending],
  )

  // Fast entry on the canvas. A refused statement comes back out of the map with a toast (the text
  // is in the message, so nothing typed is lost); roots and renames toast from the deck draft.
  const authoring: MindmapAuthoring | undefined = useMemo(
    () =>
      editor
        ? {
            addRoot: (title) => addNode(null, title),
            addBranch: (parentId, title) => addNode(parentId, title),
            addStatement: (nodeId, text) =>
              void addStatement(nodeId, text).then((res) => {
                if (!res.success) toast({ message: `Could not add “${text}”: ${res.message}.`, icon: '⚠️', tone: 'farewell' })
              }),
            renameRoot: renameNode,
            isPending,
            resolveId,
          }
        : undefined,
    [editor, addNode, addStatement, renameNode, isPending, resolveId, toast],
  )

  // Owner micro-badges: ⏳ still saving, 💧 saved but the trap engine can't quiz it yet.
  const itemStatus = useMemo(() => {
    if (!editor) return undefined
    const out: Record<string, StatementStatus> = {}
    for (const node of editor.nodes)
      for (const item of node.items) {
        if (isPendingItemId(item.id)) out[item.id] = 'saving'
        else if (!item.drillable) out[item.id] = 'not-drillable'
      }
    return out
  }, [editor])

  const rootToDelete: RootToDelete | null = useMemo(() => {
    if (!deletingRootId) return null
    const title = editor?.nodes.find((n) => n.id === deletingRootId)?.title
    const impact = branchImpact(tree, deletingRootId)
    return title && impact ? { id: deletingRootId, title, ...impact } : null
  }, [deletingRootId, editor, tree])

  return (
    <>
      <RootMap
        nodes={tree}
        levels={levels}
        treeType={treeType}
        surface={surface}
        emptyLabel={emptyLabel}
        onManage={editor ? (id) => !isPending(id) && setManageId(id) : undefined}
        ownerTools={ownerTools}
        authoring={authoring}
        itemStatus={itemStatus}
        practice={practice}
        statements={statements}
      />
      {editor && (
        <>
          <NodeManageDialog deckId={deckId} node={managed} onOpenChange={(open) => !open && setManageId(null)} />
          <EditStatementDialog deckId={deckId} statement={editingStatement} onClose={() => setEditingStatement(null)} />
          <EditRootDialog root={editingRoot} onClose={() => setEditingRoot(null)} />
          <DeleteStatementDialog deckId={deckId} statement={deletingStatement} onClose={() => setDeletingStatement(null)} />
          <DeleteRootDialog deckId={deckId} root={rootToDelete} onClose={() => setDeletingRootId(null)} />
        </>
      )}
    </>
  )
}

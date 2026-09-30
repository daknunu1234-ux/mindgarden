'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AddRootDialog,
  branchImpact,
  DeleteRootDialog,
  DeleteStatementDialog,
  EditRootDialog,
  EditStatementDialog,
  NodeManageDialog,
  type DeckEditorData,
  type DeckTreeNode,
  type ManagedNode,
  type RootToDelete,
  type RootToEdit,
  type StatementToDelete,
  type StatementToEdit,
} from '@/features/decks'
import { useSessionLaunch } from '@/features/drill'
import { RootMap, type ItemLevels, type MindmapOwnerTools, type MindmapPractice } from '@/features/mindmap'

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
// Manage dialogs refresh page data in place, so the canvas keeps its camera and re-lays out.
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
  const [addRootOpen, setAddRootOpen] = useState(false)
  // Owner deletes from the root drawer (decks' confirmation dialogs). A deleted root that is open in
  // the drawer or the manage dialog closes by itself after the refresh (its id no longer resolves).
  const [deletingStatement, setDeletingStatement] = useState<StatementToDelete | null>(null)
  const [editingStatement, setEditingStatement] = useState<StatementToEdit | null>(null)
  const [editingRoot, setEditingRoot] = useState<RootToEdit | null>(null)
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null)
  const launch = useSessionLaunch()
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
        ? { onEditStatement: setEditingStatement, onDeleteStatement: setDeletingStatement, onEditRoot: setEditingRoot, onDeleteRoot: setDeletingRootId }
        : undefined,
    [editor],
  )
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
        onManage={editor ? setManageId : undefined}
        ownerTools={ownerTools}
        onAddRoot={editor ? () => setAddRootOpen(true) : undefined}
        practice={practice}
        statements={statements}
      />
      {editor && (
        <>
          <NodeManageDialog deckId={deckId} node={managed} onOpenChange={(open) => !open && setManageId(null)} />
          <AddRootDialog deckId={deckId} open={addRootOpen} onOpenChange={setAddRootOpen} />
          <EditStatementDialog deckId={deckId} statement={editingStatement} onClose={() => setEditingStatement(null)} />
          <EditRootDialog root={editingRoot} onClose={() => setEditingRoot(null)} />
          <DeleteStatementDialog deckId={deckId} statement={deletingStatement} onClose={() => setDeletingStatement(null)} />
          <DeleteRootDialog deckId={deckId} root={rootToDelete} onClose={() => setDeletingRootId(null)} />
        </>
      )}
    </>
  )
}

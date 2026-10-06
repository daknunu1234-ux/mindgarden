'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AddRootDialog,
  branchImpact,
  DeleteRootDialog,
  DeleteStatementDialog,
  EditRootDialog,
  EditStatementDialog,
  MoveStatementDialog,
  NodeManageDialog,
  type DeckEditorData,
  type DeckTreeNode,
  type ManagedNode,
  type RootToDelete,
  type RootToEdit,
  type StatementToDelete,
  type StatementToEdit,
  type StatementToMove,
  useDeckDraftActions,
} from '@/features/decks'
import { useSessionLaunch } from '@/features/drill'
import { RootChart, type ItemLevels, type MindmapOwnerTools, type MindmapPractice } from '@/features/mindmap'

type DeckRootsPanelProps = {
  deckId: string
  // The tree's name and growth stage, shown on the floating label beside the tree.
  title: string
  stageLabel?: string
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
  // The tree's drawing, standing free at the top of the chart, and where its trunk meets the ground
  // (fractions of the drawing's box).
  surface: { content: ReactNode; base?: { x: number; y: number } }
  emptyLabel: string
}

// Route-level composition: the "Tree & roots" chart (mindmap feature) + owner tools (decks feature).
// The chart is a zoomable, pannable canvas: every root and sub-root is a compact card under the
// tree, and a root's statements open in the chart's side drawer (never on the canvas). New statements
// come through the page's deck draft (optimistic), so counts and badges update at once and the camera
// stays where it is; renames, sub-branches and deletes still refresh page data in place.
export function DeckRootsPanel({
  deckId,
  title,
  stageLabel,
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
  const [movingStatement, setMovingStatement] = useState<StatementToMove | null>(null)
  const [editingRoot, setEditingRoot] = useState<RootToEdit | null>(null)
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null)
  const launch = useSessionLaunch()
  // Statements still saving (deck draft) have no server id yet: their edit / delete wait for it.
  const { isPending, toggleType } = useDeckDraftActions()
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
            onMoveStatement: (s: StatementToMove) => !isPending(s.id) && setMovingStatement(s),
            // ⇄ root ↔ statement in place (a top-level root stays a root: the drawer and cards hide it there).
            onToggleType: (n: { id: string }) => !isPending(n.id) && toggleType(n.id),
            onEditRoot: setEditingRoot,
            onDeleteRoot: setDeletingRootId,
          }
        : undefined,
    [editor, isPending, toggleType],
  )
  const rootToDelete: RootToDelete | null = useMemo(() => {
    if (!deletingRootId) return null
    const title = editor?.nodes.find((n) => n.id === deletingRootId)?.title
    const impact = branchImpact(tree, deletingRootId)
    return title && impact ? { id: deletingRootId, title, ...impact } : null
  }, [deletingRootId, editor, tree])

  return (
    <>
      <RootChart
        nodes={tree}
        levels={levels}
        treeType={treeType}
        title={title}
        stageLabel={stageLabel}
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
          <MoveStatementDialog nodes={editor.nodes} statement={movingStatement} onClose={() => setMovingStatement(null)} />
          <DeleteRootDialog deckId={deckId} root={rootToDelete} onClose={() => setDeletingRootId(null)} />
        </>
      )}
    </>
  )
}

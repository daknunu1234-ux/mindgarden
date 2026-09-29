'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { AddRootDialog, NodeManageDialog, type DeckEditorData, type DeckTreeNode, type ManagedNode } from '@/features/decks'
import { useSessionLaunch } from '@/features/drill'
import { RootMap, type ItemLevels, type MindmapPractice } from '@/features/mindmap'

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
    return node ? { id: node.id, title: node.title, statements: node.items, childCount: childCount.get(node.id) ?? 0 } : null
  }, [manageId, editor, childCount])

  return (
    <>
      <RootMap
        nodes={tree}
        levels={levels}
        treeType={treeType}
        surface={surface}
        emptyLabel={emptyLabel}
        onManage={editor ? setManageId : undefined}
        onAddRoot={editor ? () => setAddRootOpen(true) : undefined}
        practice={practice}
        statements={statements}
      />
      {editor && (
        <>
          <NodeManageDialog deckId={deckId} node={managed} onOpenChange={(open) => !open && setManageId(null)} />
          <AddRootDialog deckId={deckId} open={addRootOpen} onOpenChange={setAddRootOpen} />
        </>
      )}
    </>
  )
}

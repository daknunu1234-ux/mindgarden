'use client'

import { FolderInput } from 'lucide-react'
import { GameDialog, GameDialogContent } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { useDeckDraftActions } from './DeckDraft'
import type { EditorNode } from '../types'

// The statement being moved: where it is now, and whether it is a sub-statement (moving it to its
// own root just un-nests it) or carries sub-statements along.
export type StatementToMove = { id: string; text: string; nodeId: string; isSubStatement: boolean; subStatements: number }

type MoveStatementDialogProps = {
  // Every root and sub-root of the tree, flattened in tree order with depths (the editor list).
  nodes: readonly EditorNode[]
  statement: StatementToMove | null
  onClose: () => void
}

// "📂 Move to…": a compact list of the tree's roots and sub-roots. Picking one moves the statement
// (and its sub-statements) there at once through the deck draft; the server catches up in the
// background and a refusal puts it back with a toast. Owner only.
function MoveStatementDialog({ nodes, statement, onClose }: MoveStatementDialogProps) {
  const { moveStatement, isPending } = useDeckDraftActions()
  return (
    <GameDialog open={statement !== null} onOpenChange={(open) => !open && onClose()}>
      <GameDialogContent title="📂 Move Statement" ribbon="wood" tone="parchment">
        {statement && (
          <div className="space-y-3 text-amber-950">
            <p className="line-clamp-3 rounded-xl border-2 border-amber-900/15 bg-white/80 px-3 py-2 text-sm font-semibold">{statement.text}</p>
            <p className="text-xs text-amber-900/70">
              Pick its new root. It goes last there
              {statement.subStatements > 0 && `, with its ${statement.subStatements} ${statement.subStatements === 1 ? 'sub-statement' : 'sub-statements'}`}
              {statement.isSubStatement && ' as a statement of its own'}. Everyone&apos;s progress on it is kept.
            </p>
            <ul role="listbox" aria-label="Move to root" className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {nodes.map((node) => {
                const here = node.id === statement.nodeId
                // A statement already in this root can't move here; a sub-statement can (it un-nests).
                const disabled = (here && !statement.isSubStatement) || isPending(node.id)
                return (
                  <li key={node.id} role="option" aria-selected={here} aria-disabled={disabled}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        moveStatement({ id: statement.id, text: statement.text }, node.id)
                        onClose()
                      }}
                      style={{ paddingLeft: `${0.5 + node.depth * 1.1}rem` }}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none',
                        disabled ? 'cursor-not-allowed text-amber-900/40' : 'hover:bg-emerald-100',
                        here && 'bg-amber-100/70',
                      )}
                    >
                      <span aria-hidden className="text-xs">
                        {node.depth === 0 ? '🌱' : '🌿'}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate', node.depth === 0 ? 'font-game font-extrabold' : 'font-semibold')}>{node.title}</span>
                      {here ? (
                        <span className="shrink-0 text-[10px] font-bold text-amber-800">{statement.isSubStatement ? 'make it a statement here' : 'current'}</span>
                      ) : (
                        <FolderInput aria-hidden className="size-3.5 shrink-0 text-emerald-700/60" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </GameDialogContent>
    </GameDialog>
  )
}

export { MoveStatementDialog }

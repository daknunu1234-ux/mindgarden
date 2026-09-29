'use client'

import Link from 'next/link'
import { GameButton, GameProgressBar } from '@/shared/components/game'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import { cn } from '@/shared/utils/cn'
import { statementTitle } from '../hooks/mindmapLayout'
import { branchItemIds, displayMastery, isMightyRoot } from '../hooks/nodeMastery'
import type { ItemLevels, RootNodeView } from '../types'
import { MasteryRing } from './MasteryRing'

const LEVEL_NAMES = ['Seed', 'Sprout', 'Sapling', 'Mighty Root'] as const

type NodeInspectorProps = {
  node: RootNodeView | null
  levels: ItemLevels
  deckSlug: string
  onOpenChange: (open: boolean) => void
  // Walk into a sub-branch from the drawer.
  onInspect: (nodeId: string) => void
  // Owners only.
  onManage?: (nodeId: string) => void
}

// Side drawer for one root: its statements (prompts only, never the answers), mastery, sub-branches
// and a Practice Branch shortcut. Opening/closing it never touches the canvas camera.
function NodeInspector({ node, levels, deckSlug, onOpenChange, onInspect, onManage }: NodeInspectorProps) {
  return (
    <Sheet open={node !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-l-[5px] border-amber-800 bg-gradient-to-b from-[#fffaf0] to-[#f8e9c8] shadow-[-8px_0_30px_rgba(69,26,3,0.3)] sm:max-w-md"
      >
        {node && <InspectorBody node={node} levels={levels} deckSlug={deckSlug} onInspect={onInspect} onManage={onManage} />}
      </SheetContent>
    </Sheet>
  )
}

function InspectorBody({ node, levels, deckSlug, onInspect, onManage }: Omit<NodeInspectorProps, 'node' | 'onOpenChange'> & { node: RootNodeView }) {
  const mastery = displayMastery(node, levels)
  const mighty = isMightyRoot(mastery)
  const branchCount = branchItemIds(node).length

  return (
    <>
      <SheetHeader className="border-b-[3px] border-amber-950/50 bg-gradient-to-b from-amber-700 to-amber-800 pr-12 text-amber-50 shadow-[inset_0_2px_0_rgba(255,255,255,0.15)]">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-amber-50 p-0.5 shadow-[0_2px_0_#451a03]">
            <MasteryRing value={mastery} mighty={mighty} />
          </span>
          <div className="min-w-0">
            <SheetTitle className="truncate font-game text-xl font-extrabold text-amber-50 [text-shadow:0_2px_0_rgba(69,26,3,0.6)]">
              {node.title}
            </SheetTitle>
            <SheetDescription className="text-amber-100/80">
              {node.items.length} {node.items.length === 1 ? 'statement' : 'statements'}
              {node.children.length > 0 && ` · ${node.children.length} sub-${node.children.length === 1 ? 'branch' : 'branches'}`}
              {mastery !== null && ` · ${Number.isInteger(mastery) ? mastery : mastery.toFixed(1)}/3`}
              {mighty && ' · 💎 Mighty Root'}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {branchCount > 0 ? (
            <GameButton asChild tone="sky">
              <Link href={`/deck/${deckSlug}/drill?nodeId=${node.id}`}>💧 Practice Branch</Link>
            </GameButton>
          ) : (
            <GameButton tone="sky" disabled>
              Nothing to practice yet
            </GameButton>
          )}
          {onManage && (
            <GameButton tone="cream" onClick={() => onManage(node.id)}>
              ✏️ Manage
            </GameButton>
          )}
        </div>
      </SheetHeader>

      <section aria-labelledby="inspector-statements" className="space-y-2.5 p-4">
        <h3 id="inspector-statements" className="font-game text-base font-bold text-amber-950">
          📜 Statements
        </h3>
        {node.items.length === 0 ? (
          <p className="text-sm text-amber-900/60">No statements on this root yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {node.items.map((item, i) => {
              const lvl = Math.min(3, Math.max(0, Math.round(levels[item.id] ?? 0)))
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-2xl border-2 px-3 py-2.5',
                    lvl === 3
                      ? 'border-yellow-400 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-[0_3px_0_#ca8a04,0_0_14px_rgba(234,179,8,0.35)]'
                      : 'border-amber-900/15 bg-white/90 shadow-[0_3px_0_rgba(120,53,15,0.18)]',
                  )}
                >
                  <p className="text-sm font-semibold text-stone-800">{statementTitle(item.prompt, node.title, i + 1)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <GameProgressBar value={lvl} max={3} segments={3} size="sm" tone={lvl === 3 ? 'gold' : 'leaf'} label={`Mastery ${lvl} of 3`} className="w-20" />
                    <span className="font-game text-xs font-bold text-amber-900/70 tabular-nums">
                      {lvl}/3 · {LEVEL_NAMES[lvl]}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-amber-900/60">🔒 The statements themselves stay hidden: you meet them in the drill.</p>
      </section>

      {node.children.length > 0 && (
        <section aria-labelledby="inspector-branches" className="space-y-2.5 border-t-2 border-dashed border-amber-900/15 p-4">
          <h3 id="inspector-branches" className="font-game text-base font-bold text-amber-950">
            🌿 Sub-branches
          </h3>
          <ul className="space-y-2">
            {node.children.map((child) => {
              const m = displayMastery(child, levels)
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onInspect(child.id)}
                    className="flex w-full items-center gap-2 rounded-2xl border-2 border-amber-900/15 bg-white/90 px-2 py-1.5 text-left text-sm shadow-[0_3px_0_rgba(120,53,15,0.18)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:translate-y-0.5 active:shadow-none"
                  >
                    <MasteryRing value={m} mighty={isMightyRoot(m)} />
                    <span className="min-w-0 flex-1 truncate font-game font-bold text-amber-950">{child.title}</span>
                    <span className="font-game text-xs font-bold text-amber-900/60">🔍 {branchItemIds(child).length}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}

export { NodeInspector }

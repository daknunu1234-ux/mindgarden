'use client'

import { useState, type ReactNode } from 'react'
import { GameSlab } from '@/shared/components/game'
import { getTreeSpecies, speciesUpgradeCost, toTreeTypeId, type TreeTypeId } from '@/shared/lib/treeSkins'
import { ContentOutline } from './ContentOutline'
import { useDeckDraftActions } from './DeckDraft'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'
import type { DeckEditor as DeckEditorData } from '../types'

// `settings`: the page's other tree switches (share, tournament), shown in the bar after the species.
// `start`: open on a new root line, focused (a tree just bought and placed).
type DeckEditorProps = { editor: DeckEditorData; settings?: ReactNode; start?: boolean }

// Owner-only Tree Workshop: the tree's outline first (writing is the main job: ContentOutline, one
// multi-level list of roots and statements), then one slim settings bar (species, plus the page's
// share / tournament switches). Every change goes through the deck draft, so it shows at 0 ms and
// saves in the background. Trap rules are never shown; statements get { negate: true } on the server.
function DeckEditor({ editor, settings, start = false }: DeckEditorProps) {
  return (
    <div className="space-y-3">
      <ContentOutline editor={editor} start={start} />
      <TreeSettingsBar treeType={editor.treeType}>{settings}</TreeSettingsBar>
    </div>
  )
}

// The secondary controls in one wrapping row under the outline. Changing the species switches the
// whole page (tree sprite, ribbon, mindmap roots) at once through the deck draft, and the server
// catches up in the background (rolled back with a toast).
// A pricier species (a standard tree → a surreal one) costs the difference: the bar asks first, in
// place, and only then changes it. Cheaper or equal species change at once, free.
function TreeSettingsBar({ treeType, children }: { treeType: string; children?: ReactNode }) {
  const { changeSpecies } = useDeckDraftActions()
  const current = toTreeTypeId(treeType)
  const [asking, setAsking] = useState<TreeTypeId | null>(null)
  // Still an upgrade from the species the tree has now (it may have changed while asking).
  const upgrade = asking ? speciesUpgradeCost(current, asking) : 0
  const pick = (next: TreeTypeId) => {
    if (speciesUpgradeCost(current, next) > 0) return setAsking(next)
    setAsking(null)
    changeSpecies(next)
  }
  return (
    <GameSlab role="group" aria-label="Tree settings" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-amber-950">
      {/* A retired species (e.g. 'sakura') shows as its successor, the one it renders as. */}
      <TreeSpeciesPicker compact value={current} onChange={pick} legend="Species" />
      {children}
      {asking && upgrade > 0 && (
        <p role="status" className="flex basis-full flex-wrap items-center gap-2 rounded-xl bg-amber-100/80 px-2.5 py-1.5 text-xs font-semibold">
          <span>
            Change this tree to {getTreeSpecies(asking).icon} {getTreeSpecies(asking).label} for <strong className="tabular-nums">{upgrade} 🪙</strong>?
          </span>
          <button
            type="button"
            onClick={() => {
              changeSpecies(asking)
              setAsking(null)
            }}
            className="rounded-full border-2 border-emerald-700 bg-emerald-500 px-2.5 leading-5 font-bold text-white hover:bg-emerald-600 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
          >
            Pay {upgrade} 🪙
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="rounded-full border-2 border-amber-800/30 bg-white px-2.5 leading-5 font-bold hover:bg-amber-50 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
          >
            Cancel
          </button>
        </p>
      )}
    </GameSlab>
  )
}

export { DeckEditor }

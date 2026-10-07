'use client'

import { useId, useState } from 'react'
import { GameButton, GameDialog, GameDialogContent, GameInput, GameLabel } from '@/shared/components/game'
import { finishNameEdit, TREE_NAME_MAX } from '@/shared/lib/treeName'
import type { FarmPlotView } from '../types'
import { TreeStageSvg } from './TreeStageSvg'

type TreeNamingDialogProps = {
  // The tree just bought and placed (null = closed). Its title is the suggested name.
  tree: FarmPlotView | null
  // Saving the name / waiting for the placement: the buttons say so and wait.
  busy: boolean
  // "Start growing": the name (cleaned and checked; unchanged when the suggestion was kept). The farm
  // saves it and opens the tree's Workshop.
  onStart: (name: string) => void
  // "Later" / Esc / ✕: the tree stays where it was planted, with its suggested name.
  onLater: () => void
}

// Step 3 of a new tree: it stands on the island; now it gets a name (the suggestion is filled in and
// selected, so typing replaces it and Enter keeps it), then the Tree Workshop opens to grow its first
// roots. Mobile-friendly: one field, two big buttons.
export function TreeNamingDialog({ tree, busy, onStart, onLater }: TreeNamingDialogProps) {
  return (
    <GameDialog open={tree !== null} onOpenChange={(open) => !open && !busy && onLater()}>
      <GameDialogContent title="🌱 Name your tree" ribbon="leaf" tone="leaf" size="sm" showClose={!busy}>
        {/* key: a fresh field for each new tree. */}
        {tree && <NamingForm key={tree.id} tree={tree} busy={busy} onStart={onStart} onLater={onLater} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function NamingForm({ tree, busy, onStart, onLater }: { tree: FarmPlotView; busy: boolean; onStart: (name: string) => void; onLater: () => void }) {
  const [name, setName] = useState(tree.title)
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()
  const submit = () => {
    const outcome = finishNameEdit(tree.title, name)
    if (outcome.kind === 'invalid') return setError(outcome.error)
    onStart(outcome.kind === 'save' ? outcome.name : tree.title)
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) submit()
      }}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-lime-100 px-1.5 pt-3 pb-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)]">
          <TreeStageSvg stage={1} treeType={tree.treeType} label="" className="size-16" />
        </div>
        <p className="text-sm font-semibold text-emerald-950/80">Planted! What will this tree help you learn? You can rename it any time with ✏️.</p>
      </div>
      <div>
        <GameLabel htmlFor={fieldId}>Tree name</GameLabel>
        <GameInput
          id={fieldId}
          // The prompt exists to ask for this name: focus it with the suggestion selected.
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={name}
          maxLength={TREE_NAME_MAX + 20}
          disabled={busy}
          aria-invalid={error !== null}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="mt-1 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <GameButton type="submit" tone="leaf" size="lg" disabled={busy} className="flex-1">
          {busy ? 'Opening the Workshop…' : '🌱 Start growing'}
        </GameButton>
        <GameButton type="button" tone="cream" size="lg" disabled={busy} onClick={onLater}>
          Later
        </GameButton>
      </div>
    </form>
  )
}

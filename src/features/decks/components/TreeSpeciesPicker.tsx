'use client'

import { TREE_SPECIES, type TreeTypeId } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'

type TreeSpeciesPickerProps = {
  value: string
  onChange: (treeType: TreeTypeId) => void
  disabled?: boolean
  legend?: string
}

// Radio cards for every species in the shared catalog (keyboard: Tab to the group, arrows to move).
function TreeSpeciesPicker({ value, onChange, disabled = false, legend = 'Tree' }: TreeSpeciesPickerProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {TREE_SPECIES.map((species) => (
          <label
            key={species.id}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-center text-xs transition-colors sm:text-sm',
              'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-default has-[:disabled]:opacity-60',
              value === species.id ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:border-emerald-300',
            )}
          >
            <input
              type="radio"
              name="treeType"
              value={species.id}
              checked={value === species.id}
              onChange={() => onChange(species.id)}
              className="sr-only"
            />
            <span aria-hidden className="text-2xl sm:text-3xl">
              {species.icon}
            </span>
            {species.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export { TreeSpeciesPicker }

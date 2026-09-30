'use client'

import { TREE_SPECIES, type TreeTypeId } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'

type TreeSpeciesPickerProps = {
  value: string
  onChange: (treeType: TreeTypeId) => void
  disabled?: boolean
  legend?: string
}

// Seed-packet tiles for every species in the shared catalog (radio group: Tab in, arrows to move).
// Each tile is tinted with the species' own canopy colours; the picked one lifts with a gold frame.
function TreeSpeciesPicker({ value, onChange, disabled = false, legend = 'Tree' }: TreeSpeciesPickerProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 font-game text-sm font-bold text-amber-950">{legend}</legend>
      <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3 sm:grid-cols-5">
        {TREE_SPECIES.map((species) => {
          const picked = value === species.id
          return (
            <label
              key={species.id}
              className={cn(
                'relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-[3px] px-1.5 pt-3 pb-2 text-center font-game text-xs leading-tight font-bold text-amber-950 sm:text-sm',
                'transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
                'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-yellow-300 has-[:disabled]:cursor-default has-[:disabled]:opacity-60',
                picked
                  ? 'mg-spring -translate-y-1 border-yellow-400 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-[0_6px_0_#ca8a04,0_0_20px_rgba(250,204,21,0.4)]'
                  : 'border-amber-900/15 bg-gradient-to-b from-white to-amber-50 shadow-[0_4px_0_rgba(120,53,15,0.2)] hover:-translate-y-0.5 hover:border-emerald-400',
              )}
            >
              <input
                type="radio"
                name="treeType"
                value={species.id}
                checked={picked}
                onChange={() => onChange(species.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="flex size-12 items-center justify-center rounded-full border-2 border-white text-3xl shadow-[inset_0_-3px_0_rgba(0,0,0,0.12),0_2px_0_rgba(0,0,0,0.12)] sm:size-14"
                style={{ background: `radial-gradient(circle at 35% 30%, ${species.skin.canopyLight}, ${species.skin.canopyDark})` }}
              >
                {species.icon}
              </span>
              {species.label}
              {picked && (
                <span
                  aria-hidden
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border-2 border-emerald-800 bg-emerald-500 text-xs text-white shadow-[0_2px_0_#065f46]"
                >
                  ✓
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export { TreeSpeciesPicker }

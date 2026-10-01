'use client'

import { SeedPricePill } from '@/shared/components/game'
import { speciesUpgradeCost, TREE_SPECIES, type TreeTypeId } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'

type TreeSpeciesPickerProps = {
  value: string
  onChange: (treeType: TreeTypeId) => void
  disabled?: boolean
  legend?: string
  // One row of small round species buttons (the Tree Workshop's settings bar) instead of seed packets.
  compact?: boolean
  // The player's purse (null / undefined: unknown). A seed it can't pay shows its price tag in the
  // alert tone with a tooltip; the tile stays selectable, so the form can say what is missing.
  coins?: number | null
}

// The same radio group as a single pill row: an icon per species, its name as tooltip and label.
// The tree is already planted here, so only the difference to a pricier species is charged: those
// carry a small "+N" coin badge (the Workshop asks before paying it).
function CompactSpeciesPicker({ value, onChange, disabled, legend }: { value: string; onChange: (treeType: TreeTypeId) => void; disabled: boolean; legend: string }) {
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden className="mr-0.5 font-game text-xs font-bold text-amber-950">
        {legend}
      </span>
      {TREE_SPECIES.map((species) => {
        const picked = value === species.id
        const upgrade = speciesUpgradeCost(value, species.id)
        return (
          <label
            key={species.id}
            title={upgrade > 0 ? `${species.label} · change for ${upgrade} 🪙` : species.label}
            className={cn(
              'relative flex size-8 cursor-pointer items-center justify-center rounded-full border-2 text-base leading-none transition-transform duration-150',
              'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-yellow-300 has-[:disabled]:cursor-default has-[:disabled]:opacity-60',
              picked ? 'scale-110 border-yellow-400 shadow-[0_2px_0_#ca8a04,0_0_0_2px_rgba(250,204,21,0.35)]' : 'border-white opacity-75 hover:scale-105 hover:opacity-100',
            )}
            style={{ background: `radial-gradient(circle at 35% 30%, ${species.skin.canopyLight}, ${species.skin.canopyDark})` }}
          >
            <input type="radio" name="treeType" value={species.id} checked={picked} onChange={() => onChange(species.id)} className="sr-only" />
            <span aria-hidden>{species.icon}</span>
            <span className="sr-only">
              {species.label}
              {upgrade > 0 && `, ${upgrade} coins to change`}
            </span>
            {upgrade > 0 && (
              <span
                aria-hidden
                data-upgrade={upgrade}
                className="absolute -right-2 -bottom-1.5 rounded-full border border-[#8a4a0c] bg-[#ffd76a] px-1 font-game text-[9px] leading-[13px] font-extrabold text-[#5a2a02] tabular-nums"
              >
                +{upgrade}
              </span>
            )}
          </label>
        )
      })}
    </fieldset>
  )
}

// Seed-packet tiles for every species in the shared catalog (radio group: Tab in, arrows to move).
// Each tile is tinted with the species' own canopy colours and carries its seed price; the picked
// one lifts with a gold frame.
function TreeSpeciesPicker({ value, onChange, disabled = false, legend = 'Tree', compact = false, coins }: TreeSpeciesPickerProps) {
  if (compact) return <CompactSpeciesPicker value={value} onChange={onChange} disabled={disabled} legend={legend} />
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 font-game text-sm font-bold text-amber-950">{legend}</legend>
      {/* Rows stretch their cards to one height; each price tag is pinned to its card's bottom edge. */}
      <div className="grid grid-cols-2 items-stretch gap-3 min-[400px]:grid-cols-3 sm:grid-cols-5">
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
              <SeedPricePill price={species.price} coins={coins} className="mt-auto" />
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

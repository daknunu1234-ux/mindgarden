'use client'

import { cn } from '@/shared/utils/cn'
import { DEFAULT_DRILL_SIZE, drillSizeOptions, type DrillSize } from '../lib/drillSize'

type DrillSizeSelectorProps = {
  value: DrillSize
  onChange: (size: DrillSize) => void
  // Questions the round could ask; sizes it can't fill are disabled or badged.
  available: number
  className?: string
}

// Tactile wooden segmented control: "5 💧", "10 💧 (Default)", "20 💧". A radio group, so arrow
// keys move between sizes. A size bigger than the tree shows how many it will really ask.
function DrillSizeSelector({ value, onChange, available, className }: DrillSizeSelectorProps) {
  const options = drillSizeOptions(available)
  return (
    <div
      role="radiogroup"
      aria-label="Questions per round"
      className={cn(
        'inline-flex gap-1 rounded-full border-[3px] border-[#6b3a14] p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_3px_0_#4a2008] [background-image:repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0_2px,transparent_2px_14px),linear-gradient(to_bottom,#b8773a,#8a4f1f)]',
        className,
      )}
    >
      {options.map(({ size, enabled, short }) => {
        const selected = size === value
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!enabled}
            onClick={() => onChange(size)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const enabledSizes = options.filter((o) => o.enabled).map((o) => o.size)
              const at = enabledSizes.indexOf(value)
              const next = enabledSizes[(at + (e.key === 'ArrowRight' ? 1 : enabledSizes.length - 1)) % enabledSizes.length]
              if (next !== undefined) onChange(next)
            }}
            tabIndex={selected ? 0 : -1}
            title={short ? `This tree has only ${Math.max(0, Math.floor(available))} to ask` : undefined}
            className={cn(
              'relative flex items-center gap-1 rounded-full px-3 py-1.5 font-game text-sm font-extrabold whitespace-nowrap transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? '-translate-y-0.5 border-2 border-[#8a5a12] bg-gradient-to-b from-[#fffbe0] to-[#ffd76a] text-[#5a2a02] shadow-[inset_0_2px_0_#fff,0_3px_0_#8a5a12]'
                : 'text-[#fff1d6] [text-shadow:0_1px_0_rgba(69,26,3,0.7)] enabled:hover:-translate-y-0.5',
            )}
          >
            {size} 💧
            {size === DEFAULT_DRILL_SIZE && <span className="text-[10px] font-bold opacity-75">(Default)</span>}
            {short && (
              <span className="rounded-full bg-black/20 px-1.5 text-[10px] font-bold tabular-nums">
                only {Math.max(0, Math.floor(available))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export { DrillSizeSelector }

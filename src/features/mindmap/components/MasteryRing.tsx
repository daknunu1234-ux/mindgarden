import { MAX_MASTERY } from '@/shared/lib/mastery'

const R = 12
const CIRCUMFERENCE = 2 * Math.PI * R

type MasteryRingProps = { value: number | null; mighty: boolean }

// Circular 0–5 mastery meter with the level in the middle ("–" when there is nothing to master).
function MasteryRing({ value, mighty }: MasteryRingProps) {
  const fraction = value === null ? 0 : Math.min(MAX_MASTERY, Math.max(0, value)) / MAX_MASTERY
  const label = value === null ? '–' : Number.isInteger(value) ? String(value) : value.toFixed(1)

  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <circle cx="16" cy="16" r={R} fill="none" strokeWidth="3.5" className="stroke-amber-900/10" />
      <circle
        cx="16"
        cy="16"
        r={R}
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        transform="rotate(-90 16 16)"
        className={mighty ? 'stroke-yellow-500' : 'stroke-emerald-500'}
        style={{ transition: 'stroke-dashoffset 700ms ease' }}
      />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-amber-950 text-[10px] font-semibold tabular-nums"
      >
        {label}
      </text>
    </svg>
  )
}

export { MasteryRing }

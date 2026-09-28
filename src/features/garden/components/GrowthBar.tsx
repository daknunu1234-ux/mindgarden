import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'

type GrowthBarProps = { percent: number; className?: string }

// Deck mastery as a green bar that turns gold once the tree blooms (stage 5, ≥ 90%).
function GrowthBar({ percent, className }: GrowthBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Tree growth"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700', value >= GOLDEN_BLOOM_PERCENT ? 'bg-yellow-500' : 'bg-emerald-500')}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}

export { GrowthBar }

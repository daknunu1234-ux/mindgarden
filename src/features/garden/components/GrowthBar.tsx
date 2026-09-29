import { GameProgressBar } from '@/shared/components/game'
import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'

type GrowthBarProps = { percent: number; className?: string }

// Deck mastery as a leafy capsule gauge that turns gold once the tree blooms (stage 5, ≥ 90%).
// Notches mark the 5 growth stages.
function GrowthBar({ percent, className }: GrowthBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <GameProgressBar
      value={value}
      tone={value >= GOLDEN_BLOOM_PERCENT ? 'gold' : 'leaf'}
      segments={5}
      label="Tree growth"
      caption={`${value}%`}
      className={className}
    />
  )
}

export { GrowthBar }

import { cn } from '@/shared/utils/cn'
import { gaugePercent, notchOffsets } from './gauge'

// Glossy capsule juice-bar: a recessed dark track with a thick cartoon rim, a fluid fill that
// eases to its value with an interior glow and a surface gloss, a travelling shimmer, a bright
// meniscus at the fill's edge, and optional segmented tick notches.

type GaugeTone = 'leaf' | 'gold' | 'sky' | 'fire' | 'berry'

const FILLS: Record<GaugeTone, string> = {
  leaf: 'from-[#b6f36a] via-[#4fd86b] to-[#18a94a] shadow-[inset_0_-3px_0_rgba(6,95,70,0.35),0_0_10px_rgba(74,222,128,0.65)]',
  gold: 'from-[#fff7ae] via-[#fcd34d] to-[#f59e0b] shadow-[inset_0_-3px_0_rgba(180,83,9,0.35),0_0_12px_rgba(250,204,21,0.75)]',
  sky: 'from-[#a5f3fc] via-[#38bdf8] to-[#0284c7] shadow-[inset_0_-3px_0_rgba(7,89,133,0.35),0_0_10px_rgba(56,189,248,0.7)]',
  fire: 'from-[#fde68a] via-[#fb923c] to-[#ea580c] shadow-[inset_0_-3px_0_rgba(154,52,18,0.35),0_0_10px_rgba(251,146,60,0.7)]',
  berry: 'from-[#fbcfe8] via-[#fb7185] to-[#e11d48] shadow-[inset_0_-3px_0_rgba(159,18,57,0.35),0_0_10px_rgba(251,113,133,0.7)]',
}

type GameProgressBarProps = {
  value: number
  max?: number
  tone?: GaugeTone
  // Number of equal segments to mark with notches (0/1 = none).
  segments?: number
  size?: 'sm' | 'md' | 'lg'
  label: string
  // Text inside the capsule (e.g. "120 / 175 XP").
  caption?: string
  className?: string
}

const HEIGHTS = { sm: 'h-3.5', md: 'h-6', lg: 'h-8' }

function GameProgressBar({ value, max = 100, tone = 'leaf', segments = 0, size = 'md', label, caption, className }: GameProgressBarProps) {
  const pct = gaugePercent(value, max)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      className={cn(
        'relative overflow-hidden rounded-full border-[2.5px] border-[#3b2412]/70 bg-gradient-to-b from-[#2a1a10]/55 to-[#4a2e1c]/35 p-[2px] shadow-[inset_0_3px_4px_rgba(0,0,0,0.35),0_2px_0_rgba(255,255,255,0.5)]',
        HEIGHTS[size],
        className,
      )}
    >
      <div
        className={cn(
          'relative h-full overflow-hidden rounded-full bg-gradient-to-b transition-[width] duration-700 ease-[cubic-bezier(.22,1.3,.36,1)]',
          FILLS[tone],
        )}
        style={{ width: `${pct}%`, minWidth: pct > 0 ? '0.9rem' : 0 }}
      >
        {/* Surface gloss, specular streak, travelling shimmer and the bright meniscus edge. */}
        <span aria-hidden className="absolute inset-x-1.5 top-[1px] h-[42%] rounded-full bg-gradient-to-b from-white/75 to-white/10" />
        <span aria-hidden className="absolute top-[22%] left-2 h-[18%] w-[18%] max-w-6 rounded-full bg-white/80" />
        <span aria-hidden className="mg-shimmer absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        {pct > 0 && pct < 100 && <span aria-hidden className="absolute inset-y-[12%] right-0 w-[3px] rounded-full bg-white/70" />}
      </div>
      {notchOffsets(segments).map((left) => (
        <span
          key={left}
          aria-hidden
          className="absolute inset-y-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[#3b2412]/35 shadow-[1px_0_0_rgba(255,255,255,0.35)]"
          style={{ left: `${left}%` }}
        />
      ))}
      {caption && (
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-game text-[11px] leading-none font-extrabold tracking-wide tabular-nums',
            // Centered text: light on the fill, dark on the bare track.
            pct >= 50 ? 'text-white [text-shadow:0_1.5px_0_rgba(0,0,0,0.5)]' : 'text-white/90 [text-shadow:0_1.5px_0_rgba(0,0,0,0.6)]',
          )}
        >
          {caption}
        </span>
      )}
    </div>
  )
}

export { GameProgressBar }

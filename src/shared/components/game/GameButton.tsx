import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/shared/utils/cn'

// Chunky tactile toy button: a thick cartoon border, a mechanical 3D bevel underneath
// (shadow-[0_6px_0_…]), a specular top rim (inset 0 2px 0 white), an interior gloss dome, and a
// bouncy recoil (sinks 6px on press, springs back on release). Server-safe (no hooks).

export type GameTone = 'leaf' | 'sun' | 'sky' | 'wood' | 'clay' | 'cream' | 'berry' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

// Every tone: top-rim specular (inset 0 2px 0 white/45), inner bottom shade, 6px bevel + soft drop.
// Class strings stay literal so Tailwind's scanner picks them up.
const TONES: Record<GameTone, string> = {
  leaf: 'border-[#0b6b3a] bg-gradient-to-b from-[#6ee7a0] via-[#34c774] to-[#16a34a] text-white [text-shadow:0_2px_0_rgba(6,78,59,0.55)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(6,95,70,0.35),0_6px_0_#0b6b3a,0_10px_16px_rgba(6,78,59,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(6,95,70,0.35),0_0_0_#0b6b3a,0_2px_4px_rgba(6,78,59,0.3)] focus-visible:ring-emerald-300',
  sun: 'border-[#b45309] bg-gradient-to-b from-[#fff3a3] via-[#fcd34d] to-[#f59e0b] text-[#5a2a02] [text-shadow:0_1px_0_rgba(255,255,255,0.55)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(180,83,9,0.3),0_6px_0_#b45309,0_10px_16px_rgba(180,83,9,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(180,83,9,0.3),0_0_0_#b45309,0_2px_4px_rgba(180,83,9,0.3)] focus-visible:ring-yellow-200',
  sky: 'border-[#075985] bg-gradient-to-b from-[#7dd3fc] via-[#38bdf8] to-[#0284c7] text-white [text-shadow:0_2px_0_rgba(12,74,110,0.55)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(7,89,133,0.35),0_6px_0_#075985,0_10px_16px_rgba(7,89,133,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(7,89,133,0.35),0_0_0_#075985,0_2px_4px_rgba(7,89,133,0.3)] focus-visible:ring-sky-300',
  wood: 'border-[#5a2a0c] bg-gradient-to-b from-[#e0954a] via-[#c26b28] to-[#9a4a17] text-[#fff7e6] [text-shadow:0_2px_0_rgba(69,26,3,0.6)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(69,26,3,0.3),0_6px_0_#5a2a0c,0_10px_16px_rgba(69,26,3,0.4)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(69,26,3,0.3),0_0_0_#5a2a0c,0_2px_4px_rgba(69,26,3,0.35)] focus-visible:ring-amber-300',
  clay: 'border-[#9a2d0a] bg-gradient-to-b from-[#fdba74] via-[#fb7a3c] to-[#ea580c] text-white [text-shadow:0_2px_0_rgba(124,45,18,0.55)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(154,52,18,0.3),0_6px_0_#9a2d0a,0_10px_16px_rgba(154,52,18,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(154,52,18,0.3),0_0_0_#9a2d0a,0_2px_4px_rgba(154,52,18,0.3)] focus-visible:ring-orange-300',
  berry: 'border-[#9f1239] bg-gradient-to-b from-[#fda4af] via-[#fb7185] to-[#e11d48] text-white [text-shadow:0_2px_0_rgba(136,19,55,0.55)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(159,18,57,0.3),0_6px_0_#9f1239,0_10px_16px_rgba(159,18,57,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(159,18,57,0.3),0_0_0_#9f1239,0_2px_4px_rgba(159,18,57,0.3)] focus-visible:ring-rose-300',
  // Destructive actions only (e.g. uprooting a tree): crimson with a deep red bevel.
  danger: 'border-[#7f1d1d] bg-gradient-to-b from-[#fca5a5] via-[#ef4444] to-[#b91c1c] text-white [text-shadow:0_2px_0_rgba(127,29,29,0.6)] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_0_rgba(127,29,29,0.3),0_5px_0_#991b1b,0_10px_16px_rgba(127,29,29,0.35)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(127,29,29,0.3),0_0_0_#991b1b,0_2px_4px_rgba(127,29,29,0.3)] focus-visible:ring-red-300',
  cream: 'border-[#b98a5a] bg-gradient-to-b from-white via-[#fffaf0] to-[#f6e3c3] text-[#5a2a0c] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),inset_0_-4px_0_rgba(185,138,90,0.25),0_6px_0_#b98a5a,0_10px_16px_rgba(120,53,15,0.2)] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.9),inset_0_-2px_0_rgba(185,138,90,0.25),0_0_0_#b98a5a,0_2px_4px_rgba(120,53,15,0.2)] focus-visible:ring-amber-200',
}

const SIZES: Record<Size, string> = {
  sm: 'h-10 rounded-[14px] border-[2.5px] px-3.5 text-sm',
  md: 'h-12 rounded-[18px] border-[3px] px-5 text-base',
  lg: 'h-[58px] rounded-[22px] border-[3px] px-7 text-lg',
  icon: 'size-12 rounded-[18px] border-[3px] text-lg',
  'icon-sm': 'size-10 rounded-[14px] border-[2.5px] text-base',
}

type GameButtonProps = React.ComponentProps<'button'> & { tone?: GameTone; size?: Size; asChild?: boolean }

function GameButton({ tone = 'leaf', size = 'md', asChild = false, className, children, ...props }: GameButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="game-button"
      className={cn(
        'group/gb relative isolate inline-flex shrink-0 items-center justify-center gap-2 font-game leading-none font-extrabold tracking-wide whitespace-nowrap select-none',
        // Bouncy recoil: lifts on hover, sinks onto its bevel when pressed, overshoots back.
        'transition-[transform,box-shadow,filter] duration-200 ease-[cubic-bezier(.34,1.8,.64,1)]',
        'hover:-translate-y-0.5 hover:brightness-[1.07] active:translate-y-1.5 active:scale-[0.98] active:duration-75',
        'focus-visible:ring-4 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-55 disabled:saturate-[0.35] aria-disabled:pointer-events-none aria-disabled:opacity-55',
        // Interior gloss dome across the top (above the fill, under the label).
        'before:pointer-events-none before:absolute before:inset-x-[8%] before:top-[3px] before:-z-10 before:h-[42%] before:rounded-[999px] before:bg-gradient-to-b before:from-white/60 before:to-white/5',
        // Tiny specular dot at the top-left, like a glossy toy.
        'after:pointer-events-none after:absolute after:top-[5px] after:left-[9%] after:-z-10 after:size-1.5 after:rounded-full after:bg-white/80',
        '[&_svg]:pointer-events-none [&_svg]:relative [&_svg]:shrink-0 [&_svg]:drop-shadow-[0_1.5px_0_rgba(0,0,0,0.25)] [&_svg:not([class*=size-])]:size-5',
        TONES[tone],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {asChild ? children : <span className="relative inline-flex items-center gap-2">{children}</span>}
    </Comp>
  )
}

// Keyboard hotkey chip, e.g. [1] or [Enter]: a chubby raised key cap with its own bevel.
// Decorative by default (pair it with aria-keyshortcuts on the control).
function KeyChip({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      aria-hidden
      {...props}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] border-[2.5px] border-[#8a5a2b] bg-gradient-to-b from-white to-[#f6e3c3] px-1.5 font-game text-sm leading-none font-extrabold text-[#5a2a0c] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_3px_0_#8a5a2b,0_5px_8px_rgba(69,26,3,0.25)]',
        className,
      )}
    />
  )
}

export { GameButton, KeyChip }

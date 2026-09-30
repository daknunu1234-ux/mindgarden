import * as React from 'react'
import { cn } from '@/shared/utils/cn'
import { GameIcon, type GameIconName } from './GameIcon'
import { GameProgressBar } from './GameProgressBar'

// Floating HUD pods for game screens: chunky toy slabs hovering over a soft ground shadow, with a
// chubby icon medallion bursting out of the left end. Server-safe; the overlay that holds them
// should be `pointer-events-none` so drags reach the world, and each pod re-enables pointer events.

// Soft oval shadow on the "ground" under a floating pod (sells the 2.5D hover).
function PodShadow({ className }: { className?: string }) {
  return <span aria-hidden className={cn('pointer-events-none absolute -bottom-3 left-1/2 h-3 w-[80%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-[3px]', className)} />
}

const POD =
  'relative rounded-[20px] border-[3px] border-[#b98a5a] bg-gradient-to-b from-white via-[#fffaf0] to-[#f6e3c3] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-4px_0_rgba(185,138,90,0.25),0_5px_0_#a8784a]'

// Top-left: level shield + title + XP juice-bar in one pod.
function LevelCrest({
  level,
  title,
  xpIntoLevel,
  xpForNextLevel,
  className,
}: {
  level: number
  title: string
  xpIntoLevel: number
  xpForNextLevel: number
  className?: string
}) {
  return (
    <div className={cn('pointer-events-auto relative flex items-center pb-1', className)}>
      <PodShadow />
      <div aria-hidden className="relative z-10 size-[68px] shrink-0 drop-shadow-[0_5px_0_#8a4a0c]">
        <svg viewBox="0 0 64 64" className="size-full overflow-visible">
          <path d="M32 3 L58 12 Q59 41 32 62 Q5 41 6 12 Z" fill="#3b1d0b" />
          <path d="M32 6 L55 14 Q55 39 32 58 Q9 39 9 14 Z" fill="#f59e0b" />
          <path d="M32 6 L55 14 Q55 25 50 34 Q40 22 12 22 Q10 18 9 14 Z" fill="#fde047" />
          <path d="M32 58 Q49 45 54 26 Q52 42 32 58 Z" fill="#c2410c" opacity="0.45" />
          <path d="M15 16 Q24 11 31 11" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.85" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center pb-1.5 font-game text-[26px] font-extrabold text-[#5a2a02] [text-shadow:0_2px_0_rgba(255,255,255,0.7)]">
          {level}
        </span>
      </div>
      <div className={cn(POD, '-ml-5 min-w-0 py-1.5 pr-3 pl-7')}>
        <p className="truncate font-game text-sm leading-tight font-extrabold text-[#4a2511]">{title}</p>
        <GameProgressBar
          value={xpIntoLevel}
          max={xpForNextLevel}
          tone="leaf"
          size="md"
          label={`Level ${level} experience`}
          caption={`${xpIntoLevel} / ${xpForNextLevel} XP`}
          className="mt-1 w-32 sm:w-44"
        />
      </div>
    </div>
  )
}

type PillTone = 'fire' | 'gold' | 'leaf'

// Coloured medallion socket behind each icon.
const MEDALLIONS: Record<PillTone, string> = {
  fire: 'from-[#fff1d6] to-[#ffc98a] border-[#c2410c] shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_4px_0_#9a3412]',
  gold: 'from-[#fffbe0] to-[#ffe28a] border-[#b45309] shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_4px_0_#8a4a0c]',
  leaf: 'from-[#f2ffe8] to-[#b9f0a0] border-[#15803d] shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_4px_0_#166534]',
}

// Top-right: one floating stat pod (🔥 streak, 🪙 coins: the only currency). `icon` is a
// GameIcon name, or any node (e.g. an emoji).
function ResourcePill({
  icon,
  value,
  label,
  hint,
  tone,
  onAdd,
  addLabel,
}: {
  icon: GameIconName | React.ReactNode
  value: React.ReactNode
  label: string
  hint?: string
  tone: PillTone
  // Optional chunky "+" on the right end (e.g. open the Coin Shop).
  onAdd?: () => void
  addLabel?: string
}) {
  return (
    <div title={hint} className="pointer-events-auto relative flex items-center pb-1">
      <PodShadow className="w-[70%]" />
      <span
        aria-hidden
        className={cn('relative z-10 flex size-11 items-center justify-center rounded-full border-[3px] bg-gradient-to-b text-xl', MEDALLIONS[tone])}
      >
        {typeof icon === 'string' && isIconName(icon) ? <GameIcon name={icon} className="size-7" /> : icon}
      </span>
      <span
        className={cn(
          POD,
          '-ml-4 flex h-9 min-w-16 items-center justify-end rounded-l-none pl-6 font-game text-lg leading-none font-extrabold text-[#4a2511] tabular-nums',
          onAdd ? 'pr-8' : 'pr-3.5',
        )}
      >
        <span className="sr-only">{label}: </span>
        {value}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel ?? `Get more ${label.toLowerCase()}`}
          title={addLabel ?? `Get more ${label.toLowerCase()}`}
          className="absolute top-0.5 -right-2 z-10 flex size-8 items-center justify-center rounded-full border-[2.5px] border-[#0b6b3a] bg-gradient-to-b from-[#6ee7a0] via-[#34c774] to-[#16a34a] font-game text-xl leading-none font-extrabold text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_3px_0_#0b6b3a] [text-shadow:0_1.5px_0_rgba(6,78,59,0.6)] transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] hover:scale-110 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:translate-y-0.5 active:shadow-none"
        >
          +
        </button>
      )}
    </div>
  )
}

const ICON_NAMES = new Set<string>(['flame', 'coin', 'sprout', 'star', 'drop', 'trophy', 'seed'])
const isIconName = (s: string): s is GameIconName => ICON_NAMES.has(s)

// Bottom-centre dock: a chunky wooden tray (with a ground shadow) holding big round action orbs.
function ActionDock({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'pointer-events-auto relative flex items-end gap-2 rounded-[36px] border-4 border-[#4a2008] px-3 pt-2 pb-2.5 sm:gap-3 sm:px-5',
        '[background-image:repeating-linear-gradient(180deg,rgba(0,0,0,0.07)_0_3px,transparent_3px_22px),linear-gradient(to_bottom,#d0843c,#a85a22_55%,#8a4518)]',
        'shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-5px_0_rgba(69,26,3,0.3),0_7px_0_#4a2008,0_18px_28px_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      {children}
    </nav>
  )
}

type DockTone = 'leaf' | 'sun' | 'sky' | 'berry'

const DOCK_TONES: Record<DockTone, string> = {
  leaf: 'from-[#b6f36a] via-[#4fd86b] to-[#16a34a] border-[#0b5c2e] shadow-[inset_0_3px_0_rgba(255,255,255,0.5),inset_0_-5px_0_rgba(6,95,70,0.35),0_6px_0_#0b5c2e]',
  sun: 'from-[#fff7ae] via-[#fcd34d] to-[#f59e0b] border-[#8a4a0c] shadow-[inset_0_3px_0_rgba(255,255,255,0.6),inset_0_-5px_0_rgba(180,83,9,0.35),0_6px_0_#8a4a0c]',
  sky: 'from-[#bdf4ff] via-[#38bdf8] to-[#0284c7] border-[#064d78] shadow-[inset_0_3px_0_rgba(255,255,255,0.55),inset_0_-5px_0_rgba(7,89,133,0.35),0_6px_0_#064d78]',
  berry: 'from-[#fecdd3] via-[#fb7185] to-[#e11d48] border-[#8a1033] shadow-[inset_0_3px_0_rgba(255,255,255,0.5),inset_0_-5px_0_rgba(159,18,57,0.35),0_6px_0_#8a1033]',
}

// Class for the dock's clickable element (a <button> or <Link>); put a <DockOrb> and a caption inside.
const DOCK_BUTTON =
  'group/dock relative flex flex-col items-center gap-1.5 rounded-2xl font-game text-xs leading-none font-extrabold tracking-wide text-[#fff7e6] [text-shadow:0_2px_0_rgba(69,26,3,0.7)] focus-visible:outline-none'

// Glossy round orb: bounces on hover, sinks onto its bevel on press (driven by the parent's group/dock).
function DockOrb({ children, badge, tone, big = false }: { children: React.ReactNode; badge?: React.ReactNode; tone: DockTone; big?: boolean }) {
  return (
    <span
      className={cn(
        'relative flex items-center justify-center rounded-full border-[3.5px] bg-gradient-to-b text-2xl transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)]',
        'group-hover/dock:-translate-y-1.5 group-hover/dock:scale-105 group-active/dock:translate-y-1.5 group-active/dock:scale-95 group-active/dock:shadow-none',
        'group-focus-visible/dock:ring-4 group-focus-visible/dock:ring-yellow-300',
        big ? 'size-[70px] text-3xl sm:size-20' : 'size-[52px] sm:size-14',
        DOCK_TONES[tone],
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-[16%] top-[7%] h-[34%] rounded-full bg-gradient-to-b from-white/75 to-white/0" />
      <span aria-hidden className="pointer-events-none absolute top-[14%] left-[20%] size-[10%] rounded-full bg-white" />
      <span className="relative drop-shadow-[0_2px_0_rgba(0,0,0,0.25)]">{children}</span>
      {badge !== undefined && (
        <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-[2.5px] border-white bg-gradient-to-b from-[#fb7185] to-[#e11d48] px-1 font-game text-xs font-extrabold text-white shadow-[0_2px_0_#8a1033]">
          {badge}
        </span>
      )}
    </span>
  )
}

export { ActionDock, DOCK_BUTTON, DockOrb, LevelCrest, PodShadow, ResourcePill }

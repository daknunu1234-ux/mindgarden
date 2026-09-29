import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

// Chubby cartoon icons: bold dark outlines, a base colour, a shade on the lower-right and a glossy
// specular on the upper-left (light comes from the top-left, like the rest of the game).
// Pure SVG with no ids, so any number can sit on a page and render on the server.

export type GameIconName = 'flame' | 'coin' | 'gem' | 'sprout' | 'star' | 'drop' | 'trophy' | 'seed'

const OUTLINE = { stroke: '#3b1d0b', strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

const ICONS: Record<GameIconName, ReactNode> = {
  flame: (
    <>
      <path d="M16 3 C 22 9 26 13 26 19 A 10 10 0 0 1 6 19 C 6 14 9 11 11 8 C 12 11 13 13 15 13 C 14 9 14 6 16 3 Z" fill="#fb6a1c" {...OUTLINE} />
      <path d="M16 13 C 19 16 21 18 21 21 A 5 5 0 0 1 11 21 C 11 18 13 16 16 13 Z" fill="#fde047" />
      <path d="M21 17 C 23 19 23 23 20 26" stroke="#c2410c" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6" />
      <ellipse cx="10.5" cy="16" rx="1.6" ry="2.6" fill="#fff" opacity="0.75" transform="rotate(20 10.5 16)" />
    </>
  ),
  coin: (
    <>
      <ellipse cx="16" cy="17.5" rx="12" ry="11.5" fill="#c77d08" {...OUTLINE} />
      <ellipse cx="16" cy="15.5" rx="12" ry="11.5" fill="#fbbf24" {...OUTLINE} />
      <ellipse cx="16" cy="15.5" rx="8" ry="7.6" fill="#f59e0b" />
      <path d="M13.5 11.5 h5 M16 11.5 v8 M13.5 19.5 h5" stroke="#fff4c2" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="10.5" cy="10" rx="2.8" ry="1.6" fill="#fff" opacity="0.8" transform="rotate(-35 10.5 10)" />
    </>
  ),
  gem: (
    <>
      <path d="M9 5 H23 L29 12 L16 28 L3 12 Z" fill="#22b8e8" {...OUTLINE} />
      <path d="M3 12 H29 M9 5 L13 12 L16 28 L19 12 L23 5" stroke="#0b6f96" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <path d="M13 12 L16 28 L3 12 Z" fill="#67e0ff" opacity="0.9" />
      <path d="M19 12 L29 12 L16 28 Z" fill="#0e8fc0" opacity="0.85" />
      <path d="M10 7 L12 10.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
    </>
  ),
  sprout: (
    <>
      <path d="M16 28 V 15" stroke="#3b1d0b" strokeWidth="5" strokeLinecap="round" />
      <path d="M16 28 V 15" stroke="#5bbf3a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 16 C 10 17 5 13 5 7 C 11 6 16 9 16 16 Z" fill="#4ade80" {...OUTLINE} />
      <path d="M16 15 C 22 16 27 12 27 6 C 21 5 16 8 16 15 Z" fill="#22c55e" {...OUTLINE} />
      <ellipse cx="9" cy="9.5" rx="2" ry="1.2" fill="#fff" opacity="0.75" transform="rotate(30 9 9.5)" />
      <ellipse cx="16" cy="28.5" rx="7" ry="2" fill="#7c4a21" {...OUTLINE} strokeWidth={1.8} />
    </>
  ),
  star: (
    <>
      <path
        d="M16 3.5 L19.6 11.2 L28 12.2 L21.8 17.9 L23.5 26.3 L16 22 L8.5 26.3 L10.2 17.9 L4 12.2 L12.4 11.2 Z"
        fill="#fcd34d"
        {...OUTLINE}
      />
      <path d="M16 22 L23.5 26.3 L21.8 17.9 L28 12.2 L19.6 11.2" fill="#f59e0b" opacity="0.6" />
      <ellipse cx="12.5" cy="12.5" rx="2" ry="1.2" fill="#fff" opacity="0.85" transform="rotate(-30 12.5 12.5)" />
    </>
  ),
  drop: (
    <>
      <path d="M16 3 C 21 11 26 15 26 20 A 10 10 0 0 1 6 20 C 6 15 11 11 16 3 Z" fill="#38bdf8" {...OUTLINE} />
      <path d="M22 18 C 24 21 22 26 18 27" stroke="#0369a1" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.55" />
      <ellipse cx="11.5" cy="18" rx="2" ry="3.4" fill="#fff" opacity="0.85" transform="rotate(20 11.5 18)" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 6 C 2 6 3 15 10 15 M24 6 C 30 6 29 15 22 15" fill="none" stroke="#3b1d0b" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M8 6 C 2 6 3 15 10 15 M24 6 C 30 6 29 15 22 15" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 4 H24 V11 A 8 8 0 0 1 8 11 Z" fill="#fbbf24" {...OUTLINE} />
      <path d="M13.5 19 H18.5 L19.5 24 H12.5 Z" fill="#f59e0b" {...OUTLINE} />
      <rect x="9" y="24" width="14" height="5" rx="1.8" fill="#a8551e" {...OUTLINE} />
      <path d="M11.5 6.5 V 11" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
    </>
  ),
  seed: (
    <>
      <path d="M16 4 C 24 8 26 18 22 24 C 19 28 13 28 10 24 C 6 18 8 8 16 4 Z" fill="#c2803c" {...OUTLINE} />
      <path d="M16 6 C 13 12 13 20 16 26" stroke="#8a4a18" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="12.5" cy="12" rx="1.8" ry="3" fill="#fff" opacity="0.7" transform="rotate(20 12.5 12)" />
    </>
  ),
}

// `className` sets the size (defaults to size-6).
function GameIcon({ name, className, label }: { name: GameIconName; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-6 shrink-0 overflow-visible drop-shadow-[0_2px_0_rgba(59,29,11,0.35)]', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ICONS[name]}
    </svg>
  )
}

export { GameIcon }

import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

// Hover-to-reveal owner tools (✏️ Edit, 🗑️ Delete…) on a card, pill or row. Put `group` on the
// target and <HoverActions> inside it. The tools stay hidden (and unclickable) until the target is
// hovered or anything in it has keyboard focus; on touch screens, which can't hover, they are
// always shown so nothing is lost.
export const HOVER_REVEAL =
  'pointer-events-none opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'

type HoverActionsProps = {
  children: ReactNode
  // Where the pill sits: floating over the top-right corner, or inline at the end of a row.
  placement?: 'corner' | 'inline'
  label?: string
  className?: string
}

function HoverActions({ children, placement = 'inline', label = 'Owner tools', className }: HoverActionsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex items-center gap-1 rounded-full border border-amber-900/15 bg-white/95 p-0.5 shadow-[0_2px_0_rgba(120,53,15,0.2)]',
        placement === 'corner' && 'absolute -top-3 right-2 z-20',
        HOVER_REVEAL,
        className,
      )}
    >
      {children}
    </div>
  )
}

type HoverActionButtonProps = {
  icon: string
  label: string
  onClick: () => void
  tone?: 'edit' | 'delete' | 'neutral'
  // Visible text next to the icon (e.g. "Edit"); icon-only when omitted.
  text?: string
}

const TONES = {
  edit: 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-300',
  delete: 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100 focus-visible:ring-red-300',
  neutral: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 focus-visible:ring-amber-300',
} as const

function HoverActionButton({ icon, label, onClick, tone = 'neutral', text }: HoverActionButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Cards and pills underneath have their own click / drag handling.
        e.stopPropagation()
        onClick()
      }}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 min-w-7 items-center justify-center gap-1 rounded-full border px-1.5 text-xs font-semibold focus-visible:ring-4 focus-visible:outline-none',
        TONES[tone],
      )}
    >
      <span aria-hidden>{icon}</span>
      {text && <span>{text}</span>}
    </button>
  )
}

export { HoverActionButton, HoverActions }

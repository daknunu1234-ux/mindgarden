'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { Ribbon, type PanelTone, type RibbonTone } from './GamePanel'

// Pillowy game modal: a tinted, blurred backdrop; a puffy toy slab that lands with a bounce; a
// ribbon plaque floating across the top edge; and a round tomato-red ✕ badge on the corner.

const GameDialog = DialogPrimitive.Root
const GameDialogTrigger = DialogPrimitive.Trigger
const GameDialogClose = DialogPrimitive.Close

const BODIES: Record<PanelTone, string> = {
  parchment:
    'border-[#c9955e] bg-gradient-to-b from-[#fffcf3] via-[#fff5e0] to-[#f5dcb2] text-[#4a2511] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-8px_0_rgba(201,149,94,0.22),0_10px_0_#b07a45,0_30px_60px_rgba(41,20,5,0.45)]',
  wood: 'border-[#4a2008] text-[#fff7e6] [background-image:repeating-linear-gradient(180deg,rgba(0,0,0,0.07)_0_3px,transparent_3px_30px),linear-gradient(to_bottom,#d0843c,#a85a22_55%,#8a4518)] shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-8px_0_rgba(69,26,3,0.3),0_10px_0_#4a2008,0_30px_60px_rgba(41,20,5,0.5)]',
  stone:
    'border-[#8f8a82] bg-gradient-to-b from-[#fafaf9] via-[#eeece8] to-[#d9d5ce] text-[#292524] shadow-[inset_0_3px_0_rgba(255,255,255,0.95),inset_0_-8px_0_rgba(120,113,108,0.2),0_10px_0_#7c766e,0_30px_60px_rgba(28,25,23,0.45)]',
  leaf: 'border-[#2f8f4e] bg-gradient-to-b from-[#f2fde9] via-[#e3f9d0] to-[#c8efae] text-[#12391f] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-8px_0_rgba(47,143,78,0.2),0_10px_0_#237a3f,0_30px_60px_rgba(6,40,30,0.45)]',
  sky: 'border-[#3a86c4] bg-gradient-to-b from-[#f0f9ff] via-[#e0f2fe] to-[#bfe3fb] text-[#0c3553] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-8px_0_rgba(58,134,196,0.2),0_10px_0_#2f6fa5,0_30px_60px_rgba(8,47,73,0.45)]',
  gold: 'border-[#d69e12] bg-gradient-to-b from-[#fffdf0] via-[#fff4c2] to-[#fde58a] text-[#5a3300] shadow-[inset_0_3px_0_rgba(255,255,255,0.95),inset_0_-8px_0_rgba(214,158,18,0.25),0_10px_0_#b7830c,0_30px_60px_rgba(41,20,5,0.45)]',
}

type GameDialogContentProps = Omit<React.ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: React.ReactNode
  // Sub-line under the title plaque (rendered as the dialog description).
  description?: React.ReactNode
  tone?: PanelTone
  ribbon?: RibbonTone
  size?: 'sm' | 'md' | 'lg'
  showClose?: boolean
}

const WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' }

function GameDialogContent({
  title,
  description,
  tone = 'parchment',
  ribbon = 'wood',
  size = 'md',
  showClose = true,
  className,
  children,
  ...props
}: GameDialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[radial-gradient(ellipse_at_center,rgba(12,74,110,0.35),rgba(6,40,30,0.6))] backdrop-blur-[4px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="game-dialog"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          WIDTHS[size],
        )}
        {...props}
      >
        <div
          className={cn(
            'mg-land relative mt-6 mb-3 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[36px] border-[5px] px-5 pt-11 pb-6 sm:px-7',
            BODIES[tone],
            className,
          )}
        >
          {description !== undefined ? (
            <DialogPrimitive.Description className="mb-5 text-center text-sm font-medium opacity-80">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogPrimitive.Description>
          )}
          {children}
        </div>
        {/* Title plaque + close badge sit outside the scroll box so they stay put. */}
        <div className="pointer-events-none absolute top-0 left-1/2 z-10 flex max-w-[calc(100%-5rem)] -translate-x-1/2 justify-center drop-shadow-[0_6px_6px_rgba(41,20,5,0.3)]">
          <DialogPrimitive.Title asChild>
            <div className="pointer-events-auto">
              <Ribbon tone={ribbon}>{title}</Ribbon>
            </div>
          </DialogPrimitive.Title>
        </div>
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-2 right-0 z-10 flex size-11 items-center justify-center rounded-full border-[3px] border-[#8a1033] bg-gradient-to-b from-[#fda4af] via-[#fb7185] to-[#e11d48] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#8a1033,0_8px_12px_rgba(41,20,5,0.3)] transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] hover:scale-110 hover:rotate-90 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:translate-y-1 active:shadow-[inset_0_2px_0_rgba(255,255,255,0.45)] sm:-right-3"
          >
            <X className="size-6 drop-shadow-[0_1.5px_0_rgba(136,19,55,0.6)]" strokeWidth={3.5} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// `GameModal` is the art-direction name for the same pillowy dialog.
const GameModal = GameDialog
const GameModalContent = GameDialogContent

export { GameDialog, GameDialogClose, GameDialogContent, GameDialogTrigger, GameModal, GameModalContent }

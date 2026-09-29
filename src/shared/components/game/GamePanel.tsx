import * as React from 'react'
import { cn } from '@/shared/utils/cn'

// Toy-like slabs: thick puffy borders, a top-rim specular (inset 0 2px 0 white), an inner bottom
// shade, a solid bevel underneath and a soft ground drop shadow. An optional ribbon plaque floats
// across the top edge. Replace flat cards everywhere.

export type PanelTone = 'parchment' | 'wood' | 'stone' | 'leaf' | 'sky' | 'gold'
export type RibbonTone = 'wood' | 'leaf' | 'sky' | 'gold' | 'berry' | 'danger'
type HeadingTag = 'div' | 'h1' | 'h2' | 'h3'

const PANELS: Record<PanelTone, string> = {
  parchment:
    'border-[#c9955e] bg-gradient-to-b from-[#fffcf3] via-[#fff5e0] to-[#f7e2bd] text-[#4a2511] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-6px_0_rgba(201,149,94,0.22),0_8px_0_#b07a45,0_18px_32px_rgba(90,42,12,0.22)]',
  wood: 'border-[#4a2008] text-[#fff7e6] [background-image:repeating-linear-gradient(180deg,rgba(0,0,0,0.07)_0_3px,transparent_3px_30px),linear-gradient(to_bottom,#d0843c,#a85a22_55%,#8a4518)] shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-6px_0_rgba(69,26,3,0.3),0_8px_0_#4a2008,0_18px_32px_rgba(69,26,3,0.4)]',
  stone:
    'border-[#8f8a82] bg-gradient-to-b from-[#fafaf9] via-[#eeece8] to-[#d9d5ce] text-[#292524] shadow-[inset_0_3px_0_rgba(255,255,255,0.95),inset_0_-6px_0_rgba(120,113,108,0.2),0_8px_0_#7c766e,0_18px_32px_rgba(41,37,36,0.22)]',
  leaf: 'border-[#2f8f4e] bg-gradient-to-b from-[#f2fde9] via-[#e3f9d0] to-[#c8efae] text-[#12391f] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-6px_0_rgba(47,143,78,0.2),0_8px_0_#237a3f,0_18px_32px_rgba(6,78,59,0.22)]',
  sky: 'border-[#3a86c4] bg-gradient-to-b from-[#f0f9ff] via-[#e0f2fe] to-[#bfe3fb] text-[#0c3553] shadow-[inset_0_3px_0_rgba(255,255,255,0.9),inset_0_-6px_0_rgba(58,134,196,0.2),0_8px_0_#2f6fa5,0_18px_32px_rgba(12,74,110,0.22)]',
  gold: 'border-[#d69e12] bg-gradient-to-b from-[#fffdf0] via-[#fff4c2] to-[#fde58a] text-[#5a3300] shadow-[inset_0_3px_0_rgba(255,255,255,0.95),inset_0_-6px_0_rgba(214,158,18,0.25),0_8px_0_#b7830c,0_0_32px_rgba(250,204,21,0.5),0_18px_32px_rgba(120,80,0,0.2)]',
}

const RIBBONS: Record<RibbonTone, string> = {
  wood: 'from-[#e8a05a] via-[#c8712c] to-[#9a4a17] border-[#4a2008] text-[#fff7e6] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#4a2008]',
  leaf: 'from-[#7ee8a8] via-[#34c774] to-[#138a44] border-[#0a5c2e] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#0a5c2e]',
  sky: 'from-[#8fdcff] via-[#38bdf8] to-[#0277bd] border-[#064d78] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#064d78]',
  gold: 'from-[#fff3a3] via-[#fcd34d] to-[#eb9a0b] border-[#a15c07] text-[#5a2a02] shadow-[inset_0_2px_0_rgba(255,255,255,0.6),0_4px_0_#a15c07]',
  berry: 'from-[#fdb4bd] via-[#fb7185] to-[#d3143f] border-[#8a1033] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#8a1033]',
  danger: 'from-[#fca5a5] via-[#ef4444] to-[#b91c1c] border-[#7f1d1d] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_4px_0_#7f1d1d]',
}

// Tails sit behind the plaque, one shade darker, with a notched end.
const TAILS: Record<RibbonTone, string> = {
  wood: 'bg-[#8a4518] border-[#4a2008]',
  leaf: 'bg-[#0f7a3b] border-[#0a5c2e]',
  sky: 'bg-[#0369a1] border-[#064d78]',
  gold: 'bg-[#d68a09] border-[#a15c07]',
  berry: 'bg-[#be123c] border-[#8a1033]',
  danger: 'bg-[#991b1b] border-[#7f1d1d]',
}

// Ribbon plaque with folded, notched tails: panel titles, badges and trophy ribbons.
function Ribbon({ children, tone = 'wood', className, as: As = 'div' }: { children: React.ReactNode; tone?: RibbonTone; className?: string; as?: HeadingTag }) {
  const tail = 'absolute top-2.5 h-[calc(100%-2px)] w-7 border-y-[2.5px] [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,38%_50%)]'
  return (
    <As className={cn('relative inline-flex max-w-full items-center px-1', className)}>
      <span aria-hidden className={cn(tail, '-left-3 border-l-[2.5px]', TAILS[tone])} />
      <span aria-hidden className={cn(tail, '-right-3 border-r-[2.5px] [clip-path:polygon(0_0,100%_0,62%_50%,100%_100%,0_100%)]', TAILS[tone])} />
      <span
        className={cn(
          'relative max-w-full truncate rounded-[12px] border-[2.5px] bg-gradient-to-b px-5 py-1.5 font-game text-base leading-tight font-extrabold tracking-wide whitespace-nowrap [text-shadow:0_2px_0_rgba(0,0,0,0.2)]',
          RIBBONS[tone],
        )}
      >
        {children}
      </span>
    </As>
  )
}

type GamePanelProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  tone?: PanelTone
  // Ribbon title plaque across the top edge.
  title?: React.ReactNode
  ribbon?: RibbonTone
  titleAs?: HeadingTag
}

function GamePanel({ tone = 'parchment', title, ribbon = 'wood', titleAs = 'h2', className, children, ...props }: GamePanelProps) {
  return (
    <section
      data-slot="game-panel"
      className={cn('relative rounded-[32px] border-4 p-5 sm:p-6', PANELS[tone], title !== undefined && 'mt-6 pt-10 sm:pt-11', className)}
      {...props}
    >
      {title !== undefined && (
        <div className="absolute -top-6 left-1/2 z-10 flex max-w-[calc(100%-3rem)] -translate-x-1/2 justify-center drop-shadow-[0_6px_6px_rgba(69,26,3,0.2)]">
          <Ribbon tone={ribbon} as={titleAs}>
            {title}
          </Ribbon>
        </div>
      )}
      {children}
    </section>
  )
}

// A small raised tile inside a panel (stats, list rows): a mini toy slab with rim light and bevel.
function GameSlab({ className, tone = 'cream', ...props }: React.ComponentProps<'div'> & { tone?: 'cream' | 'gold' | 'leaf' | 'sky' }) {
  const tones = {
    cream: 'border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_4px_0_#d2ac7c,0_8px_14px_rgba(90,42,12,0.12)]',
    gold: 'border-[#e0a818] bg-gradient-to-b from-[#fffdf0] to-[#ffeaa0] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_4px_0_#c28c0e,0_0_20px_rgba(250,204,21,0.45)]',
    leaf: 'border-[#6cc48a] bg-gradient-to-b from-[#f4fdee] to-[#dcf7cb] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_4px_0_#4fa56d,0_8px_14px_rgba(6,78,59,0.12)]',
    sky: 'border-[#7cbde6] bg-gradient-to-b from-[#f5fbff] to-[#dbefff] shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_4px_0_#5a9fcc,0_8px_14px_rgba(12,74,110,0.12)]',
  }
  return <div className={cn('rounded-[20px] border-[2.5px]', tones[tone], className)} {...props} />
}

export { GamePanel, GameSlab, Ribbon }

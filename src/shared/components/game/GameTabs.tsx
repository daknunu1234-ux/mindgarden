'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/shared/utils/cn'

// Wooden drawer tabs: a plank rail of tabs; the active one is pulled out (lighter, raised) and
// joins the parchment drawer below. Radix Tabs underneath, so arrow keys and roles work.

const GameTabs = TabsPrimitive.Root

function GameTabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex gap-1 rounded-t-[20px] border-[3px] border-b-0 border-[#4a2008] bg-gradient-to-b from-[#a85a22] to-[#7a3a12] px-1.5 pt-1.5 shadow-[inset_0_2px_0_rgba(255,255,255,0.3)]',
        className,
      )}
      {...props}
    />
  )
}

function GameTabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-t-[14px] px-2 py-2.5 font-game text-sm leading-none font-extrabold transition-[background,color,transform] duration-150',
        'text-amber-100/80 hover:bg-amber-700/60 hover:text-amber-50',
        'data-[state=active]:-mb-px data-[state=active]:translate-y-0 data-[state=active]:bg-[#fdf3dc] data-[state=active]:text-amber-950 data-[state=active]:shadow-[inset_0_2px_0_rgba(255,255,255,0.9)]',
        'focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  )
}

function GameTabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'rounded-b-[20px] border-[3px] border-t-0 border-[#4a2008]/60 bg-[#fdf3dc] p-4 shadow-[inset_0_-4px_0_rgba(201,149,94,0.2),0_6px_0_#b07a45] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300',
        className,
      )}
      {...props}
    />
  )
}

export { GameTabs, GameTabsContent, GameTabsList, GameTabsTrigger }

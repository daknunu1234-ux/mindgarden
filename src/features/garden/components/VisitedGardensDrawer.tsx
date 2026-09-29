'use client'

import { useState } from 'react'
import Link from 'next/link'
import { GameButton } from '@/shared/components/game'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { formatVisitedAgo, visitHref, type VisitedGarden } from '../lib/neighbors'

type VisitedGardensDrawerProps = {
  gardens: VisitedGarden[]
  signedIn: boolean
  // The neighbour being visited right now (highlighted), if any.
  visitingOwnerId?: string | null
}

// "🧭 Visited Gardens": a wooden tab on the farm's left edge opening a drawer of the
// shared trees this player has opened (from a shared link), grouped by gardener, newest visit
// first. Visit a whole garden (read-only island) or re-open one tree (read-only).
function VisitedGardensDrawer({ gardens, signedIn, visitingOwnerId = null }: VisitedGardensDrawerProps) {
  const [open, setOpen] = useState(false)
  // "3 days ago" is measured from when the drawer opened (the content only renders while open).
  const [openedAt, setOpenedAt] = useState(0)
  const { open: openLogin } = useLoginDialog()
  const treeCount = gardens.reduce((n, g) => n + g.trees.length, 0)

  const show = () => {
    setOpenedAt(Date.now())
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`Visited Gardens: ${gardens.length} ${gardens.length === 1 ? 'garden' : 'gardens'}, ${treeCount} ${treeCount === 1 ? 'tree' : 'trees'} visited`}
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-r-[18px] border-[3px] border-l-0 border-[#4a2008] px-1.5 py-3 font-game text-xs leading-tight font-extrabold text-[#fff7e6] shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_5px_0_#4a2008,0_10px_18px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)] [background-image:repeating-linear-gradient(90deg,rgba(0,0,0,0.07)_0_2px,transparent_2px_14px),linear-gradient(to_bottom,#d0843c,#a85a22_55%,#8a4518)] [text-shadow:0_1.5px_0_rgba(69,26,3,0.7)] hover:translate-x-1 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
      >
        <span aria-hidden className="text-xl">
          🧭
        </span>
        <span className="[writing-mode:vertical-rl]">Visited Gardens</span>
        {gardens.length > 0 && (
          <span className="mt-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-b from-[#fb7185] to-[#e11d48] text-[11px] shadow-[0_2px_0_#8a1033]">
            {gardens.length}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-full gap-0 overflow-y-auto border-r-[5px] border-amber-800 bg-gradient-to-b from-[#fffaf0] to-[#f8e9c8] sm:max-w-md"
        >
          <SheetHeader className="border-b-[3px] border-amber-950/50 bg-gradient-to-b from-amber-700 to-amber-800 pr-12 text-amber-50">
            <SheetTitle className="font-game text-xl font-extrabold text-amber-50 [text-shadow:0_2px_0_rgba(69,26,3,0.6)]">
              🧭 Visited Gardens
            </SheetTitle>
            <SheetDescription className="text-amber-100/85">
              Shared trees you have opened from a link. They are read-only: clone one into your garden to practise it.
            </SheetDescription>
          </SheetHeader>

          {!signedIn ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="font-game font-bold text-amber-900/75">Sign in to keep track of the gardens you visit.</p>
              <GameButton
                tone="leaf"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  openLogin()
                }}
              >
                Sign in
              </GameButton>
            </div>
          ) : gardens.length === 0 ? (
            <p className="p-6 text-center font-game font-bold text-amber-900/70">
              No visits yet. Open a tree someone shared with you, and it will wait for you here 🌿
            </p>
          ) : (
            <ul className="space-y-4 p-4">
              {gardens.map((g) => (
                <li
                  key={g.ownerId}
                  className={
                    g.ownerId === visitingOwnerId
                      ? 'rounded-[20px] border-[2.5px] border-[#e0a818] bg-gradient-to-b from-[#fffdf0] to-[#ffeaa0] p-3 shadow-[inset_0_2px_0_#fff,0_4px_0_#c28c0e]'
                      : 'rounded-[20px] border-[2.5px] border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] p-3 shadow-[inset_0_2px_0_#fff,0_4px_0_#d2ac7c]'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-2xl">
                      🏡
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-game text-lg font-extrabold text-amber-950">{g.name}&apos;s Garden</p>
                      <p className="text-xs font-semibold text-amber-900/65">Last visit {formatVisitedAgo(g.lastVisitedAt, openedAt)}</p>
                    </div>
                    <GameButton asChild tone="leaf" size="sm">
                      <Link href={visitHref(g.ownerId)} onClick={() => setOpen(false)}>
                        {g.ownerId === visitingOwnerId ? 'Visiting' : 'Visit 👣'}
                      </Link>
                    </GameButton>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.trees.map((t) => (
                      <li key={t.deckId}>
                        <Link
                          href={`/deck/${t.slug}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-[14px] border-2 border-amber-900/15 bg-amber-50 px-2.5 py-1.5 font-game text-amber-950 transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
                        >
                          <span aria-hidden className="text-lg">
                            {getTreeSpecies(t.treeType).icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{t.title}</span>
                            <span className="block text-xs font-semibold text-amber-900/65">
                              {t.statementCount !== null && `${t.statementCount} ${t.statementCount === 1 ? 'statement' : 'statements'} · `}
                              visited {formatVisitedAgo(t.visitedAt, openedAt)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export { VisitedGardensDrawer }

import Link from 'next/link'
import { GamePanel } from '@/shared/components/game'
import { plural } from '../lib/format'
import { showcaseSlots } from '../lib/showcase'
import type { PlantedTreeView } from '../types'

type MightyShowcaseProps = { trees: PlantedTreeView[] }

// Trophy shelf: a framed slot for every tree that grew Mighty Roots; locked frames are next goals.
function MightyShowcase({ trees }: MightyShowcaseProps) {
  const slots = showcaseSlots(trees)
  const earned = slots.filter((s) => s.kind === 'trophy').length

  return (
    <GamePanel tone="wood" ribbon="gold" title="💎 Mighty Roots Showcase">
      <p className="mb-5 text-center text-sm font-medium text-amber-100/85">
        {earned > 0
          ? `${plural(earned, 'tree has', 'trees have')} grown Mighty Roots. Master every statement of a root to add more.`
          : 'Master every statement of a root (3/3) to hang your first trophy here.'}
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {slots.map((slot) =>
          slot.kind === 'trophy' ? (
            <li key={slot.tree.slug}>
              <Link
                href={`/deck/${slot.tree.slug}`}
                className="group block rounded-2xl border-[5px] border-amber-950/70 bg-gradient-to-b from-yellow-100 to-amber-200 p-1.5 shadow-[inset_0_0_0_2px_#facc15,0_5px_0_#451a03] transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-gradient-to-b from-sky-200 via-sky-100 to-lime-200 shadow-[inset_0_3px_8px_rgba(0,0,0,0.2)]">
                  <span aria-hidden className="mg-glow absolute inset-[18%] rounded-full bg-yellow-300/50 blur-xl" />
                  {slot.tree.illustration && <div className="relative size-full p-1">{slot.tree.illustration}</div>}
                  <span className="absolute top-1.5 right-1.5 rounded-full border-2 border-sky-700 bg-gradient-to-b from-cyan-200 to-sky-400 px-1.5 font-game text-xs font-extrabold text-sky-950 shadow-[0_2px_0_#075985]">
                    💎 {slot.tree.mightyRoots}
                  </span>
                </div>
                <p className="mt-1.5 truncate px-1 text-center font-game text-sm font-bold text-amber-950 group-hover:underline">{slot.tree.title}</p>
              </Link>
            </li>
          ) : (
            <li key={`locked-${slot.index}`} aria-hidden>
              <div className="rounded-2xl border-[5px] border-dashed border-amber-950/40 bg-amber-900/30 p-1.5 shadow-[inset_0_3px_8px_rgba(0,0,0,0.3)]">
                <div className="flex aspect-square items-center justify-center rounded-xl bg-amber-950/25 text-3xl opacity-60">🔒</div>
                <p className="mt-1.5 text-center font-game text-sm font-bold text-amber-100/40">Empty frame</p>
              </div>
            </li>
          ),
        )}
      </ul>
    </GamePanel>
  )
}

export { MightyShowcase }

import { cn } from '@/shared/utils/cn'

// Instant skeleton for /deck/[slug], shaped like the real page (DeckScene): back button, the
// parchment header (title, ribbons, growth bar, stat slabs, water button), the "Tree & roots" toolbar
// with the wooden-framed canvas, and the Tree Workshop. It's what <Link> prefetches for this dynamic
// route (the farm also warms it on hover), so a click swaps to it at once while the deck streams in.
// Server-only markup, no client JS; the pulse stops under reduced motion.

function Bone({ className }: { className?: string }) {
  return <div className={cn('rounded-lg bg-amber-900/10 motion-safe:animate-pulse', className)} />
}

export default function Loading() {
  return (
    <main className="mg-meadow-bg w-full flex-1" aria-busy="true" aria-label="Loading tree">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Bone className="h-9 w-28 rounded-full" />

        {/* Header panel */}
        <div className="mt-6 rounded-[28px] border-4 border-amber-800/25 bg-[#fdf3dc]/90 p-5 shadow-[0_6px_0_rgba(120,53,15,0.18)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Bone className="h-9 w-3/4 max-w-md" />
              <div className="mt-4 flex flex-wrap gap-3 pl-3">
                <Bone className="h-7 w-28 rounded-full" />
                <Bone className="h-7 w-24 rounded-full" />
                <Bone className="h-7 w-20 rounded-full" />
              </div>
              <Bone className="mt-5 h-4 w-full max-w-md rounded-full" />
            </div>
            <div className="flex shrink-0 flex-row gap-3 sm:flex-col sm:items-stretch">
              <div className="flex gap-3">
                <Bone className="h-16 w-24 rounded-2xl" />
                <Bone className="h-16 w-24 rounded-2xl" />
              </div>
              <Bone className="h-12 flex-1 rounded-2xl sm:flex-none" />
            </div>
          </div>
        </div>

        {/* Tree & roots */}
        <div className="mt-10">
          <Bone className="h-7 w-40" />
          <Bone className="mt-2 h-4 w-full max-w-lg" />
          <div className="mt-3 flex gap-2">
            <Bone className="size-8 rounded-full" />
            <Bone className="h-8 w-14 rounded-full" />
            <Bone className="size-8 rounded-full" />
            <Bone className="h-8 w-24 rounded-full" />
          </div>
          <div className="mt-3 flex h-[72vh] max-h-[860px] min-h-[460px] flex-col items-center overflow-hidden rounded-[24px] border-[5px] border-amber-800/60 bg-gradient-to-b from-sky-100 via-emerald-50 to-[#f1e4cc] pt-10">
            {/* The tree, the ground line and a few roots fanning out. */}
            <Bone className="size-32 rounded-full bg-emerald-800/10" />
            <div className="mt-3 h-1 w-full bg-lime-600/30" />
            <div className="mt-12 flex w-full max-w-3xl justify-around gap-4 px-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex w-full max-w-56 flex-col gap-2">
                  <Bone className="h-12 w-full rounded-full bg-amber-900/15" />
                  <Bone className="ml-6 h-16 w-[85%] rounded-xl" />
                  <Bone className="ml-6 h-16 w-[85%] rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tree Workshop */}
        <div className="mt-12 rounded-[28px] border-4 border-amber-900/40 bg-amber-800/25 p-5 sm:p-6">
          <Bone className="mx-auto h-8 w-48 rounded-full bg-amber-950/15" />
          <Bone className="mx-auto mt-4 h-4 w-full max-w-md bg-amber-950/10" />
          <Bone className="mt-5 h-28 w-full rounded-2xl bg-amber-50/40" />
          <div className="mt-5 space-y-2 rounded-[20px] bg-amber-50/40 p-4">
            <div className="flex flex-wrap gap-1.5">
              <Bone className="h-7 w-24 rounded-full" />
              <Bone className="h-7 w-20 rounded-full" />
              <Bone className="h-7 w-28 rounded-full" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className={cn('h-5', i === 0 ? 'w-40' : 'ml-6 w-[70%]')} />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

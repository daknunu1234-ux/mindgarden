import { Skeleton } from '@/shared/components/ui/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-12 sm:px-6" aria-busy aria-label="Loading your garden">
      <div className="flex items-center gap-4 rounded-xl border p-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </main>
  )
}

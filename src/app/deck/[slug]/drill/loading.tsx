import { Skeleton } from '@/shared/components/ui/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6" aria-busy aria-label="Loading drill">
      <Skeleton className="mb-6 h-8 w-56" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-2 w-full rounded-full" />
      <div className="mt-6 space-y-3 rounded-xl border p-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-3/4" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}

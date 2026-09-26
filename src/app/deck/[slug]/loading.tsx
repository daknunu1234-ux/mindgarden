import { Skeleton } from '@/shared/components/ui/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6" aria-busy aria-label="Loading deck">
      <Skeleton className="h-4 w-20" />
      <div className="mt-6 flex items-start gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-full max-w-md" />
          <div className="flex gap-6">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>
      <Skeleton className="mt-10 h-0.5 w-full" />
      <Skeleton className="mt-6 h-6 w-20" />
      <Skeleton className="mt-3 h-48 w-full rounded-xl" />
    </main>
  )
}

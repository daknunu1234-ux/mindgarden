import { Skeleton } from '@/shared/components/ui/skeleton'
import { GardenGridSkeleton } from '@/features/garden'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <Skeleton className="mb-3 h-9 w-48" />
      <Skeleton className="mb-8 h-5 w-72" />
      <GardenGridSkeleton />
    </main>
  )
}

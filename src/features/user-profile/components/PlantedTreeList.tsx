import Link from 'next/link'
import { PencilLine } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { cn } from '@/shared/utils/cn'
import { plural } from '../lib/format'
import type { PlantedTreeView } from '../types'

type PlantedTreeListProps = { trees: PlantedTreeView[] }

function PlantedTreeList({ trees }: PlantedTreeListProps) {
  if (trees.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p aria-hidden className="text-4xl">
          🌱
        </p>
        <p className="mt-3 font-medium">You haven&apos;t planted a tree yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Plant one, add a few roots, and watch it grow as you practice.</p>
        <Button asChild className="mt-6">
          <Link href="/deck/new">Plant a Tree 🌱</Link>
        </Button>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {trees.map((tree) => (
        <li key={tree.slug}>
          <Card className="flex-row items-center gap-4 px-4 py-3">
            {tree.illustration && <div className="size-14 shrink-0">{tree.illustration}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/deck/${tree.slug}`} className="truncate font-medium hover:underline">
                  {tree.title}
                </Link>
                <Badge variant="outline" className="capitalize">
                  {tree.treeType}
                </Badge>
                {!tree.isPublic && <Badge variant="secondary">Private</Badge>}
                {tree.mightyRoots > 0 && (
                  <Badge className="border-yellow-500 bg-yellow-50 text-yellow-800">
                    ✨ {plural(tree.mightyRoots, 'Mighty Root', 'Mighty Roots')}
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn('h-full rounded-full', tree.masteryPercent > 80 ? 'bg-yellow-500' : 'bg-emerald-500')}
                    style={{ width: `${tree.masteryPercent}%` }}
                  />
                </div>
                <span className="tabular-nums">{tree.masteryPercent}%</span>
                <span>· {plural(tree.itemCount, 'statement', 'statements')}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {tree.itemCount > 0 ? (
                <Button asChild size="sm">
                  <Link href={`/deck/${tree.slug}/drill`}>Practice 🌿</Link>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link href={`/deck/${tree.slug}#grow-heading`} aria-label={`Edit roots of ${tree.title}`}>
                  <PencilLine aria-hidden /> Edit roots
                </Link>
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

export { PlantedTreeList }

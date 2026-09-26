import Link from 'next/link'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getTreeIcon } from '../lib/treeIcon'
import type { DeckCardView } from '../types'

type TreeCardProps = { deck: DeckCardView }

function TreeCard({ deck }: TreeCardProps) {
  return (
    <Link
      href={`/deck/${deck.slug}`}
      className="group block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Card className="h-full transition-colors duration-200 group-hover:border-emerald-300 group-hover:bg-emerald-50/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <span aria-hidden className="text-4xl leading-none">
              {getTreeIcon(deck.treeType)}
            </span>
            <Badge variant="outline" className="capitalize">
              {deck.treeType}
            </Badge>
          </div>
          <CardTitle className="mt-3 text-lg">{deck.title}</CardTitle>
          {deck.description && (
            <CardDescription className="line-clamp-3 whitespace-pre-wrap">
              {deck.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    </Link>
  )
}

export { TreeCard }

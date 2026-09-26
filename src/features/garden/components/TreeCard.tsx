import Link from 'next/link'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { useTreeStage } from '../hooks/useTreeStage'
import type { DeckCardView } from '../types'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type TreeCardProps = { deck: DeckCardView }

function TreeCard({ deck }: TreeCardProps) {
  const { stage, name, emoji } = useTreeStage(deck.masteryPercent)

  return (
    <Link
      href={`/deck/${deck.slug}`}
      className="group block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Card className="h-full transition-colors duration-200 group-hover:border-emerald-300 group-hover:bg-emerald-50/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <TreeStageSvg stage={stage} treeType={deck.treeType} label={`${name} tree`} className="size-20" />
            <Badge variant="outline" className={stage === 4 ? 'border-yellow-500 bg-yellow-50' : undefined}>
              {emoji} {name}
            </Badge>
          </div>
          <CardTitle className="mt-2 text-lg">{deck.title}</CardTitle>
          {deck.description && (
            <CardDescription className="line-clamp-3 whitespace-pre-wrap">{deck.description}</CardDescription>
          )}
          <GrowthBar percent={deck.masteryPercent} className="mt-3" />
          <p className="text-xs text-muted-foreground capitalize">{deck.treeType} tree</p>
        </CardHeader>
      </Card>
    </Link>
  )
}

export { TreeCard }

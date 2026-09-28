import { CalendarDays, Mail } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { formatJoined, gardenerName } from '../lib/format'
import type { GardenerView } from '../types'

type GardenerCardProps = { gardener: GardenerView; masteryPercent: number }

function GardenerCard({ gardener, masteryPercent }: GardenerCardProps) {
  const name = gardenerName(gardener.email)
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-800 uppercase"
        >
          {name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
            <Badge variant="secondary">🧑‍🌾 Gardener</Badge>
            {masteryPercent > 80 && <Badge className="border-yellow-500 bg-yellow-50 text-yellow-800">✨ Golden garden</Badge>}
          </div>
          <dl className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-5">
            <div className="flex min-w-0 items-center gap-1.5">
              <dt>
                <Mail className="size-4" aria-label="Email" />
              </dt>
              <dd className="truncate">{gardener.email}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>
                <CalendarDays className="size-4" aria-label="Joined" />
              </dt>
              <dd>{formatJoined(gardener.joinedAt)}</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}

export { GardenerCard }

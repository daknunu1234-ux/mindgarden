import { cn } from '@/shared/utils/cn'
import { nodeMastery, rootOpacity } from '../hooks/nodeMastery'
import type { ItemLevels, RootNodeView } from '../types'

type RootOutlineProps = {
  nodes: RootNodeView[]
  levels: ItemLevels
  nested?: boolean
}

// Text outline of the roots until the SVG RootMap lands. Each root fades in with mastery
// (opacity rule from frontend/ARCHITECTURE.md §5) and shows its average level.
function RootOutline({ nodes, levels, nested = false }: RootOutlineProps) {
  return (
    <ul className={cn('space-y-2', nested && 'mt-2 border-l-2 border-amber-800/20 pl-4')}>
      {nodes.map((node) => (
        <li key={node.id}>
          <RootRow node={node} levels={levels} />
          {node.children.length > 0 && <RootOutline nodes={node.children} levels={levels} nested />}
        </li>
      ))}
    </ul>
  )
}

function RootRow({ node, levels }: { node: RootNodeView; levels: ItemLevels }) {
  const mastery = nodeMastery(node, levels)
  const mighty = mastery !== null && mastery >= 3

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-medium text-amber-950" style={{ opacity: rootOpacity(mastery) }}>
        {node.title}
      </span>
      {mastery === null ? (
        <span className="text-xs text-muted-foreground">no items yet</span>
      ) : (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <MasteryDots value={mastery} />
          <span className={cn('tabular-nums', mighty && 'font-medium text-yellow-700')}>
            {Number.isInteger(mastery) ? mastery : mastery.toFixed(1)}/3
            {mighty && ' ✨'}
          </span>
          <span>
            · {node.items.length} {node.items.length === 1 ? 'item' : 'items'}
          </span>
        </span>
      )}
    </div>
  )
}

function MasteryDots({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={cn(
            'size-2 rounded-full',
            value >= step ? 'bg-yellow-500' : value > step - 1 ? 'bg-yellow-500/45' : 'bg-muted-foreground/25',
          )}
        />
      ))}
    </span>
  )
}

export { RootOutline }

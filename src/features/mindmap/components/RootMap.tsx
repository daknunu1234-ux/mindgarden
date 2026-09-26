'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { displayMastery, isMightyRoot, rootOpacity } from '../hooks/nodeMastery'
import { ancestorPath, layoutRoots, NODE_H, NODE_W } from '../hooks/useRootLayout'
import type { ItemLevels, RootNodeView } from '../types'
import { RootNode } from './RootNode'

const ROOT_BROWN = '#92400e'
const GOLD = '#eab308'

type RootMapProps = {
  nodes: RootNodeView[]
  levels: ItemLevels
  // Used only to build "/deck/<slug>/drill?nodeId=<id>" links (mindmap → drill via URL).
  deckSlug: string
}

// Underground root system: SVG branch lines behind absolutely positioned HTML cards.
// Line opacity follows 0.35 + 0.65 × mastery / 3; hovering or focusing a root lights its path.
function RootMap({ nodes, levels, deckSlug }: RootMapProps) {
  const layout = useMemo(() => layoutRoots(nodes), [nodes])
  const mastery = useMemo(
    () => new Map(layout.nodes.map((n) => [n.node.id, displayMastery(n.node, levels)])),
    [layout, levels],
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const lit = useMemo(() => ancestorPath(layout, activeId), [layout, activeId])

  return (
    <div className="overflow-x-auto pb-2">
      <div
        role="group"
        aria-label="Mindmap of roots"
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          aria-hidden
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
        >
          {/* Trunk base where the roots leave the ground line. */}
          <circle cx={layout.trunk.x} cy={layout.trunk.y + 4} r={6} fill={ROOT_BROWN} opacity={0.8} />
          {layout.edges.map((edge) => {
            const m = mastery.get(edge.to) ?? null
            const highlighted = lit.has(edge.to)
            return (
              <path
                key={edge.to}
                d={edge.path}
                fill="none"
                stroke={isMightyRoot(m) ? GOLD : ROOT_BROWN}
                strokeWidth={highlighted ? 4 : 2.5}
                strokeLinecap="round"
                opacity={highlighted ? 1 : rootOpacity(m)}
                className="transition-[opacity,stroke-width] duration-300"
              />
            )
          })}
        </svg>

        {layout.nodes.map(({ node, x, y }) => (
          <div
            key={node.id}
            className={cn('absolute transition-transform duration-200', lit.has(node.id) && '-translate-y-0.5')}
            style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
            onMouseEnter={() => setActiveId(node.id)}
            onMouseLeave={() => setActiveId((id) => (id === node.id ? null : id))}
            onFocus={() => setActiveId(node.id)}
            onBlur={() => setActiveId((id) => (id === node.id ? null : id))}
          >
            <RootNode node={node} mastery={mastery.get(node.id) ?? null} deckSlug={deckSlug} />
          </div>
        ))}
      </div>
    </div>
  )
}

export { RootMap }

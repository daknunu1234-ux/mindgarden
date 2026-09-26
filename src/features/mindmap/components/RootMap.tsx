'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { ChevronsDownUp, ChevronsUpDown, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { getTreeSkin, MIGHTY_GOLD } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { allNodeIds, countDescendants, pruneCollapsed } from '../hooks/collapse'
import { displayMastery } from '../hooks/nodeMastery'
import { conduitPath, groundPath, rootStroke, sceneGeometry, type SurfaceBox } from '../hooks/scene'
import { ancestorPath, CROWN_Y, layoutRoots, NODE_H, NODE_W } from '../hooks/useRootLayout'
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from '../hooks/zoom'
import type { ItemLevels, RootNodeView } from '../types'
import { RootNode } from './RootNode'

const GRASS = '#65a30d'

type RootMapProps = {
  nodes: RootNodeView[]
  levels: ItemLevels
  // Used only to build "/deck/<slug>/drill?nodeId=<id>" links (mindmap → drill via URL).
  deckSlug: string
  // Tree skin (decks.tree_type): the roots use the same wood as the trunk.
  treeType: string
  // Drawn above the ground with its trunk base on the root conduit (the page passes the tree).
  surface?: SurfaceBox & { content: ReactNode }
  emptyLabel?: string
}

type Drag = { x: number; y: number; left: number; top: number; pointerId: number }

// One scene: tree above the ground line, soil below, a tapered conduit from the trunk into a
// root crown, and bezier roots out to each concept card. Everything lives in one canvas that
// is CSS-scaled for zoom and scrolled for pan, so the tree stays anchored to its roots.
// Line opacity follows 0.35 + 0.65 × mastery / 3; ≥ 2/3 glows in the skin tint, 3/3 in gold.
function RootMap({ nodes, levels, deckSlug, treeType, surface, emptyLabel }: RootMapProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [zoom, setZoom] = useState(1)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skin = getTreeSkin(treeType)

  // Mastery and counts always come from the full tree; only the layout sees collapsed branches.
  const fullById = useMemo(() => {
    const map = new Map<string, RootNodeView>()
    const walk = (list: RootNodeView[]) => list.forEach((n) => (map.set(n.id, n), walk(n.children)))
    walk(nodes)
    return map
  }, [nodes])
  const mastery = useMemo(
    () => new Map([...fullById.values()].map((n) => [n.id, displayMastery(n, levels)])),
    [fullById, levels],
  )
  const parentIds = useMemo(
    () => allNodeIds(nodes).filter((id) => (fullById.get(id)?.children.length ?? 0) > 0),
    [nodes, fullById],
  )

  const layout = useMemo(() => layoutRoots(pruneCollapsed(nodes, collapsed)), [nodes, collapsed])
  const scene = sceneGeometry(layout, surface ?? null, viewportWidth, zoom)
  const lit = useMemo(() => ancestorPath(layout, activeId), [layout, activeId])

  // Track the visible width so the canvas (and its soil) always fills it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth))
    observer.observe(el)
    setViewportWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Latest geometry for scroll adjustments that run after a zoom re-render.
  const latest = useRef({ trunkX: scene.trunkX, zoom })
  useEffect(() => {
    latest.current = { trunkX: scene.trunkX, zoom }
  })
  const afterRender = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))

  const centerOnTrunk = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current
    const { trunkX, zoom: z } = latest.current
    if (el) el.scrollTo({ left: trunkX * z - el.clientWidth / 2, top: 0, behavior })
  }, [])

  // Start with the tree in the middle of the view.
  const centeredOnce = useRef(false)
  useEffect(() => {
    if (!centeredOnce.current && viewportWidth > 0) {
      centeredOnce.current = true
      centerOnTrunk('auto')
    }
  }, [viewportWidth, centerOnTrunk])

  // Zoom around the middle of the view, measured from the trunk: the canvas width (and so the
  // trunk's x) changes with zoom, but the point you were looking at stays put.
  const zoomBy = (direction: 1 | -1) => {
    const el = scrollRef.current
    const next = stepZoom(zoom, direction)
    if (!el || next === zoom) return
    const fromTrunk = (el.scrollLeft + el.clientWidth / 2) / zoom - scene.trunkX
    const top = (el.scrollTop / zoom) * next
    setZoom(next)
    afterRender(() => {
      const { trunkX } = latest.current
      el.scrollTo({ left: (trunkX + fromTrunk) * next - el.clientWidth / 2, top })
    })
  }

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id))

  const resetView = () => {
    setZoom(1)
    afterRender(() => centerOnTrunk('smooth'))
  }

  // Mouse drag on empty canvas pans it. Touch already scrolls natively; cards keep their clicks.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return
    if ((e.target as HTMLElement).closest('a, button, article')) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, pointerId: e.pointerId }
    el.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    const d = drag.current
    if (!el || !d || d.pointerId !== e.pointerId) return
    el.scrollLeft = d.left - (e.clientX - d.x)
    el.scrollTop = d.top - (e.clientY - d.y)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) {
      scrollRef.current?.releasePointerCapture(e.pointerId)
      drag.current = null
    }
  }

  const id = (name: string) => `${uid}-${name}`
  const { groundY, offsetX, trunkX } = scene

  return (
    <div className="space-y-2">
      {nodes.length > 0 && (
        <div role="toolbar" aria-label="Mindmap view" className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => zoomBy(-1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => zoomBy(1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <ZoomIn />
          </Button>
          <Button variant="outline" size="sm" onClick={resetView}>
            <RotateCcw /> Reset view
          </Button>
          {parentIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
              aria-pressed={allCollapsed}
            >
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="max-h-[80vh] cursor-grab overflow-auto rounded-xl border bg-background active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* The sizer reserves the zoomed size so scrollbars match; the canvas inside is scaled. */}
        {/* Centered until the viewport is measured (server render), so the first paint doesn't jump. */}
        <div
          className={cn('relative', viewportWidth === 0 && 'mx-auto')}
          style={{ width: scene.width * zoom, height: scene.height * zoom }}
        >
          <div
            role="group"
            aria-label="Tree and its roots"
            className="absolute top-0 left-0 origin-top-left transition-transform duration-200"
            style={{ width: scene.width, height: scene.height, transform: `scale(${zoom})` }}
          >
            <svg aria-hidden width={scene.width} height={scene.height} className="absolute inset-0">
              <defs>
                <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ecfccb" stopOpacity="0.5" />
                  <stop offset="1" stopColor="#ecfccb" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={id('soil')} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#b98d5f" stopOpacity="0.45" />
                  <stop offset="0.25" stopColor="#d6b58c" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#fef3c7" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id={id('conduit')} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={skin.bark} />
                  <stop offset="1" stopColor={skin.barkDeep} />
                </linearGradient>
                <filter id={id('glow-soft')} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id={id('glow-gold')} x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {layout.edges.map((edge) => {
                  const s = rootStroke(mastery.get(edge.to) ?? null, { bark: skin.bark, glow: skin.glow, gold: MIGHTY_GOLD })
                  return (
                    <linearGradient
                      key={edge.to}
                      id={id(`edge-${edge.to}`)}
                      gradientUnits="userSpaceOnUse"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                    >
                      <stop offset="0" stopColor={s.from} />
                      <stop offset="1" stopColor={s.to} />
                    </linearGradient>
                  )
                })}
              </defs>

              {/* Sky above, soil below, with a few faint strata for an organic feel. */}
              <rect x="0" y="0" width={scene.width} height={groundY} fill={`url(#${id('sky')})`} />
              <rect x="0" y={groundY} width={scene.width} height={scene.height - groundY} fill={`url(#${id('soil')})`} />
              {[0.35, 0.62].map((f) => (
                <path
                  key={f}
                  d={groundPath(scene.width, groundY + (scene.height - groundY) * f, 5)}
                  fill="none"
                  stroke="#b98d5f"
                  strokeOpacity="0.12"
                  strokeWidth="10"
                />
              ))}

              {/* Roots, in the layout's coordinates (y = 0 is the ground line). */}
              <g transform={`translate(${offsetX} ${groundY})`}>
                {layout.edges.map((edge) => {
                  const s = rootStroke(
                    mastery.get(edge.to) ?? null,
                    { bark: skin.bark, glow: skin.glow, gold: MIGHTY_GOLD },
                    lit.has(edge.to),
                  )
                  return (
                    <path
                      key={edge.to}
                      d={edge.path}
                      fill="none"
                      stroke={`url(#${id(`edge-${edge.to}`)})`}
                      strokeWidth={s.width}
                      strokeLinecap="round"
                      opacity={s.opacity}
                      filter={s.glow === 'none' ? undefined : `url(#${id(`glow-${s.glow}`)})`}
                      className="transition-[opacity,stroke-width] duration-300"
                    />
                  )
                })}
              </g>

              {/* Main conduit from the trunk through the ground into the root crown. */}
              {nodes.length > 0 && (
                <>
                  <path d={conduitPath(trunkX, groundY, CROWN_Y)} fill={`url(#${id('conduit')})`} />
                  <circle cx={trunkX} cy={groundY + CROWN_Y} r={4} fill={skin.barkDeep} />
                </>
              )}

              {/* Ground line on top, so the trunk visibly emerges from the soil. */}
              <path d={groundPath(scene.width, groundY)} fill="none" stroke={GRASS} strokeWidth="3" strokeLinecap="round" />
              <path
                d={groundPath(scene.width, groundY + 3, 2)}
                fill="none"
                stroke="#8b6b43"
                strokeOpacity="0.35"
                strokeWidth="2"
              />
            </svg>

            {surface && scene.surface && (
              <div
                className="pointer-events-none absolute"
                style={{ left: scene.surface.left, top: scene.surface.top, width: surface.width, height: surface.height }}
              >
                {surface.content}
              </div>
            )}

            {nodes.length === 0 && emptyLabel && (
              <p
                className="absolute -translate-x-1/2 text-center text-sm text-amber-900/70"
                style={{ left: trunkX, top: groundY + 48, width: Math.min(360, scene.width - 32) }}
              >
                {emptyLabel}
              </p>
            )}

            {layout.nodes.map(({ node, x, y }) => {
              const full = fullById.get(node.id) ?? node
              const hasChildren = full.children.length > 0
              return (
                <div
                  key={node.id}
                  className={cn('absolute transition-transform duration-200', lit.has(node.id) && '-translate-y-0.5')}
                  style={{ left: offsetX + x, top: groundY + y, width: NODE_W, height: NODE_H }}
                  onMouseEnter={() => setActiveId(node.id)}
                  onMouseLeave={() => setActiveId((current) => (current === node.id ? null : current))}
                  onFocus={() => setActiveId(node.id)}
                  onBlur={() => setActiveId((current) => (current === node.id ? null : current))}
                >
                  <RootNode
                    node={full}
                    mastery={mastery.get(node.id) ?? null}
                    deckSlug={deckSlug}
                    collapse={
                      hasChildren
                        ? {
                            collapsed: collapsed.has(node.id),
                            hiddenCount: countDescendants(full),
                            onToggle: () => toggle(node.id),
                          }
                        : null
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export { RootMap }

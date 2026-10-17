'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Maximize, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { GameButton, HoverActionButton, HoverActions } from '@/shared/components/game'
import { masteryFraction } from '@/shared/lib/mastery'
import { getTreeSkin, MIGHTY_GOLD } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { MAX_ZOOM, MIN_ZOOM, zoomPercent } from '../hooks/chartCamera'
import { allNodeIds, indexNodes } from '../hooks/collapse'
import { branchItemIds, displayMastery, isMightyRoot, rootOpacity } from '../hooks/nodeMastery'
import { CHART, layoutRootTree, ROOT_STATUS_LABEL, rootStatus, type RootStatus } from '../hooks/orgChartLayout'
import { useChartCamera } from '../hooks/useChartCamera'
import type { ItemLevels, MindmapOwnerTools, MindmapPractice, RootNodeView } from '../types'
import { MasteryRing } from './MasteryRing'
import { NodeInspector } from './NodeInspector'

type RootChartProps = {
  nodes: RootNodeView[]
  levels: ItemLevels
  // Tree skin (decks.tree_type): the root tendrils use the same wood as the trunk.
  treeType: string
  // The tree's name and growth stage ("🌳 Mature Canopy"), on the floating label beside the tree.
  title?: string
  stageLabel?: string
  // The tree's drawing, standing free at the top (the page passes the garden sprite), and where its
  // trunk meets the ground as fractions of the drawing's box (default: half-way across, 90% down).
  surface?: { content: ReactNode; base?: { x: number; y: number } }
  emptyLabel?: string
  // Deck owners: manage a root (rename, add, remove) and add a top-level root. The page wires
  // these to the decks feature; the chart itself never calls actions.
  onManage?: (nodeId: string) => void
  onAddRoot?: () => void
  // Deck owners: edit / delete a root or a statement (the page opens the dialogs and confirms).
  ownerTools?: MindmapOwnerTools
  // Practice shortcuts ("Drill" / "Compete") open the page's launch pop-up. null = strict read-only
  // visitor mode: no practice at all (visitors clone, or join a hosted Mind Tournament).
  practice?: MindmapPractice | null
  // item id → true statement text, for the statements drawer.
  statements?: Readonly<Record<string, string>>
}

// Badge colours per status: soft, readable chips on the card.
const STATUS_STYLE: Record<RootStatus, string> = {
  empty: 'border-stone-300 bg-stone-100 text-stone-600',
  seed: 'border-amber-300 bg-amber-100 text-amber-900',
  growing: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  thriving: 'border-lime-400 bg-lime-100 text-lime-900',
  mighty: 'border-yellow-400 bg-yellow-100 text-yellow-900',
}
const STATUS_ICON: Record<RootStatus, string> = { empty: '▫️', seed: '🌰', growing: '🌱', thriving: '🌿', mighty: '🌟' }

// A root card at rest shows only its mastery ring and its title. Everything else (status chip,
// statement count, practice, owner tools) is hidden and unclickable until the card is hovered, holds
// keyboard focus or is the one open in the drawer; touch screens, which can't hover, always show it.
const REVEAL =
  'pointer-events-none opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-data-[selected=true]:pointer-events-auto group-data-[selected=true]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'
// The title slides up a little to make room for the revealed row (the card itself never moves).
const LIFT =
  'transition-transform duration-150 motion-reduce:transition-none group-hover:-translate-y-3.5 group-focus-within:-translate-y-3.5 group-data-[selected=true]:-translate-y-3.5 [@media(hover:none)]:-translate-y-3.5'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// "Tree & roots": a diorama of the tree and everything under it, on a zoomable, pannable canvas.
// The tree stands free on the ground line, swaying, with a small floating label (title, stage,
// mastery) beside its trunk: no box round it. A taproot drops from the foot of the trunk into the
// soil and branches into tendrils that reach the top-level roots; every sub-root hangs under its
// parent, tier by tier. Sky above the ground, soil below (painted by the frame, following the
// camera). Only roots are drawn, and statements never appear on the canvas. A card at rest is its
// progress ring and its title, large and dark; its status chip, statement count, practice button and
// the owner's tools fade in on hover, keyboard focus or selection. Clicking a card opens that root's
// statements in the side drawer
// (`NodeInspector`). Layout is pure (hooks/orgChartLayout.ts); the camera is one CSS transform on the
// chart (hooks/useChartCamera.ts): drag the background to pan in any direction, wheel or pinch to
// zoom (50%–180%), or use the corner buttons. No filters.
function RootChart({ nodes, levels, treeType, title, stageLabel, surface, emptyLabel, onManage, onAddRoot, ownerTools, practice = null, statements }: RootChartProps) {
  // Root (or sub-root) shown in the statements drawer.
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const skin = getTreeSkin(treeType)

  const byId = useMemo(() => indexNodes(nodes), [nodes])
  const layout = useMemo(() => layoutRootTree(nodes), [nodes])
  const world = useMemo(() => ({ w: layout.width, h: layout.height }), [layout.width, layout.height])
  const camera = useChartCamera(frameRef, worldRef, world, layout.base.y)
  // An inspected root that was deleted (after a refresh) simply closes the drawer.
  const inspected = inspectedId ? (byId.get(inspectedId) ?? null) : null
  const inspect = useCallback((id: string) => setInspectedId(id), [])

  const allItems = useMemo(() => nodes.flatMap(branchItemIds), [nodes])
  const rootCount = useMemo(() => allNodeIds(nodes).length, [nodes])
  const overall = allItems.length === 0 ? null : allItems.reduce((sum, id) => sum + (levels[id] ?? 0), 0) / allItems.length
  const wood = skin.bark

  return (
    <div className="space-y-3">
      <div role="toolbar" aria-label="Tree and roots" className="flex flex-wrap items-center gap-2">
        {onAddRoot && (
          <GameButton tone="leaf" size="sm" onClick={onAddRoot}>
            <Plus className="size-4" strokeWidth={3} /> Add root
          </GameButton>
        )}
        <span className="rounded-full bg-emerald-900/10 px-2.5 py-1 font-game text-xs font-bold text-emerald-950">
          {plural(rootCount, 'root', 'roots')} · {plural(allItems.length, 'statement', 'statements')}
        </span>
        <span className="ml-auto hidden font-game text-xs font-bold text-emerald-900/55 sm:inline">Drag to move · scroll or pinch to zoom · open a root to read its statements</span>
      </div>

      {/* The canvas in a chunky wooden frame. */}
      <div className="relative h-[68vh] max-h-[760px] min-h-[420px] overflow-hidden rounded-[24px] border-[5px] border-amber-800 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.3),0_6px_0_#451a03,0_16px_30px_rgba(69,26,3,0.25)]">
        {/* Canvas controls, in the corner (outside the dragged area, so they never pan). */}
        <div role="toolbar" aria-label="Canvas view" className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-2xl border-2 border-amber-900/20 bg-[#fffaf0]/90 p-1.5 shadow-[0_3px_0_rgba(120,53,15,0.25)]">
          <GameButton tone="cream" size="icon-sm" onClick={camera.zoomOut} disabled={camera.percent <= zoomPercent(MIN_ZOOM)} aria-label="Zoom out">
            <ZoomOut className="size-4" strokeWidth={2.5} />
          </GameButton>
          <span className="min-w-12 rounded-full bg-slate-900/75 px-2 py-0.5 text-center font-game text-xs font-bold text-white tabular-nums" aria-live="polite" aria-label={`Zoom ${camera.percent}%`}>
            {camera.percent}%
          </span>
          <GameButton tone="cream" size="icon-sm" onClick={camera.zoomIn} disabled={camera.percent >= zoomPercent(MAX_ZOOM)} aria-label="Zoom in">
            <ZoomIn className="size-4" strokeWidth={2.5} />
          </GameButton>
          <GameButton tone="cream" size="icon-sm" onClick={camera.fit} aria-label="Fit to screen" title="Fit the whole tree on screen">
            <Maximize className="size-4" strokeWidth={2.5} />
          </GameButton>
        </div>

        <div
          ref={frameRef}
          role="group"
          aria-label="Tree and its roots"
          // Sky above the ground line, a strip of turf on it, soil beneath: one gradient whose stops
          // sit on `--mg-ground`, the ground line's place on screen (the camera hook keeps it current).
          className="mg-chart-ground absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
          {...camera.handlers}
        >
          {/* The chart: one element moved by the camera's translate3d + scale (set by the hook). */}
          <div ref={worldRef} data-chart-world className="absolute top-0 left-0 origin-top-left will-change-transform" style={{ width: layout.width, height: layout.height }}>
            {/* Under the ground: the ring of soil the trunk stands in, the taproot diving from the
                foot of the trunk, and the tendrils it branches into (smooth curves from each parent's
                foot, or the taproot's end, to its child's head). */}
            <svg aria-hidden width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0 overflow-visible" fill="none" strokeLinecap="round">
              <g data-root-ring>
                <ellipse cx={layout.base.x + 2} cy={layout.base.y + 3} rx={34} ry={9.5} fill="rgba(20, 40, 15, 0.35)" />
                <ellipse cx={layout.base.x} cy={layout.base.y + 1} rx={29} ry={7.5} fill="#b08863" />
                <ellipse cx={layout.base.x + 0.6} cy={layout.base.y + 1.8} rx={25.5} ry={6} fill="#7a5537" />
                <ellipse cx={layout.base.x + 1.2} cy={layout.base.y + 2.6} rx={23.5} ry={5} fill="#966e4a" />
              </g>
              {nodes.length > 0 && (
                <g data-taproot>
                  <path d={layout.taproot.path} fill={skin.barkDeep} opacity={0.35} transform="translate(1.5 1)" />
                  <path d={layout.taproot.path} fill={wood} />
                  <circle cx={layout.taproot.x} cy={layout.taproot.y2} r={5.5} fill={skin.barkDeep} />
                </g>
              )}
              {layout.edges.map((edge) => {
                const node = byId.get(edge.to)
                const mastery = node ? displayMastery(node, levels) : null
                const status = rootStatus(mastery)
                // The tendril into a root shows how well it is mastered: brighter, gold at 5/5. It
                // thins with every tier, like a real root.
                const color = status === 'mighty' ? MIGHTY_GOLD : status === 'thriving' ? skin.glow : wood
                const width = Math.max(3, 7 - edge.depth * 1.6)
                return (
                  <g key={edge.to} data-edge={edge.to} data-edge-from={edge.from ?? 'tree'}>
                    <path d={edge.path} stroke={skin.barkDeep} strokeWidth={width + 2} opacity={0.35} />
                    <path d={edge.path} stroke={wood} strokeWidth={width} />
                    <path d={edge.path} stroke={color} strokeWidth={width * 0.45} opacity={rootOpacity(mastery)} />
                    <circle cx={edge.x2} cy={edge.y2} r={width * 0.7} fill={color} stroke={wood} strokeWidth={1.6} />
                  </g>
                )
              })}
            </svg>

            {/* The tree itself: free-standing, no box. It sways about the foot of its trunk (the same
                idle motion as on the farm; off for reduced motion), so the foot stays on its soil ring. */}
            {surface && (
              <div data-chart-tree className="pointer-events-none absolute" style={{ left: layout.tree.x, top: layout.tree.y, width: layout.tree.w, height: layout.tree.h }}>
                <div className="mg-tree-sway size-full" style={{ transformOrigin: `${(surface.base?.x ?? CHART.tree.baseX) * 100}% ${(surface.base?.y ?? CHART.tree.baseY) * 100}%` }}>
                  {surface.content}
                </div>
              </div>
            )}

            {/* A floating label beside the trunk: the tree's name, its stage and its mastery. */}
            <div
              data-chart-label
              className="absolute flex items-center gap-2 rounded-full border border-white/15 bg-black/60 py-1 pr-4 pl-1.5 text-white shadow-[0_3px_0_rgba(0,0,0,0.25)]"
              style={{ left: layout.label.x, top: layout.label.y, maxWidth: layout.label.w, height: layout.label.h }}
            >
              <span className="rounded-full bg-amber-50 p-0.5">
                <MasteryRing value={overall} mighty={isMightyRoot(overall)} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-game text-sm leading-tight font-extrabold" title={title}>
                  {title ?? 'This tree'}
                </span>
                <span className="block truncate font-game text-[11px] leading-tight font-bold text-emerald-200">
                  {stageLabel && `${stageLabel} · `}
                  {overall === null ? 'nothing to master yet' : `mastery ${masteryFraction(overall)}`}
                </span>
              </span>
            </div>

            {nodes.length === 0 && emptyLabel && (
              <p className="absolute w-80 -translate-x-1/2 text-center text-sm font-medium text-amber-950/80" style={{ left: layout.width / 2, top: layout.base.y + 22 }}>
                {emptyLabel}
              </p>
            )}

            {/* The roots, every tier: compact cards. */}
            {layout.cards.map((box) => {
              const node = byId.get(box.nodeId)
              if (!node) return null
              const mastery = displayMastery(node, levels)
              const status = rootStatus(mastery)
              const own = node.items.length
              const branch = branchItemIds(node).length
              const top = box.depth === 0
              return (
                <article
                  key={node.id}
                  data-root-card={node.id}
                  data-depth={box.depth}
                  data-status={status}
                  data-selected={inspectedId === node.id}
                  aria-label={`${top ? 'Root' : 'Sub-root'} ${node.title}: ${ROOT_STATUS_LABEL[status]}`}
                  className={cn(
                    'group absolute rounded-2xl border-2 transition-shadow duration-150 hover:shadow-[0_5px_0_rgba(120,53,15,0.35)]',
                    status === 'mighty' ? 'border-yellow-500 bg-[#fffbea] shadow-[0_3px_0_#ca8a04]' : 'border-amber-900/35 bg-[#fffdf8] shadow-[0_3px_0_rgba(120,53,15,0.28)]',
                    inspectedId === node.id && 'ring-4 ring-sky-300/80',
                  )}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                >
                  {/* The whole card opens the statements. At rest it shows the ring and the name only. */}
                  <button
                    type="button"
                    onClick={() => inspect(node.id)}
                    aria-label={`Open ${node.title}: ${plural(own, 'statement', 'statements')}${node.children.length > 0 ? `, ${plural(node.children.length, 'sub-root', 'sub-roots')}` : ''}`}
                    className="flex size-full items-center rounded-[14px] px-3 text-left focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
                  >
                    <span data-card-title className={cn('flex min-w-0 flex-1 items-center gap-2.5', LIFT)}>
                      <MasteryRing value={mastery} mighty={status === 'mighty'} />
                      <span className={cn(top ? 'text-[17px]' : 'text-base', 'line-clamp-2 min-w-0 flex-1 font-game leading-[1.25] font-extrabold text-stone-950')} title={node.title}>
                        {node.title}
                      </span>
                    </span>
                  </button>
                  {/* Revealed on hover / focus / selection: status, statement count, practice. */}
                  <div data-card-actions className={cn('absolute inset-x-2.5 bottom-2 flex items-center gap-1.5', REVEAL)}>
                    <span className={cn('inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-game text-[11px] font-extrabold', STATUS_STYLE[status])}>
                      <span aria-hidden>{STATUS_ICON[status]}</span>
                      <span className="truncate">{ROOT_STATUS_LABEL[status]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => inspect(node.id)}
                      aria-label={`View the statements of ${node.title}`}
                      title={`View ${plural(own, 'statement', 'statements')}`}
                      className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 font-game text-[11px] font-extrabold text-sky-900 transition-colors hover:bg-sky-100 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
                    >
                      <span aria-hidden>📜</span> {own}
                    </button>
                    {/* Rounds start from top-level roots; a sub-root is drilled from its drawer. */}
                    {practice && top && branch > 0 && (
                      <button
                        type="button"
                        onClick={() => practice.onPractice({ rootId: node.id })}
                        aria-label={practice.mode === 'compete' ? `Compete on the root ${node.title}` : `Drill the root ${node.title}`}
                        title={practice.mode === 'compete' ? 'Compete on this root' : 'Drill this root'}
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full border text-sm transition-colors focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none',
                          practice.mode === 'compete' ? 'border-amber-400 bg-amber-100 hover:bg-amber-200' : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100',
                        )}
                      >
                        {practice.mode === 'compete' ? '⚔️' : '💧'}
                      </button>
                    )}
                  </div>
                  {/* Owner tools float over the card's corner, revealed the same way. */}
                  {(ownerTools || onManage) && (
                    <HoverActions placement="corner" label={`Tools for root ${node.title}`} className="duration-150 group-data-[selected=true]:pointer-events-auto group-data-[selected=true]:opacity-100">
                      {ownerTools && <HoverActionButton icon="✏️" label={`Edit root ${node.title}`} tone="edit" onClick={() => ownerTools.onEditRoot({ id: node.id, title: node.title })} />}
                      {ownerTools?.onToggleType && !top && (
                        <HoverActionButton icon="⇄" label={`Make ${node.title} a statement, where it stands`} onClick={() => ownerTools.onToggleType?.({ id: node.id })} />
                      )}
                      {ownerTools && <HoverActionButton icon="🗑️" label={`Delete root ${node.title}`} tone="delete" onClick={() => ownerTools.onDeleteRoot(node.id)} />}
                      {onManage && <HoverActionButton icon="⚙️" label={`Manage ${node.title}: add statements and sub-branches`} onClick={() => onManage(node.id)} />}
                    </HoverActions>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <NodeInspector
        node={inspected}
        topLevel={inspected !== null && nodes.some((n) => n.id === inspected.id)}
        levels={levels}
        onOpenChange={(open) => !open && setInspectedId(null)}
        onInspect={inspect}
        onManage={onManage}
        ownerTools={ownerTools}
        practice={practice}
        statements={statements}
      />
    </div>
  )
}

export { RootChart }

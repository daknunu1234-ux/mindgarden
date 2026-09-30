'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Crosshair, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { GameButton } from '@/shared/components/game'
import { useCamera } from '@/shared/hooks/useCamera'
import { centreOffset, contentSize, MAX_ZOOM, MIN_ZOOM } from '@/shared/lib/camera'
import { getTreeSkin, MIGHTY_GOLD } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { collapsibleNodeIds, indexNodes } from '../hooks/collapse'
import {
  ancestorKeys,
  branchNodeIds,
  CROWN_Y,
  descendantKeys,
  DRAFT_KEY,
  layoutMindmap,
  nodeKey,
  type MindmapCard,
  type MindmapDraftSlot,
} from '../hooks/mindmapLayout'
import { branchItemIds, displayMastery } from '../hooks/nodeMastery'
import { nextQuickSlot, parentIndex, quickAddPrompt, resolveSlot, type QuickAddKey } from '../hooks/quickAdd'
import { conduitPath, groundPath, rootStroke, sceneGeometry, type SurfaceBox } from '../hooks/scene'
import type { ItemLevels, MindmapAuthoring, MindmapOwnerTools, MindmapPractice, RootNodeView, StatementStatus } from '../types'
import { NodePill, QuickAddCard, RootSwitcher, StatementCard, type RootChip } from './MindmapCards'
import { NodeInspector } from './NodeInspector'

const GRASS = '#65a30d'
// Where a root lands when you jump to it: horizontally centred, this far below the canvas top.
const JUMP_TOP = 64

type RootMapProps = {
  nodes: RootNodeView[]
  levels: ItemLevels
  // Tree skin (decks.tree_type): the roots use the same wood as the trunk.
  treeType: string
  // Drawn above the ground with its trunk base on the root conduit (the page passes the tree).
  surface?: SurfaceBox & { content: ReactNode }
  emptyLabel?: string
  // Deck owners: the full manage dialog for a root (bulk add, lists). The page wires it to the decks
  // feature; the mindmap itself never calls actions.
  onManage?: (nodeId: string) => void
  // Deck owners: 🗑️ delete a statement / 'Delete Root' in the root drawer (the page confirms).
  ownerTools?: MindmapOwnerTools
  // Deck owners: fast entry on the canvas (quick-add inputs, inline rename, the floating ＋ Root).
  authoring?: MindmapAuthoring
  // Deck owners: ⏳ saving / 💧 not drillable micro-badges on statement cards.
  itemStatus?: Readonly<Record<string, StatementStatus>>
  // Practice shortcuts ("Drill Root" / "Compete Root") open the page's launch pop-up. null = strict
  // read-only visitor mode: no practice at all (visitors clone, or join a hosted Mind Tournament).
  practice?: MindmapPractice | null
  // item id → true statement text (the owner's from the editor, visitors' from the reader). Missing
  // or blank texts fall back to the prompt / "Statement n".
  statements?: Readonly<Record<string, string>>
}

// "Inspect Roots": the deck's knowledge as a mindmap growing out of the tree. Crown under the
// trunk → category pills in a row → statements and sub-branches stacked in columns, joined by
// Bezier roots. Pills collapse their branch; everything at 5/5 glows gold. Layout is pure
// (hooks/mindmapLayout.ts); the camera (drag, pinch, Ctrl/⌘ + wheel, fit) is shared with the farm.
// A root switcher above the canvas glides the camera to any top-level root. Owners type straight
// onto the canvas: ＋ Root (always in the corner), ＋📜 / ＋🌿 on a root's hover tools, then
// Enter / Tab / Shift+Tab to keep going (hooks/quickAdd.ts), ✏️ to rename in place.
function RootMap({
  nodes,
  levels,
  treeType,
  surface,
  emptyLabel,
  onManage,
  ownerTools,
  authoring,
  itemStatus,
  practice = null,
  statements,
}: RootMapProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // Root shown in the inspector drawer (its branch is expanded and lit on the canvas).
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  // The owner's open quick-add input, and the root being renamed in place.
  const [draft, setDraft] = useState<MindmapDraftSlot | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // The root last jumped to from the switcher (highlighted there).
  const [jumpedId, setJumpedId] = useState<string | null>(null)
  // Camera moves waiting for the next layout (a jump after expanding, the input after it moves).
  const pendingJump = useRef<string | null>(null)
  const pendingReveal = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skin = getTreeSkin(treeType)

  // Mastery always comes from the full tree; only the layout sees collapsed branches.
  const byId = useMemo(() => indexNodes(nodes), [nodes])
  const parents = useMemo(() => parentIndex(nodes), [nodes])
  const collapsible = useMemo(() => collapsibleNodeIds(nodes), [nodes])
  // The open input follows its root from a temp id to the real one when the save confirms; an input
  // under a node that has gone (deleted, or its save refused) simply isn't drawn.
  const liveDraft = useMemo(() => {
    if (!draft) return null
    const slot = authoring ? resolveSlot(draft, authoring.resolveId) : draft
    return slot.kind === 'root' || byId.has(slot.kind === 'branch' ? slot.parentId : slot.nodeId) ? slot : null
  }, [draft, authoring, byId])
  const renaming = renamingId && authoring ? authoring.resolveId(renamingId) : renamingId
  const layout = useMemo(() => layoutMindmap(nodes, collapsed, liveDraft), [nodes, collapsed, liveDraft])
  const scene = useMemo(() => sceneGeometry(layout, surface ?? null), [layout, surface])
  // An inspected node that was deleted (after a refresh) simply closes the drawer.
  const inspected = inspectedId ? (byId.get(inspectedId) ?? null) : null
  const lit = useMemo(() => {
    const keys = ancestorKeys(layout, activeKey)
    if (inspected) {
      const key = nodeKey(inspected.id)
      for (const k of ancestorKeys(layout, key)) keys.add(k)
      for (const k of descendantKeys(layout, key)) keys.add(k)
    }
    return keys
  }, [layout, activeKey, inspected])

  // Show a node's whole path: it and every root above it expanded.
  const expandTo = useCallback(
    (id: string) => {
      const path = new Set<string>()
      for (let at: string | null | undefined = id; at; at = parents.get(at)) path.add(at)
      setCollapsed((prev) => new Set([...prev].filter((c) => !path.has(c))))
    },
    [parents],
  )

  // Inspect: expand the whole branch, light it, open the drawer. Camera untouched.
  const inspect = useCallback(
    (id: string) => {
      const node = byId.get(id)
      if (!node) return
      const branch = new Set(branchNodeIds(node))
      setCollapsed((prev) => new Set([...prev].filter((c) => !branch.has(c))))
      setInspectedId(id)
    },
    [byId],
  )

  const masteryOf = useCallback(
    (card: MindmapCard): number | null => {
      if (card.kind === 'draft') return null
      if (card.itemId) return levels[card.itemId] ?? 0
      const node = byId.get(card.nodeId)
      return node ? displayMastery(node, levels) : null
    },
    [byId, levels],
  )

  // Camera: fit the tree + roots on arrival and on "Center"; the soil runs on past them.
  const world = useMemo(() => ({ w: scene.width, h: scene.height }), [scene.width, scene.height])
  const fit = useMemo(() => ({ w: scene.focus.w, h: scene.focus.h }), [scene.focus.w, scene.focus.h])
  const focus = useMemo(
    () => ({ x: scene.focus.x + scene.focus.w / 2, y: scene.focus.y + scene.focus.h / 2 }),
    [scene.focus.x, scene.focus.y, scene.focus.w, scene.focus.h],
  )
  const camera = useCamera(scrollRef, world, focus, fit)
  const { zoom, view, panTo, reveal } = camera
  const content = contentSize(view, world, zoom)
  const offset = { x: centreOffset(view.w, world.w, zoom), y: centreOffset(view.h, world.h, zoom) }
  const { groundY, offsetX, trunkX } = scene

  // After the layout settles: glide to the root picked in the switcher, or keep the quick-add input
  // on screen as it moves (only when it would be off screen).
  useEffect(() => {
    const jump = pendingJump.current
    if (jump) {
      pendingJump.current = null
      const card = layout.cards.find((c) => c.key === nodeKey(jump))
      if (card) panTo({ x: offsetX + card.x + card.w / 2, y: groundY + card.y }, { x: view.w / 2, y: JUMP_TOP })
    }
    if (pendingReveal.current) {
      pendingReveal.current = false
      const card = layout.cards.find((c) => c.key === DRAFT_KEY)
      if (card) reveal({ x: offsetX + card.x, y: groundY + card.y, w: card.w, h: card.h + 40 })
    }
  }, [layout, offsetX, groundY, view.w, panTo, reveal])

  const jumpTo = useCallback(
    (id: string) => {
      pendingJump.current = id
      setJumpedId(id)
      expandTo(id)
    },
    [expandTo],
  )

  // Open (or move) the quick-add input; its target is expanded so the input shows.
  const openDraft = useCallback(
    (slot: MindmapDraftSlot | null) => {
      setDraft(slot)
      if (!slot) return
      pendingReveal.current = true
      if (slot.kind !== 'root') expandTo(slot.kind === 'branch' ? slot.parentId : slot.nodeId)
    },
    [expandTo],
  )

  // A quick-add key: save what was typed (optimistic, via the page), then move the input on.
  const onQuickKey = (key: QuickAddKey, text: string) => {
    if (!liveDraft || !authoring) return
    const typed = text.trim()
    let created: string | null = null
    if (typed) {
      if (liveDraft.kind === 'root') created = authoring.addRoot(typed)
      else if (liveDraft.kind === 'branch') created = authoring.addBranch(liveDraft.parentId, typed)
      else authoring.addStatement(liveDraft.nodeId, typed)
    }
    openDraft(nextQuickSlot(liveDraft, key, typed.length > 0, created, parents))
  }

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const allCollapsed = collapsible.length > 0 && collapsible.every((id) => collapsed.has(id))

  const id = (name: string) => `${uid}-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const colors = { bark: skin.bark, glow: skin.glow, gold: MIGHTY_GOLD }
  const cardByKey = new Map(layout.cards.map((c) => [c.key, c]))
  const draftCard = cardByKey.get(DRAFT_KEY)
  const draftPrompt = liveDraft ? quickAddPrompt(liveDraft, (nodeId) => byId.get(nodeId)?.title) : null
  const chips: RootChip[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    statementCount: branchItemIds(n).length,
    mastery: displayMastery(n, levels),
    pending: authoring?.isPending(n.id) ?? false,
  }))

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="Mindmap view" className="flex flex-wrap items-center gap-1.5">
        <GameButton tone="cream" size="icon-sm" onClick={camera.zoomOut} disabled={zoom <= MIN_ZOOM + 1e-3} aria-label="Zoom out">
          <ZoomOut className="size-4" strokeWidth={2.5} />
        </GameButton>
        <span className="rounded-full bg-slate-900/70 px-2 py-0.5 font-game text-xs font-bold text-white tabular-nums" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <GameButton tone="cream" size="icon-sm" onClick={camera.zoomIn} disabled={zoom >= MAX_ZOOM - 1e-3} aria-label="Zoom in">
          <ZoomIn className="size-4" strokeWidth={2.5} />
        </GameButton>
        <GameButton tone="cream" size="sm" onClick={camera.resetView}>
          <Crosshair className="size-4" /> Center
        </GameButton>
        {collapsible.length > 0 && (
          <GameButton
            tone="cream"
            size="sm"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(collapsible))}
            aria-pressed={allCollapsed}
          >
            {allCollapsed ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </GameButton>
        )}
        <span className="ml-auto hidden font-game text-xs font-bold text-emerald-900/55 sm:inline">Drag to move · Ctrl + scroll or pinch to zoom</span>
      </div>

      <RootSwitcher roots={chips} activeId={jumpedId} onJump={jumpTo} />

      {/* Canvas in a chunky wooden frame. */}
      <div className="relative h-[72vh] max-h-[860px] min-h-[460px] overflow-hidden rounded-[24px] border-[5px] border-amber-800 bg-[#f1e4cc] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.3),0_6px_0_#451a03,0_16px_30px_rgba(69,26,3,0.25)]">
        <div
          ref={scrollRef}
          className="absolute inset-0 cursor-grab touch-none overflow-auto overscroll-contain select-none [scrollbar-width:thin] active:cursor-grabbing"
          {...camera.handlers}
        >
          <div className="relative" style={{ width: content.w, height: content.h }}>
            <div
              role="group"
              aria-label="Tree and its roots"
              className="absolute origin-top-left"
              style={{ left: offset.x, top: offset.y, width: world.w, height: world.h, transform: `scale(${zoom})` }}
            >
              <svg aria-hidden width={world.w} height={world.h} className="absolute inset-0">
                <defs>
                  <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e0f2fe" />
                    <stop offset="1" stopColor="#f0fdf4" />
                  </linearGradient>
                  <linearGradient id={id('soil')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#c8a279" />
                    <stop offset="0.3" stopColor="#dcc19b" />
                    <stop offset="1" stopColor="#f1e4cc" />
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
                    const card = cardByKey.get(edge.to)
                    const s = rootStroke(card ? masteryOf(card) : null, colors)
                    return (
                      <linearGradient key={edge.to} id={id(`edge-${edge.to}`)} gradientUnits="userSpaceOnUse" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}>
                        <stop offset="0" stopColor={s.from} />
                        <stop offset="1" stopColor={s.to} />
                      </linearGradient>
                    )
                  })}
                </defs>

                {/* Sky, soil and faint strata. */}
                <rect x="0" y="0" width={world.w} height={groundY} fill={`url(#${id('sky')})`} />
                <rect x="0" y={groundY} width={world.w} height={world.h - groundY} fill={`url(#${id('soil')})`} />
                {[0.35, 0.62].map((f) => (
                  <path
                    key={f}
                    d={groundPath(world.w, groundY + (world.h - groundY) * f, 5)}
                    fill="none"
                    stroke="#b98d5f"
                    strokeOpacity="0.14"
                    strokeWidth="10"
                  />
                ))}

                {/* Roots in the layout's coordinates (y = 0 is the ground line). */}
                <g transform={`translate(${offsetX} ${groundY})`}>
                  {layout.edges.map((edge) => {
                    const card = cardByKey.get(edge.to)
                    // The quick-add input hangs on a dashed line until it becomes a real card.
                    if (card?.kind === 'draft') {
                      return (
                        <path key={edge.to} d={edge.path} fill="none" stroke={skin.bark} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" opacity={0.6} />
                      )
                    }
                    const s = rootStroke(card ? masteryOf(card) : null, colors, lit.has(edge.to))
                    return (
                      <path
                        key={edge.to}
                        d={edge.path}
                        fill="none"
                        stroke={`url(#${id(`edge-${edge.to}`)})`}
                        strokeWidth={card?.kind === 'statement' ? s.width - 0.75 : s.width}
                        strokeLinecap="round"
                        opacity={s.opacity}
                        filter={s.glow === 'none' ? undefined : `url(#${id(`glow-${s.glow}`)})`}
                        className="transition-[opacity,stroke-width] duration-300"
                        style={{ transition: 'd 300ms ease, opacity 300ms, stroke-width 300ms' }}
                      />
                    )
                  })}
                </g>

                {/* Main conduit from the trunk through the ground into the crown. */}
                {(nodes.length > 0 || draftCard) && (
                  <>
                    <path d={conduitPath(trunkX, groundY, CROWN_Y)} fill={`url(#${id('conduit')})`} />
                    <circle cx={trunkX} cy={groundY + CROWN_Y} r={5} fill={skin.barkDeep} />
                  </>
                )}

                <path d={groundPath(world.w, groundY)} fill="none" stroke={GRASS} strokeWidth="3" strokeLinecap="round" />
                <path d={groundPath(world.w, groundY + 3, 2)} fill="none" stroke="#8b6b43" strokeOpacity="0.35" strokeWidth="2" />
              </svg>

              {surface && scene.surface && (
                <div
                  className="pointer-events-none absolute"
                  style={{ left: scene.surface.left, top: scene.surface.top, width: surface.width, height: surface.height }}
                >
                  {surface.content}
                </div>
              )}

              {nodes.length === 0 && !draftCard && emptyLabel && (
                <div className="absolute flex w-80 -translate-x-1/2 flex-col items-center gap-3 text-center" style={{ left: trunkX, top: groundY + 48 }}>
                  <p className="text-sm text-amber-900/70">{emptyLabel}</p>
                  {authoring && (
                    <GameButton tone="leaf" size="sm" onClick={() => openDraft({ kind: 'root' })}>
                      <Plus className="size-4" strokeWidth={3} /> Plant the first root
                    </GameButton>
                  )}
                </div>
              )}

              {layout.cards.map((card) => {
                if (card.kind === 'draft') return null
                const full = byId.get(card.nodeId)
                const status = card.itemId ? itemStatus?.[card.itemId] : undefined
                const statementTools = ownerTools && card.itemId && status !== 'saving'
                const pending = authoring?.isPending(card.nodeId) ?? false
                return (
                  <div
                    key={card.key}
                    className={cn('mg-pop absolute transition-[left,top] duration-300 ease-out', (lit.has(card.key) || renaming === card.nodeId) && 'z-10')}
                    style={{ left: offsetX + card.x, top: groundY + card.y, width: card.w, height: card.h }}
                    onMouseEnter={() => setActiveKey(card.key)}
                    onMouseLeave={() => setActiveKey((k) => (k === card.key ? null : k))}
                    onFocus={() => setActiveKey(card.key)}
                    onBlur={() => setActiveKey((k) => (k === card.key ? null : k))}
                  >
                    {card.kind === 'statement' ? (
                      <StatementCard
                        card={card}
                        level={masteryOf(card) ?? 0}
                        statement={card.itemId ? statements?.[card.itemId] : undefined}
                        status={status}
                        onEdit={
                          statementTools
                            ? () => ownerTools.onEditStatement({ id: card.itemId!, text: statements?.[card.itemId!] ?? card.title })
                            : undefined
                        }
                        onDelete={
                          statementTools
                            ? () => ownerTools.onDeleteStatement({ id: card.itemId!, text: statements?.[card.itemId!] ?? card.title })
                            : undefined
                        }
                      />
                    ) : (
                      <NodePill
                        card={card}
                        mastery={masteryOf(card)}
                        collapsed={collapsed.has(card.nodeId)}
                        onToggle={() => toggle(card.nodeId)}
                        statementCount={full ? branchItemIds(full).length : 0}
                        onInspect={() => inspect(card.nodeId)}
                        onManage={onManage ? () => onManage(card.nodeId) : undefined}
                        // Owners rename in place when they can type on the canvas, else in a dialog.
                        onEdit={
                          authoring
                            ? () => setRenamingId(card.nodeId)
                            : ownerTools
                              ? () => ownerTools.onEditRoot({ id: card.nodeId, title: card.title })
                              : undefined
                        }
                        onDelete={ownerTools ? () => ownerTools.onDeleteRoot(card.nodeId) : undefined}
                        onAddStatement={authoring ? () => openDraft({ kind: 'statement', nodeId: card.nodeId }) : undefined}
                        onAddBranch={authoring ? () => openDraft({ kind: 'branch', parentId: card.nodeId }) : undefined}
                        renaming={renaming === card.nodeId}
                        onRename={(title) => {
                          setRenamingId(null)
                          if (title) authoring?.renameRoot(card.nodeId, title)
                        }}
                        pending={pending}
                        // Rounds start from top-level roots only (never from a statement card).
                        onPractice={practice && card.kind === 'category' ? () => practice.onPractice({ rootId: card.nodeId }) : undefined}
                        practiceMode={practice?.mode}
                        inspected={inspectedId === card.nodeId}
                      />
                    )}
                  </div>
                )
              })}

              {/* Rendered apart from the cards so it stays the same element (and keeps focus) as it moves. */}
              {draftCard?.draft && draftPrompt && (
                <div
                  key={DRAFT_KEY}
                  className="absolute z-20 transition-[left,top] duration-200 ease-out"
                  style={{ left: offsetX + draftCard.x, top: groundY + draftCard.y, width: draftCard.w, height: draftCard.h }}
                >
                  <QuickAddCard
                    slot={draftCard.draft}
                    placeholder={draftPrompt.placeholder}
                    label={draftPrompt.label}
                    onKey={onQuickKey}
                    onClose={() => setDraft(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Always in reach, whatever the pan or zoom: the keyboard hint while typing, and ＋ Root. */}
        {liveDraft && (
          <p
            aria-hidden
            className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-slate-900/75 px-3 py-1 font-game text-[11px] font-bold text-white sm:block"
          >
            ↵ next · Tab nest · ⇧Tab up · Esc done
          </p>
        )}
        {authoring && (
          <div className="absolute right-3 bottom-3 z-30">
            <GameButton tone="leaf" size="sm" onClick={() => openDraft({ kind: 'root' })} title="Add a top-level root">
              <Plus className="size-4" strokeWidth={3} /> Root
            </GameButton>
          </div>
        )}
      </div>

      <NodeInspector
        node={inspected}
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

export { RootMap }

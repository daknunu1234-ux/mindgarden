import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InlineNameEdit } from '@/shared/components/game'
import { TREE_SPECIES } from '@/shared/lib/treeSkins'
import { SeedConfirm, SeedGallery } from '../components/FarmShopModal'
import { freeTiles, GRID_SIZE, type Placement } from '../lib/farmGrid'
import { boughtTreeView, withLocalTrees, workshopHref } from '../lib/purchase'

// The new-tree flow: buy a seed (confirm) → place it (free tiles glow) → name it → its Workshop.

const OAK = TREE_SPECIES.find((s) => s.id === 'oak')!
const NEBULA = TREE_SPECIES.find((s) => s.id === 'cosmic_nebula')!
// The opening tag of the button whose label is "Buy & Plant".
const buyButton = (html: string) => {
  const at = html.indexOf('Buy &amp; Plant')
  return html.slice(html.lastIndexOf('<button', at), html.indexOf('>', html.lastIndexOf('<button', at)) + 1)
}
const tree = (id: string, title: string) => boughtTreeView({ id, slug: `${id}-slug`, title, treeType: 'oak' })

describe('step 1: buying a seed in the Shop', () => {
  it('with the farm handling purchases, every packet is a button that asks to confirm (no link away)', () => {
    const html = renderToStaticMarkup(createElement(SeedGallery, { coins: 300, onBuy: () => {} }))
    expect([...html.matchAll(/<button[^>]*data-species="([a-z_]+)"/g)].map((m) => m[1])).toEqual(TREE_SPECIES.map((s) => s.id))
    expect(html).not.toContain('/deck/new')
  })

  it('without it, packets still link to the planting form', () => {
    expect(renderToStaticMarkup(createElement(SeedGallery, { coins: 300 }))).toContain('href="/deck/new?species=oak"')
  })

  it('the confirmation says the price and the purse after; a short purse cannot confirm', () => {
    const ok = renderToStaticMarkup(createElement(SeedConfirm, { species: OAK, coins: 300, buying: false, onConfirm: () => {}, onCancel: () => {} }))
    expect(ok).toContain('Buy this Oak seed for 100 🪙?')
    expect(ok).toContain('Your purse: 300 → 200 🪙')
    expect(ok).toContain('🌱 Buy &amp; Plant · 100 🪙')
    expect(buyButton(ok)).not.toContain('disabled=""')
    const short = renderToStaticMarkup(createElement(SeedConfirm, { species: NEBULA, coins: 120, buying: false, onConfirm: () => {}, onCancel: () => {} }))
    expect(short).toContain('You need 60 more 🪙')
    expect(buyButton(short)).toContain('disabled=""')
    expect(short).toContain('Buy &amp; Plant · 180 🪙')
    expect(renderToStaticMarkup(createElement(SeedConfirm, { species: OAK, coins: 300, buying: true, onConfirm: () => {}, onCancel: () => {} }))).toContain('Buying…')
  })

  it('a bought tree is the owner’s, empty and not on the farm yet (it waits in the Shop)', () => {
    expect(tree('d1', 'Oak Tree')).toMatchObject({ id: 'd1', isOwner: true, itemCount: 0, placementId: null, needsWater: false, fruitReady: false, withered: false })
  })
})

describe('step 2: placing it', () => {
  it('lists every open tile, and none under a tree or a building', () => {
    const farm: Placement[] = [
      { id: 'p1', itemType: 'tree', deckId: 'd0', x: 0, y: 0, width: 1, height: 1, variant: null },
      { id: 'p2', itemType: 'farmer_house', deckId: null, x: 4, y: 4, width: 2, height: 2, variant: null },
    ]
    const tiles = freeTiles(farm)
    expect(tiles).toHaveLength(GRID_SIZE * GRID_SIZE - 1 - 4)
    expect(tiles).not.toContainEqual({ x: 0, y: 0 })
    expect(tiles).not.toContainEqual({ x: 5, y: 5 })
    expect(tiles).toContainEqual({ x: 1, y: 0 })
    expect(freeTiles([])).toHaveLength(GRID_SIZE * GRID_SIZE)
  })
})

describe('step 3 and renaming', () => {
  it('opens the new tree’s Workshop on its first root', () => {
    expect(workshopHref('oak-tree-2')).toBe('/deck/oak-tree-2?start=1')
  })

  it('shows trees bought on this visit until the server has them, and the latest names', () => {
    const server = [tree('d1', 'Oak Tree')]
    const bought = [tree('d2', 'Pine Tree'), { ...tree('d1', 'stale copy'), itemCount: 9 }]
    const view = withLocalTrees(server, bought, new Map([['d2', 'Sinh học']]))
    expect(view.map((t) => [t.id, t.title])).toEqual([
      ['d2', 'Sinh học'],
      ['d1', 'Oak Tree'],
    ])
    // The server's copy wins over the local one.
    expect(view.find((t) => t.id === 'd1')?.itemCount).toBe(0)
    // No changes: the same objects.
    expect(withLocalTrees(server, [], new Map())[0]).toBe(server[0])
  })

  it('the inline name editor shows the name and a ✏️ button to rename it', () => {
    const html = renderToStaticMarkup(createElement(InlineNameEdit, { value: 'Oak Tree', onSave: () => {}, label: 'Rename tree' }))
    expect(html).toContain('Oak Tree')
    expect(html).toMatch(/<button[^>]*aria-label="Rename tree"/)
    expect(html).toContain('title="Double-click to rename"')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TREE_SPECIES } from '@/shared/lib/treeSkins'
import { SeedGallery } from '../components/FarmShopModal'

const render = (coins: number | null) => renderToStaticMarkup(createElement(SeedGallery, { coins }))

describe("the Shop's seed gallery", () => {
  it('puts a price tag on every seed card: 180 on the three surreal species, 100 on the rest', () => {
    const html = render(300)
    const cards = [...html.matchAll(/href="\/deck\/new\?species=([a-z_]+)"[\s\S]*?data-price="(\d+)"/g)].map((m) => [m[1], Number(m[2])])
    expect(cards).toEqual(TREE_SPECIES.map((s) => [s.id, s.price]))
    expect(Object.fromEntries(cards)).toMatchObject({ crystal_flora: 180, cosmic_nebula: 180, chrono_willow: 180, oak: 100 })
    expect(html).not.toContain('data-short')
  })

  it('keeps the tag in the card footer: after the tree picture and the name, never over the picture', () => {
    const html = render(300)
    const cards = html.split('<li>').slice(1)
    expect(cards).toHaveLength(TREE_SPECIES.length)
    cards.forEach((card, i) => {
      const [picture, name, tag] = [card.indexOf('<svg'), card.indexOf(TREE_SPECIES[i].label), card.indexOf('data-price=')]
      expect(picture).toBeGreaterThanOrEqual(0)
      expect(name).toBeGreaterThan(picture)
      expect(tag, TREE_SPECIES[i].id).toBeGreaterThan(name)
      // The picture frame closes before the tag: the tag is not inside (over) it.
      expect(card.lastIndexOf('</svg>')).toBeLessThan(tag)
    })
    expect(html).not.toMatch(/data-price="\d+"[^>]*class="[^"]*absolute/)
    expect(html).not.toMatch(/class="[^"]*absolute[^"]*"[^>]*data-price/)
  })

  it('dims the seeds the purse cannot pay, with a tooltip saying what is missing', () => {
    const html = render(120)
    expect((html.match(/data-short="true"/g) ?? []).length).toBe(3)
    expect(html).toContain('title="Not enough coins: you need 60 more 🪙"')
    expect((render(40).match(/data-short="true"/g) ?? []).length).toBe(13)
    // Signed out / unknown purse: plain tags.
    expect(render(null)).not.toContain('data-short')
  })
})

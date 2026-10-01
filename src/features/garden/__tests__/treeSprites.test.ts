import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getTreeSpecies, isSurrealForm, LEGACY_TREE_TYPES, speciesScale, SURREAL_SCALE, toTreeTypeId, TREE_SPECIES, TREE_TYPE_IDS, treeScale } from '@/shared/lib/treeSkins'
import { shade } from '@/shared/lib/color'
import { treeSwayPhase } from '../components/FarmTree'
import { TreeStageSvg } from '../components/TreeStageSvg'
import type { TreeStage } from '../types'

const STAGES: TreeStage[] = [1, 2, 3, 4, 5]
const render = (treeType: string, stage: TreeStage, scale = 1) => renderToStaticMarkup(createElement(TreeStageSvg, { stage, treeType, label: `${treeType} ${stage}`, ground: false, scale }))

const NATURAL = ['oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus']
const SURREAL = ['crystal_flora', 'cosmic_nebula', 'chrono_willow']

describe('thirteen tree species', () => {
  it('has the ten natural species and the three surreal ones, each with its own drawing and a full skin', () => {
    expect(TREE_TYPE_IDS).toEqual([...NATURAL, ...SURREAL])
    expect(new Set(TREE_SPECIES.map((s) => s.form)).size).toBe(13)
    for (const s of TREE_SPECIES) {
      expect(s.label.length).toBeGreaterThan(0)
      for (const color of [s.skin.canopyLight, s.skin.canopyDark, s.skin.bark, s.skin.barkDeep, s.skin.glow]) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('renders retired species as their successor and unknown ones as oak', () => {
    expect(LEGACY_TREE_TYPES).toEqual({ sakura: 'cherry', saguaro: 'cactus', apple: 'citrus', bamboo: 'palm' })
    for (const [old, now] of Object.entries(LEGACY_TREE_TYPES)) {
      expect(getTreeSpecies(old).id).toBe(now)
      expect(toTreeTypeId(old)).toBe(now)
      const drawing = (id: string) => render(id, 4).replace(/ aria-label="[^"]*"/, '')
      expect(drawing(old)).toBe(drawing(now))
    }
    expect(getTreeSpecies('banyan').id).toBe('oak')
    expect(toTreeTypeId(null)).toBe('oak')
  })
})

describe('65 tree sprites (13 species × 5 stages)', () => {
  const sprites = TREE_TYPE_IDS.flatMap((id) => STAGES.map((stage) => ({ id, stage, svg: render(id, stage) })))

  it('renders every species at every stage, tagged with its species and stage', () => {
    expect(sprites).toHaveLength(65)
    for (const { id, stage, svg } of sprites) {
      expect(svg, `${id} ${stage}`).toContain(`data-species="${id}"`)
      expect(svg).toContain(`data-stage="${stage}"`)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      // A real drawing, not an empty frame.
      expect((svg.match(/<(path|circle|ellipse|rect)\b/g) ?? []).length, `${id} ${stage}`).toBeGreaterThan(5)
    }
  })

  it('draws 65 different sprites: no two species or stages look the same', () => {
    const bodies = sprites.map(({ svg }) => svg.replace(/ (aria-label|data-species|data-stage)="[^"]*"/g, ''))
    expect(new Set(bodies).size).toBe(65)
  })

  it('crowns stage 5 in gold: aura, sparkles and a gold rim; never before', () => {
    for (const id of TREE_TYPE_IDS) {
      expect(render(id, 5), id).toContain('#fbbf24')
      expect(render(id, 5)).toContain('#fde68a')
      for (const stage of [1, 2, 3, 4] as TreeStage[]) expect(render(id, stage), `${id} ${stage}`).not.toContain('#fbbf24')
    }
  })

  it('grows: a mature tree paints more than its sapling and its sprout', () => {
    for (const id of TREE_TYPE_IDS) {
      const shapes = [1, 2, 4].map((stage) => (render(id, stage as TreeStage).match(/<(path|circle|ellipse|rect)\b/g) ?? []).length)
      expect(shapes[2], `${id} mature vs sprout`).toBeGreaterThan(shapes[0])
      expect(shapes[2], `${id} mature vs sapling`).toBeGreaterThan(shapes[1])
    }
  })

  it('scales size tiers about the trunk base, and ignores a bad scale', () => {
    expect(render('maple', 4, 1.35)).toContain('matrix(1.35 0 0 1.35')
    expect(render('maple', 4, Number.NaN)).toBe(render('maple', 4))
  })
})

describe('lit, not outlined', () => {
  const all = TREE_TYPE_IDS.flatMap((id) => STAGES.map((stage) => ({ id, stage, svg: render(id, stage) })))

  it('uses no dark outline colours on any sprite', () => {
    // The old cartoon outline was each colour darkened by 58%, plus a few fixed inks.
    for (const { id, stage, svg } of all) {
      const skin = getTreeSpecies(id).skin
      for (const ink of [skin.canopyDark, skin.canopyLight, skin.barkDeep, skin.bark].map((c) => shade(c, -0.58)).concat(['#3b1f0e', '#1f4a14', '#4a2511'])) {
        expect(svg.includes(ink), `${id} ${stage} uses ${ink}`).toBe(false)
      }
    }
  })

  it("separates every species from the ground with its own occlusion shade and rim light", () => {
    for (const id of TREE_TYPE_IDS) {
      const { occlusion, rim } = getTreeSpecies(id).skin
      const svg = render(id, 4)
      expect(svg, id).toContain(occlusion)
      expect(svg, id).toContain(rim)
    }
  })

  it('casts its own soft shadows unless the scene does', () => {
    const withShadow = renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: 'oak', label: '', ground: false }))
    const without = renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: 'oak', label: '', ground: false, shadow: false }))
    expect(withShadow).toContain('#0b3b1f')
    expect(without).not.toContain('#0b3b1f')
  })

  it('marks the crown for the lagging foliage bob, and pulses only stage 5', () => {
    for (const { id, stage, svg } of all) {
      if (stage > 1) expect(svg, `${id} ${stage}`).toContain('mg-foliage')
      expect(svg.includes('mg-aura'), `${id} ${stage}`).toBe(stage === 5)
      expect(svg.includes('mg-sparkle'), `${id} ${stage}`).toBe(stage === 5)
    }
  })
})

describe('treeSwayPhase', () => {
  it('steps (x + 7y) mod 5 by 0.4 s, so side-by-side trees sway out of step', () => {
    expect(treeSwayPhase(0, 0)).toBe(0)
    expect(treeSwayPhase(1, 0)).toBeCloseTo(0.4)
    expect(treeSwayPhase(0, 1)).toBeCloseTo(0.8)
    expect(treeSwayPhase(3, 1)).toBeCloseTo(0)
    for (let x = 0; x < 15; x++) {
      for (let y = 0; y < 15; y++) {
        expect(treeSwayPhase(x, y)).not.toBeCloseTo(treeSwayPhase(x + 1, y))
        expect(treeSwayPhase(x, y)).not.toBeCloseTo(treeSwayPhase(x, y + 1))
        expect([0, 0.4, 0.8, 1.2, 1.6].some((p) => Math.abs(p - treeSwayPhase(x, y)) < 1e-9)).toBe(true)
      }
    }
  })
})

describe('surreal species: Crystal Flora, Cosmic Nebula, Chrono Willow', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
  // Each species' own light effects (globals.css classes).
  const EFFECTS: Record<string, string[]> = {
    crystal_flora: ['mg-core', 'mg-mote'],
    cosmic_nebula: ['mg-nebula', 'mg-star'],
    chrono_willow: ['mg-sand', 'mg-star'],
  }

  it('is in the registry with a label, a preview icon and its own form', () => {
    expect(SURREAL.map((id) => getTreeSpecies(id))).toMatchObject([
      { id: 'crystal_flora', label: 'Crystal Flora', form: 'crystal' },
      { id: 'cosmic_nebula', label: 'Cosmic Nebula', form: 'nebula' },
      { id: 'chrono_willow', label: 'Chrono Willow', form: 'chrono' },
    ])
    for (const id of SURREAL) {
      const species = getTreeSpecies(id)
      expect(species.icon.length, id).toBeGreaterThan(0)
      expect(toTreeTypeId(id)).toBe(id)
      expect(isSurrealForm(species.form)).toBe(true)
    }
    expect(new Set(SURREAL.map((id) => getTreeSpecies(id).icon)).size).toBe(3)
    for (const id of NATURAL) expect(isSurrealForm(getTreeSpecies(id).form), id).toBe(false)
  })

  it('draws each with its own effect at every stage past the sprout, and no other species has them', () => {
    for (const id of SURREAL) {
      for (const stage of [3, 4, 5] as TreeStage[]) for (const effect of EFFECTS[id]) expect(render(id, stage), `${id} ${stage} ${effect}`).toContain(`class="${effect}"`)
      // The sapling already shows the species' signature effect.
      expect(render(id, 2), id).toContain(`class="${EFFECTS[id][0]}"`)
    }
    for (const id of NATURAL) expect(render(id, 5), id).not.toMatch(/mg-(core|mote|nebula|star|sand|prism|fringe|rune|ring)|<linearGradient|<radialGradient/)
    expect(render('crystal_flora', 4)).not.toContain('mg-sand')
    expect(render('chrono_willow', 4)).not.toContain('mg-nebula')
  })

  it('draws the galaxy as a tilted disc and drops each grain of sand exactly to the ground', () => {
    expect(render('cosmic_nebula', 4)).toMatch(/rotate\(-18\) scale\(1 0\.62\)/)
    const grains = [...render('chrono_willow', 4).matchAll(/class="mg-sand" cx="[\d.]+" cy="([\d.]+)"[^>]*--mg-drop:([\d.]+)px/g)]
    expect(grains.length).toBeGreaterThanOrEqual(5)
    const ground = Number(grains[0][1]) + Number(grains[0][2])
    for (const [, cy, drop] of grains) {
      expect(Number(drop)).toBeGreaterThan(0)
      expect(Number(cy) + Number(drop)).toBeCloseTo(ground, 0)
    }
  })

  it('paints each in many hues at once: a prism, a rainbow vortex, a spectrum of threads', () => {
    const hues = (svg: string, colors: string[]) => colors.filter((c) => svg.includes(c))
    // Crystal: neon cyan, electric magenta, amber gold and royal amethyst facets (lit + deep shade of
    // each), two rainbow sweeps, a cross-sparkle per peak.
    const crystal = render('crystal_flora', 4)
    expect(hues(crystal, ['#22e6ff', '#ff5fd2', '#ffd23f', '#a78bfa'])).toHaveLength(4)
    expect(hues(crystal, ['#0891b2', '#c026d3', '#f59e0b', '#6d28d9'])).toHaveLength(4)
    expect((crystal.match(/<linearGradient/g) ?? []).length).toBe(2)
    expect((crystal.match(/class="mg-prism"/g) ?? []).length).toBe(2)
    expect((crystal.match(/class="mg-star"/g) ?? []).length).toBe(9)
    // Nebula: solar-gold core, hot magenta, cosmic indigo, azure, emerald fringe; gold, cyan and pink star dust.
    const nebula = render('cosmic_nebula', 4)
    expect(hues(nebula, ['#ffc21a', '#ff2d95', '#4338ca', '#0ea5e9', '#10e39a'])).toHaveLength(5)
    expect(nebula).toContain('<radialGradient')
    expect(nebula).toContain('class="mg-fringe"')
    expect(hues(nebula, ['#ffd23f', '#22e6ff', '#ff7ac8'])).toHaveLength(3)
    // Willow: copper → molten gold → turquoise → violet threads, runes on the trunk, prismatic rings at the base.
    const willow = render('chrono_willow', 4)
    expect(hues(willow, ['#e2622b', '#ffc21a', '#19d3c5', '#8b5cf6'])).toHaveLength(4)
    expect((willow.match(/class="mg-rune"/g) ?? []).length).toBe(3)
    expect((willow.match(/class="mg-ring"/g) ?? []).length).toBe(3)
    expect(new Set([...willow.matchAll(/class="mg-sand"[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])).size).toBeGreaterThanOrEqual(3)
  })

  it('stands about 18% bigger than a natural tree, scaled about the trunk base so it stays planted', () => {
    expect(SURREAL_SCALE).toBeGreaterThanOrEqual(1.15)
    expect(SURREAL_SCALE).toBeLessThanOrEqual(1.2)
    for (const id of SURREAL) {
      expect(speciesScale(id)).toBe(SURREAL_SCALE)
      for (const stage of STAGES) {
        // matrix(s 0 0 s e f) with e = (1 − s)·60 and f = (1 − s)·108: the base point (60, 108) maps onto itself.
        const m = /<g transform="matrix\(([\d.]+) 0 0 ([\d.]+) (-?[\d.]+) (-?[\d.]+)\)"/.exec(render(id, stage))
        expect(m, `${id} ${stage}`).not.toBeNull()
        const [s, , e, f] = m!.slice(1).map(Number)
        expect(s).toBe(SURREAL_SCALE)
        expect(s * 60 + e).toBeCloseTo(60, 2)
        expect(s * 108 + f).toBeCloseTo(108, 2)
      }
      // The size tier multiplies on top; `fit` keeps the drawing inside its box (small clipping frames).
      expect(render(id, 4, 1.35)).toContain(`matrix(${+(1.35 * SURREAL_SCALE).toFixed(4)} 0 0`)
      const fitted = renderToStaticMarkup(createElement(TreeStageSvg, { stage: 4, treeType: id, label: '', ground: false, fit: true }))
      expect(fitted).not.toContain('matrix(')
    }
    for (const id of NATURAL) {
      expect(speciesScale(id)).toBe(1)
      expect(render(id, 4)).not.toContain('matrix(')
    }
    expect(speciesScale('sakura')).toBe(1)
    // Layout that follows the crown uses tier × species.
    expect(treeScale('oak', 10)).toBe(0.85)
    expect(treeScale('chrono_willow', 10)).toBeCloseTo(0.85 * SURREAL_SCALE)
    expect(treeScale('cosmic_nebula', 500)).toBeCloseTo(1.35 * SURREAL_SCALE)
  })

  it('glows and sparkles: a radial backglow, cross-sparkles and drifting motes on every surreal tree', () => {
    for (const id of SURREAL) {
      const svg = render(id, 4)
      expect(svg, id).toMatch(/<radialGradient id="[^"]+g"/)
      expect((svg.match(/class="mg-core"/g) ?? []).length, id).toBe(1)
      // Cross-sparkles: a halo, a four-point glint and a white heart, each on its own beat.
      const glints = [...svg.matchAll(/<g class="mg-star" style="--mg-delay:(-?[\d.]+)s;--mg-dur:([\d.]+)s">/g)]
      expect(glints.length, id).toBeGreaterThanOrEqual(4)
      expect(new Set(glints.map((m) => m[2])).size, `${id} varied timings`).toBeGreaterThanOrEqual(3)
    }
    // Denser ambient motes than before, growing with the stage.
    const motes = (id: string, stage: TreeStage) => (render(id, stage).match(/class="mg-mote"/g) ?? []).length
    expect(motes('crystal_flora', 4)).toBe(9)
    expect(motes('crystal_flora', 5)).toBe(12)
    expect(motes('chrono_willow', 4)).toBe(8)
    expect(motes('crystal_flora', 2)).toBeLessThan(motes('crystal_flora', 4))
  })

  it('gives every gradient an id of its own and uses it, so many trees can share a page', () => {
    for (const id of SURREAL) {
      const svg = render(id, 4)
      const ids = [...svg.matchAll(/<(?:linear|radial)Gradient id="([^"]+)"/g)].map((m) => m[1])
      expect(ids.length, id).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
      for (const gradient of ids) expect(svg, `${id} ${gradient}`).toContain(`url(#${gradient})`)
    }
    // Two trees in one document get different ids.
    const two = renderToStaticMarkup(
      createElement('div', null, createElement(TreeStageSvg, { stage: 4, treeType: 'chrono_willow', label: 'a' }), createElement(TreeStageSvg, { stage: 4, treeType: 'chrono_willow', label: 'b' })),
    )
    const all = [...two.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1])
    expect(all).toHaveLength(2)
    expect(new Set(all).size).toBe(2)
  })

  it('keeps every particle out of the way of clicks and drags', () => {
    for (const id of SURREAL) {
      const svg = render(id, 4)
      // Every particle sits in a group that takes no pointer events (the tree button stays the
      // target): the nearest group opened before it is such a group, not the crown.
      const particles = [...svg.matchAll(/class="mg-(core|mote|star|sand)"/g)]
      expect(particles.length, id).toBeGreaterThan(3)
      for (const particle of particles) {
        const inert = svg.lastIndexOf('<g pointer-events="none">', particle.index)
        expect(inert, `${id} ${particle[0]}`).toBeGreaterThanOrEqual(0)
        expect(inert, `${id} ${particle[0]}`).toBeGreaterThan(svg.lastIndexOf('class="mg-foliage"', particle.index))
      }
    }
  })

  it('animates with transform / opacity only, stops for reduced motion and when withered', () => {
    for (const name of ['mg-core', 'mg-mote', 'mg-nebula', 'mg-star', 'mg-sand', 'mg-prism', 'mg-fringe', 'mg-rune', 'mg-ring']) {
      const frames = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)
      expect(frames, name).not.toBeNull()
      const properties = [...frames![1].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(properties.length, name).toBeGreaterThan(0)
      for (const property of properties) expect(['transform', 'opacity'], `${name} animates ${property}`).toContain(property)
      // The animation is only switched on when motion is welcome…
      const rule = new RegExp(`\\n(\\s*)\\.${name} \\{ animation:`).exec(css)
      expect(rule, name).not.toBeNull()
      expect(rule![1].length, `${name} must sit inside a media block`).toBeGreaterThan(0)
      // …and a withered tree stands still.
      expect(css).toContain(`.mg-withered .${name}`)
    }
    const block = css.slice(css.indexOf('@keyframes mg-core'), css.indexOf('Compositing hints'))
    expect(block).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(block).not.toMatch(/filter|blur/)
  })
})

describe('species migrations', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', file), 'utf8').split('-- Verify')[0]
  const allowed = (body: string) => /check \(tree_type in \(([^)]*)\)\)/.exec(body)?.[1].split(',').map((s) => s.trim().replace(/'/g, ''))

  it('20261001000000_ten_tree_species.sql allows the ten natural ids and renames retired species like the app', () => {
    const body = read('20261001000000_ten_tree_species.sql')
    expect(allowed(body)).toEqual(NATURAL)
    for (const [old, now] of Object.entries(LEGACY_TREE_TYPES)) expect(body).toMatch(new RegExp(`when '${old}'\\s+then '${now}'`))
  })

  it('20261005000000_surreal_tree_species.sql allows exactly the catalogue ids and changes no rows', () => {
    const body = read('20261005000000_surreal_tree_species.sql')
    expect(allowed(body)).toEqual([...TREE_TYPE_IDS])
    expect(body).toMatch(/drop constraint if exists decks_tree_type_check/)
    expect(body).not.toMatch(/update public\.decks/)
  })
})

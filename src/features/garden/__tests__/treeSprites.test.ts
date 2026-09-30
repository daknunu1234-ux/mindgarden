import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getTreeSpecies, LEGACY_TREE_TYPES, toTreeTypeId, TREE_SPECIES, TREE_TYPE_IDS } from '@/shared/lib/treeSkins'
import { shade } from '@/shared/lib/color'
import { treeSwayPhase } from '../components/FarmTree'
import { TreeStageSvg } from '../components/TreeStageSvg'
import type { TreeStage } from '../types'

const STAGES: TreeStage[] = [1, 2, 3, 4, 5]
const render = (treeType: string, stage: TreeStage, scale = 1) => renderToStaticMarkup(createElement(TreeStageSvg, { stage, treeType, label: `${treeType} ${stage}`, ground: false, scale }))

describe('ten tree species', () => {
  it('has the ten species, each with its own drawing and a full skin', () => {
    expect(TREE_TYPE_IDS).toEqual(['oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus'])
    expect(new Set(TREE_SPECIES.map((s) => s.form)).size).toBe(10)
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

describe('50 tree sprites (10 species × 5 stages)', () => {
  const sprites = TREE_TYPE_IDS.flatMap((id) => STAGES.map((stage) => ({ id, stage, svg: render(id, stage) })))

  it('renders every species at every stage, tagged with its species and stage', () => {
    expect(sprites).toHaveLength(50)
    for (const { id, stage, svg } of sprites) {
      expect(svg, `${id} ${stage}`).toContain(`data-species="${id}"`)
      expect(svg).toContain(`data-stage="${stage}"`)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      // A real drawing, not an empty frame.
      expect((svg.match(/<(path|circle|ellipse|rect)\b/g) ?? []).length, `${id} ${stage}`).toBeGreaterThan(5)
    }
  })

  it('draws 50 different sprites: no two species or stages look the same', () => {
    const bodies = sprites.map(({ svg }) => svg.replace(/ (aria-label|data-species|data-stage)="[^"]*"/g, ''))
    expect(new Set(bodies).size).toBe(50)
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

describe('migration 20261001000000_ten_tree_species.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261001000000_ten_tree_species.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('allows exactly the catalogue ids', () => {
    const check = /check \(tree_type in \(([^)]*)\)\)/.exec(body)
    expect(check).not.toBeNull()
    expect(check![1].split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual([...TREE_TYPE_IDS])
  })

  it('renames retired species the same way the app renders them', () => {
    for (const [old, now] of Object.entries(LEGACY_TREE_TYPES)) expect(body).toMatch(new RegExp(`when '${old}'\\s+then '${now}'`))
  })
})

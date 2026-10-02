// The ten natural species, stages 1–5, in the low-poly style of treeKit: lush crowns of overlapping
// faceted volumes on chiselled prism trunks, with faceted fruit, nuts and blossoms. Each species is
// designed once at full size (design space) and grown with the stage's scale; stage 5 swells the
// mature crown and adds masses behind it. Pure markup, no hooks.
import type { ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { MIGHTY_GOLD, type TreeForm, type TreeSkin } from '@/shared/lib/treeSkins'
import { TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X } from '../lib/plotSprite'
import {
  Blade,
  bladeOutline,
  Blossom,
  Chip,
  Chips,
  ContactShadow,
  Crown,
  crownFor,
  Facet,
  Foliage,
  Solid,
  geo,
  GREEN_SUN,
  Halo,
  leafRamp,
  Limb,
  pointList,
  prism,
  rampColor,
  Roots,
  trunkNodes,
  woodRamp,
  type CrownPlan,
  type FormProps,
  type Geo,
  type GrownStage,
  type LimbNode,
  type Point,
  type Sun,
} from './treeKit'

// Half-width of the contact shadow by stage (view units): it grows with the crown.
const SHADOW: Record<GrownStage, number> = { 2: 13, 3: 22, 4: 30, 5: 34 }
const NARROW = 0.72

// The frame every grown tree shares: contact shadow first, then the tree, all with rounded joins.
const Tree = ({ g, spread = 1, children }: { g: Geo; spread?: number; children: ReactNode }) => (
  <g strokeLinejoin="round">
    <ContactShadow w={SHADOW[g.stage] * spread} />
    {children}
  </g>
)

// How many of a list a stage shows: [stage 2, 3, 4, 5].
const upTo = <T,>(g: Geo, items: readonly T[], counts: readonly [number, number, number, number]): readonly T[] => items.slice(0, counts[g.stage - 2])

// ── Oak: a broad, heavy crown on a stout trunk, with acorns ──────────────────

const OAK: CrownPlan = {
  2: [[9, 82, 27], [-10, 64, 26]],
  3: [[0, 94, 26], [-25, 70, 25], [24, 68, 26], [0, 56, 21]],
  4: [[0, 98, 27], [-28, 86, 23], [29, 88, 23], [-36, 60, 21], [37, 62, 21], [-13, 66, 25], [15, 64, 25], [0, 48, 21]],
  extra: [[-20, 104, 19], [22, 106, 19], [-46, 76, 17], [47, 78, 17]],
}
const ACORNS: Point[] = [[-26, 52], [22, 56], [-6, 40], [34, 70], [-38, 68]]

function Oak({ g, skin }: FormProps) {
  const wood = woodRamp(skin)
  const nut = g.golden ? '#f59e0b' : '#c98a3a'
  return (
    <Tree g={g}>
      {g.stage >= 3 && <Roots g={g} hw={7.5} ramp={wood} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[-3, 28, 4.2], [-13, 40, 3.8], [-23, 52, 3.2]]} ramp={wood} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[4, 30, 4.2], [14, 41, 3.8], [24, 52, 3.2]]} ramp={wood} />}
      <Limb g={g} nodes={trunkNodes(50, 7.5, 0.5)} ramp={wood} foot />
      <Chips g={g} hw={7.5} ramp={wood} />
      <Crown g={g} skin={skin} volumes={crownFor(OAK, g.stage)} ramp={leafRamp(skin)}>
        {upTo(g, ACORNS, [0, 0, 3, 5]).map(([dx, dy]) => {
          const [x, y] = [g.x(dx), g.y(dy)]
          return (
            <g key={dx}>
              <Solid x={x} y={y + 1} rx={3.4} ry={4.2} color={nut} occlusion={skin.occlusion} />
              <Facet points={[[x - 4.2, y - 1.6], [x - 2.4, y - 4.6], [x, y - 5.4], [x, y - 2]]} fill="#a8763f" />
              <Facet points={[[x + 4.2, y - 1.6], [x + 2.4, y - 4.6], [x, y - 5.4], [x, y - 2]]} fill="#6b4423" />
            </g>
          )
        })}
      </Crown>
    </Tree>
  )
}

// ── Pine: a tall stack of faceted cones with jagged skirts ───────────────────

type Tier = readonly [apex: number, half: number, height: number] // design space, bottom tier first

const PINE: Record<GrownStage, Tier[]> = {
  2: [[62, 30, 34], [88, 20, 30]],
  3: [[50, 38, 34], [74, 29, 30], [98, 19, 28]],
  4: [[46, 42, 34], [68, 34, 30], [90, 26, 27], [112, 18, 25]],
  5: [[46, 46, 36], [65, 39, 32], [83, 31, 29], [100, 23, 26], [116, 15, 23]],
}
const PINE_SUN: Sun = { lit: '#9df25a', peak: '#d6f545', deep: '#04262e' }
const CONES: Point[] = [[-20, 22], [19, 26], [-12, 46], [14, 50], [-24, 44], [6, 70]]

function Pine({ g, skin }: FormProps) {
  const wood = woodRamp(skin)
  const leaf = leafRamp(skin, PINE_SUN)
  const tiers = PINE[g.stage].map(([apex, half, height]) => {
    const top: Point = [g.x(0), g.y(apex)]
    const base = g.y(apex) + g.r(height)
    const w = g.r(half)
    const drop = g.r(height) * 0.16
    // The skirt: seven points left to right, every other one hanging lower.
    const skirt: Point[] = Array.from({ length: 7 }, (_, i) => [g.x(0) - w + (i * w) / 3, base + (i % 2 ? drop : 0)])
    return { top, skirt, outline: pointList([top, ...skirt]) }
  })
  const crease = `translate(${(1.8 * g.k).toFixed(2)} ${(3.6 * g.k).toFixed(2)})`
  const peak = tiers[tiers.length - 1].top
  return (
    <Tree g={g} spread={NARROW}>
      <Limb g={g} nodes={[[0, 0, 9], [0, 12, 6.5], [0, 30, 6]]} ramp={wood} foot />
      <Foliage>
        {tiers.map(({ top, skirt, outline }, t) => (
          <g key={t}>
            {g.golden && (
              <Halo>
                <polygon points={outline} strokeWidth="9" />
              </Halo>
            )}
            {/* The crease this tier throws onto the one below. */}
            <polygon points={outline} fill={skin.occlusion} opacity="0.72" transform={crease} />
            <polygon points={outline} fill={leaf[2]} />
            {/* Sun on the left planes, shade on the right; neighbours alternate so each plane reads. */}
            {skirt.slice(0, -1).map((p, i) => (
              <Facet key={i} points={[top, p, skirt[i + 1]]} fill={rampColor(leaf, 0.92 - i * 0.16 + (i % 2 ? -0.07 : 0.05))} />
            ))}
            <polygon points={pointList([top, [top[0] - 3.2, top[1] + 9], [top[0] - 0.6, top[1] + 8]])} fill={skin.rim} opacity="0.85" />
          </g>
        ))}
        {upTo(g, CONES, [0, 0, 4, 6]).map(([dx, dy]) => (
          <Solid key={`${dx}:${dy}`} x={g.x(dx)} y={g.y(dy)} rx={2.8} ry={4.2} color={g.golden ? '#f59e0b' : skin.bark} occlusion={skin.occlusion} />
        ))}
        {g.golden && (
          <g>
            <polygon points={starPoints(peak[0], peak[1] - 3, 8, 0)} fill={GOLD_GLOW} opacity="0.45" />
            <polygon points={starPoints(peak[0], peak[1] - 3, 6.4, 0)} fill={MIGHTY_GOLD} />
            <polygon points={starPoints(peak[0] - 0.8, peak[1] - 3.8, 3, 0)} fill="#fff7c2" />
          </g>
        )}
      </Foliage>
    </Tree>
  )
}

const GOLD_GLOW = '#fde047'

// A five-pointed star (ten points, alternating radii), turned by `rot` degrees.
function starPoints(x: number, y: number, r: number, rot: number, inner = 0.46) {
  return pointList(
    Array.from({ length: 10 }, (_, i) => {
      const a = ((rot - 90 + i * 36) * Math.PI) / 180
      const rr = i % 2 === 0 ? r : r * inner
      return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as const
    }),
  )
}

// ── Birch: a slim white trunk with dark marks under a tall golden crown ──────

const BIRCH: CrownPlan = {
  2: [[4, 100, 23], [-9, 84, 22]],
  3: [[2, 112, 20], [-16, 98, 20], [18, 100, 19], [0, 84, 21], [-12, 70, 17]],
  4: [[2, 112, 19], [-17, 102, 18], [19, 104, 18], [2, 94, 19], [-28, 82, 17], [29, 84, 17], [-9, 82, 20], [12, 70, 18], [-17, 62, 16], [19, 58, 15]],
  extra: [[-38, 96, 14], [39, 98, 14], [-28, 54, 13], [30, 50, 12]],
}
const BIRCH_SUN: Sun = { lit: '#ffe14d', peak: '#fff6a8', deep: '#5a2d06' }
const BIRCH_FLECKS: Point[] = [[-32, 68], [34, 90], [6, 122], [-22, 110], [24, 62]]

function Birch({ g, skin }: FormProps) {
  // White bark: bright on the lit face, cool grey in the shade.
  const wood = [mix(skin.barkDeep, '#4b5563', 0.3), mix(skin.bark, skin.barkDeep, 0.22), mix(skin.bark, '#ffffff', 0.7)]
  const marks = [14, 27, 40, 53].filter((dy) => g.stage > 2 || dy < 45)
  return (
    <Tree g={g} spread={NARROW}>
      {g.stage >= 3 && <Limb g={g} nodes={[[2, 54, 3.2], [11, 66, 2.8], [19, 78, 2.4]]} ramp={wood} />}
      <Limb g={g} nodes={trunkNodes(92, 5.4, 3)} ramp={wood} foot />
      {/* Dark lenticels cut into the bark, alternating sides. */}
      {marks.map((dy, i) => {
        const [x, y] = [g.x(i % 2 ? 1.6 : -2.4), g.y(dy)]
        const w = g.r(i % 2 ? 2.6 : 3.4)
        return <polygon key={dy} points={pointList([[x - w, y], [x, y - 1.3], [x + w, y + 0.3], [x, y + 1.5]])} fill="#2b2622" />
      })}
      <Crown g={g} skin={skin} volumes={crownFor(BIRCH, g.stage)} ramp={leafRamp(skin, BIRCH_SUN)}>
        {upTo(g, BIRCH_FLECKS, [0, 0, 3, 5]).map(([dx, dy]) => (
          <Chip key={dx} x={g.x(dx)} y={g.y(dy)} r={2.6} color="#fff7c2" />
        ))}
      </Crown>
    </Tree>
  )
}

// ── Cherry: a wide pink cloud on a forked trunk, studded with blossoms ───────

const CHERRY: CrownPlan = {
  2: [[7, 74, 26], [-12, 60, 24]],
  3: [[0, 86, 24], [-27, 70, 23], [27, 72, 23], [0, 58, 22]],
  4: [[0, 100, 20], [-18, 92, 20], [19, 94, 20], [-38, 78, 19], [39, 80, 19], [-48, 62, 15], [49, 64, 15], [-22, 62, 19], [23, 62, 19], [0, 74, 23], [0, 54, 18]],
  extra: [[-30, 100, 15], [31, 102, 15], [0, 112, 14]],
}
const CHERRY_SUN: Sun = { lit: '#ffd9ec', peak: '#fff5fa', deep: '#4a0f3a' }
const CHERRY_BLOSSOMS: Point[] = [
  [-36, 70], [-14, 92], [10, 106], [34, 76], [0, 78], [-24, 54], [26, 58], [-48, 60], [48, 62], [14, 88], [-5, 52], [20, 100],
]

function Cherry({ g, skin }: FormProps) {
  const wood = woodRamp(skin, '#e8a08c')
  return (
    <Tree g={g}>
      {g.stage >= 3 && <Roots g={g} hw={6.6} ramp={wood} />}
      <Limb g={g} nodes={[[-1, 26, 5], [8, 40, 4.6], [16, 58, 4.2]]} ramp={wood} />
      <Limb g={g} nodes={[[0, 0, 9.6], [1, 16, 6.8], [-5, 34, 6.4], [-13, 54, 6]]} ramp={wood} foot />
      <Crown g={g} skin={skin} volumes={crownFor(CHERRY, g.stage)} ramp={leafRamp(skin, CHERRY_SUN)}>
        {upTo(g, CHERRY_BLOSSOMS, [1, 4, 8, 12]).map(([dx, dy]) => (
          <Blossom key={`${dx}:${dy}`} x={g.x(dx)} y={g.y(dy)} r={2.2 + g.k * 0.7} petal={skin.flower ?? '#fff1f7'} center="#f472b6" />
        ))}
        {g.stage >= 4 && [[-54, 84], [54, 90], [-8, 122]].map(([dx, dy]) => <Chip key={dx} x={g.x(dx)} y={g.y(dy)} r={3} color="#ffffff" />)}
      </Crown>
    </Tree>
  )
}

// ── Willow: a domed crown weeping faceted strands ────────────────────────────

const WILLOW: CrownPlan = {
  2: [[0, 86, 23], [-13, 74, 19], [13, 75, 19]],
  3: [[0, 100, 22], [-23, 90, 20], [23, 91, 20], [0, 84, 21]],
  4: [[0, 106, 21], [-22, 98, 20], [23, 99, 20], [-10, 112, 15], [12, 112, 15], [-38, 86, 17], [39, 87, 17], [0, 90, 21]],
  extra: [[-50, 74, 13], [51, 75, 13]],
}
const WILLOW_SUN: Sun = { lit: '#e6ff7a', peak: '#f6ffb0', deep: '#12300a' }

function Willow({ g, skin }: FormProps) {
  const wood = woodRamp(skin)
  const leaf = leafRamp(skin, WILLOW_SUN)
  const spots = g.stage === 2 ? [-18, -6, 6, 18] : g.stage === 5 ? [-56, -46, -35, -24, -12, 0, 12, 24, 35, 46, 56] : [-46, -35, -24, -12, 0, 12, 24, 35, 46]
  const strands = spots.map((dx, i) => {
    const top = 88 - Math.abs(dx) * 0.34
    const bottom = 14 + ((i * 7) % 3) * 7
    // A gentle outward sag, so the strands hang like a curtain rather than zigzag.
    const sag = (dx === 0 ? 0 : Math.sign(dx)) * (1.6 + (i % 2))
    const end = dx + sag * 1.5
    const nodes: LimbNode[] = [
      [dx, top, 3.6],
      [dx + sag, top - (top - bottom) / 3, 4],
      [dx + sag * 1.6, top - ((top - bottom) * 2) / 3, 3.6],
      [end, bottom + 5, 2.6],
    ]
    return { key: dx, nodes, front: i % 2 === 1, end: [g.x(end), g.y(bottom)] as const }
  })
  const strand = (s: (typeof strands)[number]) => (
    <g key={s.key}>
      <Limb g={g} nodes={s.nodes} ramp={leaf} cap dim={s.front ? 1 : 0.62} />
      <Chip x={s.end[0]} y={s.end[1] - 1} r={2.6} color={s.front ? leaf[4] : leaf[2]} />
    </g>
  )
  return (
    <Tree g={g}>
      {g.stage >= 3 && <Roots g={g} hw={8.4} ramp={wood} />}
      <Limb g={g} nodes={trunkNodes(72, 8.4, -2)} ramp={wood} foot />
      <Chips g={g} hw={8.4} ramp={wood} />
      <Foliage>{strands.filter((s) => !s.front).map(strand)}</Foliage>
      <Crown g={g} skin={skin} volumes={crownFor(WILLOW, g.stage)} ramp={leaf} />
      <Foliage>{strands.filter((s) => s.front).map(strand)}</Foliage>
    </Tree>
  )
}

// ── Mystic: a twisted bonsai trunk holding glowing violet cloud pads ─────────

// Flat-bottomed pads at the branch tips: the top one first, then right, left and (stage 5) upper left.
const MYSTIC_PADS: Point[][] = [
  [[6, 112], [-15, 108], [26, 107]],
  [[33, 86], [49, 82]],
  [[-37, 70], [-54, 66], [-23, 72]],
  [[-36, 98], [-50, 94]],
]
const PAD_RADII = [[22, 17, 16], [20, 14], [20, 14, 14], [16, 12]]
const MYSTIC_SUN: Sun = { lit: '#f0c4ff', peak: '#fdf0ff', deep: '#1b0a3d' }
const SPORES: Point[] = [[-54, 96], [42, 112], [-18, 126], [58, 72], [-62, 56], [4, 90], [28, 124], [-28, 104], [64, 96], [-44, 118]]

function Mystic({ g, skin }: FormProps) {
  const wood = woodRamp(skin, '#d9a3c8', '#1a0f2b')
  const pads = upTo(g, MYSTIC_PADS, [1, 2, 3, 4])
  const swell = g.golden ? 1.07 : 1
  return (
    <Tree g={g}>
      {/* Bioluminescent glow behind each pad. */}
      {pads.map((pad) => (
        <g key={`h${pad[0][0]}`} fill={skin.glow}>
          <circle cx={g.x(pad[0][0])} cy={g.y(pad[0][1])} r={g.r(32)} opacity="0.14" />
          <circle cx={g.x(pad[0][0])} cy={g.y(pad[0][1])} r={g.r(22)} opacity="0.2" />
        </g>
      ))}
      {g.stage >= 3 && <Roots g={g} hw={7} ramp={wood} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[10, 62, 3.8], [23, 68, 3.3], [31, 80, 3]]} ramp={wood} />}
      {g.stage >= 4 && <Limb g={g} nodes={[[-14, 38, 3.8], [-28, 48, 3.3], [-35, 62, 3]]} ramp={wood} />}
      {g.golden && <Limb g={g} nodes={[[7, 82, 3.2], [-16, 88, 2.8], [-34, 92, 2.5]]} ramp={wood} />}
      <Limb g={g} nodes={[[0, 0, 10], [-10, 14, 7.5], [-16, 32, 7], [-4, 48, 6.5], [10, 60, 6], [9, 78, 5.5], [5, 98, 5]]} ramp={wood} foot />
      {pads.map((pad, i) => (
        <Crown key={i} g={g} skin={skin} volumes={pad.map(([dx, dy], j) => [dx, dy, PAD_RADII[i][j] * swell] as const)} ramp={leafRamp(skin, MYSTIC_SUN)} squash={0.64} />
      ))}
      {/* Luminous spores drifting round the crown. */}
      <Foliage>
        {SPORES.slice(0, g.stage * 2).map(([dx, dy]) => (
          <g key={`${dx}:${dy}`}>
            <Chip x={g.x(dx)} y={g.y(dy)} r={3.8} color={skin.glow} opacity={0.4} />
            <Chip x={g.x(dx)} y={g.y(dy)} r={1.8} color={skin.flower ?? '#f5d0fe'} />
          </g>
        ))}
      </Foliage>
    </Tree>
  )
}

// ── Palm: a bent, ringed trunk under a wide fan of two-plane fronds ──────────

const FRONDS = [-168, -140, -112, -80, -52, -22, 8, 196, -96, 172, -126, -38] // degrees; 0 = right, −90 = up
const PALM_TRUNK: LimbNode[] = [[0, 0, 9.5], [-2, 14, 7.4], [-3, 30, 7], [-1, 46, 6.6], [2, 62, 6.2], [5, 78, 5.8], [8, 96, 5.6]]

function Palm({ g, skin }: FormProps) {
  const wood = woodRamp(skin, '#ffd08a')
  const leaf = leafRamp(skin)
  const [cx, cy] = [g.x(8), g.y(98)]
  const len = (20 + 36 * g.k) * (g.golden ? 1.04 : 1)
  const half = 6 + 5 * g.k
  // Four fronds on the sapling, eight on the young palm, ten when mature, twelve when mastered.
  const angles = g.stage === 2 ? FRONDS.filter((_, i) => i % 2 === 0 && i < 8) : FRONDS.slice(0, [8, 8, 10, 12][g.stage - 2])
  const fronds = angles.map((deg, i) => {
    const a = (deg * Math.PI) / 180
    const tip: Point = [cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.8 + len * 0.3]
    return { key: deg, tip, light: rampColor(leaf, i % 2 ? 0.95 : 0.8), dark: rampColor(leaf, i % 2 ? 0.34 : 0.18) }
  })
  const nut = g.golden ? '#d97706' : (skin.fruit ?? '#8a4f22')
  return (
    <Tree g={g} spread={NARROW}>
      <Limb g={g} nodes={PALM_TRUNK} ramp={wood} foot />
      <Foliage>
        {g.golden && (
          <Halo>
            {fronds.map((f) => (
              <polygon key={f.key} points={bladeOutline([cx, cy], f.tip, half)} strokeWidth="8" />
            ))}
          </Halo>
        )}
        {fronds.map((f) => (
          <Blade key={f.key} from={[cx, cy]} to={f.tip} half={half} light={f.light} dark={f.dark} occlusion={skin.occlusion} />
        ))}
        <polygon points={pointList([[cx - 6, cy - 2], [cx - 1, cy - 8], [cx + 1, cy - 2]])} fill={skin.rim} opacity="0.85" />
        {upTo(g, [[-5, 6], [5, 7], [0, 12]] as Point[], [0, 2, 3, 3]).map(([dx, dy]) => (
          <Solid key={dx} x={cx + dx} y={cy + dy} rx={5} color={nut} occlusion={skin.occlusion} />
        ))}
      </Foliage>
    </Tree>
  )
}

// ── Citrus: a round, heavy crown loaded with faceted oranges ─────────────────

const CITRUS: CrownPlan = {
  2: [[7, 80, 27], [-11, 64, 26]],
  3: [[0, 92, 26], [-25, 72, 25], [25, 72, 25], [0, 58, 22]],
  4: [[0, 104, 22], [-24, 94, 22], [25, 96, 22], [-37, 72, 21], [38, 74, 21], [0, 84, 25], [-16, 62, 22], [17, 62, 22], [0, 48, 20]],
  extra: [[-46, 90, 15], [47, 92, 15], [0, 114, 13]],
}
const ORANGES: Point[] = [[-22, 74], [19, 84], [0, 104], [32, 66], [-34, 60], [7, 58], [-10, 90], [27, 104], [-27, 100]]

function Citrus({ g, skin }: FormProps) {
  const wood = woodRamp(skin)
  return (
    <Tree g={g}>
      {g.stage >= 3 && <Roots g={g} hw={7.6} ramp={wood} />}
      <Limb g={g} nodes={trunkNodes(48, 7.6)} ramp={wood} foot />
      <Chips g={g} hw={7.6} ramp={wood} />
      <Crown g={g} skin={skin} volumes={crownFor(CITRUS, g.stage)} ramp={leafRamp(skin)}>
        {upTo(g, ORANGES, [0, 3, 6, 9]).map(([dx, dy]) => (
          <Solid key={`${dx}:${dy}`} x={g.x(dx)} y={g.y(dy)} rx={4.6 + 2.4 * g.k} color={g.golden ? '#ffa31a' : (skin.fruit ?? '#ff8a1f')} occlusion={skin.occlusion} />
        ))}
        {g.golden && [[-40, 86], [40, 84], [-6, 120]].map(([dx, dy]) => <Blossom key={dx} x={g.x(dx)} y={g.y(dy)} r={2.8} petal={skin.flower ?? '#ffffff'} />)}
      </Crown>
    </Tree>
  )
}

// ── Maple: a coral and crimson crown set with cut five-point leaves ──────────

const MAPLE: CrownPlan = {
  2: [[7, 72, 26], [-11, 58, 25]],
  3: [[0, 88, 26], [-26, 68, 25], [26, 68, 25], [0, 54, 21]],
  4: [[0, 100, 24], [-26, 90, 22], [27, 92, 22], [-40, 66, 20], [41, 68, 20], [-15, 70, 24], [16, 70, 24], [-26, 48, 17], [27, 49, 17], [0, 50, 20]],
  extra: [[-48, 86, 14], [49, 88, 14], [0, 112, 13]],
}
const MAPLE_SUN: Sun = { lit: '#ffb24d', peak: '#ffe59a', deep: '#3d0a12' }
// Leaves on the crown: dx, dy, radius, turn.
const MAPLE_LEAVES: [number, number, number, number][] = [[-30, 86, 11, -14], [27, 98, 11, 12], [2, 66, 12, 4], [-45, 60, 9, -20], [45, 64, 9, 18], [-8, 108, 9, -6]]

function Maple({ g, skin }: FormProps) {
  const wood = woodRamp(skin)
  const leaf = leafRamp(skin, MAPLE_SUN)
  return (
    <Tree g={g}>
      {g.stage >= 3 && <Roots g={g} hw={7} ramp={wood} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[-3, 30, 4], [-13, 42, 3.6], [-24, 54, 3]]} ramp={wood} />}
      {g.stage >= 3 && <Limb g={g} nodes={[[4, 32, 4], [14, 43, 3.6], [25, 55, 3]]} ramp={wood} />}
      <Limb g={g} nodes={trunkNodes(50, 7, 0.5)} ramp={wood} foot />
      <Chips g={g} hw={7} ramp={wood} />
      <Crown g={g} skin={skin} volumes={crownFor(MAPLE, g.stage)} ramp={leaf}>
        {upTo(g, MAPLE_LEAVES, [0, 2, 4, 6]).map(([dx, dy, r, rot]) => {
          const [x, y, rr] = [g.x(dx), g.y(dy), g.r(r)]
          // Ten wedges from the leaf's heart: lit towards the sun, deep away from it.
          const rim: Point[] = Array.from({ length: 10 }, (_, i) => {
            const a = ((rot - 90 + i * 36) * Math.PI) / 180
            const reach = i % 2 === 0 ? rr : rr * 0.5
            return [x + Math.cos(a) * reach, y + Math.sin(a) * reach]
          })
          return (
            <g key={`${dx}:${dy}`}>
              <polygon points={pointList(rim)} fill={skin.occlusion} opacity="0.6" transform="translate(1.2 2)" />
              {rim.map((p, i) => {
                const q = rim[(i + 1) % rim.length]
                const facing = ((p[0] + q[0]) / 2 - x) * -0.6 + ((p[1] + q[1]) / 2 - y) * -0.8
                return <Facet key={i} points={[[x, y], p, q]} fill={rampColor(leaf, 0.62 + (facing / rr) * 0.5 + (i % 2 ? 0.06 : -0.04))} />
              })}
            </g>
          )
        })}
      </Crown>
    </Tree>
  )
}

// ── Cactus: faceted saguaro columns with ribbed arms and blooming tips ───────

type CactusArm = { side: -1 | 1; at: number; reach: number; top: number }
const CACTUS: Record<GrownStage, { top: number; hw: number; arms: CactusArm[] }> = {
  2: { top: 56, hw: 15, arms: [] },
  3: { top: 68, hw: 14, arms: [{ side: 1, at: 28, reach: 24, top: 54 }] },
  4: { top: 84, hw: 14.5, arms: [{ side: -1, at: 30, reach: 28, top: 62 }, { side: 1, at: 44, reach: 28, top: 76 }] },
  5: { top: 94, hw: 15.5, arms: [{ side: -1, at: 32, reach: 31, top: 70 }, { side: 1, at: 48, reach: 31, top: 86 }, { side: 1, at: 22, reach: 24, top: 40 }] },
}
const CACTUS_SUN: Sun = { lit: '#d9f99d', peak: '#f7fee7', deep: '#0a2b1a' }

function Cactus({ g, skin }: FormProps) {
  const leaf = leafRamp(skin, CACTUS_SUN)
  const { top, hw, arms } = CACTUS[g.stage]
  const armHw = hw * 0.52
  // The body in ribbed segments (each a little darker or lighter than its neighbours).
  const body: LimbNode[] = Array.from({ length: 5 }, (_, i) => [0, (top * i) / 4, hw * (i === 0 ? 1.04 : 1 - i * 0.02)])
  const column = prism(g, body, { cap: true })
  const tips: Point[] = [column.tip, ...arms.map((arm) => prism(g, [[arm.side * arm.reach, arm.at, armHw], [arm.side * arm.reach, arm.top, armHw * 0.92]], { cap: true }).tip)]
  const flower = skin.flower ?? '#ff5fa2'
  return (
    <Tree g={g} spread={NARROW}>
      <Foliage>
        {arms.map((arm) => (
          <g key={`${arm.side}:${arm.at}`}>
            <Limb g={g} nodes={[[0, arm.at, armHw], [arm.side * (arm.reach + armHw * 0.4), arm.at, armHw]]} ramp={leaf} />
            <Limb g={g} nodes={[[arm.side * arm.reach, arm.at - armHw * 0.6, armHw], [arm.side * arm.reach, (arm.at + arm.top) / 2, armHw * 0.96], [arm.side * arm.reach, arm.top, armHw * 0.92]]} ramp={leaf} cap />
          </g>
        ))}
        {/* The crease the column throws onto its arms. */}
        <polygon points={pointList(column.outline)} fill={skin.occlusion} opacity="0.6" transform={`translate(${(1.8 * g.k).toFixed(2)} ${(2.4 * g.k).toFixed(2)})`} />
        <Limb g={g} nodes={body} ramp={leaf} foot cap />
        <polygon points={pointList([[g.x(0) - g.r(hw) * 0.7, g.y(top) + 2], [g.x(0) - g.r(hw) * 0.3, g.y(top) - g.r(hw) * 0.4], [g.x(0) - g.r(hw) * 0.2, g.y(top) + 3]])} fill={skin.rim} opacity="0.85" />
        {/* Spines: white chips down the ridges. */}
        {[0.18, 0.4, 0.62, 0.84].map((t, i) => (
          <g key={t}>
            <Chip x={g.x(0) - g.r(hw) * 0.4} y={g.y(top * t)} r={1.3} color="#fffbeb" />
            <Chip x={g.x(0) + g.r(hw) * 0.45} y={g.y(top * t) + 4} r={1.3} color="#fffbeb" />
            {i % 2 === 0 && <Chip x={g.x(0) - g.r(hw) * 0.95} y={g.y(top * t) + 2} r={1.2} color="#fffbeb" />}
          </g>
        ))}
        {g.stage >= 3 &&
          (g.stage === 3 ? tips.slice(0, 1) : tips).map(([x, y]) => <Blossom key={`${x}:${y}`} x={x} y={y - 1} r={g.golden ? 3.6 : 2.8} petal={flower} center={g.golden ? '#fde047' : '#facc15'} />)}
      </Foliage>
    </Tree>
  )
}

// ── Stage 1: sprouts ─────────────────────────────────────────────────────────

// A cut heap of soil with a lit and a shaded slope.
export function Heap() {
  const p = (points: Point[]) => points.map(([dx, dy]) => [TRUNK_X + dx, GROUND_Y - dy] as const)
  return (
    <g>
      <Facet points={p([[-13, 0], [-4, 6.5], [-1, 0]])} fill="#b08863" />
      <Facet points={p([[-4, 6.5], [5, 6], [-1, 0]])} fill="#966e4a" />
      <Facet points={p([[5, 6], [13, 0], [-1, 0]])} fill="#7a5537" />
    </g>
  )
}

// The sprout's own little world: full-size design units map straight onto the view.
const SPROUT: Geo = { ...geo(4), stage: 2 }
const SEED_CAPS: Partial<Record<TreeForm, string>> = {
  oak: '#a8702e',
  birch: '#d9b36a',
  cherry: '#8a2f3c',
  willow: '#b58d52',
  mystic: '#7c3aed',
  citrus: '#ff8a1f',
  maple: '#c2410c',
}

// A plump two-leaf seedling in a heap of soil, wearing its seed's cap (per species), or the species'
// own first shoot: a pine tuft, a sprouting coconut, a round baby cactus, a glowing mystic bud.
export function Sprout({ form, skin }: { form: TreeForm; skin: TreeSkin }) {
  const g = SPROUT
  const stemRamp = ['#2f7d24', '#4fb536', '#a6ec7c']
  const leaf = leafRamp(skin, form === 'cherry' || form === 'mystic' || form === 'maple' || form === 'birch' ? { lit: skin.canopyLight, peak: skin.rim, deep: '#1b1030' } : GREEN_SUN)
  const at = (dx: number, dy: number): Point => [g.x(dx), g.y(dy)]
  const frame = (children: ReactNode) => (
    <g strokeLinejoin="round">
      <ContactShadow w={9} />
      {children}
    </g>
  )

  if (form === 'pine') {
    const needles: Point[] = [[-12, 22], [-7, 30], [0, 34], [7, 30], [12, 22], [-9, 14], [9, 14]]
    return frame(
      <>
        <Heap />
        <Limb g={g} nodes={[[0, 2, 2.2], [0, 18, 1.8]]} ramp={stemRamp} />
        <Foliage>
          {needles.map(([dx, dy], i) => (
            <Blade key={i} from={at(0, i < 5 ? 17 : 9)} to={at(dx, dy)} half={2.2} light={rampColor(leaf, dx <= 0 ? 0.9 : 0.6)} dark={rampColor(leaf, dx <= 0 ? 0.4 : 0.15)} occlusion={skin.occlusion} lift={0.04} />
          ))}
          <Solid x={g.x(0)} y={g.y(33)} rx={2.6} ry={3} color="#a86a32" />
        </Foliage>
      </>,
    )
  }
  if (form === 'cactus') {
    return frame(
      <>
        <Heap />
        <Crown g={g} skin={skin} volumes={[[0, 11, 11]]} ramp={leafRamp(skin, CACTUS_SUN)} squash={1.04}>
          {[[-7, 12], [7, 10], [0, 19], [-3, 6]].map(([dx, dy]) => (
            <Chip key={dx} x={g.x(dx)} y={g.y(dy)} r={1.2} color="#fffbeb" />
          ))}
          <Blossom x={g.x(0)} y={g.y(23)} r={2.3} petal={skin.flower ?? '#ff5fa2'} />
        </Crown>
      </>,
    )
  }
  if (form === 'palm') {
    return frame(
      <>
        <Crown g={g} skin={{ ...skin, occlusion: '#3f2410', rim: '#e0a86a' }} volumes={[[0, 7, 11]]} ramp={['#3f2410', '#573216', '#6b3f1c', '#9a6232', '#c98a4b']} squash={0.78} />
        <Limb g={g} nodes={[[0, 13, 2.2], [1, 21, 1.9], [2, 28, 1.7]]} ramp={stemRamp} />
        <Foliage>
          {([[-18, 26], [12, 42], [18, 22]] as Point[]).map(([dx, dy], i) => (
            <Blade key={i} from={at(2, 28)} to={at(dx, dy)} half={3.6} light={rampColor(leaf, i === 1 ? 0.95 : 0.8)} dark={rampColor(leaf, 0.25)} occlusion={skin.occlusion} />
          ))}
        </Foliage>
      </>,
    )
  }
  // Two cotyledons; the seed coat still perched on top (acorn cap, winged seed, pit, …).
  const cap = SEED_CAPS[form] ?? '#a86a32'
  return frame(
    <>
      {form === 'mystic' && <circle cx="60" cy="84" r="16" fill={skin.glow} opacity="0.28" />}
      <Heap />
      <Limb g={g} nodes={[[0, 2, 2.4], [-0.6, 12, 2], [0, 22, 1.8]]} ramp={stemRamp} />
      <Foliage>
        <Blade from={at(0, 20)} to={at(-21, 28)} half={5.4} light={rampColor(leaf, 0.82)} dark={rampColor(leaf, 0.3)} occlusion={skin.occlusion} />
        <Blade from={at(0, 21)} to={at(22, 33)} half={5.6} light={rampColor(leaf, 0.98)} dark={rampColor(leaf, 0.42)} occlusion={skin.occlusion} />
        <polygon points={pointList([at(-14, 28), at(-9, 30), at(-10, 26)])} fill={skin.rim} opacity="0.85" />
        {/* The seed cap: a lit and a shaded plane. */}
        <Facet points={[at(-6, 22), at(-0.5, 29), at(0, 22)]} fill={shade(cap, 0.3)} />
        <Facet points={[at(-0.5, 29), at(6, 22), at(0, 22)]} fill={shade(cap, -0.2)} />
        {form === 'mystic' && [[-12, 36], [14, 40], [6, 48]].map(([dx, dy]) => <Chip key={dx} x={g.x(dx)} y={g.y(dy)} r={1.8} color={skin.flower ?? '#f5d0fe'} />)}
        {form === 'cherry' && <Blossom x={g.x(12)} y={g.y(36)} r={2} petal={skin.flower ?? '#fff1f7'} center="#f472b6" />}
      </Foliage>
    </>,
  )
}

export type NaturalForm = 'oak' | 'pine' | 'birch' | 'cherry' | 'willow' | 'mystic' | 'palm' | 'citrus' | 'maple' | 'cactus'

export const NATURAL_FORMS: Record<NaturalForm, (props: FormProps) => ReactNode> = {
  oak: Oak,
  pine: Pine,
  birch: Birch,
  cherry: Cherry,
  willow: Willow,
  mystic: Mystic,
  palm: Palm,
  citrus: Citrus,
  maple: Maple,
  cactus: Cactus,
}

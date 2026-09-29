import type { ReactNode } from 'react'
import { mix, shade } from '@/shared/lib/color'
import { getTreeSpecies, MIGHTY_GOLD, type TreeSkin } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

import { bottomCenterScale, TREE_GROUND_Y as GROUND_Y, TREE_TRUNK_X as TRUNK_X, TREE_VIEW as VIEW } from '../lib/plotSprite'

// Where the trunk meets the ground, as a fraction of the drawn size. Every species, stage and size
// tier grows from this point, so a scene can line the tree up with its own ground (roots attach here).
export { TREE_BASE_RATIO } from '../lib/plotSprite'

type TreeStageSvgProps = {
  stage: TreeStage
  treeType: string
  label: string
  className?: string
  // Draw the little tilled mound under the tree. Off when the scene draws its own ground.
  ground?: boolean
  // Size-tier multiplier (getTreeSizeTier(itemCount).scale). Scales about the trunk base, so the
  // base point (TREE_BASE_RATIO) never moves; the tree and its AO shadow grow up and out of the box
  // (the svg is overflow-visible). The soil mound keeps its size: it's the plot, not the tree.
  scale?: number
}

// Cartoon-3D tree, one silhouette family per species (broadleaf, conifer, bamboo, cactus) × five
// growth stages. Cel-shaded like a mobile farm game: every canopy clump is a plush ball with a bold
// merged outline, a shadowed underside, a sunlit top (light comes from the upper left), a specular
// glint and a warm amber bounce light underneath. A soft ambient-occlusion shadow grounds it.
// Stage 5 (Golden Ancient Bloom) adds a golden aura, sparkles and the species' blossoms or fruit.
// Pure markup (no hooks, no ids), so any number render on one page and on the server.
function TreeStageSvg({ stage, treeType, label, className, ground = true, scale = 1 }: TreeStageSvgProps) {
  const { form, skin } = getTreeSpecies(treeType)
  const Form = FORMS[form]
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1

  return (
    // overflow="visible" too (not only the class): sized-up tiers and the stage-5 aura draw past the box.
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label} overflow="visible" className={cn('size-24 overflow-visible', className)}>
      {ground && <Mound />}
      <g transform={s === 1 ? undefined : bottomCenterScale(s)}>
        {stage === 5 && <GoldenAura />}
        <GroundShadow stage={stage} form={form} />
        <Form stage={stage} skin={skin} />
        {stage === 5 && <Sparkles />}
      </g>
    </svg>
  )
}

type FormProps = { stage: TreeStage; skin: TreeSkin }
type Clump = [number, number, number] // x, y, radius

// ── Palette helpers ──────────────────────────────────────────────────────────

const SUNLIGHT = '#fff6c8'
const BOUNCE = '#ffb347'
const outlineOf = (color: string) => shade(color, -0.58)

// ── Ground ───────────────────────────────────────────────────────────────────

// Soft translucent ambient-occlusion shadow on the soil, a little to the right (sun upper-left).
function GroundShadow({ stage, form }: { stage: TreeStage; form: string }) {
  const spread = form === 'cactus' || form === 'bamboo' ? 0.7 : 1
  const w = [0, 12, 22, 32, 44, 46][stage] * spread
  return (
    <g>
      <ellipse cx={TRUNK_X + 4} cy={GROUND_Y + 1} rx={w} ry={w * 0.24} fill="#2f3d12" opacity="0.2" />
      <ellipse cx={TRUNK_X + 2} cy={GROUND_Y + 0.5} rx={w * 0.55} ry={w * 0.14} fill="#3b2410" opacity="0.28" />
    </g>
  )
}

// Little tilled soil mound (used when the scene draws no ground of its own).
function Mound() {
  return (
    <g>
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 4} rx="40" ry="8" fill="#5a3314" />
      <ellipse cx={TRUNK_X} cy={GROUND_Y + 2} rx="38" ry="7" fill="#9a5f2e" stroke="#4a2511" strokeWidth="1.6" />
      <ellipse cx={TRUNK_X - 6} cy={GROUND_Y + 0.5} rx="24" ry="3.8" fill="#b97a43" />
      <path d="M34 110 q6 -2 12 0 M52 111.5 q6 -2 12 0 M70 110.5 q6 -2 12 0" stroke="#6b3d18" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M24 106 q1 -4 -1 -6 M27 106 q0 -5 2 -7 M92 107 q1 -4 -1 -6 M95 107 q0 -5 2 -6" stroke="#3f9a2a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  )
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`

function GoldenAura() {
  return (
    <g fill="#fde68a">
      <circle cx={TRUNK_X} cy="52" r="58" opacity="0.16" />
      <circle cx={TRUNK_X} cy="52" r="46" opacity="0.2" />
      <circle cx={TRUNK_X} cy="52" r="33" opacity="0.2" />
    </g>
  )
}

function Sparkles() {
  const points: [number, number, number][] = [
    [14, 30, 6],
    [106, 24, 6.5],
    [62, 2, 5],
    [110, 74, 4.5],
    [10, 76, 4.5],
    [90, 8, 3.5],
  ]
  return (
    <g>
      {points.map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <path d={star(x, y, r + 1.4)} fill="#b45309" />
          <path d={star(x, y, r)} fill="#fde047" />
          <circle cx={x - r * 0.15} cy={y - r * 0.15} r={r * 0.22} fill="#fff" />
        </g>
      ))}
    </g>
  )
}

// Plush cloud-like canopy: outline silhouette first (so it merges around all clumps), then each
// clump back (top) to front (bottom), so lower clumps overlap the ones above like a real crown.
function Canopy({ clumps, skin, golden = false }: { clumps: Clump[]; skin: TreeSkin; golden?: boolean }) {
  const dark = golden ? mix(skin.canopyDark, '#eab308', 0.28) : skin.canopyDark
  const light = golden ? mix(skin.canopyLight, '#fde047', 0.45) : skin.canopyLight
  const outline = outlineOf(skin.canopyDark)
  const underside = shade(dark, -0.22)
  // Saturated mid-tones carry most of each clump; the pale top light is a smaller cap.
  const mid = mix(dark, light, 0.38)
  const sun = mix(light, SUNLIGHT, 0.6)
  const bounce = mix(dark, BOUNCE, 0.38)
  const ordered = [...clumps].sort((a, b) => a[1] - b[1] || a[0] - b[0])

  return (
    <g>
      <g fill={outline}>
        {ordered.map(([x, y, r]) => (
          <circle key={`o${x}-${y}`} cx={x} cy={y} r={r + 2.3} />
        ))}
      </g>
      {ordered.map(([x, y, r]) => (
        <g key={`c${x}-${y}`}>
          <circle cx={x} cy={y} r={r} fill={underside} stroke={outline} strokeOpacity="0.35" strokeWidth="1" />
          <circle cx={x - r * 0.05} cy={y - r * 0.1} r={r * 0.9} fill={dark} />
          {/* Warm bounce light off the sunny ground, under the clump. */}
          <ellipse cx={x - r * 0.28} cy={y + r * 0.56} rx={r * 0.42} ry={r * 0.19} fill={bounce} opacity="0.6" />
          <circle cx={x - r * 0.15} cy={y - r * 0.24} r={r * 0.68} fill={mid} />
          <circle cx={x - r * 0.3} cy={y - r * 0.42} r={r * 0.34} fill={light} />
          <ellipse
            cx={x - r * 0.38}
            cy={y - r * 0.54}
            rx={r * 0.2}
            ry={r * 0.11}
            fill={sun}
            transform={`rotate(-28 ${x - r * 0.38} ${y - r * 0.54})`}
          />
          <circle cx={x - r * 0.52} cy={y - r * 0.3} r={Math.max(0.8, r * 0.07)} fill="#fff" opacity="0.85" />
        </g>
      ))}
    </g>
  )
}

// Bark with a bold outline, a sunlit left edge and ambient occlusion where the crown shades it.
function Trunk({ d, skin, highlight, aoY }: { d: string; skin: TreeSkin; highlight: string; aoY?: number }) {
  const outline = outlineOf(skin.barkDeep)
  return (
    <g>
      <path d={d} fill={skin.bark} stroke={outline} strokeWidth="2.2" strokeLinejoin="round" />
      <path d={highlight} stroke={shade(skin.bark, 0.35)} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9" />
      {aoY !== undefined && <ellipse cx={TRUNK_X} cy={aoY} rx="7" ry="4" fill={skin.barkDeep} opacity="0.7" />}
    </g>
  )
}

// Five-petal blossom with a dark rim and a golden heart.
function Blossom({ x, y, petal, center = '#facc15', r = 2.6 }: { x: number; y: number; petal: string; center?: string; r?: number }) {
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [x + Math.cos(rad) * r, y + Math.sin(rad) * r] as const
  })
  return (
    <g>
      {petals.map(([px, py]) => (
        <circle key={`o${px}`} cx={px} cy={py} r={r * 0.82 + 0.9} fill={outlineOf(petal)} opacity="0.55" />
      ))}
      {petals.map(([px, py]) => (
        <circle key={`p${px}`} cx={px} cy={py} r={r * 0.82} fill={petal} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill={center} stroke="#b45309" strokeWidth="0.6" />
      <circle cx={x - r * 0.9} cy={y - r * 0.9} r={r * 0.25} fill="#fff" />
    </g>
  )
}

// Glossy fruit: outlined, a shade on the lower right, a big specular glint, stalk and leaf.
function Fruit({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="4.6" fill={outlineOf(color)} />
      <circle cx={x} cy={y} r="3.6" fill={color} />
      <circle cx={x + 0.9} cy={y + 1} r="2.4" fill={shade(color, -0.2)} opacity="0.7" />
      <ellipse cx={x - 1.3} cy={y - 1.4} rx="1.3" ry="0.9" fill="#fff" opacity="0.9" transform={`rotate(-30 ${x - 1.3} ${y - 1.4})`} />
      <path d={`M${x} ${y - 3.4} q0.3 -1.8 1.4 -2.6`} stroke="#4b2c13" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d={`M${x + 1.2} ${y - 5.4} q2.6 -1.4 4 0.4 q-2.4 1.2 -4 -0.4 Z`} fill="#4ade80" stroke="#166534" strokeWidth="0.6" />
    </g>
  )
}

// Stage 1 for trees: a plush two-leaf shoot in a little heap of turned soil.
function Sprout({ leaf = '#6fd64a', leafDark = '#3a9a28' }: { leaf?: string; leafDark?: string }) {
  const outline = '#1f4a14'
  return (
    <g>
      <path d="M50 108 q10 -7 20 0 z" fill="#8a5228" stroke="#4a2511" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M60 107 C60 100 59 94 60 86" stroke={outline} strokeWidth="4.6" fill="none" strokeLinecap="round" />
      <path d="M60 107 C60 100 59 94 60 86" stroke="#5bbf3a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M60 89 C54 91 45 89 43 80 C51 77 58 81 60 89 Z" fill={leafDark} stroke={outline} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M60 87 C66 89 76 86 78 76 C69 73 62 78 60 87 Z" fill={leaf} stroke={outline} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M47 81 q4 -2 8 1 M66 79 q4 -3 8 -2" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}

// ── Broadleaf: oak, sakura, apple ────────────────────────────────────────────

const BROADLEAF: Record<2 | 3 | 4, { trunk: string; highlight: string; aoY: number; clumps: Clump[] }> = {
  2: {
    trunk: 'M57.5 108 C58 98 58.5 88 58.8 76 L61.2 76 C61.5 88 62 98 62.5 108 Z',
    highlight: 'M59 104 C59.2 96 59.5 88 59.7 80',
    aoY: 80,
    clumps: [
      [60, 66, 12.5],
      [49, 75, 9],
      [71, 74, 9.5],
    ],
  },
  3: {
    trunk: 'M54.5 108 C56.5 97 57 84 57.5 66 L62.5 66 C63 84 63.5 97 65.5 108 Z',
    highlight: 'M57 104 C58 94 58.4 84 58.8 72',
    aoY: 74,
    clumps: [
      [60, 44, 17],
      [43, 54, 13.5],
      [77, 53, 14],
      [51, 66, 12.5],
      [70, 66, 12.5],
    ],
  },
  4: {
    trunk:
      'M49 108 C54.5 104 56 93 56.5 80 C55 72 50 68 45.5 66 L47.5 62.5 C52.5 64.5 56.5 67.5 58 70 L58 60 L62 60 L62 70 C63.5 67.5 67.5 64.5 72.5 62.5 L74.5 66 C70 68 65 72 63.5 80 C64 93 65.5 104 71 108 Z',
    highlight: 'M53 105 C56 99 57.5 90 57.8 80',
    aoY: 84,
    clumps: [
      [60, 24, 19],
      [39, 36, 17],
      [81, 34, 18],
      [28, 55, 15],
      [92, 54, 15],
      [49, 49, 18],
      [72, 48, 18],
      [42, 69, 14],
      [60, 66, 16],
      [78, 68, 14],
    ],
  },
}

const APPLES: Record<4 | 5, [number, number][]> = {
  4: [[42, 58], [74, 54], [58, 40], [88, 62], [32, 48]],
  5: [[42, 58], [74, 54], [58, 40], [88, 62], [32, 48], [66, 22], [50, 70], [82, 38], [24, 62], [70, 72]],
}
const BLOSSOMS: [number, number][] = [[32, 46], [46, 28], [70, 20], [90, 44], [60, 44], [40, 64], [80, 62], [56, 14], [22, 60], [98, 58], [62, 70]]

function Broadleaf({ stage, skin }: FormProps) {
  if (stage === 1) return <Sprout leaf={skin.canopyLight} leafDark={skin.canopyDark} />
  const shape = BROADLEAF[stage === 5 ? 4 : stage]
  const mature = stage >= 4

  return (
    <g>
      <Trunk d={shape.trunk} skin={skin} highlight={shape.highlight} aoY={shape.aoY} />
      {mature && (
        <path d="M49 108 q-6 1.5 -10 0.5 M71 108 q6 1.5 10 0.5" stroke={outlineOf(skin.barkDeep)} strokeWidth="3.4" strokeLinecap="round" />
      )}
      <Canopy clumps={shape.clumps} skin={skin} golden={stage === 5} />

      {/* Apple Orchard: fruit from stage 4, a fuller harvest at stage 5. */}
      {skin.fruit && mature && APPLES[stage === 5 ? 5 : 4].map(([x, y]) => <Fruit key={`f${x}-${y}`} x={x} y={y} color={skin.fruit!} />)}

      {/* Sakura: a few early blossoms at stage 4, full bloom at 5; apple blossoms at 5. */}
      {skin.flower &&
        (stage === 5 || (stage === 4 && !skin.fruit)) &&
        (stage === 5 ? BLOSSOMS : BLOSSOMS.slice(0, 5)).map(([x, y]) => (
          <Blossom key={`b${x}-${y}`} x={x} y={y} petal={skin.flower!} center={skin.fruit ? '#facc15' : '#f472b6'} />
        ))}
    </g>
  )
}

// ── Conifer: pine ────────────────────────────────────────────────────────────

type Tier = [number, number, number] // top y, half width, height

const CONIFER: Record<2 | 3 | 4, { trunkTop: number; trunkW: number; tiers: Tier[] }> = {
  2: { trunkTop: 84, trunkW: 5, tiers: [[66, 15, 22], [56, 11, 17]] },
  3: { trunkTop: 84, trunkW: 7, tiers: [[74, 23, 22], [61, 18, 19], [48, 13, 17]] },
  4: { trunkTop: 84, trunkW: 9, tiers: [[76, 31, 24], [61, 26, 21], [47, 20, 19], [33, 14, 17]] },
}

// A soft rounded tier: apex at the top, a scalloped skirt of little puffs along the bottom.
function tierPath([top, half, h]: Tier) {
  const bottom = top + h
  return `M${TRUNK_X} ${top} C${TRUNK_X + half * 0.35} ${top + h * 0.35} ${TRUNK_X + half * 0.8} ${top + h * 0.7} ${TRUNK_X + half} ${bottom} L${TRUNK_X - half} ${bottom} C${TRUNK_X - half * 0.8} ${top + h * 0.7} ${TRUNK_X - half * 0.35} ${top + h * 0.35} ${TRUNK_X} ${top} Z`
}
const tierPuffs = ([top, half, h]: Tier): Clump[] => {
  const n = Math.max(3, Math.round(half / 6))
  return Array.from({ length: n }, (_, i) => [TRUNK_X - half + ((i + 0.5) * half * 2) / n, top + h - 0.5, (half / n) * 1.05])
}

function Conifer({ stage, skin }: FormProps) {
  if (stage === 1) {
    return (
      <g strokeLinecap="round">
        <path d={`M${TRUNK_X} ${GROUND_Y} L60 90`} stroke="#1f4a14" strokeWidth="4.4" />
        <path d={`M${TRUNK_X} ${GROUND_Y} L60 90`} stroke="#5bbf3a" strokeWidth="2" />
        <path d="M60 92 L50 86 M60 92 L60 80 M60 92 L70 86 M60 97 L53 93 M60 97 L67 93" stroke="#1f4a14" strokeWidth="4.6" />
        <path d="M60 92 L50 86 M60 92 L60 80 M60 92 L70 86 M60 97 L53 93 M60 97 L67 93" stroke={skin.canopyLight} strokeWidth="2.4" />
      </g>
    )
  }
  const { trunkTop, trunkW, tiers } = CONIFER[stage === 5 ? 4 : stage]
  const golden = stage === 5
  const dark = golden ? mix(skin.canopyDark, '#eab308', 0.25) : skin.canopyDark
  const light = golden ? mix(skin.canopyLight, '#fde047', 0.4) : skin.canopyLight
  const outline = outlineOf(skin.canopyDark)
  const underside = shade(dark, -0.25)
  const mid = mix(dark, light, 0.55)

  return (
    <g>
      <Trunk
        d={`M${TRUNK_X - trunkW / 2 - 1.5} ${GROUND_Y} C${TRUNK_X - trunkW / 2} 100 ${TRUNK_X - trunkW / 2} 92 ${TRUNK_X - trunkW / 2} ${trunkTop} L${TRUNK_X + trunkW / 2} ${trunkTop} C${TRUNK_X + trunkW / 2} 92 ${TRUNK_X + trunkW / 2} 100 ${TRUNK_X + trunkW / 2 + 1.5} ${GROUND_Y} Z`}
        skin={skin}
        highlight={`M${TRUNK_X - trunkW / 2 + 1.4} ${GROUND_Y - 3} L${TRUNK_X - trunkW / 2 + 1.4} ${trunkTop + 4}`}
      />
      {/* Bottom tier first: each tier's scalloped skirt drapes over the one below. */}
      {tiers.map((tier) => {
        const [top, half, h] = tier
        const puffs = tierPuffs(tier)
        return (
          <g key={top}>
            <path d={tierPath(tier)} fill={outline} stroke={outline} strokeWidth="4.6" strokeLinejoin="round" />
            {puffs.map(([x, y, r]) => (
              <circle key={`o${x}`} cx={x} cy={y} r={r + 2.3} fill={outline} />
            ))}
            <path d={tierPath(tier)} fill={dark} />
            {puffs.map(([x, y, r]) => (
              <g key={`p${x}`}>
                <circle cx={x} cy={y} r={r} fill={underside} />
                <circle cx={x - r * 0.1} cy={y - r * 0.18} r={r * 0.78} fill={dark} />
              </g>
            ))}
            {/* Sunlit left face and a glint near the apex. */}
            <path
              d={`M${TRUNK_X} ${top + 1} C${TRUNK_X - half * 0.35} ${top + h * 0.35} ${TRUNK_X - half * 0.75} ${top + h * 0.7} ${TRUNK_X - half * 0.9} ${top + h - 2} L${TRUNK_X - half * 0.1} ${top + h - 3} Z`}
              fill={mid}
            />
            <path
              d={`M${TRUNK_X - 1} ${top + 3} C${TRUNK_X - half * 0.25} ${top + h * 0.3} ${TRUNK_X - half * 0.45} ${top + h * 0.5} ${TRUNK_X - half * 0.55} ${top + h * 0.62}`}
              stroke={light}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path d={`M${TRUNK_X + half * 0.1} ${top + h - 2.5} q${half * 0.4} -0.5 ${half * 0.75} 1`} stroke={mix(dark, BOUNCE, 0.4)} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7" />
          </g>
        )
      })}
      {stage >= 4 &&
        [[44, 92], [76, 90], [52, 76], [70, 74]].map(([x, y]) => (
          <g key={`cone${x}`}>
            <ellipse cx={x} cy={y} rx="3" ry="4" fill={outlineOf(skin.barkDeep)} />
            <ellipse cx={x} cy={y} rx="2.1" ry="3.1" fill={skin.bark} />
            <path d={`M${x - 1.6} ${y - 1} h3.2 M${x - 1.6} ${y + 1} h3.2`} stroke={skin.barkDeep} strokeWidth="0.7" />
          </g>
        ))}
      {golden && (
        <g>
          <path d={star(TRUNK_X, 30, 8.2)} fill="#b45309" />
          <path d={star(TRUNK_X, 30, 6.8)} fill={MIGHTY_GOLD} />
          <circle cx={TRUNK_X - 1.2} cy={28.8} r={1.4} fill="#fff" />
        </g>
      )}
    </g>
  )
}

// ── Bamboo ───────────────────────────────────────────────────────────────────

type Stalk = [number, number, number] // x, top y, width
type Leaf = [number, number, number] // x, y, rotation

const BAMBOO: Record<TreeStage, { stalks: Stalk[]; leaves: Leaf[] }> = {
  1: { stalks: [[60, 90, 6]], leaves: [[66, 90, -25], [54, 94, 205]] },
  2: {
    stalks: [[55, 74, 6], [65, 82, 6]],
    leaves: [[48, 74, 205], [62, 76, -25], [72, 82, -25], [50, 86, 200]],
  },
  3: {
    stalks: [[51, 62, 7], [60, 52, 7], [69, 70, 7]],
    leaves: [[43, 62, 205], [57, 58, 200], [67, 52, -25], [76, 70, -25], [44, 76, 200], [62, 68, -20], [78, 82, -30]],
  },
  4: {
    stalks: [[47, 50, 8], [56, 32, 8], [65, 40, 8], [74, 58, 8]],
    leaves: [
      [38, 50, 205], [52, 46, 200], [48, 32, 205], [62, 30, -25], [72, 40, -25], [58, 42, -20],
      [82, 58, -30], [66, 62, 200], [40, 66, 200], [80, 72, -25], [52, 60, 195], [72, 50, -15],
    ],
  },
  5: {
    stalks: [[47, 50, 8], [56, 32, 8], [65, 40, 8], [74, 58, 8]],
    leaves: [
      [38, 50, 205], [52, 46, 200], [48, 32, 205], [62, 30, -25], [72, 40, -25], [58, 42, -20],
      [82, 58, -30], [66, 62, 200], [40, 66, 200], [80, 72, -25], [52, 60, 195], [72, 50, -15],
    ],
  },
}

function Bamboo({ stage, skin }: FormProps) {
  const { stalks, leaves } = BAMBOO[stage]
  const outline = outlineOf(skin.barkDeep)
  const stalkColor = stage === 5 ? mix(skin.bark, '#facc15', 0.35) : skin.bark
  return (
    <g>
      {stalks.map(([x, top, w]) => {
        const nodes: number[] = []
        for (let y = GROUND_Y - 12; y > top + 5; y -= 12) nodes.push(y)
        return (
          <g key={x}>
            <rect x={x - w / 2} y={top} width={w} height={GROUND_Y - top} rx={w / 2} fill={stalkColor} stroke={outline} strokeWidth="2" />
            <rect x={x + w * 0.1} y={top + 2} width={w * 0.32} height={GROUND_Y - top - 4} rx={w * 0.16} fill={shade(stalkColor, -0.2)} opacity="0.7" />
            <rect x={x - w / 2 + 1.3} y={top + 3} width={1.6} height={GROUND_Y - top - 6} rx="0.8" fill={shade(stalkColor, 0.45)} />
            {nodes.map((y) => (
              <g key={y}>
                <path d={`M${x - w / 2 - 0.6} ${y} h${w + 1.2}`} stroke={outline} strokeWidth="2.2" strokeLinecap="round" />
                <path d={`M${x - w / 2 + 0.6} ${y - 1.6} h${w - 1.2}`} stroke={shade(stalkColor, 0.35)} strokeWidth="1" strokeLinecap="round" />
              </g>
            ))}
          </g>
        )
      })}
      {leaves.map(([x, y, rot], i) => {
        const fill = i % 3 === 0 ? skin.canopyDark : i % 3 === 1 ? skin.canopyLight : mix(skin.canopyDark, skin.canopyLight, 0.5)
        return (
          <g key={`${x}-${y}`} transform={`rotate(${rot} ${x} ${y})`}>
            <path d={`M${x} ${y} C${x + 4} ${y - 4.5} ${x + 11} ${y - 4} ${x + 16} ${y} C${x + 11} ${y + 3} ${x + 4} ${y + 3.5} ${x} ${y} Z`} fill={fill} stroke={outlineOf(skin.canopyDark)} strokeWidth="1.4" strokeLinejoin="round" />
            <path d={`M${x + 2} ${y - 0.3} Q${x + 8} ${y - 1.6} ${x + 14} ${y - 0.2}`} stroke={mix(fill, SUNLIGHT, 0.6)} strokeWidth="1" fill="none" strokeLinecap="round" />
          </g>
        )
      })}
    </g>
  )
}

// ── Cactus: saguaro ──────────────────────────────────────────────────────────

type Arm = { d: string; w: number; tip: [number, number] }

const CACTUS: Record<2 | 3 | 4, { top: number; w: number; arms: Arm[] }> = {
  2: { top: 80, w: 15, arms: [] },
  3: { top: 62, w: 17, arms: [{ d: 'M60 88 H76 V70', w: 11, tip: [76, 70] }] },
  4: {
    top: 42,
    w: 19,
    arms: [
      { d: 'M60 82 H39 V60', w: 13, tip: [39, 60] },
      { d: 'M60 72 H81 V51', w: 13, tip: [81, 51] },
    ],
  },
}

function Cactus({ stage, skin }: FormProps) {
  const outline = outlineOf(skin.canopyDark)
  const body = stage === 5 ? mix(skin.canopyLight, '#fde047', 0.25) : skin.canopyLight
  const shadeSide = mix(body, skin.canopyDark, 0.6)
  const sun = mix(body, SUNLIGHT, 0.55)

  if (stage === 1) {
    return (
      <g>
        <ellipse cx={TRUNK_X} cy="99" rx="10" ry="10.5" fill={outline} />
        <ellipse cx={TRUNK_X} cy="99" rx="8" ry="8.8" fill={body} />
        <ellipse cx={TRUNK_X + 3} cy="101" rx="4.5" ry="6" fill={shadeSide} opacity="0.6" />
        <ellipse cx={TRUNK_X - 3} cy="95" rx="2.4" ry="3.4" fill={sun} />
        <g fill="#fffbeb">
          <circle cx="54" cy="98" r="0.9" />
          <circle cx="66" cy="98" r="0.9" />
          <circle cx="60" cy="91" r="0.9" />
        </g>
      </g>
    )
  }
  const { top, w, arms } = CACTUS[stage === 5 ? 4 : stage]
  const tips: [number, number][] = [[TRUNK_X, top], ...arms.map((a) => a.tip)]

  return (
    <g>
      {/* Outline pass for arms and body, then fills, so the silhouette reads as one piece. */}
      {arms.map((arm) => (
        <path key={`o${arm.d}`} d={arm.d} stroke={outline} strokeWidth={arm.w + 4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <rect x={TRUNK_X - w / 2 - 2.2} y={top - 2.2} width={w + 4.4} height={GROUND_Y - top + 2.2} rx={w / 2 + 2.2} fill={outline} />
      {arms.map((arm) => (
        <g key={arm.d}>
          <path d={arm.d} stroke={body} strokeWidth={arm.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={arm.d} stroke={shadeSide} strokeWidth={arm.w * 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${arm.w * 0.22} ${arm.w * 0.1})`} opacity="0.55" />
        </g>
      ))}
      <rect x={TRUNK_X - w / 2} y={top} width={w} height={GROUND_Y - top} rx={w / 2} fill={body} />
      <rect x={TRUNK_X + w * 0.08} y={top + 3} width={w * 0.38} height={GROUND_Y - top - 5} rx={w * 0.19} fill={shadeSide} opacity="0.65" />
      <rect x={TRUNK_X - w * 0.36} y={top + 4} width={w * 0.16} height={GROUND_Y - top - 12} rx={w * 0.08} fill={sun} />
      {[-w / 4, w / 4].map((dx) => (
        <path key={dx} d={`M${TRUNK_X + dx} ${top + 6} V${GROUND_Y - 3}`} stroke={outline} strokeWidth="1" opacity="0.35" />
      ))}
      {/* Spines. */}
      <g fill="#fffbeb">
        {[top + 12, top + 26, top + 40, top + 54].filter((y) => y < GROUND_Y - 5).map((y) => (
          <g key={y}>
            <circle cx={TRUNK_X - w / 2 + 1.5} cy={y} r="1" />
            <circle cx={TRUNK_X + w / 2 - 1.5} cy={y + 5} r="1" />
            <circle cx={TRUNK_X} cy={y + 7} r="0.8" />
          </g>
        ))}
      </g>
      {stage === 4 && <Blossom x={TRUNK_X} y={top + 1} petal={skin.flower ?? '#f472b6'} r={2.6} />}
      {stage === 5 && tips.map(([x, y]) => <Blossom key={`${x}-${y}`} x={x} y={y - 1} petal={skin.flower ?? '#f472b6'} r={3.4} />)}
    </g>
  )
}

const FORMS: Record<ReturnType<typeof getTreeSpecies>['form'], (props: FormProps) => ReactNode> = {
  broadleaf: Broadleaf,
  conifer: Conifer,
  bamboo: Bamboo,
  cactus: Cactus,
}

export { TreeStageSvg }

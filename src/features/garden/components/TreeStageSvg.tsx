import type { ReactNode } from 'react'
import { getTreeSpecies, MIGHTY_GOLD, type TreeSkin } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

const VIEW = 120
const GROUND_Y = 108
const TRUNK_X = 60
const SPROUT_DARK = '#4d7c0f'
const SPROUT_LIGHT = '#84cc16'

// Where the trunk meets the ground, as a fraction of the drawn size. Every species and stage
// grows from this point, so a scene can line the tree up with its own ground (the roots attach here).
export const TREE_BASE_RATIO = { x: TRUNK_X / VIEW, y: GROUND_Y / VIEW } as const

type TreeStageSvgProps = {
  stage: TreeStage
  treeType: string
  label: string
  className?: string
  // Draw the little soil mound under the tree. Off when the scene draws its own ground.
  ground?: boolean
}

// Inline SVG tree: one silhouette family per species (broadleaf, conifer, bamboo, cactus),
// five growth stages each. Stage 5 (Golden Ancient Bloom) adds a golden aura, sparkles and the
// species' blossoms or fruit. Pure markup (no hooks, no ids), so it renders on the server too.
function TreeStageSvg({ stage, treeType, label, className, ground = true }: TreeStageSvgProps) {
  const { form, skin } = getTreeSpecies(treeType)
  const Form = FORMS[form]

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label} className={cn('size-24', className)}>
      {stage === 5 && <GoldenAura />}
      {ground && (
        <ellipse
          cx={TRUNK_X}
          cy={GROUND_Y + 4}
          rx="44"
          ry="6"
          fill={form === 'cactus' ? '#e7c992' : '#d6b58c'}
          opacity="0.55"
        />
      )}
      <Form stage={stage} skin={skin} />
      {stage === 5 && <Sparkles />}
    </svg>
  )
}

type FormProps = { stage: TreeStage; skin: TreeSkin }

// ── Shared pieces ────────────────────────────────────────────────────────────

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`

function GoldenAura() {
  return (
    <g fill="#fde68a">
      <circle cx={TRUNK_X} cy="50" r="54" opacity="0.18" />
      <circle cx={TRUNK_X} cy="50" r="42" opacity="0.22" />
      <circle cx={TRUNK_X} cy="50" r="30" opacity="0.2" />
    </g>
  )
}

function Sparkles() {
  const points: [number, number, number][] = [
    [18, 30, 5],
    [102, 26, 5.5],
    [60, 6, 4.5],
    [106, 72, 4],
    [14, 74, 4],
    [86, 10, 3],
  ]
  return (
    <g fill={MIGHTY_GOLD}>
      {points.map(([x, y, r]) => (
        <path key={`${x}-${y}`} d={star(x, y, r)} />
      ))}
    </g>
  )
}

// Small five-dot blossom.
function Blossom({ x, y, petal, center = '#facc15', r = 2.2 }: { x: number; y: number; petal: string; center?: string; r?: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => {
        const rad = (deg * Math.PI) / 180
        return <circle key={deg} cx={x + Math.cos(rad) * r} cy={y + Math.sin(rad) * r} r={r * 0.75} fill={petal} />
      })}
      <circle cx={x} cy={y} r={r * 0.5} fill={center} />
    </g>
  )
}

function Fruit({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="3.3" fill={color} />
      <circle cx={x - 1.1} cy={y - 1.1} r="0.9" fill="#fff" opacity="0.7" />
      <path d={`M${x} ${y - 3.2} l1 -2`} stroke="#4b2c13" strokeWidth="0.9" strokeLinecap="round" />
    </g>
  )
}

// The same two-leaf shoot starts every tree (bamboo and cactus have their own).
function Sprout() {
  return (
    <g>
      <path d={`M${TRUNK_X} ${GROUND_Y} C60 100 59 92 60 84`} stroke={SPROUT_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="51" cy="86" rx="9" ry="4.5" fill={SPROUT_DARK} transform="rotate(-25 51 86)" />
      <ellipse cx="69" cy="84" rx="9" ry="4.5" fill={SPROUT_LIGHT} transform="rotate(25 69 84)" />
      {/* Soil just broken around the shoot. */}
      <path d="M52 108 q4 -3 8 -2 q4 -1 8 2" stroke="#8b6b43" strokeWidth="1.5" fill="none" opacity="0.6" />
    </g>
  )
}

// ── Broadleaf: oak, sakura, apple ────────────────────────────────────────────

type Blob = [number, number, number]

const BROADLEAF: Record<2 | 3 | 4, { trunk: string; branches: string; dark: Blob[]; light: Blob[] }> = {
  2: {
    trunk: 'M58.5 108 L59 74 L61 74 L61.5 108 Z',
    branches: 'M60 90 L48 80 M60 84 L72 76',
    dark: [[60, 66, 11]],
    light: [
      [47, 76, 8],
      [73, 72, 9],
    ],
  },
  3: {
    trunk: 'M56 108 L58 64 L62 64 L64 108 Z',
    branches: 'M60 84 L44 72 M60 78 L78 66',
    dark: [
      [42, 66, 14],
      [78, 62, 15],
    ],
    light: [
      [60, 50, 19],
      [50, 56, 11],
      [70, 54, 11],
    ],
  },
  4: {
    trunk: 'M52 108 Q56 82 57 58 L63 58 Q64 82 68 108 Z',
    branches: 'M60 80 L38 64 M60 74 L84 58 M60 66 L60 46',
    dark: [
      [34, 60, 17],
      [86, 56, 18],
      [47, 42, 18],
      [74, 38, 19],
    ],
    light: [
      [60, 32, 20],
      [40, 52, 12],
      [80, 48, 13],
      [60, 52, 15],
    ],
  },
}

// Leaf texture for mature canopies: short curved strokes in the darker green.
const CANOPY_TEXTURE = 'M42 40 q4 -3 8 0 M66 30 q4 -3 8 0 M30 58 q4 -3 8 0 M80 52 q4 -3 8 0 M54 48 q4 -3 8 0 M70 64 q3 -2 6 0'

function Broadleaf({ stage, skin }: FormProps) {
  if (stage === 1) return <Sprout />
  const shape = BROADLEAF[stage === 5 ? 4 : stage]
  const mature = stage >= 4

  return (
    <g>
      <path d={shape.trunk} fill={skin.bark} />
      {mature && <path d="M52 108 q-5 1 -8 0 M68 108 q5 1 8 0" stroke={skin.bark} strokeWidth="3" strokeLinecap="round" />}
      <path d={shape.branches} stroke={skin.bark} strokeWidth={stage === 2 ? 2.5 : 4} strokeLinecap="round" />
      {shape.dark.map(([x, y, r]) => (
        <circle key={`d${x}-${y}`} cx={x} cy={y} r={r} fill={skin.canopyDark} />
      ))}
      {shape.light.map(([x, y, r]) => (
        <circle key={`l${x}-${y}`} cx={x} cy={y} r={r} fill={skin.canopyLight} />
      ))}
      {mature && <path d={CANOPY_TEXTURE} stroke={skin.canopyDark} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.55" />}

      {/* Stage 5: golden tint over the crown. */}
      {stage === 5 && (
        <g fill="#facc15" opacity="0.28">
          {[...shape.dark, ...shape.light].map(([x, y, r]) => (
            <circle key={`g${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      )}

      {/* Apple Orchard: fruit from stage 4, a fuller harvest at stage 5. */}
      {skin.fruit && mature && (
        <g>
          {(stage === 5
            ? [[44, 58], [72, 50], [56, 38], [84, 62], [36, 48], [66, 26], [50, 66], [80, 38]]
            : [[44, 58], [72, 50], [56, 38], [84, 62], [36, 48]]
          ).map(([x, y]) => (
            <Fruit key={`f${x}-${y}`} x={x} y={y} color={skin.fruit!} />
          ))}
        </g>
      )}

      {/* Sakura / apple blossoms at stage 5. */}
      {skin.flower && stage === 5 && (
        <g>
          {[[34, 50], [48, 30], [70, 24], [88, 46], [60, 46], [42, 66], [78, 62], [58, 18]].map(([x, y]) => (
            <Blossom key={`b${x}-${y}`} x={x} y={y} petal={skin.flower!} center={skin.fruit ? '#facc15' : '#f472b6'} />
          ))}
        </g>
      )}
    </g>
  )
}

// ── Conifer: pine ────────────────────────────────────────────────────────────

type Tier = [number, number, number] // top y, half width, height

const CONIFER: Record<2 | 3 | 4, { trunk: [number, number]; tiers: Tier[] }> = {
  2: { trunk: [88, 4], tiers: [[70, 14, 18], [62, 10, 14]] },
  3: { trunk: [84, 6], tiers: [[72, 22, 16], [60, 17, 15], [48, 12, 14]] },
  4: { trunk: [84, 8], tiers: [[74, 30, 18], [60, 25, 17], [46, 19, 16], [33, 13, 15]] },
}

const tierPath = ([top, half, h]: Tier) => `M${TRUNK_X} ${top} L${TRUNK_X + half} ${top + h} L${TRUNK_X - half} ${top + h} Z`

function Conifer({ stage, skin }: FormProps) {
  if (stage === 1) {
    return (
      <g stroke={SPROUT_DARK} strokeWidth="2.5" strokeLinecap="round">
        <path d={`M${TRUNK_X} ${GROUND_Y} L60 90`} />
        <path d="M60 90 L52 84 M60 90 L60 80 M60 90 L68 84 M60 94 L54 90 M60 94 L66 90" stroke={SPROUT_LIGHT} />
      </g>
    )
  }
  const shape = CONIFER[stage === 5 ? 4 : stage]
  const [trunkTop, trunkW] = shape.trunk

  return (
    <g>
      <rect x={TRUNK_X - trunkW / 2} y={trunkTop} width={trunkW} height={GROUND_Y - trunkTop} rx="1.5" fill={skin.bark} />
      {shape.tiers.map((tier) => {
        const [top, half, h] = tier
        return (
          <g key={top}>
            <path d={tierPath(tier)} fill={skin.canopyDark} />
            {/* Lighter inner tier for depth. */}
            <path d={tierPath([top + 3, half * 0.62, h - 4])} fill={skin.canopyLight} opacity={stage >= 4 ? 0.85 : 0.7} />
          </g>
        )
      })}
      {stage >= 4 && (
        <path
          d="M44 88 l4 -3 M72 86 l4 -3 M48 72 l4 -3 M68 70 l4 -3 M52 57 l3 -2 M64 56 l3 -2"
          stroke={skin.canopyDark}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
      {stage === 5 && (
        <g>
          <g fill="#facc15" opacity="0.25">
            {shape.tiers.map((tier) => (
              <path key={`g${tier[0]}`} d={tierPath(tier)} />
            ))}
          </g>
          {[[46, 86], [76, 84], [54, 68], [70, 62]].map(([x, y]) => (
            <ellipse key={`c${x}`} cx={x} cy={y} rx="2.2" ry="3.2" fill={skin.barkDeep} />
          ))}
          <path d={star(TRUNK_X, 30, 6)} fill={MIGHTY_GOLD} />
        </g>
      )}
    </g>
  )
}

// ── Bamboo ───────────────────────────────────────────────────────────────────

type Stalk = [number, number, number] // x, top y, width
type Leaf = [number, number, number] // x, y, rotation

const BAMBOO: Record<TreeStage, { stalks: Stalk[]; leaves: Leaf[] }> = {
  1: { stalks: [[60, 92, 5]], leaves: [[65, 92, -30]] },
  2: {
    stalks: [[56, 76, 5], [64, 84, 5]],
    leaves: [[50, 76, 30], [62, 78, -30], [70, 84, -25], [52, 86, 25]],
  },
  3: {
    stalks: [[52, 64, 6], [60, 54, 6], [68, 72, 6]],
    leaves: [[44, 64, 30], [58, 62, 25], [66, 54, -30], [74, 72, -25], [46, 76, 20], [60, 70, -20], [76, 80, -30]],
  },
  4: {
    stalks: [[48, 52, 7], [56, 34, 7], [64, 42, 7], [72, 60, 7]],
    leaves: [
      [40, 52, 30], [54, 50, 25], [50, 34, 30], [62, 34, -30], [70, 42, -30], [58, 44, -20],
      [80, 60, -30], [66, 62, 20], [42, 68, 25], [78, 74, -25], [52, 60, -15], [72, 50, 15],
    ],
  },
  5: {
    stalks: [[48, 52, 7], [56, 34, 7], [64, 42, 7], [72, 60, 7]],
    leaves: [
      [40, 52, 30], [54, 50, 25], [50, 34, 30], [62, 34, -30], [70, 42, -30], [58, 44, -20],
      [80, 60, -30], [66, 62, 20], [42, 68, 25], [78, 74, -25], [52, 60, -15], [72, 50, 15],
    ],
  },
}

function Bamboo({ stage, skin }: FormProps) {
  const { stalks, leaves } = BAMBOO[stage]
  return (
    <g>
      {stalks.map(([x, top, w]) => {
        const nodes: number[] = []
        for (let y = GROUND_Y - 11; y > top + 4; y -= 11) nodes.push(y)
        return (
          <g key={x}>
            <rect x={x - w / 2} y={top} width={w} height={GROUND_Y - top} rx={w / 2} fill={skin.bark} />
            {stage === 5 && <rect x={x - w / 2 + 1} y={top + 2} width={1.4} height={GROUND_Y - top - 4} fill="#fde68a" opacity="0.8" />}
            {nodes.map((y) => (
              <path key={y} d={`M${x - w / 2} ${y} h${w}`} stroke={skin.barkDeep} strokeWidth="1.3" />
            ))}
          </g>
        )
      })}
      {leaves.map(([x, y, rot], i) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx="8"
          ry="2.6"
          fill={i % 2 === 0 ? skin.canopyDark : skin.canopyLight}
          transform={`rotate(${rot} ${x} ${y})`}
        />
      ))}
    </g>
  )
}

// ── Cactus: saguaro ──────────────────────────────────────────────────────────

type Arm = { d: string; w: number; tip: [number, number] }

const CACTUS: Record<2 | 3 | 4, { top: number; w: number; arms: Arm[] }> = {
  2: { top: 80, w: 14, arms: [] },
  3: { top: 62, w: 16, arms: [{ d: 'M60 86 H75 V70', w: 10, tip: [75, 70] }] },
  4: {
    top: 44,
    w: 18,
    arms: [
      { d: 'M60 80 H40 V60', w: 12, tip: [40, 60] },
      { d: 'M60 70 H80 V52', w: 12, tip: [80, 52] },
    ],
  },
}

function Cactus({ stage, skin }: FormProps) {
  if (stage === 1) {
    return (
      <g>
        <ellipse cx={TRUNK_X} cy="100" rx="8" ry="9" fill={skin.canopyLight} />
        <path d="M57 94 v10 M63 94 v10" stroke={skin.canopyDark} strokeWidth="1" opacity="0.6" />
        <g fill="#fef3c7">
          <circle cx="55" cy="97" r="0.8" />
          <circle cx="65" cy="97" r="0.8" />
          <circle cx="60" cy="92" r="0.8" />
        </g>
      </g>
    )
  }
  const shape = CACTUS[stage === 5 ? 4 : stage]
  const { top, w, arms } = shape
  const ribs = stage >= 3 ? [-w / 4, 0, w / 4] : [0]
  const tips: [number, number][] = [[TRUNK_X, top], ...arms.map((a) => a.tip)]

  return (
    <g>
      {arms.map((arm) => (
        <path
          key={arm.d}
          d={arm.d}
          stroke={skin.canopyLight}
          strokeWidth={arm.w}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <rect x={TRUNK_X - w / 2} y={top} width={w} height={GROUND_Y - top} rx={w / 2} fill={skin.canopyLight} />
      {ribs.map((dx) => (
        <path key={dx} d={`M${TRUNK_X + dx} ${top + 5} V${GROUND_Y - 2}`} stroke={skin.canopyDark} strokeWidth="1.2" opacity="0.55" />
      ))}
      {arms.map((arm) => (
        <path key={`r${arm.d}`} d={arm.d} stroke={skin.canopyDark} strokeWidth="1" fill="none" opacity="0.45" />
      ))}
      {/* Spines. */}
      <g fill="#fef3c7">
        {[top + 12, top + 26, top + 40].filter((y) => y < GROUND_Y - 4).map((y) => (
          <g key={y}>
            <circle cx={TRUNK_X - w / 2 + 1} cy={y} r="0.8" />
            <circle cx={TRUNK_X + w / 2 - 1} cy={y} r="0.8" />
          </g>
        ))}
      </g>
      {stage === 4 && <circle cx={TRUNK_X} cy={top + 1} r="2.2" fill={skin.flower} opacity="0.8" />}
      {stage === 5 &&
        tips.map(([x, y]) => <Blossom key={`${x}-${y}`} x={x} y={y - 1} petal={skin.flower ?? '#f472b6'} r={3} />)}
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

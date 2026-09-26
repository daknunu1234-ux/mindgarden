import { getTreeSkin } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { TreeStage } from '../types'

const GOLD = '#facc15'
const VIEW = 120
const GROUND_Y = 108

// Where the trunk meets the ground, as a fraction of the drawn size. Lets a scene line the
// tree up with its own ground line (the deck page roots connect here).
export const TREE_BASE_RATIO = { x: 60 / VIEW, y: GROUND_Y / VIEW } as const

type TreeStageSvgProps = {
  stage: TreeStage
  treeType: string
  label: string
  className?: string
  // Draw the little soil mound under the tree. Off when the scene draws its own ground.
  ground?: boolean
}

// Inline SVG tree, one drawing per growth stage. Stage 4 adds a gold tint and sparkles.
function TreeStageSvg({ stage, treeType, label, className, ground = true }: TreeStageSvgProps) {
  const { canopyLight: light, canopyDark: dark, bark: trunk } = getTreeSkin(treeType)

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label} className={cn('size-24', className)}>
      {ground && <ellipse cx="60" cy={GROUND_Y + 4} rx="44" ry="6" fill="#d6b58c" opacity="0.55" />}

      {stage === 1 && (
        <g>
          <path d={`M60 ${GROUND_Y} C60 98 59 90 60 80`} stroke="#65a30d" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="51" cy="82" rx="9" ry="4.5" fill={dark} transform="rotate(-25 51 82)" />
          <ellipse cx="69" cy="80" rx="9" ry="4.5" fill={light} transform="rotate(25 69 80)" />
        </g>
      )}

      {stage === 2 && (
        <g>
          <rect x="57" y="70" width="6" height={GROUND_Y - 70} rx="2" fill={trunk} />
          <path d="M60 86 L45 74 M60 80 L76 68 M60 74 L60 60" stroke={trunk} strokeWidth="3" strokeLinecap="round" />
          <circle cx="44" cy="70" r="9" fill={light} />
          <circle cx="77" cy="64" r="10" fill={light} />
          <circle cx="60" cy="54" r="11" fill={dark} opacity="0.85" />
        </g>
      )}

      {stage >= 3 && (
        <g>
          <path d={`M54 ${GROUND_Y} L57 62 L63 62 L66 ${GROUND_Y} Z`} fill={trunk} />
          <path d="M60 78 L42 64 M60 72 L80 58" stroke={trunk} strokeWidth="4" strokeLinecap="round" />
          <g>
            <circle cx="40" cy="58" r="17" fill={dark} />
            <circle cx="80" cy="54" r="18" fill={dark} />
            <circle cx="60" cy="40" r="22" fill={light} />
            <circle cx="47" cy="44" r="13" fill={light} opacity="0.9" />
            <circle cx="73" cy="42" r="13" fill={light} opacity="0.9" />
          </g>
          {stage === 4 && (
            <g>
              <g fill={GOLD} opacity="0.45">
                <circle cx="40" cy="58" r="17" />
                <circle cx="80" cy="54" r="18" />
                <circle cx="60" cy="40" r="22" />
              </g>
              {[
                [26, 30],
                [96, 28],
                [60, 12],
                [100, 70],
                [18, 72],
              ].map(([x, y]) => (
                <path
                  key={`${x}-${y}`}
                  d={`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5} Z`}
                  fill="#eab308"
                />
              ))}
            </g>
          )}
        </g>
      )}
    </svg>
  )
}

export { TreeStageSvg }

import { getTreeSkin, MIGHTY_GOLD } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import type { WaterMood } from '../lib/masteryChange'

type WateringSceneProps = {
  treeType: string
  mood: WaterMood
  // Round progress 0–1: the sapling grows a little with every answered question.
  growth: number
  className?: string
}

const ROOTS = [
  'M180 72 C 178 92 160 100 140 118',
  'M180 72 C 184 94 204 104 226 120',
  'M180 72 C 180 100 176 118 170 140',
  'M160 100 C 150 104 132 102 118 98',
  'M204 104 C 214 110 232 108 250 102',
  'M176 118 C 186 126 196 130 204 142',
]

const DROPS = [
  { x: 163, delay: 0 },
  { x: 168, delay: 0.18 },
  { x: 165, delay: 0.36 },
  { x: 171, delay: 0.1 },
  { x: 160, delay: 0.28 },
]

// The drill arena's backdrop: a sapling over a soil cross-section. After an answer the watering can
// tips and pours; roots glow gold for a correct answer and warm amber for "needs practice".
// Remount (key) per answer to replay the pour.
function WateringScene({ treeType, mood, growth, className }: WateringSceneProps) {
  const skin = getTreeSkin(treeType)
  const pouring = mood === 'golden' || mood === 'practice'
  const rootColor = mood === 'golden' ? MIGHTY_GOLD : mood === 'practice' ? '#f59e0b' : skin.barkDeep
  const scale = 0.75 + Math.min(1, Math.max(0, growth)) * 0.35

  return (
    <svg viewBox="-60 0 480 150" aria-hidden className={cn('block h-auto w-full', className)}>
      <defs>
        <linearGradient id="mg-ws-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="mg-ws-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#92400e" />
          <stop offset="1" stopColor="#57300f" />
        </linearGradient>
        <filter id="mg-ws-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect x="-60" width="480" height="72" fill="url(#mg-ws-sky)" />
      <circle cx="318" cy="24" r="14" fill="#fde047" />
      <circle cx="318" cy="24" r="20" fill="#fde047" opacity="0.3" />
      <g fill="#fff" opacity="0.9">
        <ellipse cx="54" cy="26" rx="22" ry="8" />
        <ellipse cx="70" cy="20" rx="14" ry="9" />
        <ellipse cx="262" cy="40" rx="16" ry="5" />
      </g>

      {/* Soil cross-section with pebbles, grass lip on top. */}
      <rect x="-60" y="70" width="480" height="80" fill="url(#mg-ws-soil)" />
      <g fill="#451a03" opacity="0.35">
        <circle cx="40" cy="110" r="4" />
        <circle cx="300" cy="128" r="5" />
        <circle cx="96" cy="136" r="3" />
        <circle cx="268" cy="96" r="3" />
        <circle cx="330" cy="88" r="2.5" />
      </g>
      {mood === 'golden' && <ellipse cx="180" cy="112" rx="90" ry="34" fill={MIGHTY_GOLD} opacity="0.18" />}
      <path d="M-60 66 Q -30 62 0 67 T 60 66 T 120 66 T 180 67 T 240 65 T 300 67 T 360 65 T 420 66 V 74 H -60 Z" fill="#4ade80" />
      <path d="M-60 71 H 420 V 75 H -60 Z" fill="#16a34a" opacity="0.6" />

      {/* Roots: a soft glow layer under crisp strokes. */}
      <g fill="none" strokeLinecap="round" className="transition-[stroke] duration-500">
        {mood !== 'idle' && mood !== 'checking' && (
          <g stroke={rootColor} strokeWidth="9" opacity="0.55" filter="url(#mg-ws-glow)">
            {ROOTS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
        <g stroke={rootColor} strokeWidth="3.5">
          {ROOTS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>

      {/* Sapling (grows with the round). */}
      <g style={{ transform: `scale(${scale})`, transformOrigin: '180px 70px' }} className="transition-transform duration-700 ease-[cubic-bezier(.34,1.56,.64,1)]">
        <path d="M177 70 L 178 38 Q 180 34 182 38 L 183 70 Z" fill={skin.bark} />
        <circle cx="180" cy="30" r="17" fill={skin.canopyDark} />
        <circle cx="168" cy="36" r="11" fill={skin.canopyDark} />
        <circle cx="193" cy="35" r="12" fill={skin.canopyDark} />
        <circle cx="176" cy="25" r="11" fill={skin.canopyLight} />
        <circle cx="189" cy="28" r="7" fill={skin.canopyLight} opacity="0.8" />
      </g>

      {/* Watering can (spout on the right). The CSS tilt goes on an inner group: an animated CSS
          transform would replace the SVG translate attribute. */}
      <g transform="translate(96 6)">
      <g className={pouring ? 'mg-pour' : undefined}>
        <path d="M2 18 Q -8 22 -2 34" stroke="#0369a1" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="0" y="12" width="40" height="28" rx="7" fill="#38bdf8" stroke="#0369a1" strokeWidth="2.5" />
        <rect x="5" y="16" width="30" height="5" rx="2.5" fill="#fff" opacity="0.5" />
        <path d="M38 24 L 60 12" stroke="#0369a1" strokeWidth="5" strokeLinecap="round" />
        <path d="M38 24 L 60 12" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="62" cy="11" r="4" fill="#0ea5e9" stroke="#0369a1" strokeWidth="2" />
        <path d="M8 12 Q 20 -2 32 12" stroke="#0369a1" strokeWidth="3.5" fill="none" />
      </g>
      </g>

      {pouring && (
        <g fill="#38bdf8">
          {DROPS.map((d) => (
            <ellipse
              key={d.x}
              cx={d.x}
              cy={40}
              rx="2"
              ry="3.5"
              className="mg-stream"
              style={{ '--mg-delay': `${0.35 + d.delay}s`, '--mg-fall': '30px' } as React.CSSProperties}
            />
          ))}
        </g>
      )}
    </svg>
  )
}

export { WateringScene }

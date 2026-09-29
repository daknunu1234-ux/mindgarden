import type { FarmLayout } from '../lib/farmLayout'
import { frontEdge, grassPatches, type GrassPatch } from '../lib/islandTerrain'

// The island as a thick terraced block of land floating in bright water:
//   deep-water shade → animated shore foam → stratified cliff (rock base, bands of warm soil and
//   sandstone, embedded rocks) → a dark grass lip → the grass top with painterly lime and deep-green
//   patches, tufts, and a sunlit rim. `id` namespaces the SVG defs (one island per page, but safe).

// Cliff bands from the waterline up (offset below the grass top, colour). The outline is re-drawn
// at each offset, so only the front edge of each band shows: stacked strata like a cut cake.
const STRATA: [number, string][] = [
  [52, '#5b3218'],
  [46, '#7a4522'],
  [40, '#a8693a'],
  [34, '#c98a4e'],
  [28, '#8f532b'],
  [22, '#b3733f'],
  [16, '#d69a5b'],
  [10, '#955a2e'],
]

const PATCH_FILL: Record<GrassPatch['tone'], { fill: string; opacity: number }> = {
  lime: { fill: '#c4f27a', opacity: 0.55 },
  sun: { fill: '#fff0a0', opacity: 0.35 },
  deep: { fill: '#3e9f2c', opacity: 0.38 },
}

export function IslandTerrain({ layout, id }: { layout: FarmLayout; id: (name: string) => string }) {
  const { path } = layout.island
  const patches = grassPatches(layout.island.points, String(layout.plots.length))
  const rocks = frontEdge(layout.island.points)

  return (
    <g>
      <defs>
        <linearGradient id={id('grass')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#a6ea5c" />
          <stop offset="0.5" stopColor="#7fd34a" />
          <stop offset="1" stopColor="#5dbd36" />
        </linearGradient>
        {/* Grass texture: tiny tufts and wild flowers tiled over the lawn. */}
        <pattern id={id('tufts')} width="52" height="38" patternUnits="userSpaceOnUse">
          <path d="M 6 20 q 1 -5 -1 -8 M 9 20 q 0 -6 2 -9 M 32 33 q 1 -5 -1 -8 M 35 33 q 0 -6 2 -9" stroke="#3f9a2a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.55" />
          <path d="M 7 19 q 0.5 -3 -0.5 -5 M 33 32 q 0.5 -3 -0.5 -5" stroke="#d4f79a" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.8" />
          <circle cx="24" cy="9" r="1.5" fill="#fff6b0" opacity="0.9" />
          <circle cx="45" cy="18" r="1.3" fill="#ffc2dd" opacity="0.9" />
        </pattern>
        <clipPath id={id('top')}>
          <path d={path} />
        </clipPath>
      </defs>

      {/* Deep-water shade under the island, then two breathing rings of shore foam. */}
      <path d={path} transform="translate(8 72)" fill="#0a5c93" opacity="0.3" />
      {/* strokeWidth/opacity are the resting state; `.mg-foam` animates them when motion is allowed. */}
      <path d={path} transform="translate(0 60)" fill="none" stroke="#e8fbff" strokeOpacity="0.55" strokeWidth="18" opacity="0.5" strokeLinejoin="round" className="mg-foam" style={{ animationDelay: '-1.9s' }} />
      <path d={path} transform="translate(0 56)" fill="none" stroke="#ffffff" strokeWidth="12" opacity="0.7" strokeLinejoin="round" className="mg-foam" />

      {/* Stratified cliff wall. */}
      <path d={path} transform={`translate(0 ${STRATA[0][0] + 4})`} fill="#3b1d0b" />
      {STRATA.map(([dy, color]) => (
        <path key={dy} d={path} transform={`translate(0 ${dy})`} fill={color} />
      ))}
      {/* Rocks bedded in the strata along the visible front. */}
      {rocks.map(([x, y], i) => (
        <g key={`rock${i}`} transform={`translate(${x.toFixed(1)} ${(y + 24 + (i % 3) * 7).toFixed(1)})`}>
          <ellipse cx="0" cy="0" rx={7 + (i % 3) * 2} ry={4 + (i % 2) * 1.5} fill="#e1c79b" stroke="#4a230c" strokeWidth="1.4" />
          <ellipse cx="-2" cy="-1.5" rx="3" ry="1.4" fill="#fbecc9" />
        </g>
      ))}
      {/* Dark grass lip hanging over the cliff top. */}
      <path d={path} transform="translate(0 5)" fill="#2f7d1f" />

      {/* Grass top with painterly patches and tufts. */}
      <path d={path} fill={`url(#${id('grass')})`} stroke="#246b17" strokeWidth="2.5" strokeLinejoin="round" />
      <g clipPath={`url(#${id('top')})`}>
        {patches.map((p, i) => (
          <ellipse
            key={i}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            rx={p.rx.toFixed(1)}
            ry={p.ry.toFixed(1)}
            fill={PATCH_FILL[p.tone].fill}
            opacity={PATCH_FILL[p.tone].opacity}
          />
        ))}
        <path d={path} fill={`url(#${id('tufts')})`} />
        {/* Sunlit rim along the back edge (light from the upper left). */}
        <path d={path} transform="translate(0 6)" fill="none" stroke="#d8f99f" strokeWidth="6" opacity="0.55" />
      </g>
    </g>
  )
}

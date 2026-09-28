'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { seededRandom } from '@/shared/utils/seededRandom'
import type { TreeStage } from '../types'

// Ambient life around one tree. CSS-only animations (globals.css `.mg-*`), a handful of
// elements per tree, hidden from assistive tech and switched off for reduced motion.

type Vars = CSSProperties & Record<`--mg-${string}`, string>

// Falling leaves / petals for mature trees (stage 4–5). Cacti only drop petals when blooming.
export function FallingParticles({ seed, stage, treeType, size }: { seed: string; stage: TreeStage; treeType: string; size: number }) {
  const { form, skin } = getTreeSpecies(treeType)
  const particles = useMemo(() => {
    if (stage < 4 || (form === 'cactus' && stage < 5)) return []
    const random = seededRandom(`leaf:${seed}`)
    const colors =
      treeType === 'sakura'
        ? ['#fbcfe8', '#f9a8d4', '#fdf2f8']
        : form === 'cactus'
          ? [skin.flower ?? '#f472b6']
          : stage === 5 && skin.flower
            ? [skin.flower, skin.canopyLight]
            : [skin.canopyLight, skin.canopyDark]
    return Array.from({ length: stage === 5 ? 4 : 3 }, (_, i) => ({
      left: size * (0.25 + random() * 0.5),
      top: size * (0.15 + random() * 0.3),
      color: colors[i % colors.length],
      style: {
        '--mg-drift': `${Math.round((random() - 0.5) * 50)}px`,
        '--mg-dur': `${(5 + random() * 4).toFixed(1)}s`,
        '--mg-delay': `${(-random() * 8).toFixed(1)}s`,
      } as Vars,
      petal: treeType === 'sakura' || form === 'cactus' || (stage === 5 && !!skin.flower),
      thin: form === 'conifer' || form === 'bamboo',
    }))
  }, [seed, stage, treeType, form, skin, size])

  return (
    <>
      {particles.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="mg-fall pointer-events-none absolute"
          style={{
            left: p.left,
            top: p.top,
            width: p.thin ? 2.5 : p.petal ? 6 : 7,
            height: p.thin ? 9 : p.petal ? 6 : 4.5,
            borderRadius: p.petal ? '60% 40% 60% 40%' : '999px',
            background: p.color,
            ...p.style,
          }}
        />
      ))}
    </>
  )
}

// Two bees orbiting flowering apple / sakura trees at stages 4–5.
export function Bees({ stage, treeType, size }: { stage: TreeStage; treeType: string; size: number }) {
  if (stage < 4 || (treeType !== 'apple' && treeType !== 'sakura')) return null
  return (
    <>
      {[
        { orbit: 30, dur: 3.4, delay: 0, top: 0.3 },
        { orbit: 22, dur: 2.6, delay: -1.3, top: 0.42 },
      ].map((b, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: size / 2 - 4, top: size * b.top, width: 8, height: 8 }}
        >
          <span
            className="mg-bee absolute inset-0"
            style={{ '--mg-orbit': `${b.orbit}px`, '--mg-dur': `${b.dur}s`, '--mg-delay': `${b.delay}s` } as Vars}
          >
            <svg viewBox="0 0 10 8" width="10" height="8" className="overflow-visible">
              <ellipse cx="3" cy="1.5" rx="2.2" ry="1.5" fill="#e0f2fe" opacity="0.9" />
              <ellipse cx="6" cy="1.5" rx="2.2" ry="1.5" fill="#e0f2fe" opacity="0.9" />
              <ellipse cx="5" cy="4.5" rx="3.6" ry="2.6" fill="#facc15" />
              <path d="M 4 2.2 v 4.6 M 6 2.2 v 4.6" stroke="#1c1917" strokeWidth="1" />
            </svg>
          </span>
        </span>
      ))}
    </>
  )
}

// Splash + ripple the first time the player sees a tree watered today (per browser, per day).
export function useWateredSplash(deckId: string, wateredDay: string | null): boolean {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!wateredDay) return
    const key = `mg:splash:${deckId}:${wateredDay}`
    let seen = true
    try {
      seen = window.localStorage.getItem(key) === '1'
      if (!seen) window.localStorage.setItem(key, '1')
    } catch {
      // Storage blocked (private mode, previews): skip the effect rather than replay it forever.
    }
    if (seen) return
    const start = window.setTimeout(() => setActive(true), 400)
    const stop = window.setTimeout(() => setActive(false), 2400)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(stop)
    }
  }, [deckId, wateredDay])
  return active
}

export function WaterSplash({ baseX, baseY }: { baseX: number; baseY: number }) {
  const drops = [
    [-28, -30],
    [-16, -44],
    [0, -52],
    [16, -44],
    [28, -30],
    [-8, -26],
    [9, -24],
  ]
  return (
    <span aria-hidden className="pointer-events-none absolute" style={{ left: baseX, top: baseY }}>
      <span className="mg-ripple absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300" style={{ width: 70, height: 22 }} />
      {drops.map(([dx, dy], i) => (
        <span
          key={i}
          className="mg-splash absolute size-2.5 -translate-x-1/2 rounded-full bg-sky-400"
          style={{ '--mg-dx': `${dx}px`, '--mg-dy': `${dy}px`, '--mg-delay': `${(i % 3) * 0.06}s` } as Vars}
        />
      ))}
      <span
        className="mg-splash absolute -translate-x-1/2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-sky-700 shadow"
        style={{ '--mg-dx': '0px', '--mg-dy': '-96px', top: -40 } as Vars}
      >
        💧 Watered!
      </span>
    </span>
  )
}

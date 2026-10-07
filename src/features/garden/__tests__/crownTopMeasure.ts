import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TreeStageSvg } from '../components/TreeStageSvg'

// Effects drawn round a tree that are not its crown: the stage-5 aura and sparkles, light motes,
// stars, prism and night glows, the chrono rings. The action icons may overlap them.
const EFFECT = /\bmg-(aura|sparkle|star|mote|prism|ring|night-only)\b/

// The topmost painted point of a tree sprite (view units, at scale 1: the size tier and the surreal
// species' presence are an outer transform, applied by plotSprite), ignoring effects, gradients and
// anything inside its own translate / rotate transform (the Cosmic Nebula's orbiting planets).
export function measureCrownTop(treeType: string, stage: 1 | 2 | 3 | 4 | 5): number {
  const html = renderToStaticMarkup(createElement(TreeStageSvg, { stage, treeType, label: '', ground: false, shadow: false }))
  let top = Infinity
  const skipped: boolean[] = []
  for (const m of html.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m
    if (closing) {
      skipped.pop()
      continue
    }
    const skip =
      skipped.at(-1) === true ||
      /^(defs|linearGradient|radialGradient|title)$/.test(tag) ||
      EFFECT.test(/class="([^"]*)"/.exec(attrs)?.[1] ?? '') ||
      /transform="(translate|rotate)/.test(attrs)
    if (!skip) {
      for (const p of /points="([^"]+)"/.exec(attrs)?.[1].trim().split(/\s+/) ?? []) {
        const y = Number(p.split(',')[1])
        if (Number.isFinite(y)) top = Math.min(top, y)
      }
      const cy = Number(/\bcy="([-\d.]+)"/.exec(attrs)?.[1])
      const r = Number(/\b(?:r|ry)="([-\d.]+)"/.exec(attrs)?.[1])
      if ((tag === 'circle' || tag === 'ellipse') && Number.isFinite(cy) && Number.isFinite(r)) top = Math.min(top, cy - r)
    }
    if (!selfClosing && tag !== 'path') skipped.push(skip)
    else if (!selfClosing) skipped.push(skip)
  }
  return top
}

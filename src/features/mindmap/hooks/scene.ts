import type { RootLayout } from './useRootLayout'
import { isMightyRoot, rootOpacity } from './nodeMastery'

// Something drawn above the ground (the deck's tree), with the point inside it where the
// trunk meets the ground. The scene places it so that point sits exactly on the trunk.
export type SurfaceBox = { width: number; height: number; baseX: number; baseY: number }

export type SceneGeometry = {
  width: number
  height: number
  // Ground line y inside the canvas; the root layout's y = 0 maps here.
  groundY: number
  // Horizontal shift applied to the root layout (to center it in a wider canvas).
  offsetX: number
  trunkX: number
  surface: { left: number; top: number } | null
}

const SKY_MARGIN = 12
const EMPTY_SOIL_H = 120
const SOIL_PAD = 24

// Canvas coordinates are unscaled; zoom is a CSS scale on the whole canvas, so the tree,
// the ground and the roots always move together and the trunk stays anchored.
export function sceneGeometry(
  layout: RootLayout,
  surface: SurfaceBox | null,
  viewportWidth: number,
  zoom: number,
): SceneGeometry {
  const groundY = surface ? surface.baseY + SKY_MARGIN : SKY_MARGIN * 2
  // Fill the visible area at this zoom so the soil runs edge to edge.
  const width = Math.max(layout.width, surface ? surface.width + 32 : 0, viewportWidth > 0 ? viewportWidth / zoom : 0)
  const offsetX = (width - layout.width) / 2
  const trunkX = offsetX + layout.trunk.x
  const height = groundY + Math.max(layout.height, EMPTY_SOIL_H) + SOIL_PAD

  return {
    width,
    height,
    groundY,
    offsetX,
    trunkX,
    surface: surface ? { left: trunkX - surface.baseX, top: groundY - surface.baseY } : null,
  }
}

// Gently rolling ground line across the canvas (quadratic bumps every ~64px).
export function groundPath(width: number, y: number, amplitude = 3): string {
  const steps = Math.max(2, Math.round(width / 64))
  const step = width / steps
  let d = `M 0 ${y}`
  for (let i = 0; i < steps; i++) {
    const cx = step * i + step / 2
    const dy = i % 2 === 0 ? -amplitude : amplitude
    d += ` Q ${cx} ${y + dy} ${step * (i + 1)} ${y}`
  }
  return d
}

// The main conduit: a tapered root from the trunk (wide, at the ground) to the crown (narrow).
export function conduitPath(x: number, groundY: number, crownY: number, top = 9, bottom = 3.5): string {
  const y2 = groundY + crownY
  const mid = groundY + crownY * 0.55
  return [
    `M ${x - top} ${groundY - 2}`,
    `C ${x - top} ${mid}, ${x - bottom} ${mid}, ${x - bottom} ${y2}`,
    `L ${x + bottom} ${y2}`,
    `C ${x + bottom} ${mid}, ${x + top} ${mid}, ${x + top} ${groundY - 2}`,
    'Z',
  ].join(' ')
}

export type RootStroke = {
  // Gradient from `from` (at the parent) to `to` (at the root).
  from: string
  to: string
  opacity: number
  // 'gold' for Mighty Roots, 'soft' for well-mastered roots (≥ 2/3), else none.
  glow: 'none' | 'soft' | 'gold'
  width: number
}

// Line style for the root a line leads into. Opacity always follows 0.35 + 0.65 × mastery / 3.
export function rootStroke(
  mastery: number | null,
  colors: { bark: string; glow: string; gold: string },
  highlighted = false,
): RootStroke {
  const mighty = isMightyRoot(mastery)
  const strong = !mighty && mastery !== null && mastery >= 2
  return {
    from: colors.bark,
    to: mighty ? colors.gold : strong ? colors.glow : colors.bark,
    opacity: highlighted ? 1 : rootOpacity(mastery),
    glow: mighty ? 'gold' : strong ? 'soft' : 'none',
    width: highlighted ? 4 : mighty ? 3.5 : 2.5,
  }
}

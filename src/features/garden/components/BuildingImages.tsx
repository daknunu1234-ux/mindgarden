// Static PNG-rendered sprites for some 2 × 2 buildings (public/assets/sprites/*.webp, made from the
// renders in raw-assets/structures/*.png by scripts/prepare-building-sprites.mjs). Each is drawn as an SVG
// <image> around the building's ground point (0, 0), the centre of its footprint diamond, so it
// depth-sorts exactly like the vector sprites. Static: no animation. An unpowered factory is drawn
// muted (`.mg-unpowered` in globals.css).
import { FootprintShadow } from './lowPolyKit'

export type BuildingImageKind = 'windmill_small' | 'candy_factory' | 'furniture_factory'

// Per sprite: its file, its pixel size, the pixel in it that sits on the ground point (the centre of
// the building's base), and the scale from sprite pixels to farm pixels. Checked against the 2 × 2
// tile diamond (224 × 112 farm px): each base stays inside it.
export const BUILDING_IMAGES: Record<BuildingImageKind, { href: string; size: [number, number]; anchor: [number, number]; scale: number }> = {
  windmill_small: { href: '/assets/sprites/windmill_small.webp', size: [640, 891], anchor: [377, 770], scale: 0.3 },
  candy_factory: { href: '/assets/sprites/candy_factory.webp', size: [640, 775], anchor: [332, 583], scale: 0.3 },
  furniture_factory: { href: '/assets/sprites/furniture_factory.webp', size: [640, 515], anchor: [312, 356], scale: 0.3 },
}

export function BuildingImage({ kind, powered = true }: { kind: BuildingImageKind; powered?: boolean }) {
  const { href, size, anchor, scale } = BUILDING_IMAGES[kind]
  return (
    <g data-building={kind} data-powered={powered} data-sprite="image">
      <FootprintShadow w={2} h={2} />
      <image
        href={href}
        x={-anchor[0] * scale}
        y={-anchor[1] * scale}
        width={size[0] * scale}
        height={size[1] * scale}
        preserveAspectRatio="none"
        className={powered ? undefined : 'mg-unpowered'}
      />
    </g>
  )
}

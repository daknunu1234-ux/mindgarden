import { checkMove, screenToTile, type Placement } from './farmGrid'

// Direct drag-and-drop on the farm (pure, unit-tested). A press on one of your trees or items:
// - moves past the slop before the hold time → it was a camera pan (the farm is full of things, so
//   dragging across them must still pan);
// - stays put for the hold time → the thing is picked up (Move mode) and follows the pointer;
// then the release decides: a free tile moves it there, its own tile is just a tap (open it), a
// blocked or off-island tile puts it back. Holds are short for a mouse, longer for a finger.

export const HOLD_MS: Readonly<Record<string, number>> = { mouse: 150, pen: 300, touch: 400 }
export const SLOP_PX: Readonly<Record<string, number>> = { mouse: 6, pen: 8, touch: 10 }

export const holdMs = (pointerType: string): number => HOLD_MS[pointerType] ?? HOLD_MS.touch
export const slopPx = (pointerType: string): number => SLOP_PX[pointerType] ?? SLOP_PX.touch

export type PressOutcome = 'pending' | 'pan' | 'drag'

// What a press has become, `elapsed` ms after it started, with the pointer now at `at`.
export function pressOutcome(press: { pointerType: string; x: number; y: number }, at: { x: number; y: number }, elapsed: number): PressOutcome {
  if (Math.hypot(at.x - press.x, at.y - press.y) > slopPx(press.pointerType)) return 'pan'
  return elapsed >= holdMs(press.pointerType) ? 'drag' : 'pending'
}

export type DropOutcome = 'move' | 'same' | 'blocked' | 'off-island'

// Where a dragged placement lands: the top tile under the pointer (null = off the island).
export function dropOutcome(farm: readonly Placement[], movingId: string, tile: { x: number; y: number } | null): DropOutcome {
  if (!tile) return 'off-island'
  const moving = farm.find((p) => p.id === movingId)
  if (moving && moving.x === tile.x && moving.y === tile.y) return 'same'
  const check = checkMove(farm, movingId, tile)
  if (check === 'ok') return 'move'
  return check === 'out-of-bounds' ? 'off-island' : 'blocked'
}

// The tile under a screen point, given the world element's on-screen box (the camera scales it)
// and the world's unscaled size and grid origin.
export function tileAtPoint(
  client: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  world: { w: number; h: number; origin: { x: number; y: number } },
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null
  const wx = ((client.x - box.left) * world.w) / box.width - world.origin.x
  const wy = ((client.y - box.top) * world.h) / box.height - world.origin.y
  return screenToTile(wx, wy)
}

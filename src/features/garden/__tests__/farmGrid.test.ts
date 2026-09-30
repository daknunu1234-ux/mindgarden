import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FARM_CATALOG } from '../lib/farmCatalog'
import {
  checkPlacement,
  depthOf,
  fenceLinks,
  fenceVariant,
  firstFreeTile,
  footprintCenter,
  GRID_SIZE,
  screenToTile,
  TILE_H,
  TILE_W,
  tileToScreen,
  type Placement,
} from '../lib/farmGrid'

const item = (itemType: Placement['itemType'], x: number, y: number, size = 1): Placement => ({
  id: `${itemType}-${x}-${y}`,
  itemType,
  deckId: null,
  x,
  y,
  width: size,
  height: size,
  variant: null,
})

describe('isometric geometry', () => {
  it('maps a tile to screen with (x − y)·W/2, (x + y)·H/2', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 })
    expect(tileToScreen(3, 1)).toEqual({ x: TILE_W, y: 2 * TILE_H })
    expect(tileToScreen(0, 4)).toEqual({ x: -2 * TILE_W, y: 2 * TILE_H })
  })

  it('maps any point inside a tile back to that tile', () => {
    for (const [x, y] of [
      [0, 0],
      [5, 9],
      [15, 15],
      [15, 0],
    ]) {
      const c = footprintCenter({ x, y, width: 1, height: 1 })
      expect(screenToTile(c.x, c.y)).toEqual({ x, y })
      expect(screenToTile(c.x + TILE_W / 5, c.y)).toEqual({ x, y })
    }
  })

  it('sorts things further back first (bottom tile x + y)', () => {
    expect(depthOf(item('tree', 2, 2))).toBeLessThan(depthOf(item('tree', 3, 2)))
    expect(depthOf(item('farmer_house', 2, 2, 2))).toBe(depthOf(item('tree', 3, 3)))
  })
})

describe('checkPlacement', () => {
  const farm = [item('tree', 5, 5), item('farmer_house', 8, 8, 2)]

  it('accepts a free spot inside the grid', () => {
    expect(checkPlacement(farm, { x: 0, y: 0, width: 2, height: 2 })).toBe('ok')
    expect(checkPlacement(farm, { x: 14, y: 14, width: 2, height: 2 })).toBe('ok')
  })

  it('refuses spots off the 16 × 16 grid', () => {
    expect(GRID_SIZE).toBe(16)
    expect(checkPlacement(farm, { x: 15, y: 15, width: 2, height: 2 })).toBe('out-of-bounds')
    expect(checkPlacement(farm, { x: -1, y: 3, width: 1, height: 1 })).toBe('out-of-bounds')
    expect(checkPlacement(farm, { x: 3, y: 16, width: 1, height: 1 })).toBe('out-of-bounds')
  })

  it("refuses any overlap, including a 2 × 2 building's other tiles", () => {
    expect(checkPlacement(farm, { x: 5, y: 5, width: 1, height: 1 })).toBe('occupied')
    expect(checkPlacement(farm, { x: 9, y: 9, width: 1, height: 1 })).toBe('occupied')
    expect(checkPlacement(farm, { x: 4, y: 4, width: 2, height: 2 })).toBe('occupied')
    expect(checkPlacement(farm, { x: 7, y: 7, width: 2, height: 2 })).toBe('occupied')
  })

  it('finds the free tile nearest the middle for a new ghost, or none on a full farm', () => {
    expect(firstFreeTile([])).toEqual({ x: 7, y: 7 })
    const full: Placement[] = []
    for (let x = 0; x < GRID_SIZE; x++) for (let y = 0; y < GRID_SIZE; y++) full.push(item('fence', x, y))
    expect(firstFreeTile(full)).toBeNull()
  })
})

describe('fence auto-tiling', () => {
  it('links to fences on the four sides and picks the shape', () => {
    const fences = [item('fence', 5, 5), item('fence', 6, 5), item('fence', 5, 4), item('rockery', 4, 5)]
    const links = fenceLinks(fences, { x: 5, y: 5 })
    expect(links).toEqual({ north: true, east: true, south: false, west: false })
    expect(fenceVariant(links)).toBe('corner')
    expect(fenceVariant({ north: false, east: true, south: false, west: true })).toBe('straight')
    expect(fenceVariant({ north: false, east: false, south: false, west: false })).toBe('post')
    expect(fenceVariant({ north: true, east: true, south: true, west: false })).toBe('tee')
    expect(fenceVariant({ north: true, east: true, south: true, west: true })).toBe('cross')
  })
})

// ─── The database agrees with the catalogue and the rules ───────────────────────────────────

describe('migration 20260930000000_farm_grid.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260930000000_farm_grid.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('charges the catalogue prices and sizes itself (never a client-sent price)', () => {
    for (const entry of FARM_CATALOG) {
      const size = entry.width > 1 ? `; v_w := ${entry.width}; v_h := ${entry.height}` : ''
      expect(body).toContain(`when '${entry.itemType}'`)
      expect(body).toMatch(new RegExp(`when '${entry.itemType}'\\s+then v_cost := ${entry.price}${size.replace(/[;:]/g, (m) => `\\${m}`)}`))
    }
    expect(body).toMatch(/when 'tree'\s+then v_cost := 0/)
    expect(body).not.toMatch(/p_cost|p_width|p_height/)
  })

  it('ends every catalogue CASE branch with a semicolon (PL/pgSQL syntax)', () => {
    const branches = body.split(/\r?\n/).filter((line) => /^\s+when '\w+'\s+then /.test(line))
    expect(branches).toHaveLength(7)
    for (const line of branches) expect(line.trimEnd()).toMatch(/;$/)
  })

  it('lets players read and delete but never insert or update placements', () => {
    expect(body).toMatch(/alter table public\.garden_placements enable row level security/i)
    expect(body).toMatch(/grant select on table public\.garden_placements to anon, authenticated;/i)
    expect(body).toMatch(/grant delete on table public\.garden_placements to authenticated;/i)
    expect(body).not.toMatch(/grant (insert|update)[^;]*garden_placements to (anon|authenticated)/i)
  })

  it('refuses overlaps and off-grid spots, and charges only from a sufficient purse', () => {
    expect(body).toMatch(/g\.grid_x < p_x \+ v_w and p_x < g\.grid_x \+ g\.width/)
    expect(body).toMatch(/p_x \+ v_w > 16 or p_y \+ v_h > 16/)
    expect(body).toMatch(/where u\.id = v_user and u\.coins >= v_cost/)
  })

  it('mirrors the buffs: stream on a side tile ×1.2, Farmer’s House 4 × 4 area ×1.5, stacked', () => {
    expect(body).toMatch(/abs\(s\.grid_x - t\.grid_x\) \+ abs\(s\.grid_y - t\.grid_y\) = 1\s*\n\s*\) then 1\.2/)
    expect(body).toMatch(/t\.grid_x between h\.grid_x - 1 and h\.grid_x \+ 2/)
    expect(body).toMatch(/then 1\.5 else 1 end\)/)
  })

  it('pays a mastery coin only for a real claim, carrying the fraction', () => {
    expect(body).toMatch(/if not coalesce\(v_claimed, false\) then/)
    expect(body).toMatch(/coin_carry = coalesce\(v_amount, 1\) - v_pay/)
  })

  it('refunds 25% of the statements on a chop, capped at 50, only with a Woodshop', () => {
    expect(body).toMatch(/g\.item_type = 'woodshop'/)
    expect(body).toMatch(/v_refund := least\(floor\(v_statements \* 0\.25\)::integer, 50\)/)
  })
})

// ─── Coins are the only currency: no diamonds / gems left in the UI ─────────────────────────

describe('no diamonds or gems in the UI', () => {
  const SRC = join(__dirname, '..', '..', '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)
      return /\.tsx?$/.test(name) ? [path] : []
    })

  it('has no 💎, no gem icon and no gems counter anywhere in the source', () => {
    const offenders = files(SRC).filter((f) => {
      const code = readFileSync(f, 'utf8')
      return code.includes('💎') || /icon="gem"|'gem'|\bgems\b/.test(code)
    })
    expect(offenders).toEqual([])
  })
})

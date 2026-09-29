import { describe, expect, it } from 'vitest'
import { neighborName } from '@/shared/lib/neighborName'
import { loadBoards } from '../services/boards'

const LINH = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'

// The board functions return display_name (migration 20260928001000): the chosen Garden Name or null.
function fakeSupabase() {
  return {
    rpc: async (fn: string) => {
      if (fn === 'get_tournament_active_board') {
        return {
          data: [
            { rank: 1, user_id: LINH, display_name: 'Linh', current_points: 8, max_points: 10, mastery_percentage: '80.00', days_count: 2, updated_at: 't1' },
            { rank: 2, user_id: BINH, display_name: null, current_points: 4, max_points: 10, mastery_percentage: '40.00', days_count: 1, updated_at: 't2' },
          ],
          error: null,
        }
      }
      if (fn === 'get_tournament_hall_of_fame') {
        return { data: [{ rank: 1, user_id: BINH, display_name: '  ', max_points: 10, days_count: 3, graduated_at: 't0' }], error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    },
  }
}

describe('loadBoards names', () => {
  it('shows the custom Garden Name when set, the pseudonym when it is null or blank', async () => {
    const res = await loadBoards(fakeSupabase() as never, 'd1')
    expect(res.success && res.data.active.map((r) => r.name)).toEqual(['Linh', neighborName(BINH)])
    expect(res.success && res.data.hallOfFame.map((r) => r.name)).toEqual([neighborName(BINH)])
    expect(res.success && res.data.active[0].masteryPercentage).toBe(80)
  })
})

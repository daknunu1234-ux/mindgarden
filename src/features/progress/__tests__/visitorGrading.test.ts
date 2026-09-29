import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = 'owner-1'
const STATEMENT = 'Khi nhiệt độ tăng, áp suất khí lớn hơn.'

vi.mock('@/features/decks/server', () => ({
  findDrillItem: vi.fn(async () => ({
    success: true,
    data: {
      id: 'i1',
      nodeId: 'n1',
      ownerId: OWNER,
      correctStmt: STATEMENT,
      trapRules: { negate: true },
      siblingStatements: ['Khi áp suất giảm, thể tích khí tăng.'],
    },
  })),
}))

import { findDrillItem } from '@/features/decks/server'
import { gradeSubmission } from '../services/grading'
import { recordDrillResult } from '../services/recordDrillResult'

const submission = { itemId: '44444444-4444-4444-8444-444444444444', seed: 7, tag: 'A', timeZone: 'Asia/Ho_Chi_Minh' } as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('strict read-only visitor mode: grading', () => {
  it('grades the owner', async () => {
    const res = await gradeSubmission({} as never, submission, OWNER)
    expect(res.success).toBe(true)
  })

  it('refuses a visitor and a signed-out player with FORBIDDEN_VISITOR_PRACTICE', async () => {
    for (const viewer of ['visitor-2', null]) {
      expect(await gradeSubmission({} as never, submission, viewer)).toEqual({
        success: false,
        error: { code: 'FORBIDDEN_VISITOR_PRACTICE', message: 'You must clone this tree to your garden to practice it!' },
      })
    }
  })

  it('saves nothing (no progress, no coin) for a visitor', async () => {
    const from = vi.fn()
    const res = await recordDrillResult({ from, rpc: vi.fn() } as never, 'visitor-2', submission)
    expect(res).toMatchObject({ success: false, error: { code: 'FORBIDDEN_VISITOR_PRACTICE' } })
    expect(findDrillItem).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })
})

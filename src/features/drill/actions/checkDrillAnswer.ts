'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CheckDrillAnswerDto } from '../dto/CheckDrillAnswerDto'
import { gradeAnswer } from '../services/gradeAnswer'
import type { DrillAnswer } from '../types'

// Auth: Public. Grades one answer without saving progress (submitDrillResult will save).
export async function checkDrillAnswer(input: unknown): Promise<ActionResult<DrillAnswer>> {
  const parsed = CheckDrillAnswerDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return gradeAnswer(supabase, parsed.data)
}

'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDisplayNamesDto } from '../dto/DisplayNameDto'
import { readDisplayNames } from '../services/profile'

// Auth: Optional. Chosen display names by gardener id ({ id: name }; ids without one are left out,
// and the page shows their pseudonym). Never emails or full names.
export async function getDisplayNames(input: unknown): Promise<ActionResult<Record<string, string>>> {
  const parsed = GetDisplayNamesDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const supabase = await createClient()
  return readDisplayNames(supabase, parsed.data.userIds)
}

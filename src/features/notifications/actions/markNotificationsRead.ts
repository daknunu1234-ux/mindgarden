'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { MarkNotificationsReadDto } from '../dto/MarkNotificationsReadDto'
import { markRead } from '../services/notifications'

// Auth: Required. Marks some of your notifications read (others' are untouched: RLS). Returns how
// many changed.
export async function markNotificationsRead(input: unknown): Promise<ActionResult<{ marked: number }>> {
  const parsed = MarkNotificationsReadDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to see your notifications')

  return markRead(supabase, user.id, parsed.data.ids)
}

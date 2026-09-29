import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

type Client = SupabaseClient<Database>
const MISSING = new Set(['42703', 'PGRST204', 'PGRST202', '42883'])

// Saves the player's own display name with their session: RLS "users: update self" + the
// display_name column grant (migration 20260928001000) make any other row impossible.
export async function saveDisplayName(supabase: Client, userId: string, displayName: string): Promise<ActionResult<{ displayName: string }>> {
  const { data, error } = await supabase.from('users').update({ display_name: displayName }).eq('id', userId).select('display_name').maybeSingle()
  if (error) {
    if (MISSING.has(error.code)) console.error('[auth] saveDisplayName: run supabase/migrations/20260928001000_display_names.sql')
    else console.error('[auth] saveDisplayName failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not save your garden name')
  }
  // No row: the profile doesn't exist yet (the signup trigger didn't run).
  if (!data) return fail('INTERNAL_ERROR', 'Could not save your garden name')
  return ok({ displayName: data.display_name ?? displayName })
}

// The player's own display name (null = not chosen, or before the migration).
export async function readOwnDisplayName(supabase: Client, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle()
  if (error) {
    if (!MISSING.has(error.code)) console.error('[auth] readOwnDisplayName failed', error.code, error.message)
    return null
  }
  return data?.display_name?.trim() || null
}

// Chosen names of other gardeners by id (users RLS hides their rows, so this goes through the
// get_display_names function, which returns display names only). Ids without one are left out.
export async function readDisplayNames(supabase: Client, userIds: readonly string[]): Promise<ActionResult<Record<string, string>>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return ok({})
  const { data, error } = await supabase.rpc('get_display_names', { p_user_ids: ids })
  if (error) {
    if (MISSING.has(error.code)) {
      console.error('[auth] readDisplayNames: run supabase/migrations/20260928001000_display_names.sql')
      return ok({})
    }
    console.error('[auth] readDisplayNames failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load gardener names')
  }
  return ok(Object.fromEntries((data ?? []).filter((r) => r.display_name?.trim()).map((r) => [r.user_id, r.display_name.trim()])))
}

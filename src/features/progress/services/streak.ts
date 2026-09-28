import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { computeStreaks, localDay, resolveTimeZone, type Streaks } from '../lib/streak'

// Streak data lives in public.practice_days (migration 20260928000200_practice_days).
// Players read their own rows with their session; only the service role writes, so days
// can't be faked through the REST API. users.streak_count / last_active_at mirror the result.

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

function logStreakError(where: string, error: { code?: string; message?: string }) {
  if (error.code && MISSING_TABLE.has(error.code)) {
    console.error(`[progress] ${where}: practice_days is missing, run supabase/migrations/20260928000200_practice_days.sql`)
  } else {
    console.error(`[progress] ${where} failed`, error.code, error.message)
  }
}

// Current + best streak. `timeZone` defaults to the one saved with the latest practice day,
// so server-rendered pages (header, profile) agree with what the drill recorded.
export async function loadStreaks(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeZone?: string,
): Promise<ActionResult<Streaks>> {
  const { data, error } = await supabase
    .from('practice_days')
    .select('day, time_zone')
    .eq('user_id', userId)
    .order('day', { ascending: false })

  if (error) {
    logStreakError('loadStreaks', error)
    return fail('INTERNAL_ERROR', 'Could not load your streak')
  }

  const zone = resolveTimeZone(timeZone ?? data[0]?.time_zone)
  return ok(
    computeStreaks(
      data.map((d) => d.day),
      localDay(new Date(), zone),
    ),
  )
}

// Marks today (player's local day) as practised, then returns the updated streaks.
export async function recordPracticeDay(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeZone: string | undefined,
): Promise<ActionResult<Streaks>> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[progress] recordPracticeDay: SUPABASE_SERVICE_ROLE_KEY is not set, streak not saved')
    return fail('INTERNAL_ERROR', 'Could not save your streak')
  }

  const zone = resolveTimeZone(timeZone)
  const today = localDay(new Date(), zone)

  // First practice of the day wins; later answers the same day change nothing.
  const { error } = await admin
    .from('practice_days')
    .upsert({ user_id: userId, day: today, time_zone: zone }, { onConflict: 'user_id,day', ignoreDuplicates: true })
  if (error) {
    logStreakError('recordPracticeDay', error)
    return fail('INTERNAL_ERROR', 'Could not save your streak')
  }

  const streaks = await loadStreaks(supabase, userId, zone)
  if (!streaks.success) return streaks

  // Keep the documented counters in sync (DATABASE.md users.streak_count / last_active_at).
  const { error: syncError } = await admin
    .from('users')
    .update({ streak_count: streaks.data.current, last_active_at: today })
    .eq('id', userId)
  if (syncError) console.error('[progress] users streak sync failed', syncError.code, syncError.message)

  return streaks
}

// Timezone saved with the player's latest practice day (UTC if none or unreadable).
export async function latestTimeZone(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('practice_days')
    .select('time_zone')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) logStreakError('latestTimeZone', error)
  return resolveTimeZone(data?.time_zone)
}

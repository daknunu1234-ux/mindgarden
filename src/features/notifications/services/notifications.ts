import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

type Client = SupabaseClient<Database>
const MISSING = new Set(['42P01', 'PGRST205'])
// At most this many unread notices are shown at once (the oldest first).
export const NOTIFICATION_BATCH = 10

export type NotificationView = { id: string; kind: 'tree_cloned'; message: string; createdAt: string }

// The gardener's unread notifications, oldest first (RLS: own rows only). Before migration
// 20261019000000 there is no table: none.
export async function readUnread(supabase: Client, userId: string): Promise<ActionResult<NotificationView[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, message, created_at')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(NOTIFICATION_BATCH)
  if (error) {
    if (MISSING.has(error.code)) return ok([])
    console.error('[notifications] readUnread failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load your notifications')
  }
  return ok((data ?? []).map((n) => ({ id: n.id, kind: n.kind, message: n.message, createdAt: n.created_at })))
}

// Marks some of the gardener's notifications read (RLS + the read_at column grant: nothing else can
// change). Returns how many were marked.
export async function markRead(supabase: Client, userId: string, ids: readonly string[]): Promise<ActionResult<{ marked: number }>> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .in('id', [...ids])
    .select('id')
  if (error) {
    console.error('[notifications] markRead failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not update your notifications')
  }
  return ok({ marked: data?.length ?? 0 })
}

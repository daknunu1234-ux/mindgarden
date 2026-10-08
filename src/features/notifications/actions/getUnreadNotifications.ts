'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { ok, type ActionResult } from '@/shared/types/result'
import { readUnread, type NotificationView } from '../services/notifications'

// Auth: Optional. The signed-in gardener's unread notifications, oldest first (at most 10); none when
// signed out. Read only (RLS: own rows).
export async function getUnreadNotifications(): Promise<ActionResult<NotificationView[]>> {
  const user = await getRequestUser()
  if (!user) return ok([])
  return readUnread(await createClient(), user.id)
}

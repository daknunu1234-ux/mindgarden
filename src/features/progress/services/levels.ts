import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { PracticeRow } from '../lib/deckProgress'

// Keeps each `.in()` filter well under URL length limits (a UUID is 36 chars).
const ID_CHUNK = 150

// The player's progress per item (only practised items have a row): level + last practice time.
export async function fetchPracticeRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemIds: string[],
): Promise<ActionResult<Map<string, PracticeRow>>> {
  const rows = new Map<string, PracticeRow>()
  for (let i = 0; i < itemIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('user_progress')
      .select('knowledge_item_id, mastery_level, last_practiced_at')
      .eq('user_id', userId)
      .in('knowledge_item_id', itemIds.slice(i, i + ID_CHUNK))

    if (error) {
      console.error('[progress] fetchPracticeRows failed', error)
      return fail('INTERNAL_ERROR', 'Could not load progress')
    }
    for (const row of data) {
      rows.set(row.knowledge_item_id, { level: row.mastery_level, lastPracticedAt: row.last_practiced_at })
    }
  }
  return ok(rows)
}

// Just the levels (garden stats).
export async function fetchMasteryLevels(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemIds: string[],
): Promise<ActionResult<Map<string, number>>> {
  const rows = await fetchPracticeRows(supabase, userId, itemIds)
  if (!rows.success) return rows
  return ok(new Map([...rows.data].map(([id, row]) => [id, row.level])))
}

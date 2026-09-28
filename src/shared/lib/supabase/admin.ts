import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'

// Service-role client (hard rule 7: the key lives only here). It bypasses RLS and column
// privileges, so callers must only pass ids the user's own (RLS) client already proved readable.
// Returns null when SUPABASE_SERVICE_ROLE_KEY is not set.
let cached: SupabaseClient<Database> | null | undefined

export function createAdminClient(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  cached =
    url && key
      ? createClient<Database>(url, key, {
          // Server-to-server: no user session to store or refresh.
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null
  return cached
}

export const isAdminConfigured = () => createAdminClient() !== null

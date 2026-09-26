import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/shared/types/database.types'

// Browser client for Client Components (auth UI only). Uses the public anon key,
// so every query is subject to RLS.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

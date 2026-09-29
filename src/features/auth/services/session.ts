import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { SignInWithEmailInput } from '../dto/SignInWithEmailDto'
import type { SessionUser } from '../types'
import { readOwnDisplayName } from './profile'

// Sends a magic link. New emails get an account (signup is on); the link lands on
// /auth/callback, which exchanges the PKCE code for a session.
export async function sendMagicLink(
  supabase: SupabaseClient<Database>,
  { email, next }: SignInWithEmailInput,
  origin: string,
): Promise<ActionResult<{ sent: true }>> {
  const redirect = new URL('/auth/callback', origin)
  redirect.searchParams.set('next', next)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
  })

  if (error) {
    if (error.status === 429) {
      return fail('AUTH_RATE_LIMITED', 'Too many sign-in emails. Please wait a few minutes')
    }
    console.error('[auth] signInWithOtp failed', error.status, error.code)
    return fail('INTERNAL_ERROR', 'Could not send the sign-in email')
  }
  return ok({ sent: true })
}

export async function readSessionUser(supabase: SupabaseClient<Database>): Promise<SessionUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { id: user.id, email: user.email ?? '', createdAt: user.created_at, displayName: await readOwnDisplayName(supabase, user.id) }
}

// For /auth/callback (magic links and OAuth such as Google both land there). Returns false when
// the code is missing, expired or from another browser. On success, makes sure the player's
// profile row exists (with the 300 🪙 starter purse) even if the signup trigger didn't run.
export async function exchangeAuthCode(supabase: SupabaseClient<Database>, code: string): Promise<boolean> {
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth] exchangeCodeForSession failed', error.status, error.code)
    return false
  }
  await ensureUserProfile(supabase)
  return true
}

// Creates the signed-in player's missing public.users row (300 coins) and returns their balance;
// an existing row is never changed. Never blocks sign-in: failures are logged and return null.
export async function ensureUserProfile(supabase: SupabaseClient<Database>): Promise<number | null> {
  const { data, error } = await supabase.rpc('ensure_user_profile')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      console.error('[auth] ensure_user_profile is missing: run supabase/migrations/20260928000600_profiles_and_sharing.sql')
    } else {
      console.error('[auth] ensureUserProfile failed', error.code, error.message)
    }
    return null
  }
  return typeof data === 'number' ? data : null
}

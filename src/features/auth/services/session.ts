import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { SignInWithEmailInput } from '../dto/SignInWithEmailDto'
import type { SessionUser } from '../types'

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
  return user ? { id: user.id, email: user.email ?? '', createdAt: user.created_at } : null
}

// For /auth/callback. Returns false when the code is missing, expired or from another browser.
export async function exchangeAuthCode(supabase: SupabaseClient<Database>, code: string): Promise<boolean> {
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) console.error('[auth] exchangeCodeForSession failed', error.status, error.code)
  return !error
}

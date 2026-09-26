'use server'

import { headers } from 'next/headers'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { SignInWithEmailDto } from '../dto/SignInWithEmailDto'
import { sendMagicLink } from '../services/session'

// Auth: Public. Emails a magic link that signs the player in and returns them to `next`.
export async function signInWithEmail(input: unknown): Promise<ActionResult<{ sent: true }>> {
  const parsed = SignInWithEmailDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  // Next.js checks that a Server Action's Origin matches the host, so it is safe to reuse.
  // Supabase also rejects redirect URLs that are not in the project's allow list.
  const h = await headers()
  const origin = h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`

  const supabase = await createClient()
  return sendMagicLink(supabase, parsed.data, origin)
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { DeleteDeckDto } from '../dto/DeleteDeckDto'
import { removeDeck } from '../services/authoring'

// Auth: Required (deck owner). Uproots a tree with all its roots, statements and players' progress
// (database cascades), then redirects to the farm (`/`).
//
// Success never returns: `redirect('/')` navigates in the same roundtrip. Returning instead would
// make Next re-render the current route (revalidatePath does that), and on /deck/[slug] that is
// now a 404. Callers get an ActionResult only on failure; see DeleteDeckDialog for the success path.
export async function deleteDeck(input: unknown): Promise<ActionResult<never>> {
  const parsed = DeleteDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to uproot your tree')

  const res = await removeDeck(supabase, user.id, parsed.data)
  if (!res.success) return res

  revalidatePath('/')
  revalidatePath(`/deck/${res.data.slug}`)
  revalidatePath('/profile')
  redirect('/')
}

'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { ImportOutlineDto } from '../dto/ImportOutlineDto'
import { insertOutline, type ImportedOutline } from '../services/outlineImport'

// Auth: Required (the tree's owner). A document's outline (staged and confirmed in the browser; the
// file itself is never uploaded) into the tree: level 1 → roots after the existing ones, level 2 →
// sub-roots, level 3 → statements, in the document's order. → { slug, roots, subRoots, statements }.
// No revalidatePath: the page refreshes itself after the import. Errors: VALIDATION_FAILED,
// AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, INTERNAL_ERROR.
export async function importOutline(input: unknown): Promise<ActionResult<ImportedOutline>> {
  const parsed = ImportOutlineDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to import into your tree')
  return insertOutline(supabase, user.id, parsed.data)
}

'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { CreateKnowledgeItemsDto } from '../dto/CreateKnowledgeItemsDto'
import { insertKnowledgeItems } from '../services/authoring'

export type BulkImportResult = { created: { id: string; statement: string; drillable: boolean }[]; skipped: number }

// Auth: Required (deck owner). "📋 Bulk Add via Notes / Bullets": up to 100 pasted statements
// for one root in a single insert, each cleaned (NFC, single spaces, trimmed) and checked
// (5–500 characters, plain text). Statements already in the root are skipped. Errors:
// VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, NODE_NOT_FOUND, INTERNAL_ERROR.
export async function createKnowledgeItems(input: unknown): Promise<ActionResult<BulkImportResult>> {
  const parsed = CreateKnowledgeItemsDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  const res = await insertKnowledgeItems(supabase, user.id, parsed.data)
  if (!res.success) return res
  // No revalidatePath: in a Server Action it re-renders the whole deck page before answering. The page
  // already shows the statements (deck draft, lib/draft.ts), and it is dynamic, so the next visit is fresh.
  return ok({ created: res.data.created, skipped: res.data.skipped })
}

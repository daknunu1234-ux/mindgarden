import { z } from 'zod'
import { cleanStatement, LATEX_COMMAND, MAX_BULK_STATEMENTS, MAX_STATEMENT_LENGTH, MIN_BULK_STATEMENT_LENGTH } from '../lib/bulkStatements'

// One pasted statement: cleaned like the preview (NFC, no invisible characters, single spaces),
// then 5–500 characters of plain text.
const BulkStatement = z
  .string()
  .max(5_000, 'A statement is far too long')
  .transform(cleanStatement)
  .refine((s) => [...s].length >= MIN_BULK_STATEMENT_LENGTH, `Each statement needs at least ${MIN_BULK_STATEMENT_LENGTH} characters`)
  .refine((s) => [...s].length <= MAX_STATEMENT_LENGTH, `Keep each statement under ${MAX_STATEMENT_LENGTH} characters`)
  .refine((s) => !LATEX_COMMAND.test(s), 'Use plain text, not LaTeX (no \\commands)')

// "📋 Bulk Add via Notes / Bullets": many statements for one root in a single import.
export const CreateKnowledgeItemsDto = z.object({
  deckId: z.uuid('Invalid tree'),
  rootId: z.uuid('Invalid root'),
  statements: z
    .array(BulkStatement)
    .min(1, 'Paste at least one statement')
    .max(MAX_BULK_STATEMENTS, `Import at most ${MAX_BULK_STATEMENTS} statements at a time`),
})

export type CreateKnowledgeItemsInput = z.infer<typeof CreateKnowledgeItemsDto>

import { z } from 'zod'
import { cleanStatement } from '../lib/bulkStatements'
import { MAX_OUTLINE_DEPTH, MAX_OUTLINE_LINES, outlineLineIssue, outlineShapeIssue } from '../lib/outlinePlan'

// importOutline: a document's outline, staged and edited in the browser in the Tree Workshop's editor
// (the file itself never reaches the server). Rows in outline order: depth 0 = a top-level root, each
// row under the nearest row above it one level up; type 'root' or 'statement'. Text is cleaned like
// every statement (NFC, single spaces); roots are 1–150 characters, statements 5–500, all plain text
// (lib/outlinePlan, shared with the dialog). At most MAX_OUTLINE_LINES rows, MAX_OUTLINE_DEPTH deep.

export { MAX_OUTLINE_LINES }

const OutlineLineDto = z
  .object({
    depth: z.number().int().min(0).max(MAX_OUTLINE_DEPTH, `Nest at most ${MAX_OUTLINE_DEPTH + 1} levels deep`),
    type: z.enum(['root', 'statement']),
    text: z.string().max(5_000, 'A line is far too long').transform(cleanStatement),
  })
  .superRefine((line, ctx) => {
    const issue = outlineLineIssue(line)
    if (issue) ctx.addIssue({ code: 'custom', message: issue, path: ['text'] })
  })

export const ImportOutlineDto = z.object({
  deckId: z.uuid('Invalid tree'),
  items: z
    .array(OutlineLineDto)
    .min(1, 'There is nothing to import')
    .max(MAX_OUTLINE_LINES, `Import at most ${MAX_OUTLINE_LINES} lines at a time`)
    .superRefine((items, ctx) => {
      const issue = outlineShapeIssue(items)
      if (issue) ctx.addIssue({ code: 'custom', message: issue })
    }),
})

export type ImportOutlineInput = z.infer<typeof ImportOutlineDto>

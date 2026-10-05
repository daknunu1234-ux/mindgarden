import { z } from 'zod'

// Plain text only (hard rule 1): backslash commands like \frac or \sqrt are LaTeX.
const LATEX_COMMAND = /\\[a-zA-Z]+/

export const CreateKnowledgeItemDto = z.object({
  nodeId: z.uuid('Invalid root'),
  statement: z
    .string()
    .trim()
    .min(1, 'Write a true statement')
    .max(500, 'Keep the statement under 500 characters')
    .refine((s) => !LATEX_COMMAND.test(s), 'Use plain text, not LaTeX (no \\commands)'),
  // A sub-statement: the statement it sits under (same root, one level deep).
  parentItemId: z.uuid('Invalid statement').nullish(),
  // Typed right below this statement (the Tree Workshop's Enter key); else it goes last.
  afterItemId: z.uuid('Invalid statement').nullish(),
})

export type CreateKnowledgeItemInput = z.infer<typeof CreateKnowledgeItemDto>

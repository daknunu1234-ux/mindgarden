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
})

export type CreateKnowledgeItemInput = z.infer<typeof CreateKnowledgeItemDto>

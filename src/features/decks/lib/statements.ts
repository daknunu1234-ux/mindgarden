// Drill context for a statement nested under a statement (pure).

// Longest parent statement (code points) a sub-statement takes as its subject in drill questions,
// like a root's title: "Ty thể" → "sản sinh ATP" reads "Ty thể sản sinh ATP". A longer parent is a
// full sentence, not a subject, so its sub-statements keep their root's context.
export const MAX_PARENT_CONTEXT_LENGTH = 80

export function parentContext(parentStatement: string | null | undefined): string | null {
  const text = parentStatement?.trim()
  if (!text) return null
  return [...text].length <= MAX_PARENT_CONTEXT_LENGTH ? text : null
}

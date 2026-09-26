// Splits `text` into the part that differs from `other` and the shared words around it.
// Traps differ from the correct statement in one place, so one changed span is enough.
export type MutationParts = { before: string; changed: string; after: string }

export function splitMutation(text: string, other: string): MutationParts {
  const a = text.split(/(\s+)/)
  const b = other.split(/(\s+)/)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++

  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++

  return {
    before: a.slice(0, start).join(''),
    changed: a.slice(start, a.length - end).join(''),
    after: a.slice(a.length - end).join(''),
  }
}

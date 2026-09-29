// "Type the tree's name to confirm" for destructive actions. Forgiving about how it's typed
// (spaces, capitals, Unicode composition: Vietnamese IMEs may send decomposed accents), strict
// about the letters themselves ("Sinh hoc" does not confirm "Sinh học").
const normalizeName = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export function matchesTreeName(typed: string, title: string): boolean {
  const target = normalizeName(title)
  return target.length > 0 && normalizeName(typed) === target
}

// Kebab-case slug from any title, Vietnamese included: "Sinh học Tế bào" → "sinh-hoc-te-bao".
// Matches the decks.slug CHECK (lowercase a–z, 0–9, single dashes). Falls back when nothing is left.
export function slugify(input: string, { maxLength = 150, fallback = 'deck' } = {}): string {
  const slug = input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')

  return slug || fallback
}

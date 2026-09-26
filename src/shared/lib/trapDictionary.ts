// Built-in word pairs for the trap engine. Every pair is applied in both directions,
// longest phrase first, so "lớn hơn" wins over "lớn" at the same position.
// Keep entries unambiguous: a pair that also matches unrelated words makes silly traps.

export type WordPair = readonly [string, string]

// Opposites: always tried (backend/ARCHITECTURE.md §7, step 2).
export const OPPOSITE_PAIRS: readonly WordPair[] = [
  // Vietnamese
  ['tăng', 'giảm'],
  ['lớn hơn', 'nhỏ hơn'],
  ['cao hơn', 'thấp hơn'],
  ['nhiều hơn', 'ít hơn'],
  ['nhanh hơn', 'chậm hơn'],
  ['mạnh hơn', 'yếu hơn'],
  ['dài hơn', 'ngắn hơn'],
  ['nóng hơn', 'lạnh hơn'],
  ['tối đa', 'tối thiểu'],
  ['hấp thụ', 'giải phóng'],
  ['luôn luôn', 'không bao giờ'],
  ['thuận nghịch', 'không thuận nghịch'],
  ['trước', 'sau'],
  ['trong', 'ngoài'],
  ['tạo ra', 'tiêu thụ'],
  ['đầu tiên', 'cuối cùng'],
  ['thu nhiệt', 'tỏa nhiệt'],
  ['đồng hóa', 'dị hóa'],
  ['hít vào', 'thở ra'],
  // English
  ['increase', 'decrease'],
  ['increases', 'decreases'],
  ['increased', 'decreased'],
  ['higher', 'lower'],
  ['larger', 'smaller'],
  ['more', 'less'],
  ['faster', 'slower'],
  ['stronger', 'weaker'],
  ['maximum', 'minimum'],
  ['always', 'never'],
  ['absorb', 'release'],
  ['absorbs', 'releases'],
  ['positive', 'negative'],
  ['before', 'after'],
  ['inside', 'outside'],
  ['inhale', 'exhale'],
  ['inhales', 'exhales'],
  ['produce', 'consume'],
  ['produces', 'consumes'],
  ['first', 'last'],
  ['input', 'output'],
  ['internal', 'external'],
  ['endothermic', 'exothermic'],
]

// Negations: only tried when trap_rules.negate is true.
export const NEGATION_PAIRS: readonly WordPair[] = [
  // Vietnamese
  ['là', 'không phải là'],
  ['có thể', 'không thể'],
  ['có', 'không có'],
  ['sẽ', 'sẽ không'],
  // English
  ['is', 'is not'],
  ['are', 'are not'],
  ['was', 'was not'],
  ['were', 'were not'],
  ['can', 'cannot'],
  ['does', 'does not'],
  ['do', 'do not'],
  ['will', 'will not'],
]

// Operator swaps (step 3). Applied only between operands, see trapEngine.ts.
export const OPERATOR_SWAPS: Readonly<Record<string, string>> = {
  '*': '/',
  '/': '*',
  '+': '-',
  '-': '+',
  '×': '÷',
  '÷': '×',
}

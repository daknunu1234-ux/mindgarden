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

// Sibling concept swaps: a statement's subject is everything before the first of these
// predicate words ("Ty thể | sản sinh ATP"). Only statements where a marker is found
// take part, so an unknown sentence shape never produces a garbled trap.
export const PREDICATE_MARKERS: readonly string[] = [
  // Vietnamese
  'là', 'có', 'không', 'sẽ', 'cần', 'được', 'giúp', 'gồm', 'chứa', 'nằm',
  'sản sinh', 'tổng hợp', 'tạo ra', 'tiêu thụ', 'hấp thụ', 'giải phóng', 'cung cấp',
  'thực hiện', 'chuyển hóa', 'phân giải', 'vận chuyển', 'điều khiển', 'điều hòa',
  'lưu trữ', 'bảo vệ', 'diễn ra', 'quy định', 'tăng', 'giảm',
  // English
  'is', 'are', 'was', 'were', 'has', 'have', 'can', 'cannot', 'does', 'do', 'will',
  'produces', 'produce', 'makes', 'make', 'contains', 'contain', 'synthesizes', 'synthesize',
  'converts', 'convert', 'stores', 'store', 'controls', 'control', 'transports', 'transport',
  'provides', 'provide', 'releases', 'release', 'absorbs', 'absorb', 'consumes', 'consume',
  'generates', 'generate', 'regulates', 'regulate', 'breaks down', 'break down',
]

// A "subject" starting with one of these is really a clause ("Khi nhiệt độ | tăng, …"),
// so the statement is left out of sibling swaps.
export const CLAUSE_STARTERS: readonly string[] = [
  'khi', 'nếu', 'vì', 'do', 'trong', 'sau', 'trước', 'để', 'mặc dù', 'tuy',
  'when', 'if', 'because', 'in', 'after', 'before', 'during', 'while', 'although', 'since',
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

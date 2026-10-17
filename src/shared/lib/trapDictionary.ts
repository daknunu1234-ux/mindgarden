// Built-in word pairs for the trap engine. Every pair is applied in both directions,
// longest phrase first, so "lớn hơn" wins over "lớn" at the same position.
// Keep entries unambiguous: a pair that also matches unrelated words makes silly traps.

export type WordPair = readonly [string, string]

// The forms of a regular English verb: base, -s, -ed, -ing ("compress" → compresses, compressed,
// compressing). Only for verbs that take them without doubling a consonant.
export function verbForms(base: string): string[] {
  const softY = /[^aeiou]y$/.test(base)
  const s = /(?:s|x|z|ch|sh)$/.test(base) ? `${base}es` : softY ? `${base.slice(0, -1)}ies` : `${base}s`
  const ed = base.endsWith('e') ? `${base}d` : softY ? `${base.slice(0, -1)}ied` : `${base}ed`
  const ing = base.endsWith('e') && !base.endsWith('ee') ? `${base.slice(0, -1)}ing` : `${base}ing`
  return [base, s, ed, ing]
}

// Opposite verbs, given as base forms: every form is paired with the same form of its opposite
// (increases ↔ decreases, inhibited ↔ activated, compressing ↔ decompressing).
const OPPOSITE_VERBS: readonly WordPair[] = [
  ['increase', 'decrease'],
  ['absorb', 'release'],
  ['produce', 'consume'],
  ['inhale', 'exhale'],
  ['activate', 'inhibit'],
  ['excite', 'inhibit'],
  ['stimulate', 'suppress'],
  ['compress', 'decompress'],
  ['encode', 'decode'],
  ['encrypt', 'decrypt'],
  ['serialize', 'deserialize'],
  ['allocate', 'deallocate'],
  ['accelerate', 'decelerate'],
  ['enable', 'disable'],
  ['include', 'exclude'],
  ['accept', 'reject'],
  ['connect', 'disconnect'],
  ['attach', 'detach'],
  ['upload', 'download'],
  ['import', 'export'],
  ['maximize', 'minimize'],
  ['strengthen', 'weaken'],
  ['lengthen', 'shorten'],
  ['add', 'remove'],
  ['push', 'pull'],
  ['converge', 'diverge'],
  ['ascend', 'descend'],
  ['appreciate', 'depreciate'],
  ['inflate', 'deflate'],
]

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
  ['lớn nhất', 'nhỏ nhất'],
  ['cao nhất', 'thấp nhất'],
  ['hấp thụ', 'giải phóng'],
  ['luôn luôn', 'không bao giờ'],
  ['thuận nghịch', 'không thuận nghịch'],
  ['trước', 'sau'],
  ['tạo ra', 'tiêu thụ'],
  ['đầu tiên', 'cuối cùng'],
  ['thu nhiệt', 'tỏa nhiệt'],
  ['đồng hóa', 'dị hóa'],
  ['hít vào', 'thở ra'],
  ['đồng bộ', 'bất đồng bộ'],
  ['kích hoạt', 'ức chế'],
  ['kích thích', 'ức chế'],
  ['tuyến tính', 'hàm mũ'],
  ['nén', 'giải nén'],
  ['mã hóa', 'giải mã'],
  ['vĩnh viễn', 'tạm thời'],
  ['nhanh', 'chậm'],
  ['trực tiếp', 'gián tiếp'],
  ['bên trong', 'bên ngoài'],
  ['đầu vào', 'đầu ra'],
  ['máy khách', 'máy chủ'],
  ['cục bộ', 'toàn cục'],
  ['tuần tự', 'song song'],
  ['hiếu khí', 'kị khí'],
  ['ưa nước', 'kị nước'],
  ['trội', 'lặn'],
  ['cấp tính', 'mãn tính'],
  ['chủ động', 'thụ động'],
  ['tỉ lệ thuận', 'tỉ lệ nghịch'],
  ['đồng biến', 'nghịch biến'],
  ['xuất khẩu', 'nhập khẩu'],
  ['mở rộng', 'thu hẹp'],
  ['thặng dư', 'thâm hụt'],
  ['lạm phát', 'giảm phát'],
  // English: verbs in every regular form, then irregular ones
  ...OPPOSITE_VERBS.flatMap(([a, b]) => {
    const forms = verbForms(b)
    return verbForms(a).map((form, i): WordPair => [form, forms[i]])
  }),
  ['rise', 'fall'],
  ['rises', 'falls'],
  ['rose', 'fell'],
  ['rising', 'falling'],
  ['gain', 'lose'],
  ['gains', 'loses'],
  ['send', 'receive'],
  ['sends', 'receives'],
  ['buy', 'sell'],
  ['buys', 'sells'],
  ['lend', 'borrow'],
  ['lends', 'borrows'],
  ['raises', 'lowers'],
  ['raised', 'lowered'],
  ['raising', 'lowering'],
  ['opens', 'closes'],
  ['open', 'closed'],
  ['widens', 'narrows'],
  ['wide', 'narrow'],
  ['expands', 'shrinks'],
  ['locks', 'unlocks'],
  ['locked', 'unlocked'],
  // English: comparisons, quantities and order
  ['higher', 'lower'],
  ['larger', 'smaller'],
  ['more', 'less'],
  ['faster', 'slower'],
  ['stronger', 'weaker'],
  ['maximum', 'minimum'],
  ['max', 'min'],
  ['always', 'never'],
  ['positive', 'negative'],
  ['before', 'after'],
  ['inside', 'outside'],
  ['first', 'last'],
  ['input', 'output'],
  ['internal', 'external'],
  ['high', 'low'],
  ['fast', 'slow'],
  ['large', 'small'],
  ['strong', 'weak'],
  ['hot', 'cold'],
  ['early', 'late'],
  ['major', 'minor'],
  ['primary', 'secondary'],
  ['above', 'below'],
  ['inner', 'outer'],
  ['upper', 'lower'],
  ['shallow', 'deep'],
  ['thick', 'thin'],
  ['dense', 'sparse'],
  ['simple', 'complex'],
  ['single', 'multiple'],
  ['finite', 'infinite'],
  ['horizontal', 'vertical'],
  ['prefix', 'suffix'],
  ['numerator', 'denominator'],
  // English: technical and academic opposites
  ['sync', 'async'],
  ['synchronous', 'asynchronous'],
  ['synchronously', 'asynchronously'],
  ['linear', 'exponential'],
  ['linearly', 'exponentially'],
  ['client', 'server'],
  ['client-side', 'server-side'],
  ['frontend', 'backend'],
  ['permanent', 'transient'],
  ['permanent', 'temporary'],
  ['permanently', 'temporarily'],
  ['static', 'dynamic'],
  ['statically', 'dynamically'],
  ['public', 'private'],
  ['local', 'global'],
  ['serial', 'parallel'],
  ['sequential', 'parallel'],
  ['lossy', 'lossless'],
  ['implicit', 'explicit'],
  ['direct', 'indirect'],
  ['directly', 'indirectly'],
  ['dependent', 'independent'],
  ['reversible', 'irreversible'],
  ['stable', 'unstable'],
  ['mutable', 'immutable'],
  ['stateful', 'stateless'],
  ['signed', 'unsigned'],
  ['blocking', 'non-blocking'],
  ['eager', 'lazy'],
  ['compiled', 'interpreted'],
  ['centralized', 'decentralized'],
  ['symmetric', 'asymmetric'],
  ['optimistic', 'pessimistic'],
  ['tightly', 'loosely'],
  ['upstream', 'downstream'],
  ['discrete', 'continuous'],
  ['concave', 'convex'],
  ['clockwise', 'counterclockwise'],
  ['encoder', 'decoder'],
  ['sender', 'receiver'],
  ['producer', 'consumer'],
  ['parent', 'child'],
  ['compression', 'decompression'],
  ['encoding', 'decoding'],
  ['encryption', 'decryption'],
  ['activation', 'inhibition'],
  ['expansion', 'contraction'],
  ['acceleration', 'deceleration'],
  ['oxidation', 'reduction'],
  ['endothermic', 'exothermic'],
  ['saturated', 'unsaturated'],
  ['dominant', 'recessive'],
  ['aerobic', 'anaerobic'],
  ['hydrophilic', 'hydrophobic'],
  ['anabolic', 'catabolic'],
  ['voluntary', 'involuntary'],
  ['acidic', 'alkaline'],
  ['supply', 'demand'],
  ['debit', 'credit'],
  ['surplus', 'deficit'],
  ['inflation', 'deflation'],
  ['bullish', 'bearish'],
  ['long-term', 'short-term'],
  ['long-run', 'short-run'],
]

// Phrase guards: inside `phrase`, `word` only looks like one half of a pair and is never swapped.
// "phát hành lần đầu ra công chúng" (an IPO) reads "lần đầu | ra công chúng" (first time, to the
// public): it holds no "đầu ra" (output), so the đầu ra ↔ đầu vào rule must leave it alone.
export const GUARDED_PHRASES: readonly { phrase: string; word: string }[] = [
  { phrase: 'lần đầu ra', word: 'đầu ra' },
  { phrase: 'lần đầu vào', word: 'đầu vào' },
  { phrase: 'ban đầu ra', word: 'đầu ra' },
  { phrase: 'ban đầu vào', word: 'đầu vào' },
]

// Loose opposites: everyday words that are opposites in a terse note ("người ngoài mua lại", "cash
// in") but far too common to swap in a full sentence ("Nước ở trong tế bào", "in the cell"). Tried
// only on short fragments (questionEngine: notes of at most TERSE_WORDS words), both ways.
//   notBefore  the word is part of a set phrase when one of these follows ("trong khi", "ngoài ra")
//   atEnd      only as the last word of the note ("cash in", never "in the cell")
export type LoosePair = { pair: WordPair; notBefore?: readonly string[]; atEnd?: boolean }
export const LOOSE_OPPOSITE_PAIRS: readonly LoosePair[] = [
  { pair: ['trong', 'ngoài'], notBefore: ['khi', 'lúc', 'đó', 'số', 'quá', 'vòng', 'suốt', 'khoảng', 'ra', 'việc', 'trừ'] },
  { pair: ['in', 'out'], atEnd: true },
  { pair: ['into', 'out of'] },
  { pair: ['inward', 'outward'] },
  { pair: ['inbound', 'outbound'] },
  { pair: ['inflow', 'outflow'] },
  { pair: ['inflows', 'outflows'] },
  { pair: ['insider', 'outsider'] },
  { pair: ['insiders', 'outsiders'] },
  { pair: ['on', 'off'], atEnd: true },
  { pair: ['up', 'down'], atEnd: true },
  { pair: ['vào', 'ra'], atEnd: true },
  { pair: ['lên', 'xuống'], atEnd: true },
  { pair: ['nhiều', 'ít'], notBefore: ['hơn', 'nhất'] },
  { pair: ['cao', 'thấp'], notBefore: ['hơn', 'nhất', 'su'] },
  { pair: ['lớn', 'nhỏ'], notBefore: ['hơn', 'nhất', 'giọt'] },
  { pair: ['dài hạn', 'ngắn hạn'] },
  { pair: ['nội bộ', 'bên ngoài'] },
]

// Pairs of roles: when a statement names both ("the client waits for the server"), swapping one
// would repeat a role ("the server waits for the server"), so the two are exchanged instead.
export const ROLE_PAIRS: readonly WordPair[] = [
  ['client', 'server'],
  ['sender', 'receiver'],
  ['producer', 'consumer'],
  ['encoder', 'decoder'],
  ['parent', 'child'],
  ['input', 'output'],
  ['supply', 'demand'],
  ['debit', 'credit'],
  ['prefix', 'suffix'],
  ['numerator', 'denominator'],
  ['frontend', 'backend'],
  ['upstream', 'downstream'],
  ['máy khách', 'máy chủ'],
  ['đầu vào', 'đầu ra'],
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

// Linking and auxiliary words among the predicate markers: they open a predicate but name no action
// of their own ("is", "has", "can", "là", "có").
export const LINKING_WORDS: readonly string[] = [
  'là', 'có', 'không', 'sẽ', 'cần', 'được', 'gồm', 'nằm',
  'is', 'are', 'was', 'were', 'has', 'have', 'can', 'cannot', 'does', 'do', 'will',
]

// Action verbs a plain declarative statement is split at ("Lysosomes | digest | waste"), on top of the
// predicate markers. Verbs that are just as often nouns ("form", "test", "map") are listed only in
// their -s form, where a verb is the likelier reading.
const ACTION_VERB_BASES = [
  'affect', 'allow', 'alter', 'amplify', 'apply', 'bind', 'break', 'build', 'burn', 'capture', 'carry', 'catalyze',
  'cause', 'collect', 'combine', 'compare', 'compile', 'compute', 'conduct', 'create', 'define', 'deliver', 'depend',
  'describe', 'destroy', 'detect', 'determine', 'develop', 'digest', 'direct', 'divide', 'drive', 'eliminate', 'emit',
  'enforce', 'ensure', 'enter', 'establish', 'evaluate', 'execute', 'exist', 'expose', 'express', 'extend', 'extract',
  'facilitate', 'fight', 'fill', 'follow', 'give', 'govern', 'grow', 'halve', 'help', 'hold', 'identify', 'implement',
  'improve', 'indicate', 'induce', 'initiate', 'insert', 'join', 'keep', 'kill', 'lead', 'maintain', 'manage', 'mediate',
  'merge', 'modify', 'monitor', 'move', 'need', 'occur', 'operate', 'organize', 'perform', 'permit', 'predict',
  'prevent', 'promote', 'protect', 'pump', 'react', 'reduce', 'reflect', 'remain', 'replace', 'replicate', 'represent',
  'require', 'resist', 'respond', 'restrict', 'retain', 'rotate', 'secrete', 'select', 'separate', 'serve', 'slow',
  'solve', 'spread', 'stabilize', 'surround', 'sustain', 'take', 'transcribe', 'transfer', 'transform', 'translate',
  'transmit', 'turn', 'use', 'validate', 'vary', 'verify', 'oxidize', 'hydrolyze', 'calculate', 'estimate', 'exceed',
  'diversify', 'invest', 'earn', 'pay', 'happen', 'flow', 'change', 'form', 'run', 'distribute', 'conserve',
  'guarantee', 'coordinate', 'receive', 'encourage', 'increase', 'decrease', 'cache', 'intercept', 'fetch', 'render',
  'parse', 'dispatch', 'subscribe', 'publish', 'persist', 'authenticate', 'authorize', 'acquire', 'dilute', 'settle',
]
const ACTION_VERBS_S_ONLY = [
  'returns', 'limits', 'supports', 'runs', 'sorts', 'splits', 'triggers', 'wraps', 'measures', 'yields', 'results in',
  'signals', 'tests', 'maps', 'marks', 'records', 'forces', 'powers', 'costs', 'targets', 'hosts', 'filters', 'links',
  'shares', 'shows', 'starts', 'stops', 'passes', 'reaches', 'reverses', 'updates', 'blocks', 'calls', 'copies',
  'covers', 'cuts', 'shifts', 'attacks', 'damages', 'delays', 'guides', 'influences', 'balances', 'exchanges',
  'travels', 'handles', 'functions as', 'acts as', 'speeds up', 'slows down', 'relies on', 'leads to', 'consists of', 'depends on', 'belongs to',
]
const ACTION_VERBS_VI = [
  'di chuyển', 'gây ra', 'xảy ra', 'biến đổi', 'cho phép', 'sử dụng', 'tạo thành', 'phụ thuộc', 'quyết định',
  'ảnh hưởng', 'kiểm soát', 'xử lý', 'trả về', 'kích hoạt', 'kích thích', 'ức chế', 'ngăn chặn', 'hỗ trợ', 'duy trì',
  'tham gia', 'đóng vai trò', 'dẫn đến', 'làm tăng', 'làm giảm', 'kết hợp', 'liên kết', 'mã hóa', 'giải mã',
  'bao gồm', 'xúc tác', 'phân chia', 'nhân đôi', 'sao chép', 'tiết ra', 'tiêu hóa', 'trao đổi', 'sinh ra', 'thực thi',
  'quản lý', 'kết nối', 'yêu cầu', 'đảm bảo', 'xác định', 'kiểm tra', 'truyền', 'gây', 'bơm', 'mua lại', 'phát hành',
  'nắm giữ', 'sở hữu', 'cho vay', 'đầu tư', 'thanh toán', 'chi trả', 'huy động', 'bán ra', 'mua vào',
]
export const ACTION_VERBS: readonly string[] = [
  ...new Set([
    ...ACTION_VERB_BASES.flatMap(verbForms),
    ...OPPOSITE_VERBS.flat().flatMap(verbForms),
    ...ACTION_VERBS_S_ONLY,
    ...ACTION_VERBS_VI,
    'rise', 'rises', 'rose', 'fall', 'falls', 'fell', 'gains', 'loses', 'lose', 'sends', 'send', 'receives', 'receive',
    'buys', 'sells', 'lends', 'borrows', 'raise', 'raises', 'raised', 'lowers', 'lowered', 'moved', 'caused', 'bought', 'sold',
    'made', 'broke', 'built', 'held', 'kept', 'led', 'took', 'gave', 'grew', 'drove',
  ]),
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

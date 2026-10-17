import { describe, expect, it } from 'vitest'
import { decompose, parseConditional, parseScenario, parseShorthand } from '@/shared/lib/conceptPatterns'
import { isPredicateOnly, stripMarks, synthesizeProposition } from '@/shared/lib/notePatterns'
import { buildQuestion, prepareDeck, questionKinds, TRAP_TYPES, trapTypes, typedSeed, type DeckNote, type Question, type TrapType } from '@/shared/lib/questionEngine'
import { OPPOSITE_PAIRS, verbForms } from '@/shared/lib/trapDictionary'
import { antonymVariants, collectTrapCandidates } from '@/shared/lib/trapEngine'

// Plain declarative statements, written the way notes are: no "if" / "when", no "e.g.", no brackets,
// no "Key: Value". The engine must still ask them from many angles: the subject / action / object
// split (conceptPatterns decompose), the dynamic scenario (type 5), the element questions (type 7),
// peers at the same depth (type 4), a changed property as the odd one out (type 6) and the wider
// opposites dictionary (type 1).

const note = (id: string, statement: string, path: string[], ancestry: string[]): DeckNote => ({ id, nodeId: ancestry[ancestry.length - 1], statement, path, ancestry, rules: {} })

const PLAIN: DeckNote[] = [
  note('o1', 'Ribosomes synthesize proteins.', ['Biology', 'Organelles'], ['bio', 'org']),
  note('o2', 'Lysosomes digest waste.', ['Biology', 'Organelles'], ['bio', 'org']),
  note('o3', 'Mitochondria produce ATP.', ['Biology', 'Organelles'], ['bio', 'org']),
  note('o4', 'The nucleus stores genetic information.', ['Biology', 'Organelles'], ['bio', 'org']),
  note('t1', 'Diffusion moves particles down a concentration gradient.', ['Biology', 'Transport'], ['bio', 'tra']),
  note('t2', 'Active transport consumes ATP.', ['Biology', 'Transport'], ['bio', 'tra']),
  note('t3', 'Osmosis moves water across a membrane.', ['Biology', 'Transport'], ['bio', 'tra']),
  note('n1', 'TCP acknowledges every segment.', ['Networking', 'Protocols'], ['net', 'pro']),
  note('n2', 'UDP sends datagrams without a handshake.', ['Networking', 'Protocols'], ['net', 'pro']),
  note('n3', 'A synchronous call blocks the client until the server responds.', ['Networking', 'Protocols'], ['net', 'pro']),
  note('n4', 'Gzip compresses responses before transfer.', ['Networking', 'Protocols'], ['net', 'pro']),
  note('v1', 'Ty thể sản sinh ATP.', ['Sinh học', 'Bào quan'], ['sh', 'bq']),
  note('v2', 'Ribosome tổng hợp protein.', ['Sinh học', 'Bào quan'], ['sh', 'bq']),
  note('v3', 'Enzyme xúc tác phản ứng hóa học.', ['Sinh học', 'Bào quan'], ['sh', 'bq']),
  note('v4', 'Lục lạp hấp thụ ánh sáng.', ['Sinh học', 'Bào quan'], ['sh', 'bq']),
]
const deck = prepareDeck(PLAIN)
const SEEDS = Array.from({ length: 24 }, (_, i) => `e${i.toString(36)}`)

function ask(id: string, type: TrapType, base = 'abc'): Question {
  const res = buildQuestion(deck, id, typedSeed(type, base))
  if (!res.ok) throw new Error(`no question for ${id}`)
  return res.question
}
const answerOf = (q: Question) => q.choices.find((c) => c.tag === q.correctTag)!.text
const wrongOf = (q: Question) => q.choices.filter((c) => c.tag !== q.correctTag).map((c) => c.text)
const share = (type: TrapType) => PLAIN.filter((n) => trapTypes(deck, n.id).includes(type)).length / PLAIN.length

describe('the sample is plain: no statement carries a special marker', () => {
  it('has no condition, no example, no pair, no author mark', () => {
    for (const n of PLAIN) {
      expect(parseConditional(n.statement), n.id).toBeNull()
      expect(parseScenario(n.statement), n.id).toBeNull()
      expect(n.statement).not.toMatch(/[:=[\]]|\b(if|when|e\.g\.)\b|\b(khi|nếu|vd)\b/i)
    }
  })
})

describe('subject, action, object', () => {
  it('splits a plain sentence at its verb, in English and Vietnamese', () => {
    expect(decompose('Ribosomes synthesize proteins.')).toMatchObject({ subject: 'Ribosomes', action: 'synthesize', object: 'proteins', predicate: 'synthesize proteins', kind: 'action' })
    expect(decompose('Active transport consumes ATP.')).toMatchObject({ subject: 'Active transport', action: 'consumes', object: 'ATP' })
    expect(decompose('The nucleus stores genetic information.')).toMatchObject({ subject: 'The nucleus', action: 'stores', object: 'genetic information' })
    expect(decompose('Ty thể sản sinh ATP.')).toMatchObject({ subject: 'Ty thể', action: 'sản sinh', object: 'ATP', kind: 'action' })
    expect(decompose('Binary search halves the range each step.')).toMatchObject({ subject: 'Binary search', action: 'halves' })
  })

  it('a word that is a noun there is not the verb: after a determiner, or right before the real verb', () => {
    expect(decompose('The control unit directs operations.')).toMatchObject({ subject: 'The control unit', action: 'directs' })
    expect(decompose('Unit tests verify behaviour.')).toMatchObject({ subject: 'Unit tests', action: 'verify' })
    expect(decompose('TypeScript was released by Microsoft.')).toMatchObject({ subject: 'TypeScript', action: 'was', kind: 'linking' })
  })

  it('a written sentence with an unknown verb is still split; a label, a clause or an equation is not', () => {
    expect(decompose('TCP acknowledges every segment.')).toMatchObject({ subject: 'TCP', predicate: 'acknowledges every segment', kind: 'guess' })
    expect(decompose('Golgi apparatus')).toBeNull()
    expect(decompose('Mitochondrial inner membrane')).toBeNull()
    expect(decompose('When oxygen is low, cells ferment.')).toBeNull()
    expect(decompose('F = m × a')).toBeNull()
  })

  it('subject + rest is always the statement itself', () => {
    for (const n of PLAIN) {
      const parts = decompose(n.statement)
      expect(parts, n.id).not.toBeNull()
      expect(parts!.subject + parts!.rest).toBe(n.statement)
    }
  })
})

describe('eligibility: plain statements reach most types', () => {
  it('every plain statement is eligible for scenario (5), element (7), sibling swap (4) and least likely (6)', () => {
    for (const type of [4, 5, 6, 7] as const) expect(share(type), `type ${type}`).toBe(1)
  })

  it('each has at least five types, and never the last-resort card', () => {
    for (const n of PLAIN) {
      expect(trapTypes(deck, n.id).length, `${n.id}: ${trapTypes(deck, n.id).join('')}`).toBeGreaterThanOrEqual(5)
      expect(questionKinds(deck, n.id)).not.toContain('exact')
    }
    const mean = PLAIN.reduce((sum, n) => sum + trapTypes(deck, n.id).length, 0) / PLAIN.length
    expect(mean).toBeGreaterThanOrEqual(5.5)
  })

  it('all but the formula type are reachable from plain statements alone', () => {
    expect(new Set(PLAIN.flatMap((n) => trapTypes(deck, n.id)))).toEqual(new Set(TRAP_TYPES.filter((t) => t !== 8)))
  })

  it('marker-based engines would have refused them: types 5 and 7 used to need "e.g." and "when"', () => {
    // What the eligibility was before the upgrade, by the old rule (a parsed example / condition).
    const before = (type: 5 | 7) => PLAIN.filter((n) => (type === 5 ? parseScenario(n.statement) : parseConditional(n.statement)) !== null).length / PLAIN.length
    expect(before(5)).toBe(0)
    expect(before(7)).toBe(0)
    expect(share(5)).toBeGreaterThan(before(5))
    expect(share(7)).toBeGreaterThan(before(7))
  })
})

describe('type 5: a dynamic scenario from the mechanism', () => {
  it('frames what the subject does as an observed case and asks for the concept', () => {
    const prompts = new Set(SEEDS.map((s) => ask('o1', 5, s).prompt))
    expect([...prompts].sort()).toEqual(['Applied case: a component is at work that “synthesize proteins”.', 'Scenario: in a system, you observe something that “synthesize proteins”.'])
    for (const s of SEEDS) {
      const q = ask('o1', 5, s)
      expect(q).toMatchObject({ kind: 'scenario', trapType: 5, instruction: 'Which underlying concept is being observed?' })
      expect(answerOf(q)).toBe('Ribosomes')
      // The concept is never named in the scenario, and neither is a wrong answer.
      for (const c of q.choices) expect(q.prompt).not.toContain(c.text)
    }
  })

  it('offers the nearest other concepts as wrong answers', () => {
    const wrong = new Set(SEEDS.flatMap((s) => wrongOf(ask('o1', 5, s))))
    expect([...wrong]).toEqual(expect.arrayContaining(['Lysosomes', 'Mitochondria', 'The nucleus']))
    // Its own subject (Biology) has enough concepts: nothing from Networking or Sinh học.
    for (const w of wrong) expect(['TCP', 'UDP', 'Gzip', 'Ty thể', 'Enzyme']).not.toContain(w)
  })

  it('works in Vietnamese as written', () => {
    const q = ask('v1', 5)
    expect(q.prompt).toContain('“sản sinh ATP”')
    expect(answerOf(q)).toBe('Ty thể')
  })
})

describe('type 7: a declarative statement asked by element', () => {
  const kinds = (id: string) => new Set(SEEDS.map((s) => ask(id, 7, s).kind))

  it('asks which component is responsible, what its effect is, and what it acts on', () => {
    expect(kinds('t2')).toEqual(new Set(['element-subject', 'element-action', 'element-object']))
    const by = (kind: string) => SEEDS.map((s) => ask('t2', 7, s)).find((q) => q.kind === kind)!

    const subject = by('element-subject')
    expect(subject.prompt).toBe('Which component is responsible for “consumes ATP”?')
    expect(answerOf(subject)).toBe('Active transport')

    const action = by('element-action')
    expect(action.prompt).toBe('What is the primary effect of “Active transport” on “ATP”?')
    expect(answerOf(action)).toBe('consumes')
    // The direct opposite and the neighbours' actions, in the same grammatical form.
    const actions = new Set(SEEDS.map((s) => ask('t2', 7, s)).filter((q) => q.kind === 'element-action').flatMap(wrongOf))
    expect(actions).toContain('produces')
    for (const a of actions) expect(a.endsWith('s')).toBe(true)

    const object = by('element-object')
    expect(object.prompt).toBe('Active transport consumes ____.')
    expect(answerOf(object)).toBe('ATP')
  })

  it('never offers an element that would make another true statement of the tree', () => {
    // "Mitochondria produce ATP" is true: "Mitochondria" is no wrong answer for "… produce ATP", and
    // so on for every element of every statement.
    const truths = new Set(PLAIN.map((n) => n.statement.replace(/\.$/, '').toLocaleLowerCase()))
    for (const n of PLAIN) {
      const parts = decompose(n.statement)!
      for (const s of SEEDS) {
        const q = ask(n.id, 7, s)
        for (const w of wrongOf(q)) {
          const rebuilt = q.kind === 'element-subject' ? `${w} ${parts.predicate}` : q.kind === 'element-action' ? `${parts.subject} ${w} ${parts.object}` : q.kind === 'element-object' ? `${parts.subject} ${parts.action} ${w}` : `${parts.subject} ${w}`
          expect(truths.has(rebuilt.toLocaleLowerCase()), `${n.id} ${q.kind}: ${rebuilt}`).toBe(false)
        }
      }
    }
  })

  it('a sentence with an unknown verb is asked by its subject and its whole predicate, as written', () => {
    expect(kinds('n1')).toEqual(new Set(['element-subject', 'element-predicate']))
    const predicate = SEEDS.map((s) => ask('n1', 7, s)).find((q) => q.kind === 'element-predicate')!
    expect(predicate.prompt).toBe('What is true of “TCP”?')
    expect(answerOf(predicate)).toBe('acknowledges every segment')
    expect(wrongOf(predicate)).toEqual(expect.arrayContaining(['sends datagrams without a handshake']))
  })

  it('a condition keeps its condition questions and gets no element question', () => {
    const cond = prepareDeck([
      ...PLAIN,
      note('c1', 'Enzymes denature when the temperature is too high.', ['Biology', 'Organelles'], ['bio', 'org']),
      note('c2', 'Stomata close when water is scarce.', ['Biology', 'Organelles'], ['bio', 'org']),
    ])
    expect(questionKinds(cond, 'c1').filter((k) => k.startsWith('conditional') || k.startsWith('element'))).toEqual(['conditional-outcome', 'conditional-condition'])
  })
})

describe('type 6: the odd one out is plausible', () => {
  const all = (id: string) => SEEDS.map((s) => ask(id, 6, s))
  const texts = new Set(PLAIN.map((n) => n.statement))

  it('is a property of the topic with one detail changed, or a statement of a sibling topic', () => {
    const odd = new Set(all('n4').map(answerOf))
    // Changed properties of "Protocols" itself: an opposite keyword in one of its statements.
    expect([...odd]).toEqual(expect.arrayContaining(['Gzip decompresses responses before transfer.', 'UDP receives datagrams without a handshake.']))
    for (const text of odd) expect(texts.has(text), text).toBe(false)

    // Organelles has one changed property (produce → consume) and a sibling topic (Transport).
    const organelles = new Set(all('o1').map(answerOf))
    expect(organelles).toContain('Mitochondria consume ATP.')
    const transport = PLAIN.filter((n) => n.nodeId === 'tra').map((n) => n.statement)
    for (const text of organelles) expect(text === 'Mitochondria consume ATP.' || transport.includes(text), text).toBe(true)
  })

  it('never shows a changed property next to its original; the rest are true statements of the root', () => {
    for (const n of PLAIN) {
      const family = PLAIN.filter((m) => m.nodeId === n.nodeId).map((m) => m.statement)
      for (const q of all(n.id)) {
        const others = wrongOf(q)
        expect(others.length).toBeGreaterThanOrEqual(2)
        for (const text of others) expect(family, `${n.id}: ${text}`).toContain(text)
        const odd = answerOf(q)
        expect(family).not.toContain(odd)
        // One word apart from a shown statement would give it away: its source is hidden.
        const words = (s: string) => s.split(' ')
        for (const text of others) {
          const [a, b] = [words(odd), words(text)]
          if (a.length === b.length) expect(a.filter((w, i) => w !== b[i]).length, `${odd} / ${text}`).not.toBe(1)
        }
      }
    }
  })

  it('reaches further only when the topic has no changed property and no sibling topic', () => {
    const lonely = prepareDeck([
      note('a', 'Ribosomes synthesize proteins.', ['Organelles'], ['org']),
      note('b', 'Lysosomes digest waste.', ['Organelles'], ['org']),
      note('c', 'Chloroplasts hold chlorophyll.', ['Organelles'], ['org']),
      note('d', 'Bonds pay a fixed coupon.', ['Finance', 'Debt'], ['fin', 'debt']),
    ])
    const res = buildQuestion(lonely, 'a', typedSeed(6, 'abc'))
    expect(res.ok && res.question.choices.find((c) => c.tag === res.question.correctTag)!.text).toBe('Bonds pay a fixed coupon.')
  })
})

describe('type 1: a wider opposites dictionary', () => {
  it('knows the common technical and academic pairs, both ways', () => {
    const has = (a: string, b: string) => OPPOSITE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
    for (const [a, b] of [
      ['increase', 'decrease'],
      ['sync', 'async'],
      ['synchronous', 'asynchronous'],
      ['activate', 'inhibit'],
      ['linear', 'exponential'],
      ['client', 'server'],
      ['compress', 'decompress'],
      ['permanent', 'transient'],
      ['static', 'dynamic'],
      ['encode', 'decode'],
      ['stable', 'unstable'],
      ['đồng bộ', 'bất đồng bộ'],
      ['kích hoạt', 'ức chế'],
    ]) expect(has(a, b), `${a} / ${b}`).toBe(true)
    expect(verbForms('compress')).toEqual(['compress', 'compresses', 'compressed', 'compressing'])
    expect(verbForms('activate')).toEqual(['activate', 'activates', 'activated', 'activating'])
  })

  it('triggers on the predicate or the key adjective, in any form of the word', () => {
    expect(antonymVariants('Caffeine inhibits adenosine receptors.', {})).toEqual(['Caffeine activates adenosine receptors.'])
    expect(antonymVariants('The file was compressed before upload.', {})).toEqual(expect.arrayContaining(['The file was decompressed before upload.']))
    expect(antonymVariants('Bacterial growth is exponential.', {})).toEqual(['Bacterial growth is linear.'])
    expect(antonymVariants('A synchronous call waits for the result.', {})).toEqual(['An asynchronous call waits for the result.'])
    expect(antonymVariants('ROM is permanent storage.', {})).toEqual(expect.arrayContaining(['ROM is transient storage.']))
    expect(antonymVariants('Lời gọi đồng bộ chặn luồng.', {})).toEqual(['Lời gọi bất đồng bộ chặn luồng.'])
  })

  it('every plain statement holding an opposite is eligible for type 1', () => {
    for (const n of PLAIN) {
      const eligible = trapTypes(deck, n.id).includes(1)
      expect(eligible, n.id).toBe(antonymVariants(n.statement, {}).length > 0)
    }
    expect(PLAIN.filter((n) => trapTypes(deck, n.id).includes(1)).map((n) => n.id)).toEqual(['o3', 't2', 'n2', 'n3', 'n4', 'v4'])
  })

  it('a pair named as a whole is left alone; two roles in one statement trade places', () => {
    expect(antonymVariants('HTTP follows a client-server model.', {})).toEqual([])
    expect(antonymVariants('Price depends on supply and demand.', {})).toEqual([])
    expect(antonymVariants('The client waits until the server responds.', {})).toEqual(['The server waits until the client responds.'])
  })
})

// ── Terse notes: bullets and shorthand, the way notes are really taken ──────────────────────────
// Under 7 words, no formal subject. A bullet takes its root's title as subject (context
// inheritance); "Term: explanation" / "Term - explanation" / "Term (details)" reads as subject and
// mechanism; everyday opposites count in a fragment.

const TERSE: DeckNote[] = [
  note('a1', '- Consumes ATP', ['Biology', 'Active transport'], ['bio', 'act']),
  note('a2', 'moves ions against the gradient', ['Biology', 'Active transport'], ['bio', 'act']),
  note('a3', 'needs carrier proteins', ['Biology', 'Active transport'], ['bio', 'act']),
  note('d1', '- no energy needed', ['Biology', 'Diffusion'], ['bio', 'dif']),
  note('d2', 'moves particles down the gradient', ['Biology', 'Diffusion'], ['bio', 'dif']),
  note('d3', 'increases by 15% when heated', ['Biology', 'Diffusion'], ['bio', 'dif']),
  note('w1', 'used for background tasks', ['Web', 'Web Workers'], ['web', 'ww']),
  note('w2', '• runs off the main thread', ['Web', 'Web Workers'], ['web', 'ww']),
  note('w3', 'no DOM access', ['Web', 'Web Workers'], ['web', 'ww']),
  note('s1', 'Caches responses offline', ['Web', 'Service Workers'], ['web', 'sw']),
  note('s2', 'intercepts network requests', ['Web', 'Service Workers'], ['web', 'sw']),
  note('s3', 'high latency on first load', ['Web', 'Service Workers'], ['web', 'sw']),
  note('m1', 'MBIs: người ngoài mua lại', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
  note('m2', 'MBO: ban quản lý mua lại', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
  note('m3', 'LBO - mua lại bằng vốn vay', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
  note('m4', 'IPO (phát hành cổ phiếu lần đầu)', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
  note('v1', 'tăng khi lãi suất giảm', ['Tài chính', 'Giá trái phiếu'], ['tc', 'tp']),
  note('v2', 'dòng tiền vào', ['Tài chính', 'Giá trái phiếu'], ['tc', 'tp']),
  note('v3', 'rủi ro thấp', ['Tài chính', 'Giá trái phiếu'], ['tc', 'tp']),
]
const terse = prepareDeck(TERSE)
const askTerse = (id: string, type: TrapType, base = 'abc'): Question => {
  const res = buildQuestion(terse, id, typedSeed(type, base))
  if (!res.ok) throw new Error(`no question for ${id}`)
  return res.question
}
const overSeeds = (id: string, type: TrapType) => SEEDS.map((s) => askTerse(id, type, s))
const unbulleted = (s: string) => s.replace(/^[-•*]\s+/, '')

describe('terse notes: the sample', () => {
  it('is short and has no formal subject: at most 7 words; every bullet takes its root as subject', () => {
    for (const n of TERSE) expect(unbulleted(n.statement).split(/\s+/).length, n.id).toBeLessThanOrEqual(7)
    // Everything but the shorthand terms is a fragment about its root.
    for (const n of TERSE.filter((x) => !x.id.startsWith('m'))) {
      const proposition = synthesizeProposition(n.statement, n.path)
      expect(proposition.inherited, n.id).toBe(true)
      expect(proposition.text.startsWith(`${n.path.at(-1)} `), n.id).toBe(true)
    }
    for (const n of TERSE.filter((x) => x.id.startsWith('m'))) expect(parseShorthand(n.statement), n.id).not.toBeNull()
  })
})

describe('context inheritance: the root is the implicit subject', () => {
  it('a bullet that opens with a verb, in any case and with or without a list marker, inherits its root', () => {
    expect(isPredicateOnly('Consumes ATP')).toBe(true)
    expect(isPredicateOnly('increases by 15% when heated')).toBe(true)
    expect(isPredicateOnly('used for background tasks')).toBe(true)
    expect(isPredicateOnly('Caches responses offline')).toBe(true)
    expect(isPredicateOnly('Kích hoạt enzyme')).toBe(true)
    // The bullet marker and the capital that only opened the bullet are dropped.
    expect(stripMarks('- Consumes ATP').text).toBe('Consumes ATP')
    expect(stripMarks('• runs off the main thread').text).toBe('runs off the main thread')
    expect(stripMarks('-5 degrees').text).toBe('-5 degrees')
    expect(synthesizeProposition('- Consumes ATP', ['Biology', 'Active transport'])).toEqual({ text: 'Active transport consumes ATP', inherited: true })
    expect(synthesizeProposition('used for background tasks', ['Web Workers'])).toEqual({ text: 'Web Workers used for background tasks', inherited: true })
  })

  it('a statement with its own subject keeps it, even when it opens with a word from the verb lexicon', () => {
    for (const own of ['Exports increase national income.', 'Transport proteins move ions.', 'Unit tests verify behaviour.', 'Ribosomes synthesize proteins.']) {
      expect(isPredicateOnly(own), own).toBe(false)
      expect(synthesizeProposition(own, ['Root']).inherited).toBe(false)
    }
  })

  it('the synthetic statement is split after the root: its verb gives action and object, any other fragment is taken whole', () => {
    expect(decompose('Active transport consumes ATP', 'Active transport')).toMatchObject({ subject: 'Active transport', action: 'consumes', object: 'ATP', kind: 'action' })
    expect(decompose('Web Workers used for background tasks', 'Web Workers')).toMatchObject({ subject: 'Web Workers', action: 'used', object: 'for background tasks', kind: 'action' })
    expect(decompose('Web Workers no DOM access', 'Web Workers')).toMatchObject({ subject: 'Web Workers', predicate: 'no DOM access', action: '', kind: 'guess' })
  })
})

describe('shorthand: Term: explanation / Term - explanation / Term (details)', () => {
  it('reads the term as the subject and the explanation as its mechanism', () => {
    expect(parseShorthand('MBIs: người ngoài mua lại')).toMatchObject({ subject: 'MBIs', predicate: 'người ngoài mua lại', rest: ': người ngoài mua lại', kind: 'note' })
    expect(parseShorthand('LBO - mua lại bằng vốn vay')).toMatchObject({ subject: 'LBO', predicate: 'mua lại bằng vốn vay', kind: 'note' })
    expect(parseShorthand('IPO (phát hành cổ phiếu lần đầu)')).toMatchObject({ subject: 'IPO', predicate: 'phát hành cổ phiếu lần đầu', rest: ' (phát hành cổ phiếu lần đầu)', kind: 'note' })
    expect(parseShorthand('NADH (electron carrier).')).toMatchObject({ subject: 'NADH', predicate: 'electron carrier' })
  })

  it('is not an equation, a time, a sentence or a term as long as a clause', () => {
    for (const other of ['v = s / t', 'Ribosomes synthesize proteins.', 'Meeting at 10:30', 'A very long heading with far too many words in it: explanation']) expect(parseShorthand(other), other).toBeNull()
  })
})

describe('terse notes reach at least five trap types', () => {
  it('every one has 5 or more, and types 4, 5, 6 and 7 for all of them', () => {
    for (const n of TERSE) expect(trapTypes(terse, n.id).length, `${n.id} “${n.statement}”: ${trapTypes(terse, n.id).join('')}`).toBeGreaterThanOrEqual(5)
    for (const type of [4, 5, 6, 7] as const) expect(TERSE.filter((n) => trapTypes(terse, n.id).includes(type)).length, `type ${type}`).toBe(TERSE.length)
    const mean = TERSE.reduce((sum, n) => sum + trapTypes(terse, n.id).length, 0) / TERSE.length
    expect(mean).toBeGreaterThanOrEqual(5.5)
    for (const n of TERSE) expect(questionKinds(terse, n.id)).not.toContain('exact')
  })

  it('type 4 swaps the root with the roots beside it, never with another subject when one is near', () => {
    const q = askTerse('a1', 4)
    expect(answerOf(q)).toBe('Active transport consumes ATP')
    expect(wrongOf(q)).toEqual(['Diffusion consumes ATP'])
    // Shorthand: the term is swapped with the terms beside it.
    const terms = new Set(overSeeds('m1', 4).flatMap(wrongOf))
    expect(terms).toEqual(new Set(['MBO: người ngoài mua lại', 'LBO: người ngoài mua lại', 'IPO: người ngoài mua lại']))
  })

  it('type 5 frames the bullet as an observed case and asks for its root; the badge hides the root', () => {
    for (const q of overSeeds('a1', 5)) {
      expect(q.prompt).toContain('“consumes ATP”')
      expect(q.instruction).toBe('Which underlying concept is being observed?')
      expect(answerOf(q)).toBe('Active transport')
      expect(q.context).toEqual(['Biology'])
      // The root beside it is always offered.
      expect(wrongOf(q)).toContain('Diffusion')
    }
    // A mechanism that is no verb phrase gets a neutral frame; shorthand asks for the term.
    expect(new Set(overSeeds('w3', 5).map((q) => q.prompt))).toEqual(new Set(['Scenario: in a case, this is what you observe: “no DOM access”.', 'Applied case: this is at work: “no DOM access”.']))
    const term = askTerse('m1', 5)
    expect(term.prompt).toContain('“người ngoài mua lại”')
    expect(answerOf(term)).toBe('MBIs')
  })

  it('type 7 asks what the root does, which one is responsible, and each element', () => {
    const kinds = (id: string) => new Set(overSeeds(id, 7).map((q) => q.kind))
    expect(kinds('a1')).toEqual(new Set(['element-subject', 'element-action', 'element-object', 'element-predicate']))
    const by = (id: string, kind: string) => overSeeds(id, 7).find((q) => q.kind === kind)!

    const does = by('a1', 'element-predicate')
    expect(does.prompt).toBe('What does “Active transport” do?')
    expect(answerOf(does)).toBe('consumes ATP')
    const which = by('a1', 'element-subject')
    expect(which.prompt).toBe('Which component is responsible for “consumes ATP”?')
    expect(answerOf(which)).toBe('Active transport')
    expect(which.context).toEqual(['Biology'])
    expect(by('a1', 'element-object').prompt).toBe('Active transport consumes ____.')

    // A verbless fragment: what is true of the root, and which root it describes.
    expect(kinds('w3')).toEqual(new Set(['element-subject', 'element-predicate']))
    expect(by('w3', 'element-predicate')).toMatchObject({ prompt: 'What is true of “Web Workers”?' })
    // Shorthand: the term from its explanation, the explanation from its term, against the other terms.
    const termOf = by('m2', 'element-subject')
    expect(termOf.prompt).toBe('Which term matches “ban quản lý mua lại”?')
    expect(answerOf(termOf)).toBe('MBO')
    expect(wrongOf(termOf).sort()).toEqual(['IPO', 'LBO', 'MBIs'])
    const describes = by('m2', 'element-predicate')
    expect(describes.prompt).toBe('What describes “MBO”?')
    expect(answerOf(describes)).toBe('ban quản lý mua lại')
    for (const w of wrongOf(describes)) expect(['người ngoài mua lại', 'mua lại bằng vốn vay', 'phát hành cổ phiếu lần đầu', 'người trong mua lại']).toContain(w)
  })

  it('every question on a terse note has distinct choices and exactly one right answer, whatever the type', () => {
    for (const n of TERSE) {
      for (const type of trapTypes(terse, n.id)) {
        for (const q of overSeeds(n.id, type)) {
          expect(q.trapType).toBe(type)
          expect(q.choices.length, `${n.id} t${type}`).toBeGreaterThanOrEqual(2)
          expect(new Set(q.choices.map((c) => c.text.toLocaleLowerCase())).size).toBe(q.choices.length)
          expect(q.choices.filter((c) => c.tag === q.correctTag)).toHaveLength(1)
          // The right answer is never given away by the breadcrumb badge.
          if (q.kind === 'scenario' || q.kind === 'element-subject' || q.kind === 'category') expect(q.context).not.toContain(answerOf(q))
        }
      }
    }
  })
})

describe('type 1 on fragments: a single keyword is enough', () => {
  it('“MBIs: người ngoài mua lại”: “ngoài” is swapped for “trong”', () => {
    expect(antonymVariants('MBIs: người ngoài mua lại', {}, { loose: true })).toEqual(['MBIs: người trong mua lại'])
    expect(trapTypes(terse, 'm1')).toContain(1)
    const q = askTerse('m1', 1)
    expect(answerOf(q)).toBe('MBIs: người ngoài mua lại')
    expect(wrongOf(q)).toEqual(['MBIs: người trong mua lại'])
    // Sibling swap tests it against the internal buyout (MBO) as well.
    expect(overSeeds('m1', 4).flatMap(wrongOf)).toContain('MBO: người ngoài mua lại')
  })

  it('in / out, high / low, internal / external, tăng / giảm, nhanh / chậm, trong / ngoài all trigger in a fragment', () => {
    const loose = (s: string) => antonymVariants(s, {}, { loose: true })
    expect(loose('cash flows in')).toEqual(['cash flows out'])
    expect(loose('money moved out')).toEqual(['money moved in'])
    expect(loose('high latency on first load')).toEqual(expect.arrayContaining(['low latency on first load']))
    expect(loose('internal buyers only')).toEqual(['external buyers only'])
    expect(loose('tăng khi lãi suất giảm').sort()).toEqual(['giảm khi lãi suất giảm', 'tăng khi lãi suất tăng'])
    expect(loose('phản ứng nhanh')).toEqual(['phản ứng chậm'])
    expect(loose('nằm trong tế bào')).toEqual(['nằm ngoài tế bào'])
    expect(loose('rủi ro thấp')).toEqual(['rủi ro cao'])
    expect(loose('dòng tiền vào')).toEqual(['dòng tiền ra'])
    expect(loose('flows into the cell')).toEqual(['flows out of the cell'])
  })

  it('the everyday words stay untouched in a full sentence, and inside set phrases even in a fragment', () => {
    // Not loose (a sentence): no swap of "trong", "in" or "cao".
    expect(antonymVariants('Nước ở trong tế bào.', {})).toEqual([])
    expect(antonymVariants('Protein is made in the cytoplasm.', {})).toEqual([])
    // Loose, but a set phrase or a preposition in the middle: left alone.
    const loose = (s: string) => antonymVariants(s, {}, { loose: true })
    expect(loose('trong khi ngủ')).toEqual([])
    expect(loose('ngoài ra còn có thuế')).toEqual([])
    expect(loose('made in the cytoplasm')).toEqual([])
    expect(loose('depends on the load')).toEqual([])
  })

  it('phrase guard: “lần đầu ra” (first time, to …) holds no “đầu ra” and is never turned into “đầu vào”', () => {
    for (const loose of [false, true]) {
      expect(antonymVariants('phát hành lần đầu ra công chúng', {}, { loose })).toEqual([])
      expect(antonymVariants('IPO (phát hành lần đầu ra công chúng)', {}, { loose })).toEqual([])
      expect(antonymVariants('IPO: phát hành cổ phiếu lần đầu ra công chúng.', {}, { loose })).toEqual([])
      expect(antonymVariants('Lần đầu vào thị trường quốc tế', {}, { loose })).toEqual([])
    }
    // The older trap generator and the clause near-misses go through the same rule.
    expect(collectTrapCandidates('Công ty phát hành cổ phiếu lần đầu ra công chúng.', {})).toEqual([])
    // The real pair still swaps, both ways, also in a sentence that holds the guarded phrase too.
    expect(antonymVariants('Dữ liệu đầu ra của mô hình', {})).toEqual(['Dữ liệu đầu vào của mô hình'])
    expect(antonymVariants('Dữ liệu đầu vào của mô hình', {})).toEqual(['Dữ liệu đầu ra của mô hình'])
    expect(antonymVariants('Lần đầu ra mắt, đầu ra tăng mạnh', {})).toEqual(expect.arrayContaining(['Lần đầu ra mắt, đầu vào tăng mạnh']))
    expect(antonymVariants('Lần đầu ra mắt, đầu ra tăng mạnh', {}).some((v) => v.includes('Lần đầu vào'))).toBe(false)
    // In the engine: the IPO note is asked, but never as a "đầu vào" antonym.
    const ipo = prepareDeck([
      note('i', 'IPO (phát hành lần đầu ra công chúng)', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
      note('j', 'MBO: ban quản lý mua lại', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
      note('k', 'LBO - mua lại bằng vốn vay', ['Tài chính', 'Mua lại'], ['tc', 'ml']),
    ])
    expect(trapTypes(ipo, 'i')).not.toContain(1)
    for (const type of trapTypes(ipo, 'i')) {
      for (const s of SEEDS) {
        const res = buildQuestion(ipo, 'i', typedSeed(type, s))
        expect(res.ok && res.question.choices.some((c) => c.text.includes('đầu vào'))).toBe(false)
      }
    }
  })

  it('the engine uses loose opposites only on terse notes', () => {
    const tree = prepareDeck([
      note('t', 'nằm trong tế bào chất', ['Sinh học', 'Ribosome'], ['sh', 'rb']),
      note('l', 'Ribosome tự do nằm rải rác ở trong tế bào chất của mọi loại tế bào sống.', ['Sinh học', 'Ribosome'], ['sh', 'rb']),
      note('o', 'tổng hợp protein', ['Sinh học', 'Ribosome'], ['sh', 'rb']),
    ])
    expect(trapTypes(tree, 't')).toContain(1)
    expect(trapTypes(tree, 'l')).not.toContain(1)
    const res = buildQuestion(tree, 't', typedSeed(1, 'abc'))
    expect(res.ok && res.question.choices.map((c) => c.text).sort()).toEqual(['Ribosome nằm ngoài tế bào chất', 'Ribosome nằm trong tế bào chất'])
  })

  it('more than a third of the terse sample holds an opposite and is asked as type 1', () => {
    const withOpposite = TERSE.filter((n) => trapTypes(terse, n.id).includes(1)).map((n) => n.id)
    expect(withOpposite).toEqual(expect.arrayContaining(['a1', 'd3', 's3', 'm1', 'v1', 'v2', 'v3']))
  })
})

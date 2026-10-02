import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDrillItems } from '@/features/decks/server'
import { localDay, resolveTimeZone } from '@/shared/lib/localDay'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import { buildQuestion, prepareDeck, questionKinds, toDeckNote } from '@/shared/lib/questionEngine'
import type { DrillTag } from '@/shared/lib/trapEngine'
import { canPractice } from '@/shared/lib/visitor'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { AnswerDailyRushInput, StartDailyRushInput } from '../dto/RushDto'
import { RUSH_LIMIT_MS, RUSH_STALE_MS, rushOrder, rushQuestionSeed, type RushOutcome } from '../lib/rules'
import type { RushAnswer, RushCard, RushStart, RushStatus } from '../types'

// Daily Rush (migration 20261008000000_daily_rush.sql): one sudden-death run a day on one of the
// player's own trees. The run's cards are never stored: the server rebuilds them from the run's seed
// and the tree, so the client only ever sees choices and the server grades every pick. All writes go
// through the service role (players can't write daily_rush_runs or users.coins); the database's own
// clock decides timeouts.

type Client = SupabaseClient<Database>
const MIGRATION = 'supabase/migrations/20261008000000_daily_rush.sql'
const missing = (code?: string) => code === '42P01' || code === 'PGRST202' || code === 'PGRST205' || code === '42883'

type DealtCard = RushCard & { correctTag: DrillTag }

// The cards a run deals, in order: every statement of the tree the question engine can ask, shuffled
// by the run's seed, each at most once. Owner only.
async function dealCards(supabase: Client, userId: string, deckId: string, seed: string): Promise<ActionResult<DealtCard[]>> {
  const tree = await listDrillItems(supabase, { deckId })
  if (!tree.success) return tree
  if (!canPractice(tree.data.deck.ownerId, userId)) return fail('DECK_NOT_FOUND', 'Daily Rush is played on your own trees')

  const deck = prepareDeck(tree.data.items.map(toDeckNote))
  const askable = tree.data.items.filter((i) => questionKinds(deck, i.id).length > 0).map((i) => i.id)
  const cards: DealtCard[] = []
  for (const itemId of rushOrder(askable, seed)) {
    const built = buildQuestion(deck, itemId, rushQuestionSeed(itemId, seed, cards.length))
    if (!built.ok) continue
    const { kind, context, prompt, instruction, choices, correctTag } = built.question
    cards.push({ index: cards.length, kind, context, prompt, instruction, choices, correctTag })
  }
  return ok(cards)
}

// What the player gets: the card without its answer.
const publicCard = ({ index, kind, context, prompt, instruction, choices }: DealtCard): RushCard => ({ index, kind, context, prompt, instruction, choices })

// Whether today's run is used, and how the latest run went. "Today" is the player's local day in the
// timezone their latest run was started in (the server can't ask the browser). A run abandoned
// mid-card is settled first, so its streak is paid.
export async function loadRushStatus(supabase: Client, userId: string, now: Date = new Date()): Promise<RushStatus> {
  const latest = () => supabase.from('daily_rush_runs').select('day, time_zone, streak, coins, status, question_started_at').eq('user_id', userId).order('day', { ascending: false }).limit(1).maybeSingle()
  let { data: run, error } = await latest()
  if (error) {
    console.error(`[rush] loadRushStatus failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
    return { playedToday: false, lastRun: null }
  }
  if (!run) return { playedToday: false, lastRun: null }

  if (run.status === 'active' && now.getTime() - new Date(run.question_started_at).getTime() > RUSH_STALE_MS) {
    const admin = createAdminClient()
    if (admin) {
      const settled = await admin.rpc('settle_daily_rush', { p_user_id: userId, p_stale_ms: RUSH_STALE_MS })
      if (settled.error) console.error('[rush] settle_daily_rush failed', settled.error.code, settled.error.message)
      else ({ data: run, error } = await latest())
    }
  }
  if (!run) return { playedToday: false, lastRun: null }

  return {
    playedToday: run.day >= localDay(now, resolveTimeZone(run.time_zone)),
    lastRun: run.status === 'finished' ? { day: run.day, streak: run.streak, coins: run.coins } : null,
  }
}

// Claims today's run and deals its first card.
export async function startRush(supabase: Client, userId: string, { deckId, timeZone }: StartDailyRushInput, now: Date = new Date()): Promise<ActionResult<RushStart>> {
  const zone = resolveTimeZone(timeZone)
  const day = localDay(now, zone)
  const seed = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

  const cards = await dealCards(supabase, userId, deckId, seed)
  if (!cards.success) return cards
  if (cards.data.length === 0) return fail('DRILL_NO_ITEMS', 'This tree has no statements to rush through yet')

  const admin = createAdminClient()
  if (!admin) {
    console.error('[rush] startRush: SUPABASE_SERVICE_ROLE_KEY is not set')
    return fail('INTERNAL_ERROR', 'Could not start the Daily Rush')
  }
  const { error } = await admin.rpc('start_daily_rush', { p_user_id: userId, p_deck_id: deckId, p_day: day, p_seed: seed, p_time_zone: zone })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('RUSH_ALREADY_PLAYED')) return fail('RUSH_ALREADY_PLAYED', 'You already played your Daily Rush today. See you tomorrow!')
    if (message.includes('DECK_NOT_FOUND')) return fail('DECK_NOT_FOUND', 'Daily Rush is played on your own trees')
    console.error(`[rush] start_daily_rush failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not start the Daily Rush')
  }
  return ok({ day, total: cards.data.length, card: publicCard(cards.data[0]) })
}

// Grades one pick (or a timeout: tag null) of the player's run of `day`. Right and in time: the next
// card. Otherwise, or after the last card, the run ends and pays its streak in the same transaction.
export async function answerRush(supabase: Client, userId: string, { day, tag }: AnswerDailyRushInput): Promise<ActionResult<RushAnswer>> {
  const { data: run, error: readError } = await supabase.from('daily_rush_runs').select('deck_id, seed, streak, status').eq('user_id', userId).eq('day', day).maybeSingle()
  if (readError) {
    console.error('[rush] answerRush read failed', readError.code, readError.message)
    return fail('INTERNAL_ERROR', 'Could not check this answer')
  }
  if (!run || run.status !== 'active') return fail('RUSH_NOT_ACTIVE', 'This Daily Rush is already over')

  // The tree was chopped mid-run: no card to grade, the run ends with what it has.
  const cards = run.deck_id ? await dealCards(supabase, userId, run.deck_id, run.seed) : ok<DealtCard[]>([])
  if (!cards.success && cards.error.code !== 'DECK_NOT_FOUND') return cards
  const dealt = cards.success ? cards.data : []
  const card = dealt[run.streak]
  const isCorrect = card !== undefined && tag !== null && tag === card.correctTag

  const admin = createAdminClient()
  if (!admin) {
    console.error('[rush] answerRush: SUPABASE_SERVICE_ROLE_KEY is not set')
    return fail('INTERNAL_ERROR', 'Could not check this answer')
  }
  const { data, error } = await admin.rpc('answer_daily_rush', {
    p_user_id: userId,
    p_day: day,
    p_expected: run.streak,
    p_correct: isCorrect,
    p_timed_out: tag === null,
    p_last: run.streak + 1 >= dealt.length,
    p_limit_ms: RUSH_LIMIT_MS,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('RUSH_NOT_ACTIVE') || message.includes('RUSH_OUT_OF_SYNC')) return fail('RUSH_NOT_ACTIVE', 'This Daily Rush is already over')
    console.error(`[rush] answer_daily_rush failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not check this answer')
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return fail('INTERNAL_ERROR', 'Could not check this answer')

  // The player's own verdict is the database's: a right pick that arrived too late is a timeout.
  const verdict = { isCorrect: row.is_finished ? row.outcome === 'complete' : true, correctTag: card?.correctTag ?? 'A', streak: row.run_streak }
  if (!row.is_finished) return ok({ ...verdict, finished: false, next: publicCard(dealt[row.run_streak]) })
  return ok({ ...verdict, finished: true, outcome: row.outcome as RushOutcome, coinsEarned: row.coins_earned, totalCoins: row.total_coins })
}

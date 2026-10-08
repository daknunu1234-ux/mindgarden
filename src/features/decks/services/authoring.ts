import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { seedPrice, speciesUpgradeCost } from '@/shared/lib/treeSkins'
import { CLONE_MIN_STATEMENTS } from '@/shared/lib/economy'
import { slugify } from '@/shared/utils/slugify'
import type { CloneDeckInput } from '../dto/CloneDeckDto'
import type { CreateDeckInput } from '../dto/CreateDeckDto'
import type { SetTournamentOpenInput } from '../dto/SetTournamentOpenDto'
import type { DeleteDeckInput } from '../dto/DeleteDeckDto'
import type { UpdateDeckInput } from '../dto/UpdateDeckDto'
import { toDeck } from './decks'
import type { Deck } from '../types'

// Deck-level authoring: planting, cloning, settings, tournaments, chopping. The outline itself
// (roots and statements, public.content_nodes) is edited in services/content.ts.

type Client = SupabaseClient<Database>

// Slugs that would collide with static routes under /deck.
const RESERVED_SLUGS = new Set(['new'])
const UNIQUE_VIOLATION = '23505'

function* slugCandidates(title: string) {
  const base = slugify(title)
  if (!RESERVED_SLUGS.has(base)) yield base
  for (let n = 2; n <= 5; n++) yield `${base}-${n}`
  // Private decks of other users are invisible (RLS), so collisions can't be listed up front.
  yield `${base}-${crypto.randomUUID().slice(0, 6)}`
}

export type PlantedDeck = { deck: Deck; remainingCoins: number }

// Plants a tree for its species' seed price (treeSkins seedPrice: 100 🪙, or 180 for a surreal
// species) through plant_deck() (migration 20261006000000_species_seed_prices.sql), which charges
// the signed-in player and inserts the deck in one transaction. A slug collision (23505) rolls the
// charge back, so trying the next slug never charges twice. Players can't INSERT into decks
// directly, so the fee can't be skipped.
export async function plantDeck(supabase: Client, input: CreateDeckInput): Promise<ActionResult<PlantedDeck>> {
  for (const slug of slugCandidates(input.title)) {
    const { data, error } = await supabase.rpc('plant_deck', {
      p_title: input.title,
      p_slug: slug,
      p_description: input.description,
      p_is_public: input.isPublic,
      p_tree_type: input.treeType,
    })

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      if (error.message?.includes('INSUFFICIENT_COINS')) {
        return fail('INSUFFICIENT_COINS', `You need ${seedPrice(input.treeType)} coins to buy a seed for this tree!`)
      }
      if (error.message?.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to plant a tree')
      // PGRST202 / 42883: plant_deck is missing (run 20260928000500_seed_economy.sql).
      // 23503: the player has no public.users row (handle_new_user trigger missing?).
      console.error('[decks] plantDeck failed', error.code, error.message)
      return fail('INTERNAL_ERROR', 'Could not plant this tree')
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      console.error('[decks] plantDeck returned no row')
      return fail('INTERNAL_ERROR', 'Could not plant this tree')
    }
    // Read the new deck back with the player's own client (RLS: owner).
    const { data: deck, error: readError } = await supabase.from('decks').select('*').eq('id', row.deck_id).single()
    if (readError || !deck) {
      console.error('[decks] plantDeck read-back failed', readError)
      return fail('INTERNAL_ERROR', 'Your tree was planted, but we could not load it')
    }
    return ok({ deck: toDeck(deck), remainingCoins: row.remaining_coins })
  }
  return fail('INTERNAL_ERROR', 'Could not find a free link for this tree')
}

export type ClonedDeck = { deck: Deck; remainingCoins: number; cost: number }

// Clones another gardener's shared tree through clone_deck() (migration 20261019000000), which
// needs at least 50 statements (CLONE_TOO_SMALL), charges the species' seed price + min(statements,
// 50) 🪙 (economy cloneCost: 150 for a standard tree, 230 for a surreal one once the gate is met),
// pays the tree's creator +50 🪙, logs the clone, notifies the creator and deep-copies roots +
// statements, all in one transaction.
// Like plantDeck, a slug collision (23505) rolls the charge back, so the next slug never
// double-charges. Progress is never copied: the cloner starts every statement at 0/5.
export async function cloneSharedDeck(supabase: Client, { deckId }: CloneDeckInput): Promise<ActionResult<ClonedDeck>> {
  // Visible to the caller only if it's theirs or public (RLS); the RPC re-checks both.
  const { data: source, error: sourceError } = await supabase.from('decks').select('title').eq('id', deckId).maybeSingle()
  if (sourceError) {
    console.error('[decks] cloneSharedDeck source lookup failed', sourceError)
    return fail('INTERNAL_ERROR', 'Could not clone this tree')
  }
  if (!source) return fail('DECK_NOT_FOUND', 'This tree is not shared (anymore)')

  for (const slug of slugCandidates(source.title)) {
    const { data, error } = await supabase.rpc('clone_deck', { p_source_deck_id: deckId, p_slug: slug })

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      const message = error.message ?? ''
      if (message.includes('INSUFFICIENT_COINS')) {
        const cost = /(\d+) coins/.exec(error.hint ?? '')?.[1]
        return fail('INSUFFICIENT_COINS', cost ? `You need ${cost} coins to clone this tree!` : 'You need more coins to clone this tree!')
      }
      if (message.includes('CLONE_TOO_SMALL')) return fail('CLONE_TOO_SMALL', `Requires at least ${CLONE_MIN_STATEMENTS} statements to clone`)
      if (message.includes('CANNOT_CLONE_OWN_DECK')) return fail('AUTH_FORBIDDEN', 'You cannot clone your own tree')
      if (message.includes('DECK_NOT_FOUND')) return fail('DECK_NOT_FOUND', 'This tree is not shared (anymore)')
      if (message.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to clone this tree')
      // PGRST202 / 42883: clone_deck is missing (run 20260928000700_clone_deck.sql).
      console.error('[decks] cloneSharedDeck failed', error.code, error.message)
      return fail('INTERNAL_ERROR', 'Could not clone this tree')
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      console.error('[decks] cloneSharedDeck returned no row')
      return fail('INTERNAL_ERROR', 'Could not clone this tree')
    }
    const { data: deck, error: readError } = await supabase.from('decks').select('*').eq('id', row.deck_id).single()
    if (readError || !deck) {
      console.error('[decks] cloneSharedDeck read-back failed', readError)
      return fail('INTERNAL_ERROR', 'Your copy was planted, but we could not load it')
    }
    return ok({ deck: toDeck(deck), remainingCoins: row.remaining_coins, cost: row.cost })
  }
  return fail('INTERNAL_ERROR', 'Could not find a free link for this tree')
}

// RLS already blocks writes to other people's decks; this gives a clear error first.
export async function checkDeckOwner(
  supabase: Client,
  deckId: string,
  userId: string,
): Promise<ActionResult<{ slug: string; treeType: string }>> {
  const { data, error } = await supabase.from('decks').select('user_id, slug, tree_type').eq('id', deckId).maybeSingle()
  if (error) {
    console.error('[decks] checkDeckOwner failed', error)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  if (!data) return fail('DECK_NOT_FOUND', 'Deck not found')
  if (data.user_id !== userId) return fail('AUTH_FORBIDDEN', 'Only the owner can edit this tree')
  return ok({ slug: data.slug, treeType: data.tree_type })
}

// `remainingCoins`: the purse after a species change that cost coins; null when nothing was charged.
export type UpdatedDeck = Deck & { remainingCoins: number | null }

// Owner-only settings change (title, description, species, visibility). RLS "decks: update own"
// is the final guard; the owner check gives AUTH_FORBIDDEN instead of a silent no-op. Changing to a
// pricier species (a standard tree → a surreal one) charges the difference in the database
// (decks_charge_species_upgrade, migration 20261006000000): a short purse refuses the change.
export async function updateDeckSettings(
  supabase: Client,
  userId: string,
  { deckId, title, description, treeType, isPublic }: UpdateDeckInput,
): Promise<ActionResult<UpdatedDeck>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner
  const upgrade = treeType === undefined ? 0 : speciesUpgradeCost(owner.data.treeType, treeType)

  const { data, error } = await supabase
    .from('decks')
    .update({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(treeType !== undefined && { tree_type: treeType }),
      ...(isPublic !== undefined && { is_public: isPublic }),
    })
    .eq('id', deckId)
    .select('*')
    .single()

  if (error) {
    if (error.message?.includes('INSUFFICIENT_COINS')) {
      return fail('INSUFFICIENT_COINS', `You need ${upgrade} coins to change this tree to that species!`)
    }
    console.error('[decks] updateDeckSettings failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not update this tree')
  }
  if (upgrade === 0) return ok({ ...toDeck(data), remainingCoins: null })

  // The upgrade was charged: read the purse back so the header shows it at once.
  const purse = await supabase.from('users').select('coins').eq('id', userId).maybeSingle()
  if (purse.error) console.error('[decks] updateDeckSettings purse read failed', purse.error.code, purse.error.message)
  return ok({ ...toDeck(data), remainingCoins: purse.data?.coins ?? null })
}

// Owner-only: open or close the tree's Mind Tournament. Opening needs a shared (public) tree:
// visitors can only reach public trees. Closing keeps every participant row, so graduates stay
// engraved and a re-opened tournament continues where it stopped.
export async function setDeckTournament(
  supabase: Client,
  userId: string,
  { deckId, isOpen }: SetTournamentOpenInput,
): Promise<ActionResult<Deck>> {
  const { data: deck, error: readError } = await supabase.from('decks').select('user_id, is_public').eq('id', deckId).maybeSingle()
  if (readError) {
    console.error('[decks] setDeckTournament read failed', readError)
    return fail('INTERNAL_ERROR', 'Could not load this tree')
  }
  if (!deck) return fail('DECK_NOT_FOUND', 'Deck not found')
  if (deck.user_id !== userId) return fail('AUTH_FORBIDDEN', "Only the tree's owner can host its tournament")
  if (isOpen && !deck.is_public) return fail('VALIDATION_FAILED', 'Share the tree with the community first, so visitors can join')

  const { data, error } = await supabase.from('decks').update({ is_tournament_open: isOpen }).eq('id', deckId).select('*').single()
  if (error) {
    // 42703 / PGRST204: the column is missing (run 20260928000900_mind_tournament.sql).
    console.error('[decks] setDeckTournament failed', error.code, error.message)
    return fail('INTERNAL_ERROR', isOpen ? 'Could not open the tournament' : 'Could not close the tournament')
  }
  return ok(toDeck(data))
}

// Uproot a whole tree. The database cascades the rest (decks → mindmap_nodes → knowledge_items →
// user_progress, all ON DELETE CASCADE, see DATABASE.md), so one DELETE removes every root,
// statement and everyone's progress on them in a single statement. RLS "decks: delete own" is the
// final guard; the owner check gives AUTH_FORBIDDEN first, and RETURNING catches a silent no-op.
export async function removeDeck(
  supabase: Client,
  userId: string,
  { deckId }: DeleteDeckInput,
): Promise<ActionResult<{ id: string; slug: string; refund: number; totalCoins: number | null }>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // Chop through uproot_deck() (migration 20260930000000): deletes the deck and pays the Woodshop
  // refund (25% of its statements, at most 50 🪙) in one transaction. Before that migration the
  // function doesn't exist: fall back to the plain delete below (no refund).
  const chopped = await supabase.rpc('uproot_deck', { p_deck_id: deckId })
  if (!chopped.error) {
    const row = Array.isArray(chopped.data) ? chopped.data[0] : chopped.data
    return ok({ id: deckId, slug: owner.data.slug, refund: row?.refund ?? 0, totalCoins: row?.total_coins ?? null })
  }
  if (!['PGRST202', '42883'].includes(chopped.error.code)) {
    console.error('[decks] uproot_deck failed', chopped.error.code, chopped.error.message)
    return fail('INTERNAL_ERROR', 'Could not uproot this tree')
  }
  console.error('[decks] removeDeck: run supabase/migrations/20260930000000_farm_grid.sql (no Woodshop refund until then)')

  const { data, error } = await supabase.from('decks').delete().eq('id', deckId).select('id')
  if (error) {
    console.error('[decks] removeDeck failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not uproot this tree')
  }
  // Zero rows: the delete policy refused it (or the deck vanished in between).
  if (!data || data.length === 0) {
    console.error('[decks] removeDeck deleted no rows (missing "decks: delete own" policy?)', deckId)
    return fail('AUTH_FORBIDDEN', 'This tree could not be uprooted')
  }
  // No purse figure on this path (the coins didn't change).
  return ok({ id: deckId, slug: owner.data.slug, refund: 0, totalCoins: null })
}

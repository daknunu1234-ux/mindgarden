import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { STARTING_COINS } from '@/shared/lib/economy'
import { ensureUserProfile, exchangeAuthCode } from '../services/session'

const MIGRATION = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260928000600_profiles_and_sharing.sql'),
  'utf8',
)

// In-memory auth + profiles: ensure_user_profile creates a missing row with the starter purse
// and never touches an existing one (the migration's semantics).
function fakeSupabase({ exchangeOk = true, existingCoins }: { exchangeOk?: boolean; existingCoins?: number }) {
  const profiles = new Map<string, number>(existingCoins === undefined ? [] : [['u1', existingCoins]])
  const client = {
    auth: {
      exchangeCodeForSession: vi.fn(async () => (exchangeOk ? { error: null } : { error: { status: 400, code: 'bad_code' } })),
    },
    rpc: vi.fn(async (fn: string) => {
      if (fn !== 'ensure_user_profile') throw new Error(`unexpected rpc ${fn}`)
      if (!profiles.has('u1')) profiles.set('u1', STARTING_COINS)
      return { data: profiles.get('u1'), error: null }
    }),
  }
  return { client, profiles }
}

describe('new signups get the 300-coin starter purse', () => {
  it('the signup trigger inserts coins = 300 for email and OAuth (Google) metadata', () => {
    expect(MIGRATION).toMatch(/insert into public\.users \(id, email, full_name, avatar_url, coins\)/i)
    expect(MIGRATION).toMatch(new RegExp(`\\n\\s+${STARTING_COINS}\\s+-- starting purse`))
    // Google sends `name` and `picture` besides full_name / avatar_url.
    expect(MIGRATION).toMatch(/raw_user_meta_data ->> 'full_name', new\.raw_user_meta_data ->> 'name'/)
    expect(MIGRATION).toMatch(/raw_user_meta_data ->> 'avatar_url', new\.raw_user_meta_data ->> 'picture'/)
  })

  it('backfills every auth user that has no profile row, with 300 coins', () => {
    expect(MIGRATION).toMatch(/where not exists \(select 1 from public\.users p where p\.id = u\.id\)/i)
    expect(MIGRATION).toMatch(/grant execute on function public\.ensure_user_profile\(\) to authenticated/i)
  })

  it('a login whose trigger never ran still ends with 300 coins', async () => {
    const { client, profiles } = fakeSupabase({})
    expect(await exchangeAuthCode(client as never, 'code')).toBe(true)
    expect(client.rpc).toHaveBeenCalledWith('ensure_user_profile')
    expect(profiles.get('u1')).toBe(300)
  })

  it('never resets an existing balance', async () => {
    const { client, profiles } = fakeSupabase({ existingCoins: 40 })
    expect(await ensureUserProfile(client as never)).toBe(40)
    expect(profiles.get('u1')).toBe(40)
  })

  it('does not touch profiles when the login code fails', async () => {
    const { client } = fakeSupabase({ exchangeOk: false })
    expect(await exchangeAuthCode(client as never, 'bad')).toBe(false)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

describe('trees are private until shared', () => {
  it('flips the decks.is_public default to false (existing trees keep theirs)', () => {
    expect(MIGRATION).toMatch(/alter table public\.decks alter column is_public set default false;/i)
    expect(MIGRATION).not.toMatch(/update public\.decks set is_public/i)
  })
})

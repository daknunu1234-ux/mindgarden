import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { neighborName, publicName } from '@/shared/lib/neighborName'
import { createClient } from '@/shared/lib/supabase/server'
import { getDisplayNames } from '../actions/getDisplayNames'
import { updateDisplayName } from '../actions/updateDisplayName'
import { UpdateDisplayNameDto } from '../dto/DisplayNameDto'
import { displayNameLength, sanitizeDisplayName } from '../lib/displayName'

const LINH = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'

// ─── Sanitizing and limits ─────────────────────────────────────────────────────────────────────

describe('sanitizeDisplayName', () => {
  it('trims and collapses spaces', () => {
    expect(sanitizeDisplayName('   Linh    Nguyễn  ')).toBe('Linh Nguyễn')
  })

  it('strips HTML / quote characters and invisible characters, keeping Vietnamese letters', () => {
    expect(sanitizeDisplayName('<script>alert("x")</script>')).toBe('scriptalert(x)/script')
    expect(sanitizeDisplayName('<b>Trạng</b> & "Nguyên"')).toBe('bTrạng/b Nguyên')
    expect(sanitizeDisplayName('Mai​‮Anh\nHồ')).toBe('Mai Anh Hồ')
    expect(sanitizeDisplayName("O'Brien `x` \\y")).toBe('OBrien x y')
  })

  it('normalizes to NFC and counts code points (decomposed "ễ" is one character)', () => {
    const decomposed = 'Nguyễn'
    expect(sanitizeDisplayName(decomposed)).toBe('Nguyễn')
    expect(displayNameLength(sanitizeDisplayName(decomposed))).toBe(6)
  })
})

describe('UpdateDisplayNameDto', () => {
  const parse = (displayName: unknown) => UpdateDisplayNameDto.safeParse({ displayName })

  it('rejects names shorter than 2 characters, after trimming and sanitizing', () => {
    expect(parse('A').success).toBe(false)
    expect(parse('   ').success).toBe(false)
    expect(parse(' <b> ').success).toBe(false) // sanitizes to "b"
    expect(parse('An').success).toBe(true)
  })

  it('rejects names longer than 30 characters', () => {
    expect(parse('x'.repeat(30)).success).toBe(true)
    expect(parse('x'.repeat(31)).success).toBe(false)
    expect(parse('ễ'.repeat(30)).success).toBe(true) // 30 code points, whatever their UTF-16 size
  })

  it('returns the sanitized name', () => {
    expect(UpdateDisplayNameDto.parse({ displayName: '  <i>Hoa</i>   Sen ' }).displayName).toBe('iHoa/i Sen')
  })

  it('rejects anything but a string', () => {
    expect(parse(42).success).toBe(false)
    expect(UpdateDisplayNameDto.safeParse({}).success).toBe(false)
  })
})

// ─── updateDisplayName ─────────────────────────────────────────────────────────────────────────

// Fake Supabase with RLS "users: update self": an update can only touch the caller's row.
function fakeSupabase(viewer: string | null) {
  const rows = new Map<string, { display_name: string | null }>([
    [LINH, { display_name: null }],
    [BINH, { display_name: 'Bình' }],
  ])
  const updates: { patch: Record<string, unknown>; id: unknown }[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`)
      let patch: Record<string, unknown> | null = null
      let id: unknown = null
      const q = {
        update: (p: Record<string, unknown>) => {
          patch = p
          return q
        },
        eq: (_col: string, value: unknown) => {
          id = value
          return q
        },
        select: () => q,
        maybeSingle: async () => {
          if (!patch) return { data: null, error: null }
          updates.push({ patch, id })
          const row = id === viewer ? rows.get(String(id)) : undefined
          if (!row) return { data: null, error: null }
          Object.assign(row, patch)
          return { data: { display_name: row.display_name }, error: null }
        },
      }
      return q
    },
    rpc: async (fn: string, args: { p_user_ids: string[] }) => {
      if (fn !== 'get_display_names') throw new Error(`unexpected rpc ${fn}`)
      return {
        data: args.p_user_ids.flatMap((uid) => {
          const name = rows.get(uid)?.display_name
          return name ? [{ user_id: uid, display_name: name }] : []
        }),
        error: null,
      }
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { rows, updates }
}

beforeEach(() => vi.clearAllMocks())

describe('updateDisplayName', () => {
  it('saves the sanitized name on the caller\'s own row and revalidates every page', async () => {
    const { rows, updates } = fakeSupabase(LINH)
    expect(await updateDisplayName({ displayName: '  Linh   <3 ' })).toEqual({ success: true, data: { displayName: 'Linh 3' } })
    expect(updates).toEqual([{ patch: { display_name: 'Linh 3' }, id: LINH }])
    expect(rows.get(LINH)?.display_name).toBe('Linh 3')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('prevents unauthenticated updates (no query at all)', async () => {
    const { updates } = fakeSupabase(null)
    expect(await updateDisplayName({ displayName: 'Linh' })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(updates).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects too short / too long names before touching the database', async () => {
    const { updates } = fakeSupabase(LINH)
    expect(await updateDisplayName({ displayName: 'L' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await updateDisplayName({ displayName: 'L'.repeat(31) })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(updates).toEqual([])
  })

  it('never writes another gardener\'s row (the id comes from the session, not the payload)', async () => {
    const { rows, updates } = fakeSupabase(LINH)
    await updateDisplayName({ displayName: 'Hacker', userId: BINH })
    expect(updates.map((u) => u.id)).toEqual([LINH])
    expect(rows.get(BINH)?.display_name).toBe('Bình')
  })
})

describe('getDisplayNames and the public-name fallback', () => {
  it('returns chosen names only; anyone without one falls back to the pseudonym', async () => {
    fakeSupabase(null)
    const res = await getDisplayNames({ userIds: [LINH, BINH, BINH] })
    expect(res).toEqual({ success: true, data: { [BINH]: 'Bình' } })
    const names = res.success ? res.data : {}
    expect(publicName(names[BINH], BINH)).toBe('Bình')
    expect(publicName(names[LINH], LINH)).toBe(neighborName(LINH))
  })

  it('treats a blank display name as not chosen', () => {
    expect(publicName('   ', LINH)).toBe(neighborName(LINH))
    expect(publicName('', LINH)).toBe(neighborName(LINH))
    expect(publicName(null, LINH)).toBe(neighborName(LINH))
  })

  it('rejects malformed ids', async () => {
    fakeSupabase(null)
    expect(await getDisplayNames({ userIds: ['nope'] })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
  })
})

// ─── The migration ─────────────────────────────────────────────────────────────────────────────

describe('migration 20260928001000_display_names.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260928001000_display_names.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('adds an opt-in, length-checked display_name that players may update on their own row only', () => {
    expect(body).toMatch(/add column if not exists display_name varchar\(30\)/i)
    expect(body).toMatch(/char_length\(btrim\(display_name\)\) between 2 and 30/i)
    expect(body).toMatch(/grant update \(display_name\) on table public\.users to authenticated;/i)
    expect(body).not.toMatch(/grant update \([^)]*(email|coins|role_id)/i)
  })

  it('exposes chosen names only: the lookup and both boards return display_name, never email or full_name', () => {
    expect(body).toMatch(/create or replace function public\.get_display_names\(p_user_ids uuid\[\]\)/i)
    expect(body.match(/u\.display_name::text/g)).toHaveLength(3)
    expect(body).not.toMatch(/u\.(email|full_name)/i)
  })
})

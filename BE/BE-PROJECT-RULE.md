# Backend Project Rules
> **Read when**: writing or reviewing server code (actions, services, dto, tests).
> **Related**: [ARCHITECTURE.md](./ARCHITECTURE.md) · [../API_SPEC.md](../API_SPEC.md) · [../DATABASE.md](../DATABASE.md)

## Overview
- **Language**: TypeScript (`strict: true`) · **Framework**: Next.js App Router (Server Actions & Route Handlers)
- **Data Client**: `@supabase/ssr` (server) / `@supabase/supabase-js` (typed with `Database`)
- **Architecture**: Feature-based; one folder per feature for server + UI (ARCHITECTURE.md §4)

## 1. Feature Structure (server part)
```
src/features/[feature-name]/
├── actions/     # 'use server' entry points
├── services/    # Supabase queries & mutations, import 'server-only'
├── dto/         # Zod schemas
├── types/       # Domain types
├── lib/         # Pure helpers (progress/lib/masteryRules.ts)
├── __tests__/   # Vitest
├── index.ts     # Client-safe public API (actions, types)
├── server.ts    # Server-only public API (services)
└── context.md   # Owned tables, exports, dependencies
```
**Flow**: `page / hook` → `action` → `dto` (validate) → `service` → Supabase

## 2. Naming Conventions
| Element | Convention | DO | DON'T |
|---------|------------|----|-------|
| Feature folders | kebab-case | `decks`, `drill`, `deck-editor` | `Decks`, `deck_editor` |
| Actions / Services | camelCase, verb first | `submitDrillResult`, `recordDrillResult` | `DrillSubmit`, `deck_nodes` |
| DTO schemas | PascalCase + `Dto` | `DrillSubmissionDto` | `drillSchema` |
| Types | PascalCase | `DrillSubmission`, `DeckTree` | `IDeckTree`, `deckTreeType` |

## 3. Feature Rules
| Rule | DO | DON'T |
|------|----|-------|
| Server cross-feature | `import { getItemsByNode } from '@/features/decks/server'` | `import ... from '@/features/decks/services/items'` |
| Client-safe imports | `import { getDeckBySlug } from '@/features/decks'` | Re-exporting `services/` from `index.ts` |
| Shared code | Move to `src/shared/` once used by 2+ features | Copy-paste helpers between features |
| Table ownership | Only `decks` services query `decks` | `drill` writing to `decks` directly |

## 4. Code Patterns (MUST)
**Response envelope** (`src/shared/types/result.ts`):
```typescript
export type Meta = { page?: number; limit?: number; total?: number }
export type ActionResult<T> =
  | { success: true; data: T; meta?: Meta }
  | { success: false; error: { code: ErrorCode; message: string } }   // ErrorCode: shared/types/errors.ts
export const ok = <T>(data: T, meta?: Meta): ActionResult<T> => ({ success: true, data, meta })
export const fail = (code: ErrorCode, message: string): ActionResult<never> =>
  ({ success: false, error: { code, message } })
```

**Supabase server client** (`src/shared/lib/supabase/server.ts`):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/shared/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => { try { list.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)) } catch { /* called from RSC */ } },
    } },
  )
}
```

**Server Action: validate → auth → service → envelope** (`features/progress/actions/submitDrillResult.ts`):
```typescript
'use server'
export async function submitDrillResult(input: unknown): Promise<ActionResult<DrillResult>> {
  const parsed = DrillSubmissionDto.safeParse(input)                   // 1. Zod first
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()             // 2. never trust client user_id
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Login required')
  return recordDrillResult(supabase, user.id, parsed.data)              // 3. service returns ActionResult
}
```

**Trap Engine: deterministic & pure** (`src/shared/lib/trapEngine.ts`, spec in ARCHITECTURE.md §7):
- DO: `generateTraps(correctStmt, trapRules, seed: string)`; same input → same output
- DON'T: `Math.random()`, `Date.now()`, Supabase calls, or LaTeX parsing inside the engine

## 5. Anti-patterns (MUST NOT)
| DON'T | DO |
|-------|----|
| `await supabase.from('decks').select()` inside `page.tsx` | `const res = await getDeckBySlug({ slug })` from `@/features/decks` |
| `SUPABASE_SERVICE_ROLE_KEY` in a client file or `NEXT_PUBLIC_*` var | Only in `src/shared/lib/supabase/admin.ts` with `import 'server-only'` |
| `drill/actions` importing `progress/actions` and back | Actions call services via `server.ts`; shared logic moves to `src/shared/` |
| `supabase.from('user_progress').insert(body)` with raw `body` | `DrillSubmissionDto.parse(body)` first |
| Taking `user_id` from the request payload | Use `supabase.auth.getUser()` on the server |

## 6. Git Workflow
| Item | DO | DON'T |
|------|----|-------|
| Branch | `feat/drill`, `fix/streak-reset` | `update`, `linh-branch` |
| Commit | `feat(drill): add trap swap rule` · `fix(progress): clamp mastery at 3` · `docs: update DATABASE.md` | `fixed stuff`, `WIP` |

## 7. Testing
- **Runner**: Vitest; pure functions only, no DB
- **Trap Engine**: `src/features/drill/__tests__/trapEngine.test.ts` · **Mastery**: `src/features/progress/__tests__/masteryRules.test.ts`

```typescript
const STMT = 'Khi nhiệt độ tăng, áp suất khí lớn hơn.'
it('is deterministic for the same seed', () => {
  expect(generateTraps(STMT, {}, 'item42:sess7')).toEqual(generateTraps(STMT, {}, 'item42:sess7'))
})
it('returns 3 unique choices with the original as correctTag', () => {
  const r = generateTraps(STMT, {}, 'item42:sess7')
  if (!r.ok) throw new Error('expected traps')
  expect(new Set(r.choices.map((c) => c.text)).size).toBe(3)
  expect(r.choices.find((c) => c.tag === r.correctTag)?.text).toBe(STMT)
})
it('caps mastery at 3 and floors at 0', () => {
  expect(nextMastery(3, true)).toBe(3)
  expect(nextMastery(0, false)).toBe(0)
})
```
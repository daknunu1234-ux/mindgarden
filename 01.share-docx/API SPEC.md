# API Specification

> **Read when**: adding or changing a Server Action, Route Handler, DTO, error code, or response shape.
> **Related**: [DATABASE.md](./DATABASE.md) · [backend/ARCHITECTURE.md](./backend/ARCHITECTURE.md) · [frontend/ARCHITECTURE.md](./frontend/ARCHITECTURE.md)

## 1. Overview

- **Primary**: Next.js Server Actions (`'use server'`) in `src/features/*/actions/`, exported from each feature's `index.ts`
- **Secondary**: Route Handlers in `src/app/api/*` (thin wrappers over the same service) and `src/app/auth/callback`
- **Base URL pattern**: `/api/*` · **Content-Type**: `application/json`
- **Casing**: camelCase in payloads, snake_case in the DB; services map between them

```
Client ──► Server Action / Route Handler ──► Zod DTO ──► feature service ──► PostgreSQL (RLS) ──► envelope
```

---

## 2. Authentication

- **Session**: Supabase session cookie via `createServerClient` (`@supabase/ssr`) in `src/shared/lib/supabase/server.ts`
- **Identity**: `supabase.auth.getUser()` on the server; `userId` is never accepted from the client
- **Anonymous**: may explore public decks and request drill questions; progress mutations require a session

| Auth | Meaning |
|------|---------|
| Public | No session needed |
| Optional | Works without a session; a session adds own private decks and personal progress |
| Required | No session → `AUTH_UNAUTHORIZED` |

---

## 3. Request Conventions

- **Validation**: every payload is parsed with a Zod DTO (`features/*/dto`) before any DB call
- **Pagination**: `?limit=20&page=1` (Route) or `{ limit, page }` (Action); `limit` 1–50 (default 20), `page` ≥ 1
  - Supabase: `.range((page - 1) * limit, page * limit - 1)` with `{ count: 'exact' }`
- **Payloads**: plain JSON objects; text is plain text only (no LaTeX, see DATABASE.md)
- **IDs**: UUID v4 strings · **Slugs**: kebab-case (`cell-biology-101`)

---

## 4. Response Format

```json
{ "success": true, "data": { }, "meta": { } }
{ "success": false, "error": { "code": "DECK_NOT_FOUND", "message": "Deck not found" } }
```

- Type: `ActionResult<T>` in `src/shared/types/result.ts` (backend/PROJECT-RULES.md §4)
- `meta` = `{ page, limit, total }` for lists, `{}` otherwise
- Server Actions never throw to the client; Route Handlers return the same body with the HTTP status below

---

## 5. Error Codes (`src/shared/types/errors.ts`)

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_FAILED` | 400 | Zod validation failed; `message` = first issue |
| `AUTH_UNAUTHORIZED` | 401 | No valid session on a Required endpoint |
| `AUTH_RATE_LIMITED` | 429 | Supabase refused to send another sign-in email (built-in mailer limit) |
| `DECK_NOT_FOUND` | 404 | Deck doesn't exist, or is private and not owned (RLS returns no row) |
| `NODE_NOT_FOUND` | 404 | Mindmap node doesn't exist or its deck isn't readable |
| `ITEM_NOT_FOUND` | 404 | Submitted `itemId` doesn't exist or isn't readable |
| `DRILL_NO_ITEMS` | 422 | Node has no drillable item (none left, or all `INSUFFICIENT_MUTATIONS`) |
| `INTERNAL_ERROR` | 500 | Unexpected Supabase / server error (logged, details not returned) |

---

## 6. Endpoints / Server Actions

| Feature | Action / Route | Method | Description | Auth |
|---------|---------------|--------|-------------|------|
| Auth | `/auth/callback` | GET | Exchange the magic-link (PKCE) code for a session | Public |
| Auth | `signInWithEmail` | Action/POST | Email a magic link | Public |
| Auth | `signOut` | Action/POST | Clear the session | Optional |
| Auth | `getCurrentUser` | Action | Verified user or null (layout, pages) | Optional |
| Decks | `getDecks` | Action/GET | List public and personal decks | Optional |
| Decks | `getDeckBySlug` | Action/GET | Deck metadata + full mindmap tree | Optional |
| Decks | `createDeck` | Action/POST | Create new tree deck | Required |
| Drill | `getDrillQuestion` | Action/POST | 3 choices (1 correct + 2 traps) for a node | Optional |
| Drill | `getDrillSession` | Action/POST | Shuffled practice round for a whole deck (1 correct + 2 traps per item) | Optional |
| Drill | `checkDrillAnswer` | Action/POST | Grade one answer without saving progress | Public |
| Progress | `submitDrillResult` | Action/POST | Grade answer, update item mastery & streak | Required |
| Progress | `getProgressByDecks` | Action/GET | Mastery % per deck + level per item | Optional |

Route mirrors: `GET /api/decks`, `GET /api/decks/[slug]`, `POST /api/decks`, `POST /api/drill/question`, `POST /api/progress/drill-result`, `GET /api/progress?deckIds=…`

### `GET /auth/callback`
```
Query:   ?code=<oauth_code>&next=/deck/cell-biology-101
Success: exchangeCodeForSession(code) → 307 to `next` (same-origin paths only, `auth/lib/safeNextPath`)
Failure: 302 to /?login=error
```

### `signInWithEmail` (auth)
```typescript
// Input (SignInWithEmailDto): { email: string; next?: string /* same-origin path, else '/' */ }
// data: { sent: true } · Errors: VALIDATION_FAILED, AUTH_RATE_LIMITED, INTERNAL_ERROR
```
- `signInWithOtp` with `emailRedirectTo = <origin>/auth/callback?next=…`; new emails get an account
- The link must be opened in the same browser (PKCE code verifier cookie)

### `signOut` / `getCurrentUser` (auth)
```typescript
// signOut(): data null · Errors: INTERNAL_ERROR
// getCurrentUser(): data { id: string; email: string } | null   (from supabase.auth.getUser())
```

### `getDecks` (decks)
```typescript
// Input: { limit?: number; page?: number }
// data: decks visible under RLS (is_public OR owner)
Array<{ id: string; userId: string; title: string; slug: string; description: string | null;
        isPublic: boolean; treeType: string; createdAt: string }>
// meta: { page, limit, total } · Errors: VALIDATION_FAILED
```

### `getDeckBySlug` (decks)
```typescript
// Input: { slug: string }
// data
{ deck: { id; userId; title; slug; description; isPublic; treeType; createdAt };
  tree: DeckTreeNode[] }                     // roots (parent_id = null), ordered by sort_order
type DeckTreeNode = { id: string; title: string; sortOrder: number;
  items: { id: string; prompt: string }[];   // no correctStmt: answers stay hidden
  children: DeckTreeNode[] }
// Errors: VALIDATION_FAILED, DECK_NOT_FOUND
```

### `createDeck` (decks)
```typescript
// Input (CreateDeckDto): { title: string; slug: string; description?: string; isPublic?: boolean; treeType?: string }
// defaults (DATABASE.md): isPublic = true, treeType = 'oak'; slug must be kebab-case
// data: created deck (same shape as a getDecks row) · Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED
```

### `getDrillQuestion` (drill)
```typescript
// Input (DrillQuestionDto): { nodeId: string; sessionId: string; excludeItemIds?: string[] /* max 50 */ }
// data
{ itemId: string; prompt: string;
  seed: string;                               // hash(itemId + sessionId), backend/ARCHITECTURE.md §7
  choices: { tag: 'A' | 'B' | 'C'; text: string }[] }   // shuffled, no correctTag
// Errors: VALIDATION_FAILED, NODE_NOT_FOUND, DRILL_NO_ITEMS
```
- **Item pick**: signed in → lowest `mastery_level`, then oldest `last_practiced_at`; anonymous → first by `created_at` not in `excludeItemIds`
- Items returning `INSUFFICIENT_MUTATIONS` are skipped

### `getDrillSession` (drill)
```typescript
// Input (GetDrillSessionDto): { slug: string } | { deckId: string }, plus limit?: number /* 1–50, default 20 */
// data
{ deck: { id: string; slug: string; title: string; treeType: string };
  sessionId: string;                          // crypto.randomUUID() per call
  questions: { itemId: string; nodeTitle: string; prompt: string;
               seed: string;                  // hash(itemId + sessionId), backend/ARCHITECTURE.md §7
               choices: { tag: 'A' | 'B' | 'C'; text: string }[] }[];   // no correctTag
  skippedCount: number }                      // items that returned INSUFFICIENT_MUTATIONS
// Errors: VALIDATION_FAILED, DECK_NOT_FOUND, DRILL_NO_ITEMS
```
- **Order**: items shuffled with `seededRandom(sessionId)`, then cut to `limit`
- Deck-wide counterpart of `getDrillQuestion` (per node, still planned for the mindmap)

### `checkDrillAnswer` (drill)
```typescript
// Input (DrillSubmissionDto, from progress): { itemId: string; seed: string; tag: 'A' | 'B' | 'C' }
// data
{ isCorrect: boolean; correctTag: 'A' | 'B' | 'C' }
// Errors: VALIDATION_FAILED, ITEM_NOT_FOUND
```
- **Grading**: same as `submitDrillResult` (re-run `generateTraps` with the seed), but saves nothing and needs no session
- Lets anonymous players get feedback; `submitDrillResult` adds mastery + streak once auth and progress exist

### `submitDrillResult` (progress)
```typescript
// Input (DrillSubmissionDto): { itemId: string; seed: string; tag: 'A' | 'B' | 'C' }
// data
{ isCorrect: boolean; correctTag: 'A' | 'B' | 'C';
  masteryLevel: 0 | 1 | 2 | 3; previousMasteryLevel: 0 | 1 | 2 | 3; mistakeCount: number }
// streakCount: planned, needs the admin client (SUPABASE_SERVICE_ROLE_KEY); not returned yet
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, ITEM_NOT_FOUND
```
- **Grading**: re-run `generateTraps(correctStmt, trapRules, seed)`, compare `tag` with `correctTag`
- **Mastery** (`nextMastery` in `progress/lib`): correct → `min(level + 1, 3)`; wrong → `max(level - 1, 0)` and `mistakeCount + 1`
- **Write**: upsert `user_progress` with `onConflict: 'user_id,knowledge_item_id'`, `last_practiced_at = now()`
- **Streak** (admin client, not built yet): `last_active_at` = today → unchanged; yesterday → +1; otherwise → 1
- **Grading** is shared with `checkDrillAnswer` via `progress/server` `gradeSubmission`

### `getProgressByDecks` (progress)
```typescript
// Input: { deckIds: string[] /* 1–50 */ }
// data
Array<{ deckId: string; masteryPercent: number;            // Σ level / (3 × itemCount) × 100, 0 if no items
        itemCount: number; items: { itemId: string; masteryLevel: 0 | 1 | 2 | 3 }[] }>
// Errors: VALIDATION_FAILED
```
- Anonymous → every `masteryPercent` = 0 and `masteryLevel` = 0; unpractised items count as 0

---

## 7. Adding a New Endpoint

- [ ] DTO in `features/<f>/dto` → service in `services/` → action in `actions/` → export from `index.ts`
- [ ] New error code → `shared/types/errors.ts` + Section 5 · new row + schema block in Section 6
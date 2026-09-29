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
| `AUTH_FORBIDDEN` | 403 | Signed in, but not the owner of the deck being edited |
| `AUTH_RATE_LIMITED` | 429 | Supabase refused to send another sign-in email (built-in mailer limit) |
| `DECK_NOT_FOUND` | 404 | Deck doesn't exist, or is private and not owned (RLS returns no row) |
| `NODE_NOT_EMPTY` | 409 | Deleting a root that still has statements or sub-roots |
| `NODE_NOT_FOUND` | 404 | Mindmap node doesn't exist or its deck isn't readable |
| `ITEM_NOT_FOUND` | 404 | Submitted `itemId` doesn't exist or isn't readable |
| `DRILL_NO_ITEMS` | 422 | Node has no drillable item (none left, or all `INSUFFICIENT_MUTATIONS`) |
| `INSUFFICIENT_COINS` | 402 | The purse is short: planting a tree costs 100 🪙 (`createDeck`), cloning one costs min(100 + statements, 150) 🪙 (`cloneDeck`) |
| `FORBIDDEN_VISITOR_PRACTICE` | 403 | Practising or grading a tree you don't own (strict read-only visitor mode, signed out included). Message: "You must clone this tree to your garden to practice it!" (`getDrillSession`, `checkDrillAnswer`, `submitDrillResult`) |
| `DRILL_ALL_MASTERED` | 422 | Every drillable item in the deck/branch is at 5/5 and review mode is off ("fully cultivated"); retry with `includeMastered: true` |
| `INTERNAL_ERROR` | 500 | Unexpected Supabase / server error (logged, details not returned) |

---

## 6. Endpoints / Server Actions

| Feature | Action / Route | Method | Description | Auth |
|---------|---------------|--------|-------------|------|
| Auth | `/auth/callback` | GET | Exchange the magic-link (PKCE) code for a session | Public |
| Auth | `signInWithEmail` | Action/POST | Email a magic link | Public |
| Auth | `signOut` | Action/POST | Clear the session | Optional |
| Auth | `getCurrentUser` | Action | Verified user or null (layout, pages) | Optional |
| Decks | `getDecks` | Action/GET | The signed-in player's own decks (their garden) | Optional |
| Decks | `getCommunityDecks` | Action/GET | Other gardeners' shared (public) decks | Optional |
| Decks | `getNeighborGarden` | Action/GET | One gardener's shared decks (visitor mode) | Optional |
| Decks | `getDeckBySlug` | Action/GET | Deck metadata + full mindmap tree | Optional |
| Decks | `createDeck` | Action/POST | Plant a new tree deck for 100 🪙 (slug generated) | Required |
| Decks | `cloneDeck` | Action/POST | Copy another gardener's shared tree into your garden for min(100 + statements, 150) 🪙 | Required |
| Progress | `simulateCoinTopUp` | Action/POST | Development only: credit a Coin Shop package without payment | Required |
| Decks | `createMindmapNode` | Action/POST | Add a root to an owned deck | Required |
| Decks | `createKnowledgeItem` | Action/POST | Add a plain-text statement to a root | Required |
| Decks | `getDeckEditor` | Action | Owner-only roots + true statements for the editor | Required |
| Decks | `getDeckReader` | Action | Read-only roots + true statements of a public tree (or your own), for visitors | Optional |
| Decks | `updateDeck` | Action/POST | Owner edits title, description, species, visibility | Required |
| Decks | `updateMindmapNode` | Action/POST | Owner renames a root | Required |
| Decks | `deleteMindmapNode` | Action/POST | Owner deletes an empty root | Required |
| Decks | `deleteKnowledgeItem` | Action/POST | Owner removes a statement | Required |
| Decks | `deleteDeck` | Action/POST | Owner uproots a whole tree (cascades roots, statements, progress), then redirects to `/` | Required |
| Drill | `getDrillQuestion` | Action/POST | 2–3 choices (1 correct + 1–2 traps) for a node | Optional |
| Drill | `getDrillSession` | Action/POST | Shuffled practice round for a whole deck or one branch (1 correct + 1–2 traps per item). Owner only | Required (owner) |
| Drill | `checkDrillAnswer` | Action/POST | Grade one answer without saving progress. Owner only | Required (owner) |
| Progress | `submitDrillResult` | Action/POST | Grade answer, update item mastery & streak. Owner only | Required (owner) |
| Progress | `getProgressByDecks` | Action/GET | Mastery % per deck + level per item | Optional |
| Progress | `getGardenStats` | Action | Profile totals over the player's own trees + current/best streak | Required |
| Progress | `getStreak` | Action | Current/best streak for the header badge (null when signed out) | Optional |
| Progress | `getFarmHud` | Action | Gardener level + streak for the Farm Island HUD (null when signed out) | Optional |

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
// getCurrentUser(): data { id: string; email: string; createdAt: string } | null   (from supabase.auth.getUser())
```

### `getDecks` (decks)
```typescript
// Input: { limit?: number; page?: number }
// data: the signed-in player's OWN decks only (user_id = session user; public and private), newest first.
//       Signed out → [] (total 0). Never another gardener's tree, even a public one.
Array<{ id: string; userId: string; title: string; slug: string; description: string | null;
        isPublic: boolean; treeType: string; createdAt: string }>
// meta: { page, limit, total } · Errors: VALIDATION_FAILED
```
- Feeds the farm island and the grid: each gardener sees their own garden. Switching accounts shows only the new account's trees

### `getCommunityDecks` (decks)
```typescript
// Input: { limit?: number /* 1–60, default 30 */ }
// data: public decks (is_public = true) of OTHER gardeners (user_id ≠ session user), newest first; signed out → every public deck
// Same row shape as getDecks · Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Fills the farm's "🌱 Community Gardens · Thăm Vườn" drawer, grouped by gardener (`garden/lib/neighbors.ts`). Neighbours get a friendly name derived from their id, because profiles aren't readable across players

### `getNeighborGarden` (decks)
```typescript
// Input: { ownerId: string /* uuid */; limit?: number }
// data: that gardener's PUBLIC decks only (never their private ones) · Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Read-only visitor mode on the farm (`/?visit=<ownerId>`). Visiting yourself shows your own garden. **Strict read-only**: visitors can open a shared tree and read all its roots and statements (`getDeckReader`), but can't edit it or practise it (`FORBIDDEN_VISITOR_PRACTICE`). To practise, they clone it (`cloneDeck`)

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
// Input (CreateDeckDto): { title: string; description?: string; isPublic?: boolean; treeType?: 'oak' | 'pine' | 'sakura' | 'bamboo' | 'apple' | 'saguaro' }
// defaults (DATABASE.md): isPublic = false (private until shared), treeType = 'oak'
// sharing later: updateDeck({ deckId, isPublic }), the Tree Workshop's "Share tree with community (Public link) 🌐" switch
// slug: generated with shared/utils/slugify (diacritics stripped); on a unique clash → -2 … -5, then a random suffix; "new" is reserved
// data: { deck /* same shape as a getDecks row */; remainingCoins: number /* purse after paying */ }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INSUFFICIENT_COINS ("You need 100 coins to buy a seed for a new tree!"), INTERNAL_ERROR
```
- **Price**: 100 🪙 per tree (`SEED_PRICE_COINS`, `shared/lib/economy.ts`). New gardeners start with 300 (3 seeds)
- **Atomic**: each slug candidate calls `plant_deck()` (DATABASE.md "Seed economy"), which charges and inserts in one transaction. A slug clash rolls the charge back before the next candidate, so a tree is paid exactly once
- On success: `revalidatePath('/')` and `'/profile'`. The form pushes `remainingCoins` into `shared/stores/CoinsProvider` (HUD) and navigates to the new tree

### `cloneDeck` (decks)
```typescript
// Input (CloneDeckDto): { deckId: string /* uuid of another gardener's PUBLIC tree */ }
// data: { deck /* the new copy, same shape as a getDecks row: yours, private */; remainingCoins: number; cost: number /* fee charged */ }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INSUFFICIENT_COINS ("You need <cost> coins to clone this tree!"),
//         DECK_NOT_FOUND (private, deleted, or unknown), AUTH_FORBIDDEN (it's already your tree), INTERNAL_ERROR
```
- **Price**: `min(100 + statements, 150)` 🪙 (`cloneCost`, `shared/lib/economy.ts`; the database computes the same with `least(100 + n, 150)`). The button shows it: `🌱 Clone Tree (N 🪙)`
- **Atomic**: `clone_deck()` (DATABASE.md "Cloning") charges and deep-copies the deck, every root (same hierarchy and order) and every statement with its trap rules in one transaction. Slug from the title like `createDeck`; a clash rolls everything back before the next candidate, so the fee is paid once
- **Fresh start**: progress is never copied. The cloner owns the copy, so editing and practice are unlocked, and every statement starts at 0/5 (with its 🪙 mastery coin still to earn)
- On success: `revalidatePath('/')` and `'/profile'`. The button pushes `remainingCoins` into `CoinsProvider` and navigates to `/deck/<new slug>`

### `simulateCoinTopUp` (progress) · development only
```typescript
// Input (CoinTopUpDto): { packageId: 'coins-10' | 'coins-20' | 'coins-50' | 'coins-100' }   // the amount comes from the price list
// data: { coinsAdded: number; totalCoins: number }
// Errors: AUTH_FORBIDDEN (production build), VALIDATION_FAILED, AUTH_UNAUTHORIZED, INTERNAL_ERROR
```
- The Coin Shop's "Simulate Top-up (Dev Mode)": credits a package without payment via `dev_grant_coins` (service role). Refused when `NODE_ENV = production`; the layout only passes it to the shop outside production. Packages: 10 🪙 = 10.000 ₫, 20 = 18.000 ₫ (−10%), 50 = 40.000 ₫ (−20%), 100 (1 Tree Seed 🌱) = 68.000 ₫ (Best Value, −32%). Real payment webhooks come in a later milestone

### `createMindmapNode` (decks)
```typescript
// Input (CreateMindmapNodeDto): { deckId: string; title: string; parentId?: string | null /* null = top level */ }
// sort_order = number of existing siblings (appends)
// data: { id: string; title: string } · Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, NODE_NOT_FOUND (parent not in deck)
```

### `createKnowledgeItem` (decks)
```typescript
// Input (CreateKnowledgeItemDto): { nodeId: string; statement: string /* 1–500 chars, plain text, no \commands like \frac */ }
// Server sets: correct_stmt = statement, prompt = the root's title, trap_rules = { negate: true }
// data: { id: string; drillable: boolean /* engine finds ≥ 1 trap */ }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, NODE_NOT_FOUND
```
- Authors never see or send trap rules; non-drillable items are saved but skipped by drill sessions

### `getDeckEditor` (decks)
```typescript
// Input: { deckId: string }
// data: { deckId; nodes: { id; title; depth; items: { id; statement; drillable }[] }[] }   // tree order, flattened
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND
```

### `getDeckReader` (decks)
```typescript
// Input: { deckId: string }
// data: same shape as getDeckEditor (roots in tree order with their true statements)
// Errors: VALIDATION_FAILED, DECK_NOT_FOUND (someone else's private tree, or unknown), INTERNAL_ERROR
```
- Strict read-only visitor mode: `/deck/[slug]` shows visitors every statement (mindmap cards, root inspector, the "📖 Read this Tree" list) with no edit controls and no drill links. The deck's `is_public` (or ownership) is checked with the player's client before `answers.ts` reads with the service role
- Revealing statements is safe here because visitors can't be graded on this tree (`FORBIDDEN_VISITOR_PRACTICE`), so knowing them earns no mastery or coins

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
// Input (GetDrillSessionDto): { slug: string } | { deckId: string }, plus nodeId?: string, limit?: number /* 1–50, default 20 */,
//        includeMastered?: boolean /* default false; the page passes ?review=1 */
// nodeId: only items of that root and all its sub-roots (the page passes ?nodeId=)
// includeMastered: review mode: mix the player's 5/5 items back in (normally they rest)
// data
{ deck: { id: string; slug: string; title: string; treeType: string };
  sessionId: string;                          // crypto.randomUUID() per call
  focus: { nodeId: string; title: string } | null;   // set for a branch round
  questions: { itemId: string; nodeTitle: string; prompt: string;
               seed: string;                  // hash(itemId + sessionId), backend/ARCHITECTURE.md §7
               choices: { tag: 'A' | 'B' | 'C'; text: string }[] }[];   // no correctTag
  skippedCount: number;                       // items that returned INSUFFICIENT_MUTATIONS
  masteredCount: number;                      // drillable items the player has at 5/5 (resting, or mixed in when reviewing)
  includeMastered: boolean }
// Errors: VALIDATION_FAILED, DECK_NOT_FOUND, NODE_NOT_FOUND (nodeId not in this deck), DRILL_NO_ITEMS,
//         DRILL_ALL_MASTERED (every drillable item is 5/5 and includeMastered is false),
//         FORBIDDEN_VISITOR_PRACTICE (not the deck's owner, or signed out)
```
- **Owner only** (strict read-only visitor mode): the deck's `user_id` must be the session user, checked before any question is built. The drill page answers `FORBIDDEN_VISITOR_PRACTICE` with "You must clone this tree to your garden to practice it!" and a clone button
- **Queue** (`lib/queue.ts` `selectPracticeItems`, pure): the owner's levels come from `progress/server` `fetchMasteryLevels`; 5/5 items are left out unless `includeMastered`. If levels can't be read, nothing is left out, so practice is never blocked. A fresh clone has no levels, so every item is in the round at 0/5
- **Order**: items shuffled with `seededRandom(sessionId)`, then cut to `limit`
- **Traps**: each item gets the other statements of its node as siblings (sibling concept swaps, backend/ARCHITECTURE.md §7)
- With `nodeId` it covers what `getDrillQuestion` was planned for (per-node practice from the mindmap); `getDrillQuestion` is not built

### `checkDrillAnswer` (drill)
```typescript
// Input (DrillSubmissionDto, from progress): { itemId: string; seed: string; tag: 'A' | 'B' | 'C' }
// data
{ isCorrect: boolean; correctTag: 'A' | 'B' | 'C' }
// Errors: VALIDATION_FAILED, ITEM_NOT_FOUND, FORBIDDEN_VISITOR_PRACTICE (not the item's deck owner, or signed out)
```
- **Grading**: same as `submitDrillResult` (re-run `generateTraps` with the seed), but saves nothing
- Owner only, like `getDrillSession`: used when the owner's session expired mid-round

### `submitDrillResult` (progress)
```typescript
// Input (DrillSubmissionDto): { itemId: string; seed: string; tag: 'A' | 'B' | 'C'; timeZone?: string /* browser IANA zone */ }
// data
{ isCorrect: boolean; correctTag: 'A' | 'B' | 'C';
  masteryLevel: 0 | 1 | 2 | 3 | 4 | 5; previousMasteryLevel: 0 | 1 | 2 | 3 | 4 | 5; mistakeCount: number;
  streakCount: number | null;    // current daily streak; null if it could not be saved (the answer still counts)
  coinsEarned: number;           // 🪙 paid by this answer: 1 on the item's first 5/5, else 0
  totalCoins: number | null }    // balance after this answer; null if it could not be read (the answer still counts)
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, ITEM_NOT_FOUND, FORBIDDEN_VISITOR_PRACTICE (not the item's deck owner)
```
- **Owner only**: a visitor's answer is refused before anything is saved, so no progress, streak or 🪙 can be earned on someone else's tree
- **Grading**: re-run `generateTraps(correctStmt, trapRules, seed)`, compare `tag` with `correctTag`
- **Mastery** (`nextMastery` in `progress/lib`, scale in `shared/lib/mastery.ts`): correct → `min(level + 1, 5)`; wrong → `max(level - 1, 0)` and `mistakeCount + 1`. A 5/5 item drops to 4/5 on a wrong answer (it can only get there in review mode)
- **Write**: first answer inserts the `user_progress` row, later ones update `mastery_level`, `mistake_count`, `last_practiced_at = now()` (players can't rewrite the row's user/item, DATABASE.md "Gold coins")
- **Gold** (admin client, `progress/services/coins.ts`): if the answer leaves the item at 5/5 and it was never paid (`coin_awarded_at` NULL), `award_mastery_coin` pays 1 🪙 atomically. Once per item ever: re-mastering after a drop, or answering a mastered item again, pays 0. A coin failure never fails the answer (`coinsEarned: 0`, `totalCoins: null`). The client pushes `totalCoins` into `shared/stores/CoinsProvider` so the farm HUD updates without a reload. There's no `revalidatePath` because it would re-render the drill route and restart the round
- **Streak** (admin client): any saved answer, right or wrong, marks today (player's local day from `timeZone`, UTC if missing/invalid) in `practice_days`; streak = consecutive days ending today or yesterday (DATABASE.md "Daily streak")
- **Grading** is shared with `checkDrillAnswer` via `progress/server` `gradeSubmission`; it passes the item's node siblings to the engine, exactly like `getDrillSession`
- **Answers** (`correct_stmt`, `trap_rules`) are read with the service role in `decks/services/answers.ts` only (DATABASE.md "Answer secrecy"). Statements reach players only through `getDeckEditor` (owner) and `getDeckReader` (public trees, read-only); `trap_rules` and the correct tag never do

### `updateDeck` (decks)
```typescript
// Input (UpdateDeckDto): { deckId: string; title?: string; description?: string | null; treeType?: TreeTypeId; isPublic?: boolean }  // at least one field
// data: the updated deck (getDecks row shape) · Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, INTERNAL_ERROR
```
- The slug never changes, so links stay stable

### `updateMindmapNode` / `deleteMindmapNode` / `deleteKnowledgeItem` (decks)
```typescript
// updateMindmapNode({ nodeId, title /* 1–150 */ }) → { id, title }
// deleteMindmapNode({ nodeId })                   → { id }   only when the root has no statements and no sub-roots
// deleteKnowledgeItem({ itemId })                 → { id }   players' user_progress rows for it cascade away
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, NODE_NOT_FOUND, ITEM_NOT_FOUND, NODE_NOT_EMPTY (delete root), INTERNAL_ERROR
```
- Owner check first (`AUTH_FORBIDDEN`), then RLS as the final guard; used by the mindmap's ✏️ manage dialog

### `deleteDeck` (decks)
```typescript
// deleteDeck({ deckId }) → on success: revalidatePath('/', '/deck/<slug>', '/profile') then redirect('/') (no return value)
//                        → on failure: { success: false, error }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not the owner, or RLS deleted 0 rows), DECK_NOT_FOUND, INTERNAL_ERROR
```
- One `DELETE FROM decks … RETURNING id`; `mindmap_nodes`, `knowledge_items` and `user_progress` go with it via `ON DELETE CASCADE` (DATABASE.md). Gardener XP is derived from progress, so it drops accordingly. 🪙 gold already earned is kept (`users.coins` is a stored balance)
- Success redirects instead of returning: `revalidatePath` would re-render the current route, and `/deck/<slug>` is gone. The client sees Next's redirect signal (`DeleteDeckDialog` shows the farewell toast, then rethrows it via `unstable_rethrow`)
- UI: `DeleteDeckDialog` (type the tree's name to confirm, `matchesTreeName`), from the Tree Workshop's Danger Zone and the owner's 🗑 badge in the farm plot popup

### `getFarmHud` (progress)
```typescript
// Input: none
// data: { level: { level; title; xp; xpIntoLevel; xpForNextLevel; progress /* 0–1 */ };
//         streak: { current; best; practicedToday; lastDay };
//         coins: number } | null                                          // null when signed out
```
- XP = 10 × Σ `mastery_level` over all of the player's `user_progress` rows; level L → L + 1 costs 50 + 25 × (L − 1)
- Coins = the stored 🪙 gold balance `users.coins` (1 per item mastered for the first time; 0 if the coins migration hasn't run). Nothing to spend yet. The HUD's 💎 gems are the Mighty Roots on the current island, computed by the page

### `getGardenStats` (progress)
```typescript
// Input: none (the signed-in user)
// data
{ treeCount: number;          // decks owned by the user (public + private)
  itemCount: number;          // knowledge items across those decks
  mightyRootCount: number;    // roots with ≥ 1 item whose average mastery is 5/5
  masteryPercent: number;     // Σ level / (5 × itemCount) × 100 over owned items, rounded; 0 without items
  trees: { deckId; slug; title; treeType; isPublic; itemCount; masteryPercent; mightyRoots }[];  // newest first
  currentStreak: number; bestStreak: number; practicedToday: boolean }   // 0 / false if the streak can't be read
// Errors: AUTH_UNAUTHORIZED, INTERNAL_ERROR
```
- Only owned trees count; mastery earned on other people's public decks is not included
- Deck + item ids come from `decks/server` (`listOwnedDecks`, `listDeckItemIds`), levels from `user_progress`

### `getStreak` (progress)
```typescript
// Input: none
// data: { current: number; best: number; practicedToday: boolean; lastDay: string | null } | null   // null when signed out
```
- "Today" uses the timezone saved with the player's latest practice day

### `getProgressByDecks` (progress)
```typescript
// Input: { deckIds: string[] /* 1–50 */ }
// data
Array<{ deckId: string; masteryPercent: number;            // Σ level / (5 × itemCount) × 100, 0 if no items
        itemCount: number; items: { itemId: string; masteryLevel: 0 | 1 | 2 | 3 }[];
        mightyRoots: number;                                // roots whose items are all 5/5
        lastPracticedDay: string | null;                    // newest practice, player's local day
        practicedToday: boolean }>                          // false also when never practised (farm 💧)
// Errors: VALIDATION_FAILED
```
- Anonymous → every `masteryPercent` = 0 and `masteryLevel` = 0; unpractised items count as 0
- `masteryPercent` is rounded to an integer; duplicate `deckIds` are removed; unreadable decks return `itemCount: 0`
- Item ids come from `decks/server` `listDeckItemIds`; `user_progress` is queried in chunks of 150 ids

---

## 7. Adding a New Endpoint

- [ ] DTO in `features/<f>/dto` → service in `services/` → action in `actions/` → export from `index.ts`
- [ ] New error code → `shared/types/errors.ts` + Section 5 · new row + schema block in Section 6
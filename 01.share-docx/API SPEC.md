# API Specification

> **Read when**: adding or changing a Server Action, Route Handler, DTO, error code, or response shape.
> **Related**: [DATABASE.md](./DATABASE.md) · [backend/ARCHITECTURE.md](../BE/BE-ARCHITECTURE.md) · [frontend/ARCHITECTURE.md](../FE/FE-ARCHITECTURE.md)

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
- **Anonymous**: may explore and read public decks (strict read-only), and read Mind Tournament boards. Drills are **owner-only**: `getDrillSession`, `checkDrillAnswer` and `submitDrillResult` need a session AND the deck's owner, else `FORBIDDEN_VISITOR_PRACTICE` (`shared/lib/visitor.ts` `canPractice`). Visitors clone a tree (`cloneDeck`) to practise it. The one exception is a **Mind Tournament**: a signed-in visitor may drill a public tree whose owner hosts one (`getTournamentSession`, `submitTournamentAnswer`), with an isolated score

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
| `TOURNAMENT_CLOSED` | 403 | Mind Tournament: the tree isn't public or its owner isn't hosting a tournament (`getTournamentSession`, `submitTournamentAnswer`) |
| `TOURNAMENT_GRADUATED` | 409 | Mind Tournament: you already mastered this tree (engraved in the Hall of Fame); your run is frozen |
| `DRILL_ALL_MASTERED` | 422 | Every drillable item in the deck/branch is at 5/5 and review mode is off ("fully cultivated"); retry with `includeMastered: true` |
| `TILE_UNAVAILABLE` | 409 | Farm grid: the spot is taken or off the 16 × 16 grid, or the tree is already planted (`placeFarmItem`) |
| `INTERNAL_ERROR` | 500 | Unexpected Supabase / server error (logged, details not returned) |

---

## 6. Endpoints / Server Actions

| Feature | Action / Route | Method | Description | Auth |
|---------|---------------|--------|-------------|------|
| Auth | `/auth/callback` | GET | Exchange the magic-link (PKCE) code for a session | Public |
| Auth | `signInWithEmail` | Action/POST | Email a magic link | Public |
| Auth | `signOut` | Action/POST | Clear the session | Optional |
| Auth | `getCurrentUser` | Action | Verified user or null (layout, pages) | Optional |
| Auth | `updateDisplayName` | Action/POST | Set your own public Garden Name (2–30 characters) | Required |
| Auth | `getDisplayNames` | Action | Chosen Garden Names by gardener id (never emails) | Optional |
| Decks | `getDecks` | Action/GET | The signed-in player's own decks (their garden) | Optional |
| Decks | `getNeighborGarden` | Action/GET | One gardener's shared decks (visitor mode) | Optional |
| Decks | `getVisitedGardens` | Action | Shared trees the player has opened, newest visit first (Visited Gardens drawer) | Optional |
| Decks | `recordTreeVisit` | Action | Save / refresh a visit to another gardener's shared tree | Required |
| Decks | `getDeckBySlug` | Action/GET | Deck metadata + full mindmap tree | Optional |
| Decks | `createDeck` | Action/POST | Plant a new tree deck for 100 🪙 (slug generated) | Required |
| Decks | `cloneDeck` | Action/POST | Copy another gardener's shared tree into your garden for min(100 + statements, 150) 🪙 | Required |
| Progress | `simulateCoinTopUp` | Action/POST | Development only: credit a Coin Shop package without payment | Required |
| Decks | `createMindmapNode` | Action/POST | Add a root to an owned deck | Required |
| Decks | `createKnowledgeItems` | Action/POST | Bulk import pasted statements (bullets / lines) into one root in a single insert | Required |
| Decks | `createKnowledgeItem` | Action/POST | Add a plain-text statement to a root | Required |
| Decks | `getDeckEditor` | Action | Owner-only roots + true statements for the editor | Required |
| Decks | `getDeckReader` | Action | Read-only roots + true statements of a public tree (or your own), for visitors | Optional |
| Decks | `updateDeck` | Action/POST | Owner edits title, description, species, visibility | Required |
| Decks | `updateMindmapNode` | Action/POST | Owner renames a root | Required |
| Decks | `deleteMindmapNode` | Action/POST | Owner deletes an empty root (the UI now uses `deleteRootBranch`) | Required |
| Decks | `deleteRootBranch` | Action/POST | Owner deletes a root with its sub-roots, statements and their progress | Required |
| Decks | `updateKnowledgeItem` | Action/POST | Owner edits a statement's text | Required |
| Decks | `deleteKnowledgeItem` | Action/POST | Owner deletes a statement and its progress | Required |
| Decks | `setTournamentOpen` | Action/POST | Owner opens or closes the tree's Mind Tournament (public trees only) | Required (owner) |
| Drill | `getTournamentSession` | Action | Mind Tournament round on someone else's public, hosting tree | Required (not the host) |
| Tournament | `submitTournamentAnswer` | Action/POST | Grade one tournament pick; isolated score, practice days, graduation | Required (not the host) |
| Tournament | `getTournamentBoards` | Action | Hall of Fame + Active Learners boards, and your own standing | Optional |
| Garden | `getFarmPlacements` | Action | A farm's placements: yours, or a neighbour's (items + public trees) | Optional |
| Garden | `placeFarmItem` | Action/POST | Plant one of your trees (free) or buy + place a Shop item on your farm | Required |
| Garden | `moveFarmPlacement` | Action/POST | Move one of your farm trees or items to another tile (free) | Required |
| Garden | `removeFarmPlacement` | Action/POST | Pick up one of your farm items (a tree goes back to the Shop, no refund) | Required |
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
// getCurrentUser(): data { id: string; email: string; createdAt: string; displayName: string | null } | null
//   (supabase.auth.getUser(), plus the player's own users.display_name)
```

### `updateDisplayName` (auth)
```typescript
// Input (UpdateDisplayNameDto): { displayName: string }
//   sanitized first: NFC, invisible/control characters and < > & " ' ` \ removed, spaces collapsed, trimmed;
//   then 2–30 characters (code points: "Nguyễn" is 6)
// data: { displayName: string /* as saved */ }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INTERNAL_ERROR
```
- Updates only the caller's own `users` row (the id comes from the session; RLS + column grant). `revalidatePath('/', 'layout')`, so the header, both tournament boards, Visited Gardens and the profile show the new name on the next render (`DisplayNameEditor` calls `router.refresh()`)
- Edited on `/profile` ("🏡 Garden Name") or with the ✏️ on your own row of a tournament board

### `getDisplayNames` (auth)
```typescript
// Input (GetDisplayNamesDto): { userIds: string[] /* uuid, max 200 */ }
// data: Record<userId, displayName>   // only gardeners who chose one; the page shows everyone else by pseudonym
// Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Through `get_display_names()` (DATABASE.md): players can't read each other's profiles. Missing migration → `{}`
- The public-name rule everywhere: `shared/lib/neighborName.ts` `publicName(displayName, userId)` = the chosen name, else the pseudonym (only when the name is null or blank)

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

### `getNeighborGarden` (decks)
```typescript
// Input: { ownerId: string /* uuid */; limit?: number }
// data: that gardener's PUBLIC decks only (never their private ones) · Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Read-only visitor mode on the farm (`/?visit=<ownerId>`), reached from the Visited Gardens drawer ("Visit 👣"). Visiting an island records no tree visits. Visiting yourself shows your own garden. **Strict read-only**: visitors can open a shared tree and read all its roots and statements (`getDeckReader`), but can't edit it or practise it (`FORBIDDEN_VISITOR_PRACTICE`). To practise, they clone it (`cloneDeck`)

### `getVisitedGardens` (decks)
```typescript
// Input: { limit?: number /* 1–100, default 50 */ }
// data: the shared trees the signed-in player has opened, newest visit first. Signed out → [].
Array<{ deckId: string; ownerId: string; title: string; slug: string; treeType: string;
        statementCount: number | null;   // null if the count couldn't be read (the tree is still listed)
        visitedAt: string }>
// Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Fills the farm's "🧭 Visited Gardens" left drawer, which replaced Community Gardens. The page groups the rows by gardener (`garden/lib/neighbors.ts` `groupVisitedGardens`: newest-visited garden first, own trees left out); neighbours get a friendly name derived from their id, because profiles aren't readable across players
- Only **public** trees of **other** gardeners (explicit filters + decks RLS on the join): a tree that went private again, or was deleted, drops out
- Reads `tree_visits` (DATABASE.md), statement counts via `listDeckItemIds`

### `recordTreeVisit` (decks)
```typescript
// Input (RecordTreeVisitDto): { deckId: string /* uuid */ }
// data: { recorded: boolean }   // false: unknown, private, or your own tree (nothing saved, not an error)
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INTERNAL_ERROR
```
- Called once by `TreeVisitTracker` (client, `useEffect` on mount) on `/deck/[slug]` when `countsAsVisit` holds: signed in, not the owner, tree public. Recording after mount means link prefetching never counts as a visit
- `record_tree_visit()` re-checks the same rule in the database and upserts `(user_id, deck_id)`: a repeat visit refreshes `visitedAt` (one row per tree). No `revalidatePath`: `/` is rendered per request, so the next farm load reads the drawer fresh (a browser back/forward may still show the cached farm)
- Visiting a whole island (`/?visit=<id>`) records nothing

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
// Input (CreateDeckDto): { title: string; description?: string; isPublic?: boolean; treeType?: 'oak' | 'pine' | 'birch' | 'cherry' | 'willow' | 'mystic' | 'palm' | 'citrus' | 'maple' | 'cactus' }
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
- **Price**: `min(100 + statements, 150)` 🪙 (`cloneCost`, `shared/lib/economy.ts`; the database computes the same with `least(100 + n, 150)`). The button shows it: `🌱 Clone to Garden (N 🪙)`
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

### `createKnowledgeItems` (decks)
```typescript
// Input (CreateKnowledgeItemsDto): { deckId: string; rootId: string; statements: string[] /* 1–100 */ }
//   each statement: cleaned (NFC, invisible characters removed, spaces collapsed, trimmed), then 5–500 chars, plain text (no \commands)
// data: { created: { id: string; statement: string; drillable: boolean }[]; skipped: number /* already in the root */ }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not the owner), NODE_NOT_FOUND (root not in this deck), INTERNAL_ERROR
```
- "📋 Bulk Add via Notes / Bullets" (`BulkStatementImporter`, in the Tree Workshop list and the root's ✏️ manage dialog): the client splits the paste with `lib/bulkStatements.ts` `parseBulletedText` (one statement per line; strips `- * +`, `• ‣ ⁃ – —`, `1.` `1)` `[1]` `(1)`; drops empty and < 5-character lines; de-duplicates) and shows a live preview, flagging lines that are too long, LaTeX, or already in the root
- One `INSERT` for all new rows, same defaults as `createKnowledgeItem` (`prompt` = root title, `trap_rules = { negate: true }`); statements already in the root are skipped, not duplicated. `drillable` counts the root's existing and newly imported statements as siblings
- `revalidatePath('/deck/<slug>')`, and the importer calls `router.refresh()`, so the mindmap and the lists show the new statements at once

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

### `setTournamentOpen` (decks)
```typescript
// Input (SetTournamentOpenDto): { deckId: string; isOpen: boolean }
// data: the updated deck (getDecks row shape, with isTournamentOpen)
// Errors: VALIDATION_FAILED (also: opening a private tree, "Share the tree with the community first"),
//         AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not the owner), DECK_NOT_FOUND, INTERNAL_ERROR
```
- Owner-only "🏆 Host Mind Tournament (Allow visitors to compete)" switch in the Tree Workshop (`TournamentHostToggle`). Closing keeps every result: the boards stay readable and graduates stay engraved; re-opening continues the same runs
- `revalidatePath('/deck/<slug>')`

### `getTournamentSession` (drill)
```typescript
// Input (GetTournamentSessionDto): { slug: string; rootId?: string /* uuid: one root and its sub-roots */; limit?: 5 | 10 | 20 /* round size; anything else → 10 */ }
// data: a DrillSession with mode: 'tournament' (same shape as getDrillSession; focus = the root when rootId is set; includeMastered false)
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (you host it), TOURNAMENT_CLOSED (private tree, or not hosting),
//         TOURNAMENT_GRADUATED, DECK_NOT_FOUND, NODE_NOT_FOUND (rootId not in this tree), DRILL_NO_ITEMS, DRILL_ALL_MASTERED, INTERNAL_ERROR
```
- The one exception to strict read-only visitor mode: a signed-in visitor drills someone else's **public** tree while its owner hosts a tournament (`shared/lib/visitor.ts` `tournamentAccess`). Page: `/deck/[slug]/tournament`
- Built by `buildTournamentSession` (= `buildDrillSession` in tournament mode): the whole tree, or one root and its sub-roots (`?rootId=`); the contestant's **tournament** levels (`tournament/server` `fetchTournamentLevels`, never `user_progress`) rest 5/5 statements; review mode doesn't apply

### `submitTournamentAnswer` (tournament)
```typescript
// Input (SubmitTournamentAnswerDto): { deckId: string; itemId: string; seed: string; tag: 'A' | 'B' | 'C'; timeZone?: string }
// data
{ isCorrect: boolean; correctTag: 'A' | 'B' | 'C';
  masteryLevel: 0–5; previousMasteryLevel: 0–5;          // this statement's TOURNAMENT level
  currentPoints: number; maxPoints: number;              // Σ levels / 5 × N (N = drillable statements)
  masteryPercentage: number | null;                      // 2 decimals; null without drillable statements
  daysCount: number;                                     // distinct local practice days on this tree
  isGraduated: boolean; justGraduated: boolean }         // justGraduated: this answer completed the tree
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (the host), TOURNAMENT_CLOSED,
//         TOURNAMENT_GRADUATED, DECK_NOT_FOUND, ITEM_NOT_FOUND (not a drillable statement of this tree), INTERNAL_ERROR
```
- **Grading** on the server, exactly like `submitDrillResult` (re-run the trap engine with the seed and the node's siblings); then `record_tournament_answer` (service role) applies ±1, counts a new local day once, recomputes points over the tree's current drillable statements and graduates at 100% (DATABASE.md "Mind Tournament")
- **Isolated**: never writes `user_progress`, `practice_days` (streak) or coins. A graduate's run is frozen (`TOURNAMENT_GRADUATED`)
- The drill overlay shows the score after each round and a "🎓 Tree Mastered!" dialog with confetti on `justGraduated`

### `getTournamentBoards` (tournament)
```typescript
// Input: { deckId: string }
// data
{ levels: Record<string, number>;   // the viewer's tournament level per statement ({} if signed out / not joined)
  hallOfFame: { rank; userId; name; maxPoints; daysCount; graduatedAt }[];            // 📜 Hall of Fame: days ASC, graduatedAt ASC
  active: { rank; userId; name; currentPoints; maxPoints; masteryPercentage; daysCount; updatedAt }[];  // 🌱 Active Learners: % DESC, days ASC, updatedAt ASC (top 50)
  standing: { currentPoints; maxPoints; masteryPercentage; daysCount; isGraduated; graduatedAt; rank: number | null } | null }  // the signed-in viewer's own run and place (null past the top 50)
// Errors: VALIDATION_FAILED, INTERNAL_ERROR
```
- Auth optional; rows only for a readable tree (public, or your own), also after the host closed the tournament
- `name` = the contestant's chosen Garden Name (`users.display_name`), else the app-wide pseudonym (`shared/lib/neighborName` `publicName`). Emails and private full names are never returned
- Before migration `20260928000900` the board functions don't exist: empty boards (logged)

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
// Input (GetDrillSessionDto): { slug: string } | { deckId: string }, plus nodeId?: string, limit?: 5 | 10 | 20 /* round size; missing or anything else → 10, never an error */,
//        includeMastered?: boolean /* default false; the page passes ?review=1 */
// nodeId: only items of that root and all its sub-roots (the page passes ?rootId=; the older ?nodeId= still works)
// includeMastered: review mode: mix the player's 5/5 items back in (normally they rest)
// data
{ deck: { id: string; slug: string; title: string; treeType: string };
  mode: 'practice' | 'tournament';           // 'tournament' only from getTournamentSession
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
- **Order**: items shuffled with `seededRandom(sessionId)`, then lowest mastery first (`lib/queue.ts` `orderByMastery`, stable, so ties keep the shuffle), then cut to `limit`. A queue shorter than `limit` gives a shorter round (no error)
- **Round size** (`lib/drillSize.ts`): 5, 10 (default) or 20. Pages read `?limit=` (`/deck/[slug]/drill?limit=5`, `/deck/[slug]/tournament?limit=20`), else the `mindgarden_drill_size` cookie the selector saves, else 10. `SessionLaunchModal` / `DrillSizeSelector` pick it before a round; sizes the scope can't fill are disabled or badged "only N"
- **Launch pop-up** (drill's `SessionLaunchModal` via `SessionLaunchProvider` / `SessionLaunchButton` / `useSessionLaunch`, pure plan `lib/sessionLaunch.ts` `planLaunch`): every start on the deck page opens it first, in both modes and both scopes. "💧 Water Tree" / "🌿 Review Mastered" / "⚔️ Join Mind Tournament" (whole tree) and "Drill Root" / "⚔️ Compete Root" (mindmap statement cards, the root inspector, the visitor's tree list). It shows "[Water Tree 🌱 / Review 🌿 / Compete ⚔️] - [Whole Tree / Root: name]", the questions available in that scope (drillable statements minus the mode's 5/5 ones, the owner's mastery for watering, the contestant's tournament levels for competing), the 5 / 10 / 20 selector, and "Start Session" → `/deck/[slug]/drill?limit=…(&rootId=…)` or `/deck/[slug]/tournament?limit=…(&rootId=…)`. Both pages render the same header (`DrillRoundHeader`) and runner (`DrillOverlay`); only where answers are saved differs
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

### `updateMindmapNode` / `updateKnowledgeItem` / `deleteMindmapNode` / `deleteKnowledgeItem` / `deleteRootBranch` (decks)
```typescript
// updateMindmapNode({ nodeId, title /* 1–150 */ })  → { id, title }
// updateKnowledgeItem({ deckId, itemId, text })    → { id, statement, drillable }
//   text cleaned like a bulk import (NFC, single spaces, trimmed), then 5–500 chars of plain text; updates
//   knowledge_items.correct_stmt (RETURNING id only), keeps trap_rules and players' progress, revalidates /deck/<slug>
// deleteMindmapNode({ nodeId })                    → { id }   only when the root has no statements and no sub-roots
// deleteKnowledgeItem({ deckId, itemId })          → { id }   everyone's user_progress + deck_tournament_item_progress on it cascade away
// deleteRootBranch({ deckId, rootId })             → { rootId, deletedStatements, deletedSubRoots }
//   one DELETE of the root row; the database cascades sub-roots (parent FK), their knowledge_items, and
//   every user_progress / deck_tournament_item_progress row on those items
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, NODE_NOT_FOUND (root not in this deck),
//         ITEM_NOT_FOUND (statement not in this deck), NODE_NOT_EMPTY (deleteMindmapNode only), INTERNAL_ERROR
```
- Owner check first (`AUTH_FORBIDDEN`), then RLS as the final guard (a delete that touches 0 rows is `AUTH_FORBIDDEN` too). The deletes revalidate `/deck/<slug>`
- **Edit** (✏️): `EditStatementDialog` (textarea, live 5–500 counter, Save / Cancel) and `EditRootDialog` (rename via `updateMindmapNode`). The owner's ✏️ Edit / 🗑️ Delete sit in a **hover-to-reveal** group (`shared/components/game` `HoverActions`: hidden until hover or keyboard focus, always shown on touch screens) on mindmap root pills and statement cards, Tree Workshop rows, the root drawer's statements and the manage dialog's statements
- UI (owner only, never rendered for visitors or contestants): 🗑️ on each statement and "🗑️ Delete Root" in the Tree Workshop list, the root drawer and the ✏️ manage dialog, each behind a confirmation ("Delete Statement"; "Delete Root Branch" with the number of statements and sub-roots it removes). A deleted root open in the drawer / manage dialog closes on the refresh
- ⚠️ Mind Tournament totals: a contestant's stored `current_points` / `max_points` are recomputed on their next answer, so the boards show the old totals for them until then

### `deleteDeck` (decks)
```typescript
// deleteDeck({ deckId }) → on success: revalidatePath('/', '/deck/<slug>', '/profile') then redirect('/'), or '/?refund=N'
//                          when a Woodshop paid N coins back (the farm shows "🪚 Woodshop refund: +N 🪙")
//                        → on failure: { success: false, error }
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not the owner, or RLS deleted 0 rows), DECK_NOT_FOUND, INTERNAL_ERROR
```
- Chops through `uproot_deck()` (DATABASE.md "Farm Grid"): deletes the deck and, with a Woodshop on the farm, refunds `least(floor(statements × 0.25), 50)` 🪙 in the same transaction. Before migration `20260930000000` it falls back to one `DELETE FROM decks … RETURNING id` (no refund). `mindmap_nodes`, `knowledge_items`, `user_progress` and the tree's farm tile go with it via `ON DELETE CASCADE` (DATABASE.md). Gardener XP is derived from progress, so it drops accordingly. 🪙 gold already earned is kept (`users.coins` is a stored balance)
- Success redirects instead of returning: `revalidatePath` would re-render the current route, and `/deck/<slug>` is gone. The client sees Next's redirect signal (`DeleteDeckDialog` shows the farewell toast, then rethrows it via `unstable_rethrow`)
- UI: `DeleteDeckDialog` (type the tree's name to confirm, `matchesTreeName`), from the Tree Workshop's Danger Zone and the owner's 🗑 badge in the farm plot popup

### `getFarmPlacements` / `placeFarmItem` / `moveFarmPlacement` / `removeFarmPlacement` (garden)
```typescript
// getFarmPlacements({ ownerId?: uuid }) → Placement[]   // { id, itemType, deckId, x, y, width, height, variant }
//   yours without ownerId (signed out → []); a neighbour's: their items and PUBLIC trees only (RLS)
// placeFarmItem({ item: 'tree', deckId, x, y } | { item: 'farmer_house' | 'woodshop' | 'stream' | 'fence' | 'rockery' | 'cow' | 'pig', x, y })
//   → { placementId, remainingCoins, cost }   x, y = top tile, 0–15
//   Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INSUFFICIENT_COINS, TILE_UNAVAILABLE, DECK_NOT_FOUND, INTERNAL_ERROR
// moveFarmPlacement({ placementId, x, y }) → { id, x, y }   x, y = new top tile, 0–15; same footprint, no coins
//   Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not yours), TILE_UNAVAILABLE (taken / off the grid), INTERNAL_ERROR
// removeFarmPlacement({ placementId }) → { id }   Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not yours), INTERNAL_ERROR
```
- `placeFarmItem` calls `purchase_and_place_item()`: the database charges its own catalogue price (no price or size is sent), refuses overlaps / off-grid tiles, and inserts in one transaction. Trees are free. No `revalidatePath` (in a Server Action it re-renders the whole farm page before answering, which took seconds): the farm shows the item optimistically and the page is dynamic, so the next visit is fresh; the farm pushes `remainingCoins` into `CoinsProvider`
- `moveFarmPlacement` calls `move_garden_placement()` (migration 14): the caller's own placement only, the whole footprint on the grid and clear of every other placement (the moved one aside), under the same row lock as purchases. No `revalidatePath` (the farm applies the move optimistically). Buffs and stream / fence auto-tiling follow from the new tiles; nothing else is stored
- `removeFarmPlacement`: no refund, no `revalidatePath` (optimistic on the farm). A tree goes back to the Shop's Trees tab unchanged (its deck and progress stay); only chopping pays the Woodshop refund
- UI (`garden`): the farm's 🏪 Shop (`FarmShopModal`, tabs 🌳 Trees · 🏗️ Structures · 🌊 Landscape · 🪵 Decorations · 🐮 Animals) → placement mode on `FarmIsometricGrid` (green / red ghost; click to place, tap twice on touch; Esc, right-click or Cancel leaves without paying)

### `getFarmHud` (progress)
```typescript
// Input: none
// data: { level: { level; title; xp; xpIntoLevel; xpForNextLevel; progress /* 0–1 */ };
//         streak: { current; best; practicedToday; lastDay };
//         coins: number; coinsAsOf: number } | null                      // null when signed out
```
- XP = 10 × Σ `mastery_level` over all of the player's `user_progress` rows; level L → L + 1 costs 50 + 25 × (L − 1)
- Coins = the stored 🪙 gold balance `users.coins` (starts at 300; +1 per item mastered for the first time; −100 per seed, −min(100 + statements, 150) per clone; 0 if the coins migration hasn't run). `coinsAsOf` = when it was read (epoch ms), so the HUD keeps the newer of this and a live value from an action. Coins are the only currency: the HUD shows 🔥 streak and 🪙 coins (no gems)

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
        itemCount: number; items: { itemId: string; masteryLevel: 0 | 1 | 2 | 3 | 4 | 5 }[];
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
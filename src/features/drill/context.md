# drill

Practice rounds: builds questions with the trap engine and grades answers. Owns no tables.

## Owned tables
None. Reads items through `@/features/decks/server`.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `getDrillSession({ slug } \| { deckId }, nodeId?, limit?, includeMastered?)` | Server Action → `ActionResult<DrillSession>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `NODE_NOT_FOUND`, `DRILL_NO_ITEMS`, `DRILL_ALL_MASTERED`, `FORBIDDEN_VISITOR_PRACTICE`. Auth: owner only (strict read-only visitor mode: `services/drillSession.ts` refuses anyone but the deck's owner, signed out included, via `shared/lib/visitor.ts` `canPractice`, before building questions). `nodeId` limits the round to that root and its sub-roots (`lib/branch.ts` `collectBranch`); the session carries `focus`. Signed in: 5/5 items rest unless `includeMastered` (`lib/queue.ts` `selectPracticeItems`, levels via `progress/server` `fetchMasteryLevels`); the session carries `masteredCount` and `includeMastered` |
| `getTournamentSession({ slug, limit? })` | Server Action → `ActionResult<DrillSession>` with `mode: 'tournament'`. Auth Required, never the host. The Mind Tournament exception to strict visitor mode: `buildDrillSession(..., { mode: 'tournament' })` checks `shared/lib/visitor.ts` `tournamentAccess` (public + hosting + not the owner → else `TOURNAMENT_CLOSED` / `AUTH_FORBIDDEN` / `AUTH_UNAUTHORIZED`), rests statements the contestant has at 5/5 in the **tournament** (`tournament/server` `fetchTournamentLevels`), never mixes mastered items back in, and answers `TOURNAMENT_GRADUATED` for a graduate. Page: `/deck/[slug]/tournament` |
| `SessionLaunchProvider({ context, children })`, `SessionLaunchButton({ label, rootId?, review?, tone?, size? })`, `useSessionLaunch()`, `SessionLaunchModal({ plan, onOpenChange })` | Client. One launch pop-up per tree page, opened by any start: whole tree (`SessionLaunchButton`) or one root (`useSessionLaunch().open({ rootId })`, wired by the page to the mindmap's `onPractice` and the reader's `rootAction`). Title "[Water Tree 🌱 / Review 🌿 / Compete ⚔️] - [Whole Tree / Root: name]", available-questions badge, `DrillSizeSelector`, "Start Session" → the round URL. `context` = `{ mode: 'drill' \| 'compete', slug, nodes, items, levels }` (`launchPool(tree, drillable)` builds nodes/items); the plan is pure (`lib/sessionLaunch.ts` `planLaunch`) |
| `DrillRoundHeader({ mode, title, focus, wholeTreeHref?, reviewing?, children? })` | Server-safe. The same header on `/drill` and `/tournament`: mode label, title, "Branch: …" ribbon + whole-tree link, then the mode's extras |
| `DrillSizeSelector({ value, onChange, available })` | Client. "Questions per round": tactile wooden radio pills `5 💧` / `10 💧 (Default)` / `20 💧`. The choice is remembered in localStorage `mindgarden_drill_size` and mirrored into a cookie of the same name (`lib/drillSizeStore.ts`, `useSyncExternalStore`), so round pages opened from any link use it. Sizes the tree can't fill: `drillSizeOptions(available)` disables those above the first size that covers everything and badges that one "only N". Used inside the launch pop-up |
| `buildTournamentSession` (server, `services/drillSession.ts`) | `buildDrillSession` in tournament mode: whole tree, or one root (`nodeId` from `?rootId=`); used by `getTournamentSession({ slug, rootId?, limit? })` |
| `rootParam(rootId, nodeId)` | Pure: a round page's root from `?rootId=` (or the older `?nodeId=`) |
| `normalizeDrillSize`, `resolveDrillSize(param, saved)`, `drillSizeOptions`, `effectiveDrillSize`, `withDrillSize(href, size)`, `DRILL_SIZES`, `DEFAULT_DRILL_SIZE` (10), `DRILL_SIZE_KEY`, `tournamentHref(slug, { rootId?, limit? })`; `drillHref(slug, { rootId?, review?, limit? })` | Pure round-size helpers (`lib/drillSize.ts`, `lib/drillHref.ts`). `drillHref` also takes `limit` |
| `ReviewModeToggle({ on, href, masteredCount })` | "🌿 Include Mastered Items (Review Mode)" switch (a link, so the mode lives in `?review=1`) |
| `drillHref(slug, { nodeId?, review? })`, `isReviewParam(v)` | Pure URL helpers for rounds and review mode (`lib/drillHref.ts`) |
| `checkDrillAnswer({ itemId, seed, tag })` | Server Action → `ActionResult<DrillAnswer>`. Grades via `progress/server`, saves nothing. Auth: owner only (`FORBIDDEN_VISITOR_PRACTICE` otherwise) |
| `DrillOverlay({ session, isSignedIn })` | Client. The "Watering Session": round gauge, `WateringScene` (can pours on the roots after each answer; roots glow gold or amber), question plaque, tactile choice slabs with `[1] [2] [3]` key chips → feedback (gold / amber + `MutationHighlight`, 3-notch mastery gauge and a `ParticleBurst` on level-up when saved) → trophy summary, confetti if any root grew |
| types | `DrillSession` (with `mode: 'practice' \| 'tournament'`; `deck` carries only id, slug, title, treeType), `DrillQuestion`, `DrillAnswer`, `DrillChoice`, `DrillTag` |

## Internals
- `services/drillSession.ts`: seed per item = `drillSeed(itemId, sessionId)`, passes the node's other statements as `siblings`, skips `INSUFFICIENT_MUTATIONS`, shuffles with `seededRandom(sessionId)`, then `orderByMastery` (lowest level first, ties keep the shuffle), then cuts to the round size (5 / 10 / 20; a smaller queue gives a shorter round). The overlay header reads "Question 3 / 10"
- `hooks/useDrillSession.ts`: signed in → `progress.submitDrillResult` (saves, sends the browser timezone, pushes `streakCount` into `shared/stores/StreakProvider` and `totalCoins` into `shared/stores/CoinsProvider` so the header badge and farm HUD update without a reload; sums `coinsEarned` into the round stats for the "+X 🪙 Gold Earned!" trophy plaque with a gold `ParticleBurst`); signed out or session expired → `checkDrillAnswer` + open the login dialog. `answering → checking → feedback → … → done`, `error` with retry
- Tournament rounds (`session.mode === 'tournament'`): `useDrillSession(questions, isSignedIn, { deckId })` sends every pick to `tournament.submitTournamentAnswer` (never `submitDrillResult`), exposes the latest `standing`; `DrillOverlay` shows the tournament score (mastery %, points, "X practice days") in the summary, "⚔️ Next round" / "📜 Leaderboard", and a "🎓 Tree Mastered!" dialog with confetti when `justGraduated`
- `LoadLevels(itemIds, deckId)`: practice passes the owner's `user_progress` levels, tournament the contestant's tournament levels
- `lib/drillSeed.ts`, `lib/splitMutation.ts` (changed-words span for highlights), `lib/masteryChange.ts` (`leveledUp`, `becameMighty`: round stats and celebrations)
- Keyboard: `lib/shortcuts.ts` `shortcutFor` (pure) + `hooks/useDrillShortcuts.ts`: `1`/`2`/`3` or `A`/`B`/`C` answer (no `C` on 2-choice), `Enter`/`Space` go to the next question during feedback. Ignored while typing, with Ctrl/Cmd/Alt, on key repeat, while the login dialog is open, and for Enter/Space on a focused button (it clicks itself). Choices show a `KeyChip` (hidden below `sm`) and `aria-keyshortcuts`
- Tests: `__tests__/trapEngine.test.ts`, `__tests__/siblingSwaps.test.ts` (engine in `shared/lib`), `__tests__/drillHelpers.test.ts`, `__tests__/branch.test.ts`, `__tests__/shortcuts.test.ts`, `__tests__/masteryChange.test.ts`, `__tests__/queue.test.ts` (normal vs review queue, fully cultivated), `__tests__/tournamentSession.test.ts` (tournament guard, tournament levels, practice still owner-only), `__tests__/sessionLaunch.test.ts` (`buildTournamentSession` with / without `rootId`, `rootParam`, `launchPool`, `planLaunch` for every trigger and both modes), `__tests__/drillSize.test.ts` (size parsing and defaults, selector options, URLs, slicing to 5 / 10 / 20, small pools, lowest-mastery-first, tournament rounds)

## Rules
- The client never receives `correctStmt` or `correctTag` before answering
- Only the deck's owner practises it (the one exception: a Mind Tournament round, scored separately). Visitors get `FORBIDDEN_VISITOR_PRACTICE` ("You must clone this tree to your garden to practice it!"); the drill page shows it with decks' `CloneTreeButton`. A clone has no progress rows, so it practises from 0/5 (`__tests__/queue.test.ts`)
- Questions have 3 choices (A/B/C), or 2 (A/B) when the engine finds only one trap; items with no trap are skipped (`skippedCount`)
- No hearts, lives or timers. Correct = gold, wrong = amber

## Not built yet
`getDrillQuestion` (superseded by `getDrillSession({ nodeId })`)

## May import
`@/shared/*` (mastery scale: `shared/lib/mastery.ts`), `@/features/decks/server`, `@/features/progress` (actions, DTO), `@/features/progress/server` (`gradeSubmission`, `fetchMasteryLevels`), `@/features/tournament` (`submitTournamentAnswer`, `formatPracticeDays`, types), `@/features/tournament/server` (`fetchTournamentLevels`, `findStanding`)

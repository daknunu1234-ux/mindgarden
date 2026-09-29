# tournament

Mind Tournament: a tree's owner hosts a mastery race on a shared tree; signed-in visitors compete with an
**isolated** score. Ranking: 📜 Hall of Fame (graduates, fewest practice days first) and 🌱 Active
Learners (learners, mastery % then fewer days). Rules and schema: DATABASE.md "Mind Tournament Feature".

## Owned tables
`deck_tournament_participants`, `deck_tournament_item_progress` (migration `20260928000900_mind_tournament.sql`).
The hosting switch `decks.is_tournament_open` belongs to decks (`setTournamentOpen`).

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `submitTournamentAnswer({ deckId, itemId, seed, tag, timeZone? })` | Server Action, Auth Required, never the host → `ActionResult<TournamentAnswer>`. `services/answers.ts` `recordTournamentAnswer`: loads the tree with the player's client (`decks/server` `listDrillItems`), checks `shared/lib/visitor.ts` `tournamentAccess`, grades with the trap engine (same seed + node siblings as the round), then calls `record_tournament_answer()` with the **service role** (allow-listed in `decks/__tests__/answerSecrecy.test.ts`): ±1 on the statement, a new local day counted once, points over the current drillable statements, graduation at 100%. Never touches `user_progress`, `practice_days` or coins |
| `index.ts` | `getTournamentBoards({ deckId })` | Server Action, Auth Optional → `TournamentBoardsView`: `hallOfFame`, `active`, `standing` (with its `rank`, from `lib/scoring.ts` `standingRank`) and `levels` (the viewer's tournament level per statement: the deck page's compete launcher counts what's left, and the mindmap shows them) via the two board RPCs (`services/boards.ts`) and `fetchTournamentLevels`. The drill runner calls it at the end of a round to show the contestant's rank. Names = the chosen Garden Name (`users.display_name`) or the `shared/lib/neighborName` pseudonym, never emails or full names. `TournamentBoard` takes `viewerAction` (the page passes auth's ✏️ `DisplayNameEditor`), shown in your own row on both tabs. Missing migration → empty boards (logged) |
| `index.ts` | `TournamentBoard({ active, hallOfFame, viewerId?, standing?, limit? })` | Client. Two wooden tabs "📜 Hall of Fame" / "🌱 Active Learners": rank (🥇🥈🥉, then #n), name, mastery % and "X practice days"; highlights the viewer; opens on the Hall of Fame when it has names |
| `index.ts` | `TournamentLiveBadge()` | Server-safe golden plaque "🏆 Mind Tournament is Live!" |
| `index.ts` | `maxPoints`, `masteryPercentage`, `isGraduation`, `nextPracticeDays`, `compareActive`, `compareHallOfFame`, `contestantName`, `formatPracticeDays`, `rankBadge` | Pure rules (`lib/scoring.ts`), mirrored by the SQL |
| `index.ts` | types `TournamentAnswer`, `TournamentBoards`, `ActiveBoardRow`, `HallOfFameRow`, `TournamentStanding` | |
| `server.ts` | `fetchTournamentLevels(supabase, userId, deckId)` | The contestant's tournament level per statement (own rows, RLS). Drill uses it to rest 5/5 statements in a tournament round |
| `server.ts` | `findStanding(supabase, userId, deckId)` | The contestant's own row (or null) |

## Rules
- Only a signed-in visitor on a **public** tree whose owner hosts a tournament competes; the host never does (`AUTH_FORBIDDEN`); anything else is `TOURNAMENT_CLOSED`
- Scores are never posted by the client: the server grades, and only the service role writes the tables (players have SELECT on their own rows)
- N = drillable statements, so 100% is always reachable; graduation is permanent and freezes the run (`TOURNAMENT_GRADUATED`)
- Practice days are the contestant's local calendar days (`shared/lib/localDay.ts`), counted once per day
- Known limits (documented in DATABASE.md): visitors can read a shared tree's statements, and one long sitting can graduate in 1 day

## Tests
`__tests__/tournament.test.ts`: formula (25/50 = 50.00%), practice-day counting, both board orders, access guard, the service against an in-memory `record_tournament_answer` (server grading, ±1, days per calendar day incl. timezone, automatic graduation + freeze, host/closed/private refused, **no** `user_progress` / `practice_days` / `users` access), and the migration's SQL. Host switch: `decks/__tests__/tournamentHost.test.ts`. Round guard: `drill/__tests__/tournamentSession.test.ts`.

## May import
`@/shared/*`, `@/features/decks/server` (`listDrillItems`)

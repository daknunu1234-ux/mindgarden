# progress

Per-player mastery for knowledge items.

## Owned tables
`user_progress`, `practice_days`, and `users.streak_count` / `users.last_active_at` (written with the admin client)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `submitDrillResult({ itemId, seed, tag })` | Server Action. Auth: Required. Grades on the server, upserts `user_progress` → `DrillResult { isCorrect, correctTag, masteryLevel, previousMasteryLevel, mistakeCount }`. Errors: `VALIDATION_FAILED`, `AUTH_UNAUTHORIZED`, `ITEM_NOT_FOUND`, `INTERNAL_ERROR` |
| `index.ts` | `getProgressByDecks({ deckIds })` | Server Action. Auth: Optional. 1–50 ids → `DeckProgress[] { deckId, masteryPercent, itemCount, items: { itemId, masteryLevel }[] }`, zeros when signed out. Errors: `VALIDATION_FAILED`, `INTERNAL_ERROR` |
| `index.ts` | `getGardenStats()` | Server Action. Auth: Required. Totals over owned trees: `treeCount`, `itemCount`, `mightyRootCount`, `masteryPercent`, `trees[]` (pure `lib/gardenStats.ts` `summarizeGarden`) |
| `index.ts` | `getFarmHud()` | Server Action. Auth: Optional. `FarmHud { level: GardenerLevel, streak, coins }` or null (coins = stored 🪙 balance `users.coins`, `services/coins.ts` `readCoins`) (`lib/gardenerLevel.ts`, `services/farmHud.ts`) |
| `index.ts` | `getStreak()` | Server Action. Auth: Optional. `Streaks { current, best, practicedToday, lastDay }` or null |
| `index.ts` | `StreakBadge` | Client. Header badge "🔥 N days" / "🌱 N days" (not yet today) from `shared/stores/StreakProvider`; hidden at 0 |
| `index.ts` | `STREAK_MILESTONES`, `streakMilestone`, `nextStreakMilestone`, `type Streaks` | Pure (`lib/streak.ts`, with `computeStreaks`; `localDay` / `resolveTimeZone` now live in `shared/lib/localDay.ts` and are re-exported, since the Mind Tournament counts practice days the same way) |
| `index.ts` | `type GardenStats`, `GardenStatsWithStreak`, `GardenTree` | |
| `index.ts` | `type DeckProgress` | Pure summary in `lib/deckProgress.ts` (`summarizeDeckProgress`) |
| `index.ts` | `DrillSubmissionDto` | Zod `{ itemId, seed, tag }`, also used by drill's `checkDrillAnswer` |
| `index.ts` | `nextMastery`, `MASTERY_NAMES`, `MAX_MASTERY`, types | Pure rules: correct +1 (max 5), wrong −1 (min 0; 5/5 → 4/5 too) and `mistake_count + 1`. The scale (`MAX_MASTERY = 5`, names, `isMastered`) lives in `shared/lib/mastery.ts` and is re-exported here |
| `server.ts` | `gradeSubmission`, `fetchMasteryLevels` | For drill: grading, and the player's levels to rest 5/5 items |
| `server.ts` | `gradeSubmission(supabase, submission, viewerId)` | Re-runs `generateTraps` with the seed; shared with drill. Owner only: anyone else (or `viewerId = null`) gets `FORBIDDEN_VISITOR_PRACTICE`, so `submitDrillResult` saves no progress, streak or coin on someone else's tree (`__tests__/visitorGrading.test.ts`) |

## Notes
- `services/levels.ts` `fetchMasteryLevels` is the one chunked `user_progress` read, shared by both stats actions
- Read-then-upsert is not atomic; move to a `SECURITY DEFINER` RPC before leaderboards (DATABASE.md)
- An upsert FK error (23503) means the player has no `public.users` row: check the `handle_new_user` trigger

## Streaks
- `services/streak.ts`: `recordPracticeDay` (called by `recordDrillResult` after every saved answer) and `loadStreaks`. Writes use the service role (allow-listed in `decks/__tests__/answerSecrecy.test.ts`); a failure is logged and `streakCount` is `null`, the answer still saves
- Needs migration `supabase/migrations/20260928000200_practice_days.sql`; without it the log says so and streaks read as 0
- 🪙 Gold: `lib/coins.ts` `shouldAwardMasteryCoin` (pure: at 5/5 and unpaid) + `services/coins.ts` (`awardMasteryCoin` calls `award_mastery_coin` with the service role, allow-listed in `answerSecrecy.test.ts`; `readCoins` reads the balance with the user client). `recordDrillResult` returns `coinsEarned` / `totalCoins`; once per item ever. Needs migration `20260928000300_user_coins.sql`. Before it, answers still save and coins stay 0 (the log says which migration to run). Tests: `__tests__/coins.test.ts`
- 🛒 `simulateCoinTopUp({ packageId })` (index.ts): development-only Coin Shop top-up (`lib/devMode.ts` `isDevTopUpAllowed`: off when `NODE_ENV = production`), via `services/coins.ts` `grantDevCoins` → `dev_grant_coins` (service role). Needs migration `20260928000500_seed_economy.sql`. Tests: `__tests__/coinTopUp.test.ts`
- `getFarmHud` also returns `coinsAsOf` (epoch ms) so pages can tell the server's balance from newer live ones (`shared/stores/CoinsProvider` `useDisplayedCoins`)

## May import
`@/shared/*`, `@/features/decks/server`

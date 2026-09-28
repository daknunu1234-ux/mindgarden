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
| `index.ts` | `getFarmHud()` | Server Action. Auth: Optional. `FarmHud { level: GardenerLevel, streak, coins }` or null (coins = 5 per mastery step, `coinsFromLevels`) (`lib/gardenerLevel.ts`, `services/farmHud.ts`) |
| `index.ts` | `getStreak()` | Server Action. Auth: Optional. `Streaks { current, best, practicedToday, lastDay }` or null |
| `index.ts` | `StreakBadge` | Client. Header badge "🔥 N days" / "🌱 N days" (not yet today) from `shared/stores/StreakProvider`; hidden at 0 |
| `index.ts` | `STREAK_MILESTONES`, `streakMilestone`, `nextStreakMilestone`, `type Streaks` | Pure (`lib/streak.ts`, with `computeStreaks`, `localDay`, `resolveTimeZone`) |
| `index.ts` | `type GardenStats`, `GardenStatsWithStreak`, `GardenTree` | |
| `index.ts` | `type DeckProgress` | Pure summary in `lib/deckProgress.ts` (`summarizeDeckProgress`) |
| `index.ts` | `DrillSubmissionDto` | Zod `{ itemId, seed, tag }`, also used by drill's `checkDrillAnswer` |
| `index.ts` | `nextMastery`, `MASTERY_NAMES`, `MAX_MASTERY`, types | Pure rules: correct +1 (max 3), wrong −1 (min 0) and `mistake_count + 1` |
| `server.ts` | `gradeSubmission(supabase, submission)` | Re-runs `generateTraps` with the seed; shared with drill |

## Notes
- `services/levels.ts` `fetchMasteryLevels` is the one chunked `user_progress` read, shared by both stats actions
- Read-then-upsert is not atomic; move to a `SECURITY DEFINER` RPC before leaderboards (DATABASE.md)
- An upsert FK error (23503) means the player has no `public.users` row: check the `handle_new_user` trigger

## Streaks
- `services/streak.ts`: `recordPracticeDay` (called by `recordDrillResult` after every saved answer) and `loadStreaks`. Writes use the service role (allow-listed in `decks/__tests__/answerSecrecy.test.ts`); a failure is logged and `streakCount` is `null`, the answer still saves
- Needs migration `supabase/migrations/20260928000200_practice_days.sql`; without it the log says so and streaks read as 0

## May import
`@/shared/*`, `@/features/decks/server`

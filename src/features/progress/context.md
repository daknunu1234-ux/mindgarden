# progress

Per-player mastery for knowledge items.

## Owned tables
`user_progress` (later also `users.streak_count`, `users.last_active_at` via the admin client)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `submitDrillResult({ itemId, seed, tag })` | Server Action. Auth: Required. Grades on the server, upserts `user_progress` → `DrillResult { isCorrect, correctTag, masteryLevel, previousMasteryLevel, mistakeCount }`. Errors: `VALIDATION_FAILED`, `AUTH_UNAUTHORIZED`, `ITEM_NOT_FOUND`, `INTERNAL_ERROR` |
| `index.ts` | `getProgressByDecks({ deckIds })` | Server Action. Auth: Optional. 1–50 ids → `DeckProgress[] { deckId, masteryPercent, itemCount, items: { itemId, masteryLevel }[] }`, zeros when signed out. Errors: `VALIDATION_FAILED`, `INTERNAL_ERROR` |
| `index.ts` | `getGardenStats()` | Server Action. Auth: Required. Totals over owned trees: `treeCount`, `itemCount`, `mightyRootCount`, `masteryPercent`, `trees[]` (pure `lib/gardenStats.ts` `summarizeGarden`) |
| `index.ts` | `type GardenStats`, `GardenTree` | |
| `index.ts` | `type DeckProgress` | Pure summary in `lib/deckProgress.ts` (`summarizeDeckProgress`) |
| `index.ts` | `DrillSubmissionDto` | Zod `{ itemId, seed, tag }`, also used by drill's `checkDrillAnswer` |
| `index.ts` | `nextMastery`, `MASTERY_NAMES`, `MAX_MASTERY`, types | Pure rules: correct +1 (max 3), wrong −1 (min 0) and `mistake_count + 1` |
| `server.ts` | `gradeSubmission(supabase, submission)` | Re-runs `generateTraps` with the seed; shared with drill |

## Notes
- `services/levels.ts` `fetchMasteryLevels` is the one chunked `user_progress` read, shared by both stats actions
- Read-then-upsert is not atomic; move to a `SECURITY DEFINER` RPC before leaderboards (DATABASE.md)
- An upsert FK error (23503) means the player has no `public.users` row: check the `handle_new_user` trigger

## Not built yet
Daily streak (needs `SUPABASE_SERVICE_ROLE_KEY` + `shared/lib/supabase/admin.ts`)

## May import
`@/shared/*`, `@/features/decks/server`

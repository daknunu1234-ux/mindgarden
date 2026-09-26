# progress

Per-player mastery for knowledge items.

## Owned tables
`user_progress` (later also `users.streak_count`, `users.last_active_at` via the admin client)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `submitDrillResult({ itemId, seed, tag })` | Server Action. Auth: Required. Grades on the server, upserts `user_progress` → `DrillResult { isCorrect, correctTag, masteryLevel, previousMasteryLevel, mistakeCount }`. Errors: `VALIDATION_FAILED`, `AUTH_UNAUTHORIZED`, `ITEM_NOT_FOUND`, `INTERNAL_ERROR` |
| `index.ts` | `DrillSubmissionDto` | Zod `{ itemId, seed, tag }`, also used by drill's `checkDrillAnswer` |
| `index.ts` | `nextMastery`, `MASTERY_NAMES`, `MAX_MASTERY`, types | Pure rules: correct +1 (max 3), wrong −1 (min 0) and `mistake_count + 1` |
| `server.ts` | `gradeSubmission(supabase, submission)` | Re-runs `generateTraps` with the seed; shared with drill |

## Notes
- Read-then-upsert is not atomic; move to a `SECURITY DEFINER` RPC before leaderboards (DATABASE.md)
- An upsert FK error (23503) means the player has no `public.users` row: check the `handle_new_user` trigger

## Not built yet
`getProgressByDecks`, daily streak (needs `SUPABASE_SERVICE_ROLE_KEY` + `shared/lib/supabase/admin.ts`)

## May import
`@/shared/*`, `@/features/decks/server`

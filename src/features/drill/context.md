# drill

Practice rounds: builds questions with the trap engine and grades answers. Owns no tables.

## Owned tables
None. Reads items through `@/features/decks/server`.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `getDrillSession({ slug } \| { deckId }, limit?)` | Server Action → `ActionResult<DrillSession>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `DRILL_NO_ITEMS`. Auth: Optional |
| `checkDrillAnswer({ itemId, seed, tag })` | Server Action → `ActionResult<DrillAnswer>`. Grades via `progress/server`, saves nothing. Auth: Public |
| `DrillOverlay({ session, isSignedIn })` | Client. Question → feedback (gold / amber + `MutationHighlight`, mastery meter when saved) → summary, confetti if any root grew |
| types | `DrillSession`, `DrillQuestion`, `DrillAnswer`, `DrillChoice`, `DrillTag` |

## Internals
- `services/drillSession.ts`: seed per item = `drillSeed(itemId, sessionId)`, skips `INSUFFICIENT_MUTATIONS`, shuffles with `seededRandom(sessionId)`
- `hooks/useDrillSession.ts`: signed in → `progress.submitDrillResult` (saves); signed out or session expired → `checkDrillAnswer` + open the login dialog. `answering → checking → feedback → … → done`, `error` with retry
- `lib/drillSeed.ts`, `lib/splitMutation.ts` (changed-words span for highlights)
- Tests: `__tests__/trapEngine.test.ts` (engine in `shared/lib`), `__tests__/drillHelpers.test.ts`

## Rules
- The client never receives `correctStmt` or `correctTag` before answering
- No hearts, lives or timers. Correct = gold, wrong = amber

## Not built yet
`getDrillQuestion` (per node, for the mindmap)

## May import
`@/shared/*`, `@/features/decks/server`, `@/features/progress` (actions, DTO, `MASTERY_NAMES`), `@/features/progress/server`

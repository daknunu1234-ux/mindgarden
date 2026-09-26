# drill

Practice rounds: builds questions with the trap engine and grades answers. Owns no tables.

## Owned tables
None. Reads items through `@/features/decks/server`.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `getDrillSession({ slug } \| { deckId }, limit?)` | Server Action → `ActionResult<DrillSession>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `DRILL_NO_ITEMS`. Auth: Optional |
| `checkDrillAnswer({ itemId, seed, tag })` | Server Action → `ActionResult<DrillAnswer>`. Re-runs the engine, saves nothing. Auth: Public |
| `DrillOverlay({ session })` | Client. Question → feedback (gold / amber + `MutationHighlight`) → summary |
| types | `DrillSession`, `DrillQuestion`, `DrillAnswer`, `DrillChoice`, `DrillTag` |

## Internals
- `services/drillSession.ts`: seed per item = `drillSeed(itemId, sessionId)`, skips `INSUFFICIENT_MUTATIONS`, shuffles with `seededRandom(sessionId)`
- `services/gradeAnswer.ts`: `findDrillItem` + `generateTraps` with the same seed
- `hooks/useDrillSession.ts`: `answering → checking → feedback → … → done`, `error` with retry
- `lib/drillSeed.ts`, `lib/splitMutation.ts` (changed-words span for highlights)
- Tests: `__tests__/trapEngine.test.ts` (engine in `shared/lib`), `__tests__/drillHelpers.test.ts`

## Rules
- The client never receives `correctStmt` or `correctTag` before answering
- No hearts, lives or timers. Correct = gold, wrong = amber, no confetti until mastery exists

## Not built yet
`getDrillQuestion` (per node, for the mindmap), progress saving via `progress.submitDrillResult`

## May import
`@/shared/*`, `@/features/decks/server`, later `@/features/progress/server`

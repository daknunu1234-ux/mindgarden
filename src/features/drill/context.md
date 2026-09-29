# drill

Practice rounds: builds questions with the trap engine and grades answers. Owns no tables.

## Owned tables
None. Reads items through `@/features/decks/server`.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `getDrillSession({ slug } \| { deckId }, nodeId?, limit?)` | Server Action → `ActionResult<DrillSession>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `NODE_NOT_FOUND`, `DRILL_NO_ITEMS`. Auth: Optional. `nodeId` limits the round to that root and its sub-roots (`lib/branch.ts` `collectBranch`); the session carries `focus` |
| `checkDrillAnswer({ itemId, seed, tag })` | Server Action → `ActionResult<DrillAnswer>`. Grades via `progress/server`, saves nothing. Auth: Public |
| `DrillOverlay({ session, isSignedIn })` | Client. The "Watering Session": round gauge, `WateringScene` (can pours on the roots after each answer; roots glow gold or amber), question plaque, tactile choice slabs with `[1] [2] [3]` key chips → feedback (gold / amber + `MutationHighlight`, 3-notch mastery gauge and a `ParticleBurst` on level-up when saved) → trophy summary, confetti if any root grew |
| types | `DrillSession`, `DrillQuestion`, `DrillAnswer`, `DrillChoice`, `DrillTag` |

## Internals
- `services/drillSession.ts`: seed per item = `drillSeed(itemId, sessionId)`, passes the node's other statements as `siblings`, skips `INSUFFICIENT_MUTATIONS`, shuffles with `seededRandom(sessionId)`
- `hooks/useDrillSession.ts`: signed in → `progress.submitDrillResult` (saves, sends the browser timezone, pushes `streakCount` into `shared/stores/StreakProvider` so the header badge updates without a reload); signed out or session expired → `checkDrillAnswer` + open the login dialog. `answering → checking → feedback → … → done`, `error` with retry
- `lib/drillSeed.ts`, `lib/splitMutation.ts` (changed-words span for highlights), `lib/masteryChange.ts` (`leveledUp`, `becameMighty`: round stats and celebrations)
- Keyboard: `lib/shortcuts.ts` `shortcutFor` (pure) + `hooks/useDrillShortcuts.ts`: `1`/`2`/`3` or `A`/`B`/`C` answer (no `C` on 2-choice), `Enter`/`Space` go to the next question during feedback. Ignored while typing, with Ctrl/Cmd/Alt, on key repeat, while the login dialog is open, and for Enter/Space on a focused button (it clicks itself). Choices show a `KeyChip` (hidden below `sm`) and `aria-keyshortcuts`
- Tests: `__tests__/trapEngine.test.ts`, `__tests__/siblingSwaps.test.ts` (engine in `shared/lib`), `__tests__/drillHelpers.test.ts`, `__tests__/branch.test.ts`, `__tests__/shortcuts.test.ts`, `__tests__/masteryChange.test.ts`

## Rules
- The client never receives `correctStmt` or `correctTag` before answering
- Questions have 3 choices (A/B/C), or 2 (A/B) when the engine finds only one trap; items with no trap are skipped (`skippedCount`)
- No hearts, lives or timers. Correct = gold, wrong = amber

## Not built yet
`getDrillQuestion` (superseded by `getDrillSession({ nodeId })`)

## May import
`@/shared/*`, `@/features/decks/server`, `@/features/progress` (actions, DTO, `MASTERY_NAMES`), `@/features/progress/server`

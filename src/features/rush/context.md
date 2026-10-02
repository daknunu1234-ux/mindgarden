# rush

Daily Rush: once per calendar day, a gardener plays one sudden-death run on ONE of their own trees.
8 seconds a card; a right answer deals the next card; a wrong answer or a timeout ends the run; the
run pays 1 🪙 per card answered in a row. Rules and schema: DATABASE.md "Daily Rush".

## Owned tables
`daily_rush_runs` (migration `20261008000000_daily_rush.sql`): one row per player per local day. It also
writes `users.coins` through `answer_daily_rush()` / `settle_daily_rush()` (service role).

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getDailyRushStatus()` | Server Action, Auth Optional → `RushStatus { playedToday, lastRun }` or null (signed out). "Today" = the player's local day in the timezone their latest run was started in. Settles a run abandoned mid-card first (`settle_daily_rush`), otherwise read-only |
| `index.ts` | `startDailyRush({ deckId, timeZone? })` | Server Action, Auth Required, owner only → `RushStart { day, total, card }`. Claims today's run (`start_daily_rush`, primary key `(user_id, day)`) and deals the first card. Errors: `DECK_NOT_FOUND` (not your tree), `DRILL_NO_ITEMS`, `RUSH_ALREADY_PLAYED` |
| `index.ts` | `answerDailyRush({ day, tag })` | Server Action, Auth Required → `RushAnswer`. `tag: null` = the player's clock ran out. The server rebuilds the card from the run's seed and grades it; `answer_daily_rush()` checks the time with the database clock and, when the run ends, pays the streak in the same transaction. Right and in time → `{ finished: false, next }`; else `{ finished: true, outcome: 'wrong' \| 'timeout' \| 'complete', coinsEarned, totalCoins }`. No `revalidatePath`. Error: `RUSH_NOT_ACTIVE` |
| `index.ts` | `DailyRushArena({ deck, statementCount })` | Client. Intro (rules + ⚡ Start: the run starts only on that press, never on render, so a prefetch can't use up the day) → cards with the 8 s clock bar (amber → red), heartbeat in the last 3 s, keys 1–4 / A–D and pointer-down picks → result panel (streak, +N 🪙 with a coin burst, the card that ended it, "See you tomorrow"). Pushes `totalCoins` into `CoinsProvider` |
| `index.ts` | `RUSH_SECONDS`, `RUSH_MAX_STREAK`, `rushCoins`, `rushHeadline`, types | Pure rules (`lib/rules.ts`), mirrored by the SQL |

## Rules
- **One run a day, one tree**: the day is the player's local day when the run starts (browser timezone, UTC fallback), computed on the server. Every tree's ⚡ button greys out once it is used
- **Server-graded**: cards are never stored and never sent with their answer; the client sends only the pick (or a timeout). The order is `rushOrder(askable ids, seed)`, the card's seed `rushQuestionSeed(itemId, seed, index)`
- **Clock**: 8 s on the player's screen; the database allows `RUSH_LIMIT_MS` (8 s + 2.5 s network grace) from when it dealt the card. Later than that is a timeout whatever was picked
- **No repeats, capped**: a run asks each statement at most once and at most `RUSH_MAX_STREAK` (30) cards, so a run pays at most 30 🪙 (and at most the tree's statement count). Answering them all is a "perfect rush"
- **Isolated from practice**: a rush never changes mastery, the watering streak, tree fruit or withering. Only coins
- **Abandoned run**: closing the tab mid-card forfeits the rest; the streak so far is paid the next time the status is read
- Exception to hard rule 10 (no timers / lives): the Daily Rush is the one opt-in mode with a clock and sudden death. Its end-of-run flash is amber, not red

## Tests
`__tests__/rush.test.ts`: the rules (8 s, coins = streak, order, cap), the service against an in-memory copy of the three SQL functions (one run a day on any tree, local day, owner only, right → next card, wrong / timeout / late → game over and exact payout, perfect rush, abandoned run settled once, status), the migration's SQL, the ⚡ button states and the animations.

## May import
`@/shared/*`, `@/features/decks/server` (`listDrillItems`)

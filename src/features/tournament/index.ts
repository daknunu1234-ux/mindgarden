// Client-safe public API. Never re-export services/ from here.
export { getTournamentBoards, type TournamentBoardsView } from './actions/getTournamentBoards'
export { submitTournamentAnswer } from './actions/submitTournamentAnswer'
export { TournamentBoard } from './components/TournamentBoard'
export { TournamentLiveBadge } from './components/TournamentLiveBadge'
export {
  compareActive,
  compareHallOfFame,
  contestantName,
  formatPracticeDays,
  isGraduation,
  masteryPercentage,
  maxPoints,
  nextPracticeDays,
  rankBadge,
  standingRank,
} from './lib/scoring'
export type { ActiveBoardRow, HallOfFameRow, TournamentAnswer, TournamentBoards, TournamentStanding } from './types'

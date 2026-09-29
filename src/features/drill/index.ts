// Client-safe public API. Never re-export services/ from here.
export { getDrillSession } from './actions/getDrillSession'
export { checkDrillAnswer } from './actions/checkDrillAnswer'
export { getTournamentSession } from './actions/getTournamentSession'
export { DrillOverlay } from './components/DrillOverlay'
export { DrillRoundHeader } from './components/DrillRoundHeader'
export { DrillSizeSelector } from './components/DrillSizeSelector'
export { SessionLaunchButton, SessionLaunchModal, SessionLaunchProvider, useSessionLaunch } from './components/SessionLaunchModal'
export { ReviewModeToggle } from './components/ReviewModeToggle'
export { drillHref, isReviewParam, rootParam, tournamentHref } from './lib/drillHref'
export {
  launchPool,
  planLaunch,
  WHOLE_TREE_LABEL,
  type LaunchContext,
  type LaunchItem,
  type LaunchMode,
  type LaunchNode,
  type LaunchPlan,
  type LaunchRequest,
} from './lib/sessionLaunch'
export {
  DEFAULT_DRILL_SIZE,
  DRILL_SIZE_KEY,
  DRILL_SIZES,
  drillSizeOptions,
  effectiveDrillSize,
  normalizeDrillSize,
  resolveDrillSize,
  withDrillSize,
  type DrillSize,
  type DrillSizeOption,
} from './lib/drillSize'
export type { DrillAnswer, DrillChoice, DrillQuestion, DrillSession, DrillTag } from './types'

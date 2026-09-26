import { collectTrapCandidates, type TrapRules } from '@/shared/lib/trapEngine'

// Authors only write the statement; traps come from the built-in dictionary + negation.
export const DEFAULT_TRAP_RULES: TrapRules = { negate: true }

// One trap is enough (2-choice question); with none, drill sessions skip the item.
export const isDrillable = (statement: string, rules: TrapRules = DEFAULT_TRAP_RULES) =>
  collectTrapCandidates(statement, rules).length >= 1

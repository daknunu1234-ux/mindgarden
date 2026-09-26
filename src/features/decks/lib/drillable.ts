import { collectTrapCandidates, type TrapRules } from '@/shared/lib/trapEngine'

// Authors only write the statement; traps come from the built-in dictionary + negation.
export const DEFAULT_TRAP_RULES: TrapRules = { negate: true }

// One trap is enough (2-choice question); with none, drill sessions skip the item.
// `siblings` = the other true statements in the same root (sibling concept swaps).
export const isDrillable = (
  statement: string,
  rules: TrapRules = DEFAULT_TRAP_RULES,
  siblings: readonly string[] = [],
) => collectTrapCandidates(statement, rules, siblings).length >= 1

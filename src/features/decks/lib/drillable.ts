import { isNoteDrillable } from '@/shared/lib/questionEngine'
import type { TrapRules } from '@/shared/lib/trapEngine'

// Authors only write the statement; traps come from the built-in dictionary + negation.
export const DEFAULT_TRAP_RULES: TrapRules = { negate: true }

// Zero drop: the question engine can ask every note (cloze, recall, true/false, recognition, or at
// worst "spot your exact note"), whatever its shape or its root's other notes. Only a note with no two
// distinct words or letters (e.g. "aaa") can't be asked; the editor marks just those 💧.
export const isDrillable = (statement: string): boolean => isNoteDrillable(statement)

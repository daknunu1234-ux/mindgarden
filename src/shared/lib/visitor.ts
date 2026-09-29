// Strict read-only visitor mode (pure, unit-tested): only a tree's owner may practise it.
// Visitors explore shared trees read-only and clone them (clone_deck) to practise their own copy.
// Used by drill (starting a round) and progress (grading / saving an answer).

export const VISITOR_PRACTICE_MESSAGE = 'You must clone this tree to your garden to practice it!'

export const canPractice = (ownerId: string, viewerId: string | null | undefined): boolean => viewerId != null && viewerId === ownerId

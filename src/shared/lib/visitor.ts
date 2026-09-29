// Strict read-only visitor mode (pure, unit-tested): only a tree's owner may practise it.
// Visitors explore shared trees read-only and clone them (clone_deck) to practise their own copy.
// Used by drill (starting a round) and progress (grading / saving an answer).

export const VISITOR_PRACTICE_MESSAGE = 'You must clone this tree to your garden to practice it!'

export const canPractice = (ownerId: string, viewerId: string | null | undefined): boolean => viewerId != null && viewerId === ownerId

// Mind Tournament: the one exception to read-only visiting. A signed-in visitor may drill someone
// else's tree for the tournament (isolated scores, never user_progress) while it is public and its
// owner hosts a tournament. The host can't compete on their own tree.
export type TournamentDeck = { ownerId: string; isPublic: boolean; isTournamentOpen: boolean }
export type CompeteVerdict = 'ok' | 'signed-out' | 'host' | 'closed'

export function tournamentAccess(deck: TournamentDeck, viewerId: string | null | undefined): CompeteVerdict {
  if (!deck.isPublic || !deck.isTournamentOpen) return 'closed'
  if (viewerId == null) return 'signed-out'
  if (viewerId === deck.ownerId) return 'host'
  return 'ok'
}

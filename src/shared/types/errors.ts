// Error codes returned in ActionResult. Keep in sync with 01.share-docx/API SPEC.md §5.
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_FORBIDDEN'
  | 'DECK_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'NODE_NOT_EMPTY'
  | 'ITEM_NOT_FOUND'
  | 'DRILL_NO_ITEMS'
  // Every drillable item is at 5/5 and review mode is off: the tree is fully cultivated.
  | 'DRILL_ALL_MASTERED'
  // Planting a tree costs SEED_PRICE_COINS (shared/lib/economy.ts) and the purse is short.
  | 'INSUFFICIENT_COINS'
  // Practising / grading a tree you don't own: visitors are read-only (clone it to practise).
  | 'FORBIDDEN_VISITOR_PRACTICE'
  // Mind Tournament: the tree isn't public or its owner isn't hosting a tournament (any more).
  | 'TOURNAMENT_CLOSED'
  // Mind Tournament: this contestant already graduated (engraved in the Hall of Fame).
  | 'TOURNAMENT_GRADUATED'
  // Farm grid: the spot is taken, off the grid, or the tree is already planted.
  | 'TILE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

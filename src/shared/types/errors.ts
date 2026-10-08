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
  // The purse is short for a seed (its species' price, treeSkins seedPrice), a clone, a pricier
  // species or a Shop item.
  | 'INSUFFICIENT_COINS'
  // Cloning a shared tree with fewer than 50 statements (economy CLONE_MIN_STATEMENTS).
  | 'CLONE_TOO_SMALL'
  // Practising / grading a tree you don't own: visitors are read-only (clone it to practise).
  | 'FORBIDDEN_VISITOR_PRACTICE'
  // Mind Tournament: the tree isn't public or its owner isn't hosting a tournament (any more).
  | 'TOURNAMENT_CLOSED'
  // Mind Tournament: this contestant already graduated (engraved in the Hall of Fame).
  | 'TOURNAMENT_GRADUATED'
  // Farm grid: the spot is taken, off the grid, or the tree is already planted.
  | 'TILE_UNAVAILABLE'
  // Tree fruit: not practised yesterday, or today's fruit is already harvested.
  | 'FRUIT_NOT_READY'
  // Daily Rush: today's one run is already used.
  | 'RUSH_ALREADY_PLAYED'
  // Daily Rush: the run is over (answered wrong, timed out, finished) or was never started.
  | 'RUSH_NOT_ACTIVE'
  | 'INTERNAL_ERROR'

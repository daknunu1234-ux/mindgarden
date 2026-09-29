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
  | 'INTERNAL_ERROR'

// Error codes returned in ActionResult. Keep in sync with 01.share-docx/API SPEC.md §5.
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'AUTH_UNAUTHORIZED'
  | 'DECK_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'DRILL_NO_ITEMS'
  | 'INTERNAL_ERROR'

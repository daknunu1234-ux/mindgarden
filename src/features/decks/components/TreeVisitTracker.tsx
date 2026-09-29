'use client'

import { useEffect } from 'react'
import { recordTreeVisit } from '../actions/recordTreeVisit'

type TreeVisitTrackerProps = { deckId: string }

// Renders nothing. Records the visit once the tree page has actually mounted in the browser, so a
// prefetched link never counts as a visit. Fire and forget: the drawer is never worth an error.
function TreeVisitTracker({ deckId }: TreeVisitTrackerProps) {
  useEffect(() => {
    recordTreeVisit({ deckId }).catch(() => {})
  }, [deckId])
  return null
}

export { TreeVisitTracker }

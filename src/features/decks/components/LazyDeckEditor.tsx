'use client'

import dynamic from 'next/dynamic'

// The public `DeckEditor` (index.ts) is this lazy wrapper: the outline editor's code (inputs,
// keyboard flow, collapse, bulk import entry) loads as its own chunk instead of riding along with
// every page that imports the decks barrel. Still server-rendered, so its HTML is in the page at once.
export const DeckEditor = dynamic(() => import('./DeckEditor').then((m) => m.DeckEditor))

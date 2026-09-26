# decks

Server feature for decks, their mindmap tree and knowledge items.

## Owned tables
`decks`, `mindmap_nodes`, `knowledge_items` (only this feature's services query them)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getDecks(input?)` | Server Action. `{ limit?, page? }` → `ActionResult<Deck[]>` with `meta { page, limit, total }`. Auth: Optional (RLS returns public + own decks) |
| `index.ts` | `getDeckBySlug({ slug })` | Server Action → `ActionResult<DeckDetail>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `INTERNAL_ERROR`. Auth: Optional |
| `index.ts` | `countDeckTree(tree)` | Pure: `{ nodeCount, itemCount }` for a deck header |
| `index.ts` | `type Deck`, `DeckDetail`, `DeckTreeNode`, `DeckTreeItem` | camelCase shapes from API SPEC.md §6. Items carry only `id` + `prompt` (no `correctStmt`) |
| `server.ts` | — | Not created yet; add it when another feature needs a decks service |

## Internals
- `dto/GetDecksDto.ts`: Zod, `limit` 1–50 (default 20), `page` ≥ 1 (default 1), coerces strings
- `dto/GetDeckBySlugDto.ts`: Zod, kebab-case slug, max 160
- `services/decks.ts`: `listDecks` (newest first) and `findDeckBySlug` (deck, then its nodes with embedded `knowledge_items(id, prompt)`), `import 'server-only'`
- `lib/deckTree.ts`: `buildDeckTree` (adjacency list → nested roots, siblings by `sort_order`, cycle nodes dropped), `countDeckTree`

## Not built yet
`createDeck` (see API SPEC.md §6)

## May import
`@/shared/*` only

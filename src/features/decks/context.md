# decks

Server feature for decks, their mindmap tree and knowledge items.

## Owned tables
`decks`, `mindmap_nodes`, `knowledge_items` (only this feature's services query them)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getDecks(input?)` | Server Action. `{ limit?, page? }` → `ActionResult<Deck[]>` with `meta { page, limit, total }`. Auth: Optional (RLS returns public + own decks) |
| `index.ts` | `type Deck` | camelCase deck row (API SPEC.md §6) |
| `server.ts` | — | Not created yet; add it when another feature needs a decks service |

## Internals
- `dto/GetDecksDto.ts`: Zod, `limit` 1–50 (default 20), `page` ≥ 1 (default 1), coerces strings
- `services/decks.ts`: `listDecks(supabase, dto)`, newest first, `import 'server-only'`

## Not built yet
`getDeckBySlug`, `createDeck` (see API SPEC.md §6)

## May import
`@/shared/*` only

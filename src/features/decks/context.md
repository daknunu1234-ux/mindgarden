# decks

Server feature for decks, their mindmap tree and knowledge items.

## Owned tables
`decks`, `mindmap_nodes`, `knowledge_items` (only this feature's services query them)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getDecks(input?)` | Server Action. `{ limit?, page? }` → `ActionResult<Deck[]>` with `meta { page, limit, total }`. Auth: Optional (RLS returns public + own decks) |
| `index.ts` | `getDeckBySlug({ slug })` | Server Action → `ActionResult<DeckDetail>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `INTERNAL_ERROR`. Auth: Optional |
| `index.ts` | `createDeck({ title, description?, treeType?, isPublic? })` | Server Action, Auth Required. Slug from `slugify(title)` with collision suffixes |
| `index.ts` | `createMindmapNode({ deckId, title, parentId? })` | Server Action, owner only (`AUTH_FORBIDDEN` otherwise) |
| `index.ts` | `createKnowledgeItem({ nodeId, statement })` | Server Action, owner only. Stores `trap_rules = { negate: true }`, `prompt` = root title; returns `drillable` |
| `index.ts` | `getDeckEditor({ deckId })` | Server Action, owner only. Flattened roots with true statements |
| `index.ts` | `CreateDeckForm`, `DeckEditor({ editor })` | Client UI for `/deck/new` and the owner section of the deck page. No trap settings are shown |
| `index.ts` | `countDeckTree(tree)` | Pure: `{ nodeCount, itemCount }` for a deck header |
| `index.ts` | `type Deck`, `DeckDetail`, `DeckTreeNode`, `DeckTreeItem` | camelCase shapes from API SPEC.md §6. Items carry only `id` + `prompt` (no `correctStmt`) |
| `server.ts` | `listDrillItems(supabase, { deckId } \| { slug })` | Server-only. Deck + every item with `correctStmt`, parsed `trapRules` and `siblingStatements` (other statements in its node), for drill |
| `server.ts` | `listDeckItemIds(supabase, deckIds)` | Server-only. `{ deckId, items: { itemId, nodeId }[] }[]` in input order, for progress |
| `server.ts` | `findDrillItem(supabase, itemId)` | Server-only. One item with its answer and `siblingStatements`, for grading. `ITEM_NOT_FOUND` if unreadable |

## Internals
- `dto/GetDecksDto.ts`: Zod, `limit` 1–50 (default 20), `page` ≥ 1 (default 1), coerces strings
- `dto/GetDeckBySlugDto.ts`: Zod, kebab-case slug, max 160
- `services/decks.ts`: `listDecks` (newest first) and `findDeckBySlug` (deck, then its nodes with embedded `knowledge_items(id, prompt)`), `import 'server-only'`
- `dto/CreateDeckDto.ts` (`TREE_TYPES`), `dto/CreateMindmapNodeDto.ts`, `dto/CreateKnowledgeItemDto.ts` (plain text, rejects `\commands`), `dto/GetDeckEditorDto.ts`
- `services/authoring.ts`: inserts + owner checks; `lib/drillable.ts`: `DEFAULT_TRAP_RULES`, `isDrillable`
- `dto/TrapRulesDto.ts`: Zod for `trap_rules` (`swaps` ≤ 50, `negate`). Invalid JSON falls back to `{}` with a warning
- `services/drillItems.ts`, `services/deckItems.ts`: back `server.ts`
- `lib/deckTree.ts`: `buildDeckTree` (adjacency list → nested roots, siblings by `sort_order`, cycle nodes dropped), `countDeckTree`

## Not built yet
Editing/deleting roots and statements, reordering roots

## May import
`@/shared/*` only

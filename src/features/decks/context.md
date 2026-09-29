# decks

Server feature for decks, their mindmap tree and knowledge items.

## Owned tables
`decks`, `mindmap_nodes`, `knowledge_items` (only this feature's services query them)

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getDecks(input?)` | Server Action. `{ limit?, page? }` → `ActionResult<Deck[]>` with `meta { page, limit, total }`. Auth: Optional. **Owner-only**: returns the session user's own decks (public and private), never another gardener's; signed out → `[]` |
| `index.ts` | `getDeckBySlug({ slug })` | Server Action → `ActionResult<DeckDetail>`. Errors: `VALIDATION_FAILED`, `DECK_NOT_FOUND`, `INTERNAL_ERROR`. Auth: Optional |
| `index.ts` | `createDeck({ title, description?, treeType?, isPublic? })` | Server Action, Auth Required. Costs 100 🪙 (`shared/lib/economy.ts`): `services/authoring.ts` `plantDeck` calls the `plant_deck()` RPC (charge + insert in one transaction) per slug candidate. Returns `{ deck, remainingCoins }`; `INSUFFICIENT_COINS` when short. Slug from `slugify(title)` with collision suffixes (a clash never double-charges) |
| `index.ts` | `getDecks`, `getCommunityDecks`, `getNeighborGarden` | Server Actions (`services/decks.ts`). `getDecks` = the session user's own decks only (signed out → []); `getCommunityDecks` = other gardeners' public decks; `getNeighborGarden({ ownerId })` = one gardener's public decks. Tests: `__tests__/gardenIsolation.test.ts` |
| `index.ts` | `DeckShareToggle({ deckId, slug, isPublic })` | Owner switch "Share tree with community (Public link) 🌐" (`updateDeck({ isPublic })`) + copy link. New trees are private by default |
| `index.ts` | `CreateDeckForm({ coins, coinsAsOf? })` | "Seed Cost: 100 🪙 · Your Purse: X 🪙"; when short, the plant button is disabled and "Get More Coins 🪙" opens the Coin Shop (`shared/stores/CoinShopProvider`) |
| `index.ts` | `createMindmapNode({ deckId, title, parentId? })` | Server Action, owner only (`AUTH_FORBIDDEN` otherwise) |
| `index.ts` | `createKnowledgeItem({ nodeId, statement })` | Server Action, owner only. Stores `trap_rules = { negate: true }`, `prompt` = root title; returns `drillable` |
| `index.ts` | `getDeckEditor({ deckId })` | Server Action, owner only. Flattened roots with true statements |
| `index.ts` | `getDeckReader({ deckId })` | Server Action, Auth Optional. Strict read-only visitor mode: same shape as `getDeckEditor` for a **public** tree (or your own). `services/authoring.ts` `loadDeckReader` checks `is_public` / ownership with the user client before `answers.ts` reads; someone else's private tree → `DECK_NOT_FOUND`. Tests: `__tests__/deckReader.test.ts` |
| `index.ts` | `cloneDeck({ deckId })` | Server Action, Auth Required. Copies another gardener's public tree into the caller's garden for `cloneCost(n)` = min(100 + statements, 150) 🪙 (`shared/lib/economy.ts`): `services/authoring.ts` `cloneSharedDeck` calls the `clone_deck()` RPC (charge + deep copy of roots and statements, no progress, one transaction) per slug candidate. Returns `{ deck, remainingCoins, cost }`. Errors: `INSUFFICIENT_COINS` ("You need N coins to clone this tree!"), `DECK_NOT_FOUND`, `AUTH_FORBIDDEN` (own tree). Tests: `__tests__/cloneDeck.test.ts` |
| `index.ts` | `CloneTreeButton({ deckId, deckTitle, statementCount, coins, coinsAsOf?, signedIn, size? })` | Client. "🌱 Clone Tree (N 🪙)" + confirm dialog (Clone Cost / Your Purse); short purse → "Get More Coins 🪙" (Coin Shop), signed out → login dialog. On success: `setCoins(remainingCoins)`, toast, `router.push` to the copy |
| `index.ts` | `DeckReader({ reader })` | Server-safe list of every root (indented by depth) with its statements as plain text, for visitors. No edit controls, no drill links |
| `index.ts` | `updateDeck({ deckId, title?, description?, treeType?, isPublic? })` | Server Action, owner only; the editor uses it for the species picker |
| `index.ts` | `updateMindmapNode`, `deleteMindmapNode` (empty roots only, else `NODE_NOT_EMPTY`), `deleteKnowledgeItem` | Server Actions, owner only (`dto/ManageRootsDto.ts`, `services/authoring.ts`) |
| `index.ts` | `deleteDeck({ deckId })` | Server Action, owner only (`dto/DeleteDeckDto.ts`, `services/authoring.ts` `removeDeck`). Cascades roots, statements and progress; success = `redirect('/')`, failure = `ActionResult` |
| `index.ts` | `DeleteDeckDialog({ deckId, deckTitle, open, onOpenChange })`, `DeckDangerZone({ deckId, deckTitle })` | Client. "Uproot Tree? 🪓" game dialog: type the name to confirm (`lib/confirmName.ts` `matchesTreeName`, NFC/case/space-insensitive), "Keep Tree 🌿" / "Uproot Forever 🪓"; farewell toast via `shared/stores/ToastProvider`. `DeckDangerZone` = the Tree Workshop section with the trigger button |
| `index.ts` | `NodeManageDialog({ deckId, node, onOpenChange })`, `AddRootDialog` | Client. Owner tools opened from the mindmap: rename, add sub-branch / statement, remove statements (inline confirm), delete an empty root. Shows owner-only statement texts from `getDeckEditor`; refreshes page data in place |
| `index.ts` | `TreeSpeciesPicker({ value, onChange })` | Radio cards for every species in `shared/lib/treeSkins` |
| `index.ts` | `CreateDeckForm`, `DeckEditor({ editor })` | Client UI for `/deck/new` and the owner section of the deck page. No trap settings are shown |
| `index.ts` | `countDeckTree(tree)` | Pure: `{ nodeCount, itemCount }` for a deck header |
| `index.ts` | `type Deck`, `DeckDetail`, `DeckTreeNode`, `DeckTreeItem` | camelCase shapes from API SPEC.md §6. Items carry only `id` + `prompt` (no `correctStmt`) |
| `server.ts` | `listDrillItems(supabase, { deckId } \| { slug })` | Server-only. Deck (with `ownerId`, for drill's owner-only guard) + `nodes { id, parentId, title }` + every item with `correctStmt`, parsed `trapRules` and `siblingStatements` (other statements in its node), for drill |
| `server.ts` | `listDeckItemIds(supabase, deckIds)` | Server-only. `{ deckId, items: { itemId, nodeId }[] }[]` in input order (queried 100 decks at a time), for progress |
| `server.ts` | `listOwnedDecks(supabase, userId)` | Server-only. The user's decks (public + private), newest first, for the profile stats |
| `server.ts` | `findDrillItem(supabase, itemId)` | Server-only. One item with its answer, `siblingStatements` and its deck's `ownerId` (owner-only grading), for grading. `ITEM_NOT_FOUND` if unreadable |

## Internals
- `dto/GetDecksDto.ts`: Zod, `limit` 1–50 (default 20), `page` ≥ 1 (default 1), coerces strings
- `dto/GetDeckBySlugDto.ts`: Zod, kebab-case slug, max 160
- `services/decks.ts`: `listDecks` (newest first) and `findDeckBySlug` (deck, then its nodes with embedded `knowledge_items(id, prompt)`), `import 'server-only'`
- `dto/CreateDeckDto.ts` (`TREE_TYPES`), `dto/CreateMindmapNodeDto.ts`, `dto/CreateKnowledgeItemDto.ts` (plain text, rejects `\commands`), `dto/GetDeckEditorDto.ts`
- `services/authoring.ts`: inserts + owner checks; `lib/drillable.ts`: `DEFAULT_TRAP_RULES`, `isDrillable`
- `dto/TrapRulesDto.ts`: Zod for `trap_rules` (`swaps` ≤ 50, `negate`). Invalid JSON falls back to `{}` with a warning
- `services/answers.ts`: the only reader of `correct_stmt` / `trap_rules` (`readAnswersForNodes`, `answersByNode`), via the service-role client (`shared/lib/supabase/admin.ts`), falling back to the user client when `SUPABASE_SERVICE_ROLE_KEY` is unset. Callers pass only node ids their RLS query already returned. Guarded by `__tests__/answerSecrecy.test.ts`
- `services/drillItems.ts`, `services/deckItems.ts`: back `server.ts`
- `lib/deckTree.ts`: `buildDeckTree` (adjacency list → nested roots, siblings by `sort_order`, cycle nodes dropped), `countDeckTree`

## Not built yet
Reordering roots

## May import
`@/shared/*` only

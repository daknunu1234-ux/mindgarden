# garden

The tree surface: the Farm World (a 16 × 16 isometric grid with a 🏪 Shop, Hay Day style), the classic
grid of decks and the single tree. Trees and progress come from the page as props; the farm's own
placements are this feature's table.

## Owned tables
`garden_placements` (migration `20260930000000_farm_grid.sql`; DATABASE.md "Farm Grid Feature"). Written only through
`purchase_and_place_item()` (`placeFarmItem`) and owner deletes (`removeFarmPlacement`).

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenGrid({ decks })` | Grid of `TreeCard`s, with a built-in empty state |
| `GardenGridSkeleton({ count? })` | Loading state, used by `app/loading.tsx` |
| `TreeCard({ deck })` | Links to `/deck/[slug]`; stage SVG + stage badge + `GrowthBar` from `masteryPercent` |
| Visited Gardens | `VisitedGardensDrawer({ gardens, signedIn, visitingOwnerId? })`: wooden tab on the farm's left edge ("🧭 Visited Gardens") opening a left drawer of the shared trees this player opened, grouped by gardener (Visit 👣 → `/?visit=<id>`, or re-open one tree), each with its statement count and "visited 3 days ago". Signed out → sign-in prompt; no visits → empty state. Replaced Community Gardens. `lib/neighbors.ts` (pure, tested): `groupVisitedGardens(trees, viewerId, names?)` (gardeners named by their chosen Garden Name from auth's `getDisplayNames`, else `publicName` falls back to the pseudonym; own trees left out, newest-visited garden and tree first, duplicates keep the newest visit), `formatVisitedAgo(visitedAt, now)`, `neighborName` (id-derived friendly name; moved to `shared/lib/neighborName.ts` and re-exported, since the tournament boards use it too), `visitHref`, types `VisitedTreeView`, `VisitedGarden`. The page fills it from decks' `getVisitedGardens`. `FarmIslandView` takes `leftEdge` (the drawer) and `visitor` (read-only mode: banner + "🏡 Back to my garden", no planting/quests dock) |
| Size tiers | Tree size = subject scope from the deck's `knowledge_items` count (never mindmap nodes): `getTreeSizeTier(itemCount)` in `shared/lib/treeSkins.ts` → sm ≤ 50 (0.85×, 🌱 Compact), md 51–120 (1×, 🌿 Standard), lg 121–200 (1.18×, 🌳 Sturdy), xl > 200 (1.35×, 👑 Colossal). Independent of growth stage (mastery). Farm: `TreeStageSvg scale` inside a fixed box, anchored at the trunk base (`lib/plotSprite.ts` `bottomCenterScale`); plot button hitbox = soil mound only, the crown clicks through its painted shapes; signs, % badges and 💧/✨ bubbles live in a label layer above all trees (`plotSprite` anchors, tested). Deck page: the scene's surface box itself is scaled so the sky headroom and root attachment follow |
| `TreeStageSvg({ stage, treeType, label, ground?, scale? })` | Inline cartoon-3D SVG, 4 silhouette families (broadleaf, conifer, bamboo, cactus) × 5 stages; species and colors from `shared/lib/treeSkins`, shades from `shared/lib/color.ts`. Cel-shaded plush canopy clumps (merged bold outline, shadowed underside, sunlit top, glint, warm bounce light), AO ground shadow. Stage 5: golden aura, sparkles, blossoms/fruit. Pure markup (no hooks/ids). `ground={false}` hides the tilled mound |
| Farm scene internals | `IslandTerrain` (stratified cliff, animated shore foam, painterly grass patches via pure `lib/islandTerrain.ts` `grassPatches` / `frontEdge`, tested), `FarmScenery` (tilled plot mounds with furrows, gambrel barn with loft hay + chimney smoke, idling toy tractor, sagging fences, stone lanterns, stacked bales, flower bushes). Plots show the title on a small post sign in front of the mound and mastery as a floating wooden ring badge, never over the tree. Animations: `mg-smoke`, `mg-idle`, `mg-twinkle`, `mg-foam` (off for reduced motion) |
| `FarmIslandView({ plots, placements, unplacedTrees?, hud, signedIn, gridHref, topCenter?, leftEdge?, visitor?, onUproot? })` | Client. The Farm World: camera + HUD corners (level, 🔥 streak, 🪙 coins: the only currency, no gems), the grid, the dock (Quests · 🏪 Shop hero with a badge for trees waiting · Grid), the build bar in placement mode, and the Shop / tree / item / Daily Delivery dialogs. Placing pushes `remainingCoins` into `CoinsProvider` and refreshes. Visitors: read-only farm, no Shop |
| `getFarmPlacements({ ownerId? })`, `placeFarmItem({ item, x, y, deckId? })`, `removeFarmPlacement({ placementId })` | Server Actions (`dto/FarmDto.ts`, `services/placements.ts`). Load a farm (yours, or a neighbour's items + public trees), plant a tree (free) / buy + place a Shop item (the database charges its own catalogue price and refuses overlaps: `INSUFFICIENT_COINS`, `TILE_UNAVAILABLE`), pick an item up (no refund; a tree goes back to the Shop). Tests: `__tests__/farmActions.test.ts` |
| `FarmIsometricGrid`, `FARM_WORLD` | Client. The 16 × 16 grass grid (`FarmStructures`: tiles, streams, ghost footprint; Woodshop, rockery, auto-joining fences, wandering cows / pigs; the Farmer's House reuses `FarmScenery`'s farmhouse) with trees (`FarmTree`: `PlotButton` + `PlotLabels`) and items painted back to front by their ground point. Placement mode: a green / red ghost follows the pointer; click places (touch: tap twice, or "Place here"); Esc / right-click cancels. Pointer → tile via `screenToTile` on the measured (camera-scaled) world |
| `FarmShopModal({ open, coins, unplacedTrees, onPlantTree, onBuy })` | Client. "🏪 Shop" tabs: 🌳 Trees (own unplanted trees: title, statements, mastery → "Plant on Farm"; "+ Plant New Seed" → `/deck/new`), 🏗️ Structures, 🌊 Landscape, 🪵 Decorations, 🐮 Animals ("Buy & Place", disabled when the purse is short). Opened from the dock's hero 🏪 button |
| `FarmItemDialog`, `FarmPlotDialog` | Item popover (what it does, 📦 Pick up for the owner) and tree popover (💧 water, review, 🔍 roots, edit, 📦 remove from farm, 🪓 chop; visitors: explore / clone, ⚔️ compete while a tournament is live; the tree's coin buff) |
| `FARM_CATALOG`, `SHOP_TABS`, `catalogItem` / `catalogFor` (`lib/farmCatalog.ts`); `GRID_SIZE`, `tileToScreen`, `screenToTile`, `checkPlacement`, `fenceLinks` / `fenceVariant`, `firstFreeTile` (`lib/farmGrid.ts`); `treeBuff`, `calculateTreeBuff`, `calculateWoodshopRefund`, `WOODSHOP_REFUND_CAP` (`lib/farmBuffs.ts`) | Pure, tested (`__tests__/farmGrid.test.ts`, `__tests__/farmBuffs.test.ts`), mirrored by the SQL: stream on a side tile ×1.2, Farmer's House 4 × 4 area ×1.5 (both ×1.8); Woodshop refund `min(floor(25% × statements), 50)` |
| `ViewToggle({ view, farmHref, gridHref })` | Farm ⇄ Grid wooden switch (`?view=grid`), used by the grid view |
| `layoutFarm(count, { flowering? })` | Legacy (the farm now uses the grid; kept for its tests and the island geometry helpers). Pure isometric farmstead: plots, farmhouse + tractor landmarks, island + grass outline, cobblestone lanes, picket fence runs, props (lamps, benches, bales, hives by flowering plots), seeded decorations (`lib/farmLayout.ts`, tested) |
| camera | Moved to `shared/lib/camera.ts` (pure, tested) + `shared/hooks/useCamera.ts`, shared with the mindmap |
| `type FarmPlotView`, `FarmHudView` | View models the page fills from decks + progress |
| `TREE_BASE_RATIO` | Where the trunk meets the ground as a fraction of the drawn size (`{ x: 0.5, y: 0.9 }`); the deck scene attaches the roots there |
| `GrowthBar({ percent })` | 0–100 capsule gauge (`GameProgressBar`, 5 stage notches), gold from 90% (`GOLDEN_BLOOM_PERCENT`) |
| `getTreeStage(pct)`, `useTreeStage(pct)`, `TREE_STAGES` | Pure 5-stage math (0–20, 21–40, 41–65, 66–89, 90–100) and stage names/emoji |
| `type DeckCardView` | `{ id, slug, title, description, treeType, masteryPercent }` |
| `type TreeStage` | `1 \| 2 \| 3 \| 4 \| 5` |

## Not built yet
`TreeCanvas` (client, cross-fade between stages), stage-up confetti

## May import
`@/shared/*` only (pages pass decks, progress and names in as props)

# garden

UI-only feature: the tree surface (grid of decks, single tree).

## Owned tables
None. Never calls actions; pages pass data in as props.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenGrid({ decks })` | Grid of `TreeCard`s, with a built-in empty state |
| `GardenGridSkeleton({ count? })` | Loading state, used by `app/loading.tsx` |
| `TreeCard({ deck })` | Links to `/deck/[slug]`; stage SVG + stage badge + `GrowthBar` from `masteryPercent` |
| Visited Gardens | `VisitedGardensDrawer({ gardens, signedIn, visitingOwnerId? })`: wooden tab on the farm's left edge ("🧭 Visited Gardens · Vườn đã thăm") opening a left drawer of the shared trees this player opened, grouped by gardener (Visit 👣 → `/?visit=<id>`, or re-open one tree), each with its statement count and "visited 3 days ago". Signed out → sign-in prompt; no visits → empty state. Replaced Community Gardens. `lib/neighbors.ts` (pure, tested): `groupVisitedGardens` (own trees left out, newest-visited garden and tree first, duplicates keep the newest visit), `formatVisitedAgo(visitedAt, now)`, `neighborName` (id-derived friendly name), `visitHref`, types `VisitedTreeView`, `VisitedGarden`. The page fills it from decks' `getVisitedGardens`. `FarmIslandView` takes `leftEdge` (the drawer) and `visitor` (read-only mode: banner + "🏡 Back to my garden", no planting/quests dock) |
| Size tiers | Tree size = subject scope from the deck's `knowledge_items` count (never mindmap nodes): `getTreeSizeTier(itemCount)` in `shared/lib/treeSkins.ts` → sm ≤ 50 (0.85×, 🌱 Compact), md 51–120 (1×, 🌿 Standard), lg 121–200 (1.18×, 🌳 Sturdy), xl > 200 (1.35×, 👑 Colossal). Independent of growth stage (mastery). Farm: `TreeStageSvg scale` inside a fixed box, anchored at the trunk base (`lib/plotSprite.ts` `bottomCenterScale`); plot button hitbox = soil mound only, the crown clicks through its painted shapes; signs, % badges and 💧/✨ bubbles live in a label layer above all trees (`plotSprite` anchors, tested). Deck page: the scene's surface box itself is scaled so the sky headroom and root attachment follow |
| `TreeStageSvg({ stage, treeType, label, ground?, scale? })` | Inline cartoon-3D SVG, 4 silhouette families (broadleaf, conifer, bamboo, cactus) × 5 stages; species and colors from `shared/lib/treeSkins`, shades from `shared/lib/color.ts`. Cel-shaded plush canopy clumps (merged bold outline, shadowed underside, sunlit top, glint, warm bounce light), AO ground shadow. Stage 5: golden aura, sparkles, blossoms/fruit. Pure markup (no hooks/ids). `ground={false}` hides the tilled mound |
| Farm scene internals | `IslandTerrain` (stratified cliff, animated shore foam, painterly grass patches via pure `lib/islandTerrain.ts` `grassPatches` / `frontEdge`, tested), `FarmScenery` (tilled plot mounds with furrows, gambrel barn with loft hay + chimney smoke, idling toy tractor, sagging fences, stone lanterns, stacked bales, flower bushes). Plots show the title on a small post sign in front of the mound and mastery as a floating wooden ring badge, never over the tree. Animations: `mg-smoke`, `mg-idle`, `mg-twinkle`, `mg-foam` (off for reduced motion) |
| `FarmIslandView({ plots, hud, signedIn, gridHref, topCenter?, onUproot? })` | `FarmPlotDialog` is owner-first: water / review / edit / uproot only when `plot.isOwner`; a visitor's plot shows a disabled "Clone to practice this tree 🌱" and "🌱 Explore & clone this tree" (→ the deck page). Visitors' plots carry `needsWater: null`. `onUproot(plot)`: owner's 🗑 badge in `FarmPlotDialog` (closes the popup first); `app/_components/FarmWorld.tsx` wires it to decks' `DeleteDeckDialog`. Client. Full-bleed Farm World (see frontend/ARCHITECTURE.md §5): scenery from `FarmScenery` (pure SVG), trees/landmarks as buttons, ambience from `FarmAmbience`, game HUD from `FarmHud` (level crest + XP top-left, 🔥 🪙 💎 resource pills top-right, camera buttons bottom-left, `FarmDock` bottom-centre: 📜 Daily Quests → `DailyDeliveryDialog`, Seed Sack → `/deck/new`, Grid), `FarmPlotDialog`. Camera via `shared/hooks/useCamera.ts` |
| `ViewToggle({ view, farmHref, gridHref })` | Farm ⇄ Grid wooden switch (`?view=grid`), used by the grid view |
| `layoutFarm(count, { flowering? })` | Pure isometric farmstead: plots, farmhouse + tractor landmarks, island + grass outline, cobblestone lanes, picket fence runs, props (lamps, benches, bales, hives by flowering plots), seeded decorations (`lib/farmLayout.ts`, tested) |
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
`@/shared/*` only

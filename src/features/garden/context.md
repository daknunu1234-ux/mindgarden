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
| `TreeStageSvg({ stage, treeType, label, ground? })` | Inline SVG, 4 silhouette families (broadleaf, conifer, bamboo, cactus) × 5 stages; species and colors from `shared/lib/treeSkins`. Stage 5: golden aura, sparkles, blossoms/fruit. Pure markup (no hooks/ids). `ground={false}` hides the soil mound |
| `FarmIslandView({ plots, hud, signedIn, farmHref, gridHref, topCenter? })` | Client. Full-bleed Farm World (see frontend/ARCHITECTURE.md §5): scenery from `FarmScenery` (pure SVG), trees/landmarks as buttons, ambience from `FarmAmbience`, HUD from `FarmHud`, `FarmPlotDialog` and `DailyDeliveryDialog` (tractor). Camera via `hooks/useFarmCamera.ts` |
| `ViewToggle({ view, farmHref, gridHref })` | Farm ⇄ Grid links (`?view=grid`) |
| `layoutFarm(count, { flowering? })` | Pure isometric farmstead: plots, farmhouse + tractor landmarks, island + grass outline, cobblestone lanes, picket fence runs, props (lamps, benches, bales, hives by flowering plots), seeded decorations (`lib/farmLayout.ts`, tested) |
| `lib/camera.ts` | Pure zoom/pan math: `fitZoom`, `zoomAt` (keeps the point under the cursor fixed), `centreOn`, clamping (tested) |
| `type FarmPlotView`, `FarmHudView` | View models the page fills from decks + progress |
| `TREE_BASE_RATIO` | Where the trunk meets the ground as a fraction of the drawn size (`{ x: 0.5, y: 0.9 }`); the deck scene attaches the roots there |
| `GrowthBar({ percent })` | 0–100 bar, gold above 80% |
| `getTreeStage(pct)`, `useTreeStage(pct)`, `TREE_STAGES` | Pure 5-stage math (0–20, 21–40, 41–65, 66–89, 90–100) and stage names/emoji |
| `type DeckCardView` | `{ id, slug, title, description, treeType, masteryPercent }` |
| `type TreeStage` | `1 \| 2 \| 3 \| 4 \| 5` |

## Not built yet
`TreeCanvas` (client, cross-fade between stages), stage-up confetti

## May import
`@/shared/*` only

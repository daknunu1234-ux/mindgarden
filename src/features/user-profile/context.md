# user-profile

UI-only feature: the Gardener's Trophy & Record Hall on `/profile` (game panels from `shared/components/game`).

## Owned tables
None. `users` belongs to `auth`, stats come from `progress.getGardenStats`. The page maps that data into this feature's view models.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenerCard({ gardener, masteryPercent, level? })` | Wooden nameplate: gold-framed avatar initial with level badge, name (email before `@`), title ribbon, XP gauge (when `level`), email, "Joined …" date; "✨ Golden garden" ribbon at `GOLDEN_BLOOM_PERCENT` |
| `GardenStatsGrid({ stats })` | "Record Hall": medallion plaques for trees, items, Mighty Roots, mastery %, current/best streak (gold when earned) + overall mastery gauge |
| `MightyShowcase({ trees })` | "Mighty Roots Showcase": framed slots for trees with Mighty Roots (via `showcaseSlots`), locked frames as goals |
| `PlantedTreeList({ trees })` | "Your Orchard" ledger: owned trees with an optional `illustration`, growth gauge, chips (species · growth `stage` · size-tier `size` badge, both optional view-model fields the page fills from `getTreeStage` / `getTreeSizeTier`); "💧 Water" (`/deck/[slug]/drill`, only with statements) and "Edit" (`/deck/[slug]#grow-heading`). Empty state links to `/deck/new` |
| `formatJoined(iso)`, `gardenerName(email)` | Pure helpers (`lib/format.ts`); dates in `en-GB`, UTC, so server and client match |
| `showcaseSlots(trees, minSlots = 6, perRow = 3)` | Pure (`lib/showcase.ts`, tested): trophies sorted by Mighty Roots then growth, padded with locked frames to whole rows |
| types | `GardenerView`, `GardenerLevelView`, `GardenStatsView`, `PlantedTreeView`, `ShowcaseSlot` |

## Page (`src/app/profile/page.tsx`)
Signed out → `shared/components/SignInPrompt` (opens the login dialog). Signed in → `getCurrentUser` + `getGardenStats` + `getFarmHud` (level), tree pictures from `garden`'s `TreeStageSvg`.

## May import
`@/shared/*` only

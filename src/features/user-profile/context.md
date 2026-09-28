# user-profile

UI-only feature: the gardener overview on `/profile`.

## Owned tables
None. `users` belongs to `auth`, stats come from `progress.getGardenStats`. The page maps that data into this feature's view models.

## Exports (`index.ts`)
| Export | Notes |
|--------|-------|
| `GardenerCard({ gardener, masteryPercent })` | Avatar initial, name (email before `@`), email, "Joined …" date; "✨ Golden garden" badge above 80% |
| `GardenStatsGrid({ stats })` | Trees planted, knowledge items, Mighty Roots, garden mastery % (gold tiles when earned) + overall bar |
| `PlantedTreeList({ trees })` | Owned trees with an optional `illustration`, mastery bar, badges; "Practice 🌿" (`/deck/[slug]/drill`, only with statements) and "Edit roots" (`/deck/[slug]#grow-heading`). Empty state links to `/deck/new` |
| `formatJoined(iso)`, `gardenerName(email)` | Pure helpers (`lib/format.ts`); dates in `en-GB`, UTC, so server and client match |
| types | `GardenerView`, `GardenStatsView`, `PlantedTreeView` |

## Page (`src/app/profile/page.tsx`)
Signed out → `shared/components/SignInPrompt` (opens the login dialog). Signed in → `getCurrentUser` + `getGardenStats`, tree pictures from `garden`'s `TreeStageSvg`.

## May import
`@/shared/*` only

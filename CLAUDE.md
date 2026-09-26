@AGENTS.md

# MindGarden

Project rules, doc map, hard rules and definition of done live in the shared agent doc (imported below). Read it first, and read the matching doc it points to before writing code.

@01.share-docx/AGENTS.md

## Current state of the repo (read this before trusting the docs' commands)

The docs describe the target architecture. The code is early:

- Built so far: `src/shared/lib/supabase/{browser,server}.ts`, `src/shared/types/{database.types,result,errors}.ts`, `src/shared/lib/trapEngine.ts` (+ `trapDictionary.ts`, `shared/utils/seededRandom.ts`), `src/features/decks` (`getDecks`, `getDeckBySlug`, `server.ts` for drill), `src/features/garden` (`GardenGrid`, `TreeCard`), `src/features/drill` (`getDrillSession`, `checkDrillAnswer`, `DrillOverlay`), pages `/`, `/deck/[slug]` (mindmap is an outline placeholder), `/deck/[slug]/drill`.
- Next.js is **16.3.6** (React 19.2). Check `node_modules/next/dist/docs/` before using any Next API (see the Next.js block above).
- Installed: Supabase (`@supabase/ssr`, `@supabase/supabase-js`), `zod`, `server-only`, `lucide-react`, `canvas-confetti`, Tailwind v4, shadcn/ui.
- shadcn/ui: `components.json` aliases point to `@/shared/components/ui` and `@/shared/utils/cn`. Components import `cn` from the official `cn` npm package, so `npx shadcn add <name>` works as is.
- `database.types.ts` is **hand-written** from DATABASE.md. Replace it with `supabase gen types` output once migrations exist.
- Vitest 5 is set up (`vitest.config.mts`, `@` alias). Tests live in `src/**/__tests__/*.test.ts`; `npm test` runs once, `npm run test:watch` watches.
- **Not set up yet**: the Supabase CLI project (`supabase/` migrations folder), `admin.ts`, `proxy.ts` session refresh (planned with the auth feature). If a task needs one of these, set it up first or ask the user.
- Commands that work today: `npm run dev`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test`. Run `npx next typegen` before `tsc` after adding a route, so `PageProps<...>` knows it.

## Working notes

- The user writes in Vietnamese and English. Sample drill content can be in Vietnamese (e.g. `'Khi nhiệt độ tăng, áp suất khí lớn hơn.'`), so keep all text handling UTF-8 safe.
- The repo path contains non-ASCII characters (`Tài liệu`). Quote paths in shell commands.
- When you add a feature, also create `src/features/<feature>/context.md` (owned tables, exports, dependencies) as the docs require.

# MindGarden: Agent Instructions

> Entry point for AI coding agents (VS Code Copilot, Antigravity, and any tool that reads AGENTS.md).
> Keep this file short. Details live in the doc folders below. Read the matching doc BEFORE writing code.

## Project

- **What**: Gamified micro-learning. A Deck is a living Tree, mindmap nodes are underground Roots, knowledge items are plain-text statements drilled with trap choices. Mastery goes 0 → 5 per user per item (`shared/lib/mastery.ts`, `MAX_MASTERY`). Planting a tree costs 🪙 coins; only a tree's owner can practise it (visitors read, then clone).
- **Stack**: Next.js App Router (React 19, TypeScript strict), Tailwind + shadcn/ui, Supabase (PostgreSQL + Auth + RLS)
- **Architecture**: Monolith, feature-based. One folder per feature for server + UI: `src/features/{auth,decks,progress,drill,garden,mindmap,user-profile,tournament}` + `src/shared/`
- **Team**: Solo developer + AI assistants. Docs are the shared memory: keep them in sync with code.

## Read before you code

All paths in this file are relative to the repo root. `BE/` and `FE/` sit at the root, next to `01.share-docx/` (not inside it).

| If the task touches... | Read first |
|------------------------|------------|
| Tables, migrations, RLS, Supabase queries | `01.share-docx/DATABASE.md` |
| Server Actions, DTOs, error codes, response envelope | `01.share-docx/API SPEC.md` |
| Server folders, feature boundaries, trap engine | `BE/BE-ARCHITECTURE.md` |
| Actions, services, naming, git, backend tests | `BE/BE-PROJECT-RULE.md` |
| Routes, tree/root/drill UI, UI feature boundaries | `FE/FE-ARCHITECTURE.md` |
| Components, hooks, state, UI tests | `FE/FE-PROJECT-RULE.md` |
| A specific feature | `src/features/<feature>/context.md` |

## Doc map

Docs cross-reference each other with short names. They mean these files:

| Name used inside docs | Actual file |
|-----------------------|-------------|
| `DATABASE.md` | `01.share-docx/DATABASE.md` |
| `API_SPEC.md` | `01.share-docx/API SPEC.md` |
| `backend/ARCHITECTURE.md` | `BE/BE-ARCHITECTURE.md` |
| `backend/PROJECT-RULES.md` | `BE/BE-PROJECT-RULE.md` |
| `frontend/ARCHITECTURE.md` | `FE/FE-ARCHITECTURE.md` |
| `frontend/PROJECT-RULES.md` | `FE/FE-PROJECT-RULE.md` |
| Original project brief | `Context.md` |

Also: `ARCHITECTURE.md` / `PROJECT-RULES.md` without a folder means the file in the same folder (`BE/` or `FE/`) as the doc that mentions it (`BE-ARCHITECTURE.md`, `FE-PROJECT-RULE.md`, …).

## Hard rules (never break)

1. Plain text only. No LaTeX, KaTeX, MathJax, or OCR.
2. Validate every incoming payload with Zod before any DB call.
3. Every action returns `ActionResult<T>` = `{ success, data, meta? }` or `{ success: false, error: { code, message } }`. Codes: `01.share-docx/API SPEC.md` §5.
4. Get the user from `supabase.auth.getUser()` on the server. Never trust `user_id` from the client.
5. No Supabase queries in `page.tsx` or components. Call the feature's action.
6. Import other features only via `index.ts` (client-safe) or `server.ts` (server-only). Never import another feature's `actions/`, `services/` or `components/` directly.
7. Service role key only in `src/shared/lib/supabase/admin.ts` (`import 'server-only'`).
8. `src/shared/lib/trapEngine.ts` stays pure and deterministic: no `Math.random()`, no DB, no network.
9. Every new table gets RLS enabled + policies in the same migration.
10. No hearts, lives, or lockout timers in the UI. Feedback is gold (mastery) or amber (needs practice).

## Commands

```bash
npm run dev                  # start Next.js
npm run test                 # Vitest
npm run lint && npx tsc --noEmit
npx supabase db reset        # re-apply all migrations locally
npx supabase gen types typescript --project-id <PROJECT_ID> > src/shared/types/database.types.ts
```

## Definition of done

- [ ] Types check, lint passes, tests pass
- [ ] New schema → migration + RLS + regenerated `database.types.ts` + `01.share-docx/DATABASE.md` updated
- [ ] New/changed action → `01.share-docx/API SPEC.md` updated
- [ ] New/changed feature export → that feature's `context.md` updated
- [ ] Commit follows Conventional Commits: `feat(drill): ...`, `fix(progress): ...`, `docs: ...`
- [ ] Before creating any commit, review and update `PROJECT_STATUS.md` at the project root to reflect current architecture, database changes, and the latest commit history.

## When docs and code disagree

Stop and tell the user which file says what. Do not silently "fix" either side.
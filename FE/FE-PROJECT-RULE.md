# Frontend Project Rules
> **Read when**: building pages, components, hooks, or garden / mindmap / drill UI.
> **Related**: [ARCHITECTURE.md](./ARCHITECTURE.md) · [../API_SPEC.md](../API_SPEC.md) · [../backend/PROJECT-RULES.md](../backend/PROJECT-RULES.md)

## Overview
- **Stack**: Next.js App Router (React 19, TypeScript) · shadcn/ui (Radix) in `src/shared/components/ui/` · Tailwind CSS
- **Animation**: `canvas-confetti` + Tailwind transitions · **Data**: Server Actions (API_SPEC.md), envelope `{ success, data, meta, error }`

## 1. Feature Structure (UI part)
```
src/features/[feature-name]/
├── components/   # UI blocks (TreeCanvas.tsx, RootNode.tsx, DrillCard.tsx)
├── hooks/        # Client state + side effects; call Server Actions (useDrillSession.ts)
├── types/        # UI view models (TreeStage, DrillChoiceView)
├── __tests__/    # Vitest + React Testing Library
└── index.ts      # Client-safe public exports: components, hooks, types, actions
```
- Server folders (`actions/`, `services/`, `dto/`, `server.ts`) live in the same feature: see backend/PROJECT-RULES.md
- shadcn setup: `components.json` → `"aliases": { "ui": "@/shared/components/ui" }`

## 2. Naming Conventions
| Element | DO | DON'T |
|---------|----|-------|
| Components (PascalCase) | `TreeCanvas.tsx`, `RootNode.tsx`, `DrillCard.tsx` | `drill-card.tsx` |
| Hooks (camelCase, `use`) | `useDrillSession.ts`, `useTreeStage.ts` | `DrillSessionHook.ts` |
| Features (kebab-case) | `garden`, `mindmap`, `drill`, `auth` | `Garden`, `mind_map` |

## 3. Feature Rules
| DO | DON'T |
|----|-------|
| `import { DrillCard } from '@/features/drill'` | `import ... from '@/features/drill/components/DrillCard'` |
| Cross-feature via URL (`/deck/[slug]/drill?node=<id>`) or `src/shared/stores/` | `mindmap` importing `drill/hooks` |
| Compose features only in `app/**/page.tsx` | `garden` rendering `mindmap` components |

## 4. Component Structure (Imports → Types → Component → Export)
```tsx
'use client'
// 1. Imports: react/next → shared → feature-local
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/utils/cn'
import type { DrillChoiceView } from '../types'
// 2. Types (+ constants)
const FEEDBACK = { idle: 'border-border', pending: 'animate-pulse', correct: 'border-yellow-500 bg-yellow-50', practice: 'border-amber-500 bg-amber-50' } as const
type DrillCardProps = { prompt: string; choices: DrillChoiceView[]; onSelect: (tag: 'A' | 'B' | 'C') => void }
// 3. Component
function DrillCard({ prompt, choices, onSelect }: DrillCardProps) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-lg">{prompt}</p>
      {choices.map((c) => (
        <Button key={c.tag} variant="outline" onClick={() => onSelect(c.tag)}
          className={cn('w-full justify-start transition-colors duration-200', FEEDBACK[c.state])}>
          {c.text}
        </Button>
      ))}
    </div>
  )
}
// 4. Export (named only, re-exported from index.ts)
export { DrillCard }
```
- Every data component renders 4 states: `loading` (Skeleton) · `error` (Alert) · `empty` (CTA) · `success`

## 5. Routing (App Router params)
```tsx
// src/app/deck/[slug]/page.tsx: Server Component; params is a Promise in Next.js 15+
export default async function DeckPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const deck = await getDeckBySlug({ slug })                     // from '@/features/decks'
  if (!deck.success) notFound()
  const progress = await getProgressByDecks({ deckIds: [deck.data.deck.id] })   // from '@/features/progress'
  return <DeckScene deck={deck.data} progress={progress.success ? progress.data[0] : null} />
}
// Client: const { slug } = useParams<{ slug: string }>(); const nodeId = useSearchParams().get('node')
```

## 6. Data Fetching (Server Actions + Hooks)
```ts
// features/drill/hooks/useDrillSession.ts
export function useDrillSession(nodeId: string) {
  const [state, setState] = useState<DrillState>({ status: 'loading' })
  const [isPending, startTransition] = useTransition()
  const answer = (tag: 'A' | 'B' | 'C') => startTransition(async () => {
    const res = await submitDrillResult({ itemId: state.itemId, seed: state.seed, tag })   // from '@/features/progress'
    if (!res.success) return setState({ status: 'error', error: res.error })
    setState({ status: 'feedback', result: res.data })
  })
  return { state, isPending, answer }
}
```
- **Reads**: Server Components call actions directly (Section 5) · **Writes**: hooks + `useTransition`, then `router.refresh()`

## 7. State Management
| Kind | Where | Example |
|------|-------|---------|
| Local UI | `useState` in the component/hook | Selected choice, dialog open |
| Server | RSC props; refresh with `router.refresh()` after a write | Deck tree, progress |
| URL | `params` / `searchParams` | `/deck/[slug]`, `?node=<id>`, `?page=2` |
| Shared | React Context in `src/shared/stores/` | `StreakProvider`, `LoginDialogProvider` |
- DON'T copy server data into a global store or `useState` just to "cache" it

## 8. Gamification & Plain Text
- **Tree stage** from `masteryPercent`: 0–25 🌱 · 26–50 🌿 · 51–80 🪴 · 81–100 🌳✨ (frontend/ARCHITECTURE.md §5)
- **Feedback**: gold `border-yellow-500 bg-yellow-50` (mastery) · amber `border-amber-500 bg-amber-50` (needs practice); no red
- **Confetti** on mastery 3 or stage-up only: `confetti({ particleCount: 80, disableForReducedMotion: true })`
- **Text**: `whitespace-pre-wrap` plain text; DON'T use KaTeX, MathJax, or `dangerouslySetInnerHTML`
- DON'T show hearts, "lives left", life-deduction modals, or lockout timers

## 9. Anti-patterns (MUST NOT)
| DON'T | DO |
|-------|----|
| `submitDrillResult()` inside `RootNode.tsx` | Call it in `useDrillSession`, pass results as props |
| `createBrowserClient().from('decks')` in a component | Load in `page.tsx` via the feature action |
| Importing `@/features/progress/server` in a client file | Import actions from `@/features/progress` |
| `toast('Wrong! -1 ❤️')` | `toast('Almost! This root needs more water 🌿')` |

## 10. Git Workflow
| Item | DO | DON'T |
|------|----|-------|
| Branch | `feat/garden`, `fix/drill-feedback-color` | `ui-update`, `test2` |
| Commit | `feat(drill): add gold feedback state` · `fix(garden): stage 4 at 81%` · `style: format DrillCard` | `fix ui`, `WIP` |

## 11. Testing Priorities (Vitest + React Testing Library)
| Priority | Target | Example |
|----------|--------|---------|
| P1 | Pure helpers | `getTreeStage(80) → 3`, `getTreeStage(81) → 4` |
| P2 | Hooks | `useDrillSession`: `loading → answering → feedback`, `error` on `{ success: false }` |
| P3 | Component states | `DrillCard` gold on correct, amber on wrong; no heart/lives text |
| P4 | Accessibility | Choices reachable by keyboard; confetti off with reduced motion |
- Location: `src/features/<feature>/__tests__/`; mock Server Actions, never hit Supabase
# Database Documentation

> **Read when**: writing migrations, services, RLS policies, or any Supabase query.
> **Related**: [API_SPEC.md](./API_SPEC.md) · [backend/ARCHITECTURE.md](./backend/ARCHITECTURE.md) · [backend/PROJECT-RULES.md](./backend/PROJECT-RULES.md)

## Overview

- **Database**: PostgreSQL 15+ (hosted on Supabase)
- **Client**: `@supabase/supabase-js` (typed with generated `Database` types)
- **Auth**: Supabase Auth (`auth.users`), mirrored into `public.users`
- **Security**: Row Level Security (RLS) enabled on every table
- **Architecture**: Feature-based organization
- **Text Modality**: Plain text only (no LaTeX, no OCR)

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, plural | `decks`, `mindmap_nodes` |
| Columns | snake_case | `created_at`, `correct_stmt` |
| Foreign Keys | `[singular_table]_id` | `deck_id`, `knowledge_item_id` |
| Indexes | `idx_[table]_[column]` | `idx_decks_user_id` |
| RLS Policies | `"[table]: [action] [rule]"` | `"decks: read public or own"` |

---

## Entities by Feature

### Auth & System Feature

**roles** — *Static seed data (1 = admin, 2 = user)*
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PK (static, not generated) |
| name | VARCHAR(20) | NOT NULL, UNIQUE, CHECK IN ('admin', 'user') |

**users** — *Profile mirror of `auth.users`, auto-created on signup*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, FK → auth.users, ON DELETE CASCADE | Same ID as Supabase Auth account |
| role_id | INT | FK → roles, NOT NULL, DEFAULT 2 | New players are `user` |
| email | VARCHAR(255) | NOT NULL | Snapshot from signup |
| full_name | VARCHAR(100) | NULLABLE | Display name |
| avatar_url | VARCHAR(500) | NULLABLE | Profile picture |
| streak_count | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | Consecutive active days |
| last_active_at | DATE | NULLABLE | Drives streak logic |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### Decks & Mindmap Feature

**decks** — *A Deck is a living Tree*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | Deck owner |
| title | VARCHAR(150) | NOT NULL | "Cell Biology 101" |
| slug | VARCHAR(160) | NOT NULL, UNIQUE, CHECK kebab-case | "cell-biology-101" |
| description | TEXT | NULLABLE | |
| is_public | BOOLEAN | NOT NULL, DEFAULT TRUE | Visible to everyone |
| tree_type | VARCHAR(30) | NOT NULL, DEFAULT 'oak' | Visual skin: oak, pine, sakura… |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**mindmap_nodes** (self-referencing adjacency list) — *Nodes are underground Roots*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| deck_id | UUID | FK → decks, NOT NULL, ON DELETE CASCADE | |
| parent_id | UUID | FK → mindmap_nodes, NULLABLE, ON DELETE CASCADE | NULL = top-level root |
| title | VARCHAR(150) | NOT NULL | Concept name |
| sort_order | INT | NOT NULL, DEFAULT 0 | Order among siblings |

⚠️ Parent must be in the **same deck**: enforced by composite FK `(parent_id, deck_id) → (id, deck_id)`. `CHECK (parent_id <> id)` blocks self-parenting.

### Knowledge & Trap Engine Feature

**knowledge_items** — *Plain-text statements used to generate trap drills*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| node_id | UUID | FK → mindmap_nodes, NOT NULL, ON DELETE CASCADE | |
| prompt | TEXT | NOT NULL, non-empty | Question shown to the player |
| correct_stmt | TEXT | NOT NULL, non-empty, no LaTeX commands | The TRUE statement (plain text) |
| trap_rules | JSONB | NOT NULL, DEFAULT '{}', must be object | Rules for generating FALSE variants |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Example `trap_rules`:
```json
{
  "swaps": [
    { "from": "ATP", "to": "DNA" },
    { "from": "cellular respiration", "to": "photosynthesis" }
  ],
  "negate": true
}
```
Applied to `"Mitochondria produce ATP through cellular respiration."` → traps like `"Mitochondria produce DNA through cellular respiration."`

**Items created in the app** (`createKnowledgeItem`): authors write only the statement. The server stores `trap_rules = {"negate": true}` and `prompt` = the root's title; traps then come from the built-in dictionary (`shared/lib/trapDictionary.ts`). `swaps` stay supported for seeded or imported items.

### Progress & Gamification Feature

**user_progress** — *Decoupled progress: one row per player per item*
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users, NOT NULL, ON DELETE CASCADE | |
| knowledge_item_id | UUID | FK → knowledge_items, NOT NULL, ON DELETE CASCADE | |
| mastery_level | INT | NOT NULL, DEFAULT 0, CHECK 0–3 | 0 Seed → 1 Sprout → 2 Sapling → 3 Mighty Root |
| mistake_count | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | Times fooled by a trap |
| last_practiced_at | TIMESTAMPTZ | NULLABLE | |
| *(user_id, knowledge_item_id)* | — | UNIQUE | One progress row per player per item |

---

## ERD Diagram

```
roles
  └─1:N─► users ◄─1:1── auth.users   (handle_new_user() trigger)
            │
            ├─1:N─► decks
            │         └─1:N─► mindmap_nodes ◄──┐
            │                   │   └──────────┘ parent_id (self-ref 1:N)
            │                   └─1:N─► knowledge_items
            │                             │
            └─1:N─► user_progress ◄─N:1───┘
                    (N:M bridge: one row per user per knowledge_item)
```

---

## Key Relationships

| Relationship | Type | Notes |
|--------------|------|-------|
| auth.users → users | 1:1 | Auto-created by `handle_new_user()` trigger |
| roles → users | 1:N | Role-based access (ON DELETE RESTRICT) |
| users → decks | 1:N | Ownership drives RLS |
| decks → mindmap_nodes | 1:N | CASCADE |
| mindmap_nodes → mindmap_nodes | 1:N | Self-ref, same-deck only, subtree cascades |
| mindmap_nodes → knowledge_items | 1:N | CASCADE |
| **users ↔ knowledge_items** | N:M via `user_progress` | ⚠️ Decoupled progress: same public deck, separate progress per player |

---

## Conventions

- **Primary Key**: UUID v4 via `gen_random_uuid()` (exceptions: `roles.id` static INT, `users.id` copied from `auth.users`)
- **Cascades**: `ON DELETE CASCADE` on decks, nodes, items, progress
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (never plain `TIMESTAMP`)
- **Plain Text**: `correct_stmt` rejects backslash commands (`\frac`, `\sqrt`); validate with Zod first for friendly errors
- **JSONB**: `trap_rules` shape validated by Zod in `features/decks/dto` and read by `shared/lib/trapEngine.ts`, not in DB
- **Schema-qualify**: Always write `public.users` vs `auth.users`
- **Derived data**: Tree health is computed from `mastery_level`, never stored

---

## Indexes

```sql
-- Decks & Mindmap
CREATE INDEX idx_decks_user_id ON public.decks(user_id);
CREATE UNIQUE INDEX idx_decks_slug ON public.decks(slug);                 -- doubles as UNIQUE(slug)
CREATE INDEX idx_mindmap_nodes_deck_id ON public.mindmap_nodes(deck_id);
CREATE INDEX idx_mindmap_nodes_parent_id ON public.mindmap_nodes(parent_id);

-- Knowledge & Trap Engine
CREATE INDEX idx_knowledge_items_node_id ON public.knowledge_items(node_id);

-- Progress
CREATE UNIQUE INDEX idx_user_progress_user_item
  ON public.user_progress(user_id, knowledge_item_id);                    -- doubles as UNIQUE + upsert target
CREATE INDEX idx_user_progress_item_id ON public.user_progress(knowledge_item_id);  -- fast cascade deletes
```

---

## Row Level Security (RLS)

RLS is **enabled on all tables**. No policy = no access (except `service_role`).

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| roles | Everyone | ✗ | ✗ | ✗ |
| users | Self (admin: all) | ✗ (trigger only) | Self, `full_name` + `avatar_url` only | ✗ |
| decks | `is_public` OR owner | Owner | Owner | Owner |
| mindmap_nodes | If deck readable | Deck owner | Deck owner | Deck owner |
| knowledge_items | If deck readable | Deck owner | Deck owner | Deck owner |
| user_progress | Owner | Owner + item readable | Owner + item readable | ✗ |

```sql
-- Decks: public or own
CREATE POLICY "decks: read public or own" ON public.decks
  FOR SELECT TO anon, authenticated
  USING (is_public OR (SELECT auth.uid()) = user_id);

CREATE POLICY "decks: update own" ON public.decks
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Nodes: inherit from deck (same pattern for INSERT/UPDATE/DELETE with owner check)
CREATE POLICY "nodes: read if deck readable" ON public.mindmap_nodes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = mindmap_nodes.deck_id
      AND (d.is_public OR d.user_id = (SELECT auth.uid()))
  ));

-- Items: inherit via node → deck
CREATE POLICY "items: insert if deck owner" ON public.knowledge_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mindmap_nodes n
    JOIN public.decks d ON d.id = n.deck_id
    WHERE n.id = knowledge_items.node_id
      AND d.user_id = (SELECT auth.uid())
  ));

-- Progress: owner only, and only on items the player can see
CREATE POLICY "progress: insert own" ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.knowledge_items ki
                WHERE ki.id = user_progress.knowledge_item_id)
  );

-- Users: block role_id / streak edits from the client
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;
```

- **Perf**: Use `(SELECT auth.uid())` instead of bare `auth.uid()` so it's evaluated once per query
- **Full policy set**: see `supabase/migrations/*_rls_policies.sql`

### Answer secrecy (column privileges on `knowledge_items`)

RLS picks **rows**; it cannot hide **columns**. Without extra grants, `GET /rest/v1/knowledge_items?select=correct_stmt` with the public anon key returns every answer.
Migration `supabase/migrations/20260928000100_hide_knowledge_answers.sql` adds column-level privileges:

| Role | SELECT | INSERT / UPDATE |
|------|--------|-----------------|
| anon | `id`, `node_id`, `prompt`, `created_at` | ✗ |
| authenticated | `id`, `node_id`, `prompt`, `created_at` | `node_id`, `prompt`, `correct_stmt`, `trap_rules` (RLS: deck owner) |
| service_role | all | all |

- **Why the service role**: anything a Server Action can do with the player's JWT, the player can do from the browser too. Answers are read only with a key the browser never has
- **Code**: every `correct_stmt` / `trap_rules` read lives in `src/features/decks/services/answers.ts`, via `src/shared/lib/supabase/admin.ts`. The user's RLS client first proves the nodes/items are readable; the admin client then reads answers only for those ids. `decks/__tests__/answerSecrecy.test.ts` fails if any other file selects these columns
- **Writes**: authors still insert/update statements with their own session; Postgres needs SELECT on columns used in `WHERE` / `RETURNING`, so writes can't be used as an oracle and inserts return only `id`
- **Deploy order**: set `SUPABASE_SERVICE_ROLE_KEY` on the server → restart → run the migration. Without the key, `answers.ts` falls back to the user client (works only before the migration; after it, reads fail with `42501` and the server logs the fix)
- **New columns** on `knowledge_items` are not readable by anon/authenticated until granted explicitly (fail closed)

---

## Migration Rules

- **Location**: `supabase/migrations/`
- ⚠️ The base schema (tables, RLS, trigger) was created in the Supabase dashboard and is not in `supabase/migrations/` yet, so `npx supabase db reset` cannot rebuild it. Until it is, apply new migrations in the SQL Editor
- **Format**: `[timestamp]_[description].sql` (e.g., `20260923000200_decks_mindmap.sql`)
- **One feature per file**: auth_system → decks_mindmap → knowledge_trap_engine → progress_gamification → rls_policies
- **Forward-only**: Supabase has no `down()`; fix mistakes with a new migration, never edit an applied one
- **Test locally**: `npx supabase db reset` before pushing
- **Regenerate types** after every migration:

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > src/shared/types/database.types.ts
```

---

## Supabase Notes

```typescript
// src/shared/lib/supabase/browser.ts
import { createClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/shared/types/database.types'

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export type Deck = Tables<'decks'>
export type KnowledgeItem = Tables<'knowledge_items'>
```

```sql
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (new.id, new.email,
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'avatar_url');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Best Practices**:
- Each feature owns queries for its own tables; cross-feature access goes through that feature's exported functions
- Use `createServerClient<Database>` from `@supabase/ssr` in Server Components / Route Handlers
- Never expose the service role key (`NEXT_PUBLIC_*`); it bypasses RLS
- Validate mindmap moves in the app: DB blocks self/cross-deck parents, but not A → B → A cycles
- Slugs are globally unique; append a suffix on collision (`cell-biology-101-2`)
- ⚠️ Owners can update their own `mastery_level` via RLS; move writes to a `SECURITY DEFINER` RPC before adding leaderboards

---

## Progress Use Cases

| Action | Implementation |
|--------|----------------|
| Start drilling an item | Upsert `user_progress` with `onConflict: 'user_id,knowledge_item_id'` |
| Correct answer | `mastery_level = LEAST(mastery_level + 1, 3)`, set `last_practiced_at = now()` |
| Fooled by a trap | `mistake_count + 1`, `mastery_level = GREATEST(mastery_level - 1, 0)`, set `last_practiced_at = now()` |
| Load deck progress | `getProgressByDecks`: item IDs per deck (via `decks` server API) + `user_progress` rows of the user |
| Tree health | `Σ mastery_level / (3 × item count) × 100`, unpractised items count as 0 (computed, not stored) |
| Daily streak | `progress` service with the admin client: same day → unchanged, yesterday → +1, else → 1 |
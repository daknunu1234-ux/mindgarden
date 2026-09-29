-- ============================================================================
-- MindGarden baseline schema
-- ----------------------------------------------------------------------------
-- The foundation the later migrations build on (01.share-docx/DATABASE.md):
--   roles, users (+ handle_new_user trigger), decks, mindmap_nodes,
--   knowledge_items, user_progress: foreign keys, cascades, checks, indexes,
--   RLS on every table and the column grants for public.users.
--
-- Run order on a FRESH database (SQL Editor, or `npx supabase db reset`):
--   1. 20260928000000_initial_schema.sql        ← this file
--   2. 20260928000100_hide_knowledge_answers.sql (column privileges on knowledge_items)
--   3. 20260928000200_practice_days.sql          (streak log + backfill)
--
-- ⚠️ The existing hosted project was built in the dashboard before this file
-- existed. Do NOT run this there: it is written to be re-runnable (if not exists /
-- drop policy if exists), but it cannot reconcile differences with the dashboard
-- schema, and any dashboard policy with a different name would stay in place next
-- to these ones (permissive policies OR together).
-- ============================================================================

begin;

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase runs 15+): no extension needed.

-- ── Auth & System ───────────────────────────────────────────────────────────

create table if not exists public.roles (
  id   int         primary key,
  name varchar(20) not null unique check (name in ('admin', 'user'))
);

insert into public.roles (id, name) values (1, 'admin'), (2, 'user')
on conflict (id) do nothing;

create table if not exists public.users (
  id             uuid         primary key references auth.users (id) on delete cascade,
  role_id        int          not null default 2 references public.roles (id) on delete restrict,
  email          varchar(255) not null,
  full_name      varchar(100),
  avatar_url     varchar(500),
  streak_count   int          not null default 0 check (streak_count >= 0),
  last_active_at date,
  created_at     timestamptz  not null default now()
);

-- Auto-create the profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check for RLS. SECURITY DEFINER so a policy on public.users can ask it without
-- recursing into its own policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id = 1);
$$;

-- ── Decks & Mindmap ─────────────────────────────────────────────────────────

create table if not exists public.decks (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references public.users (id) on delete cascade,
  title       varchar(150) not null,
  -- Unique via idx_decks_slug below. Same rule as shared/utils/slugify.ts.
  slug        varchar(160) not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  is_public   boolean      not null default true,
  -- Species id validated by Zod (shared/lib/treeSkins.ts); unknown values render as oak.
  tree_type   varchar(30)  not null default 'oak',
  created_at  timestamptz  not null default now()
);

create table if not exists public.mindmap_nodes (
  id         uuid         primary key default gen_random_uuid(),
  deck_id    uuid         not null references public.decks (id) on delete cascade,
  parent_id  uuid,
  title      varchar(150) not null,
  sort_order int          not null default 0,
  -- Target of the same-deck parent FK below.
  constraint mindmap_nodes_id_deck_id_key unique (id, deck_id),
  -- A parent must live in the same deck; deleting a parent deletes its subtree.
  -- (MATCH SIMPLE: a NULL parent_id = top-level root, not checked.)
  constraint mindmap_nodes_parent_id_deck_id_fkey
    foreign key (parent_id, deck_id) references public.mindmap_nodes (id, deck_id) on delete cascade,
  constraint mindmap_nodes_no_self_parent check (parent_id <> id)
);

-- ── Knowledge & Trap Engine ─────────────────────────────────────────────────

create table if not exists public.knowledge_items (
  id           uuid        primary key default gen_random_uuid(),
  node_id      uuid        not null references public.mindmap_nodes (id) on delete cascade,
  prompt       text        not null check (char_length(btrim(prompt)) > 0),
  -- Plain text only (hard rule 1): no backslash commands such as \frac or \sqrt.
  correct_stmt text        not null check (char_length(btrim(correct_stmt)) > 0 and correct_stmt !~ '\\[A-Za-z]+'),
  trap_rules   jsonb       not null default '{}'::jsonb check (jsonb_typeof(trap_rules) = 'object'),
  created_at   timestamptz not null default now()
);

-- ── Progress & Gamification ─────────────────────────────────────────────────

create table if not exists public.user_progress (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.users (id) on delete cascade,
  knowledge_item_id uuid        not null references public.knowledge_items (id) on delete cascade,
  mastery_level     int         not null default 0 check (mastery_level between 0 and 3),
  mistake_count     int         not null default 0 check (mistake_count >= 0),
  last_practiced_at timestamptz
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

create index        if not exists idx_decks_user_id          on public.decks (user_id);
create unique index if not exists idx_decks_slug             on public.decks (slug);  -- doubles as UNIQUE(slug)
create index        if not exists idx_mindmap_nodes_deck_id   on public.mindmap_nodes (deck_id);
create index        if not exists idx_mindmap_nodes_parent_id on public.mindmap_nodes (parent_id);
create index        if not exists idx_knowledge_items_node_id on public.knowledge_items (node_id);
create unique index if not exists idx_user_progress_user_item on public.user_progress (user_id, knowledge_item_id);  -- upsert target
create index        if not exists idx_user_progress_item_id   on public.user_progress (knowledge_item_id);           -- fast cascades

-- ── Row Level Security ──────────────────────────────────────────────────────
-- (select auth.uid()) instead of auth.uid(): evaluated once per statement.

alter table public.roles           enable row level security;
alter table public.users           enable row level security;
alter table public.decks           enable row level security;
alter table public.mindmap_nodes   enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.user_progress   enable row level security;

-- roles: readable by everyone, never written through the API.
drop policy if exists "roles: read all" on public.roles;
create policy "roles: read all" on public.roles
  for select to anon, authenticated
  using (true);

-- users: self (admins: everyone); rows come only from the signup trigger.
drop policy if exists "users: read self or admin" on public.users;
create policy "users: read self or admin" on public.users
  for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "users: update self" on public.users;
create policy "users: update self" on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- decks: public or own; owners write.
drop policy if exists "decks: read public or own" on public.decks;
create policy "decks: read public or own" on public.decks
  for select to anon, authenticated
  using (is_public or (select auth.uid()) = user_id);

drop policy if exists "decks: insert own" on public.decks;
create policy "decks: insert own" on public.decks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "decks: update own" on public.decks;
create policy "decks: update own" on public.decks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Uprooting a tree (decks.deleteDeck); nodes, items and progress cascade.
drop policy if exists "decks: delete own" on public.decks;
create policy "decks: delete own" on public.decks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- mindmap_nodes: readable when the deck is; the deck owner writes.
drop policy if exists "nodes: read if deck readable" on public.mindmap_nodes;
create policy "nodes: read if deck readable" on public.mindmap_nodes
  for select to anon, authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = mindmap_nodes.deck_id
      and (d.is_public or d.user_id = (select auth.uid()))
  ));

drop policy if exists "nodes: insert if deck owner" on public.mindmap_nodes;
create policy "nodes: insert if deck owner" on public.mindmap_nodes
  for insert to authenticated
  with check (exists (
    select 1 from public.decks d
    where d.id = mindmap_nodes.deck_id and d.user_id = (select auth.uid())
  ));

drop policy if exists "nodes: update if deck owner" on public.mindmap_nodes;
create policy "nodes: update if deck owner" on public.mindmap_nodes
  for update to authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = mindmap_nodes.deck_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.decks d
    where d.id = mindmap_nodes.deck_id and d.user_id = (select auth.uid())
  ));

drop policy if exists "nodes: delete if deck owner" on public.mindmap_nodes;
create policy "nodes: delete if deck owner" on public.mindmap_nodes
  for delete to authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = mindmap_nodes.deck_id and d.user_id = (select auth.uid())
  ));

-- knowledge_items: readable when the deck is (columns narrowed by 20260928000100);
-- the deck owner writes, checked through node → deck.
drop policy if exists "items: read if deck readable" on public.knowledge_items;
create policy "items: read if deck readable" on public.knowledge_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.mindmap_nodes n
    join public.decks d on d.id = n.deck_id
    where n.id = knowledge_items.node_id
      and (d.is_public or d.user_id = (select auth.uid()))
  ));

drop policy if exists "items: insert if deck owner" on public.knowledge_items;
create policy "items: insert if deck owner" on public.knowledge_items
  for insert to authenticated
  with check (exists (
    select 1 from public.mindmap_nodes n
    join public.decks d on d.id = n.deck_id
    where n.id = knowledge_items.node_id and d.user_id = (select auth.uid())
  ));

drop policy if exists "items: update if deck owner" on public.knowledge_items;
create policy "items: update if deck owner" on public.knowledge_items
  for update to authenticated
  using (exists (
    select 1 from public.mindmap_nodes n
    join public.decks d on d.id = n.deck_id
    where n.id = knowledge_items.node_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.mindmap_nodes n
    join public.decks d on d.id = n.deck_id
    where n.id = knowledge_items.node_id and d.user_id = (select auth.uid())
  ));

drop policy if exists "items: delete if deck owner" on public.knowledge_items;
create policy "items: delete if deck owner" on public.knowledge_items
  for delete to authenticated
  using (exists (
    select 1 from public.mindmap_nodes n
    join public.decks d on d.id = n.deck_id
    where n.id = knowledge_items.node_id and d.user_id = (select auth.uid())
  ));

-- user_progress: the player's own rows, only on items they can see; no deletes
-- (rows go away with the item or the player through cascades).
drop policy if exists "progress: read own" on public.user_progress;
create policy "progress: read own" on public.user_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "progress: insert own" on public.user_progress;
create policy "progress: insert own" on public.user_progress
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.knowledge_items ki where ki.id = user_progress.knowledge_item_id)
  );

drop policy if exists "progress: update own" on public.user_progress;
create policy "progress: update own" on public.user_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.knowledge_items ki where ki.id = user_progress.knowledge_item_id)
  );

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants table privileges to anon/authenticated by default; RLS does the
-- row filtering. Narrow what RLS can't express:

-- roles: read-only for the API roles.
revoke insert, update, delete on table public.roles from anon, authenticated;

-- users: no API inserts/deletes (trigger only); players may edit only their display
-- fields, never role_id or the streak counters (those are written by the service role).
revoke insert, update, delete on table public.users from anon, authenticated;
revoke select on table public.users from anon;
grant update (full_name, avatar_url) on table public.users to authenticated;

-- The server (service role, src/shared/lib/supabase/admin.ts) keeps full access.
grant select, insert, update, delete on table
  public.roles, public.users, public.decks, public.mindmap_nodes, public.knowledge_items, public.user_progress
  to service_role;

commit;

-- ============================================================================
-- Verify (SQL Editor, after all three migrations)
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;   -- all t
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.mindmap_nodes'::regclass;          -- same-deck parent FK + no self-parent
-- -- Cascades: deleting a deck removes its nodes, items and progress rows.
-- -- Plain text: insert a correct_stmt containing '\frac{a}{b}' → check violation.

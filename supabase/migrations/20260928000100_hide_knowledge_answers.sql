-- ============================================================================
-- Hide drill answers from the public Data API
-- ----------------------------------------------------------------------------
-- Problem: RLS lets anyone who can read a deck SELECT every column of
-- knowledge_items, so `GET /rest/v1/knowledge_items?select=correct_stmt` with the
-- public anon key (or a player's own session) returns every answer.
--
-- Fix: column-level privileges. RLS still decides WHICH rows a role can see;
-- these grants decide WHICH columns. anon / authenticated keep the harmless
-- columns (id, node_id, prompt, created_at) and can still INSERT / UPDATE the
-- secret ones (the deck owner's editor), but can no longer read them back.
-- Only service_role (Next.js server, src/shared/lib/supabase/admin.ts) reads answers.
--
-- Why not a view or an RPC for anon/authenticated? Anything a Server Action can
-- run with the player's own JWT, the player can run too. Answers must be read
-- with a credential the browser never has: the service role key.
--
-- Deploy order:
--   1. Set SUPABASE_SERVICE_ROLE_KEY on the server and restart Next.js
--      (the app reads answers through the admin client once the key exists).
--   2. Run this migration (Supabase Dashboard → SQL Editor, or `npx supabase db push`).
-- Safe to re-run. Rollback at the bottom.
-- ============================================================================

begin;

-- 1. Drop table-wide SELECT from the API roles (Supabase grants it by default).
revoke select on table public.knowledge_items from anon, authenticated;

-- 2. Give back only the columns the app shows to players.
grant select (id, node_id, prompt, created_at) on table public.knowledge_items to anon, authenticated;

-- 3. Writes stay possible for authenticated (RLS still limits them to the deck owner).
--    Postgres requires SELECT on any column used in a WHERE / RETURNING, so a writer
--    cannot use UPDATE ... WHERE correct_stmt = '…' as an oracle, and inserts can only
--    RETURN id (the app uses `.insert(...).select('id')`).
grant insert (node_id, prompt, correct_stmt, trap_rules) on table public.knowledge_items to authenticated;
grant update (node_id, prompt, correct_stmt, trap_rules) on table public.knowledge_items to authenticated;
revoke insert, update on table public.knowledge_items from anon;

-- 4. The server keeps full access (service_role bypasses RLS; make its grant explicit).
grant select, insert, update, delete on table public.knowledge_items to service_role;

commit;

-- ============================================================================
-- Verify (run in the SQL Editor after the migration)
-- ============================================================================
-- set role anon;
-- select id, prompt from public.knowledge_items limit 1;      -- ok
-- select correct_stmt from public.knowledge_items limit 1;    -- ERROR: permission denied for table knowledge_items
-- select trap_rules from public.knowledge_items limit 1;      -- ERROR: permission denied
-- select * from public.knowledge_items limit 1;               -- ERROR: permission denied
-- reset role;
--
-- select grantee, column_name, privilege_type
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'knowledge_items' and grantee in ('anon', 'authenticated')
-- order by grantee, privilege_type, column_name;
--
-- Over HTTP (public key only): expect 401/403 with code 42501
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/knowledge_items?select=correct_stmt&limit=1" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"

-- ============================================================================
-- Rollback (restores the old, readable behaviour)
-- ============================================================================
-- begin;
-- grant select on table public.knowledge_items to anon, authenticated;
-- grant insert, update on table public.knowledge_items to authenticated;
-- commit;

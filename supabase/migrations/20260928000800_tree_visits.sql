-- ============================================================================
-- Visited Gardens: the shared trees a gardener has opened (one row per player per tree)
-- ----------------------------------------------------------------------------
-- The farm's left drawer lists only trees the player has personally opened on /deck/[slug],
-- grouped by gardener, newest visit first. Visiting a whole island (/?visit=<id>) records nothing.
--   • A visit counts only for a signed-in player, on ANOTHER gardener's PUBLIC tree.
--   • Re-opening a tree moves it to the top (visited_at = now()); there is one row per tree.
--   • Players read their own rows only. They can't write the table: record_tree_visit() is the
--     only writer, so a visit to a private tree or your own tree can't be forged through the API.
--   • Deleting the tree or the player deletes the rows (on delete cascade). A tree that goes
--     private again drops out of the drawer by itself (decks RLS hides it in the join).
--
-- Order: after 20260928000600_profiles_and_sharing.sql (uses ensure_user_profile). Safe to re-run.
-- ============================================================================

begin;

create table if not exists public.tree_visits (
  user_id    uuid        not null references public.users (id) on delete cascade,
  deck_id    uuid        not null references public.decks (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

-- The drawer: my visits, newest first. The PK covers user_id lookups; deck_id speeds up cascades.
create index if not exists idx_tree_visits_user_visited_at on public.tree_visits (user_id, visited_at desc);
create index if not exists idx_tree_visits_deck_id on public.tree_visits (deck_id);

-- RLS in the same migration (hard rule 9).
alter table public.tree_visits enable row level security;

drop policy if exists "tree_visits: read own" on public.tree_visits;
create policy "tree_visits: read own" on public.tree_visits
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: API roles only read. Make the grants match.
revoke all on table public.tree_visits from anon, authenticated;
grant select on table public.tree_visits to authenticated;
grant select, insert, update, delete on table public.tree_visits to service_role;

-- Records (or refreshes) the caller's visit to a tree. Returns true when a visit was saved, false
-- when the tree doesn't count: unknown, private, or the caller's own. Never an error for those,
-- so opening a tree never fails because of the drawer.
create or replace function public.record_tree_visit(p_deck_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  select d.user_id, d.is_public into v_owner, v_public from public.decks d where d.id = p_deck_id;
  if not found or not v_public or v_owner = v_user then
    return false;
  end if;

  -- tree_visits.user_id references public.users: make sure the caller has a profile row.
  perform public.ensure_user_profile();

  insert into public.tree_visits (user_id, deck_id, visited_at)
  values (v_user, p_deck_id, now())
  on conflict (user_id, deck_id) do update set visited_at = excluded.visited_at;
  return true;
end;
$$;

revoke all on function public.record_tree_visit(uuid) from public, anon;
grant execute on function public.record_tree_visit(uuid) to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where tablename = 'tree_visits';        -- t
-- select public.record_tree_visit('<someone else''s public deck id>');                 -- t (as a player)
-- select public.record_tree_visit('<your own deck id>');                              -- f
-- set role anon; select * from public.tree_visits;                                     -- ERROR: permission denied
-- reset role;

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.record_tree_visit(uuid);
-- drop table if exists public.tree_visits;

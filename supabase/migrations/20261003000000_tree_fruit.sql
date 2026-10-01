-- ============================================================================
-- Tree fruit: a tree you drilled yesterday bears fruit today
-- ----------------------------------------------------------------------------
-- At the gardener's midnight, every tree they practised the day before bears fruit worth 2 🪙
-- (shared/lib/economy.ts FRUIT_COINS), harvestable once that day. Any growth stage bears fruit.
--
-- deck_practice_days   one row per gardener per tree per local day with at least one saved (owner)
--                      practice answer. user_progress.last_practiced_at can't prove "yesterday" (every
--                      answer overwrites it), and practice_days is per gardener, not per tree.
--                      Written only by the server (service role) when an answer is saved; Mind
--                      Tournament answers never count (they never touch the player's own progress).
-- tree_harvests        one row per gardener per tree per day they harvested: the ledger that makes a
--                      tree's fruit claimable once a day.
-- harvest_tree_fruit() the only way to collect: service role only (the server action computes "today"
--                      from the server clock and the player's timezone, so a player can't pick the
--                      date). In one transaction: the tree must be the gardener's, they must have
--                      practised it on p_today - 1, and today's harvest must be the first; then the
--                      ledger row is written and users.coins grows by 2.
-- Withering (grey, still trees after 72 h without practice, immune from growth stage 4) is computed in
-- the app from the practice timestamps and needs nothing here.
--
-- Order: after 20261002000000_move_garden_placement.sql (needs practice_days and the seed economy).
-- Safe to re-run.
-- ============================================================================

begin;

create table if not exists public.deck_practice_days (
  user_id    uuid not null references public.users(id) on delete cascade,
  deck_id    uuid not null references public.decks(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id, day)
);
create index if not exists idx_deck_practice_days_deck_id on public.deck_practice_days(deck_id);

create table if not exists public.tree_harvests (
  user_id    uuid not null references public.users(id) on delete cascade,
  deck_id    uuid not null references public.decks(id) on delete cascade,
  day        date not null,
  coins      integer not null check (coins > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id, day)
);
create index if not exists idx_tree_harvests_deck_id on public.tree_harvests(deck_id);

alter table public.deck_practice_days enable row level security;
alter table public.tree_harvests enable row level security;

drop policy if exists "deck_practice_days: read own" on public.deck_practice_days;
create policy "deck_practice_days: read own" on public.deck_practice_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tree_harvests: read own" on public.tree_harvests;
create policy "tree_harvests: read own" on public.tree_harvests
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Players read their own rows; only the server writes.
revoke insert, update, delete on public.deck_practice_days from anon, authenticated;
revoke insert, update, delete on public.tree_harvests from anon, authenticated;
grant select on public.deck_practice_days to authenticated;
grant select on public.tree_harvests to authenticated;

create or replace function public.harvest_tree_fruit(p_user_id uuid, p_deck_id uuid, p_today date)
returns table (coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fruit constant integer := 2; -- FRUIT_COINS
  v_owner uuid;
  v_total integer;
begin
  if p_user_id is null or p_deck_id is null or p_today is null then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  select d.user_id into v_owner from public.decks d where d.id = p_deck_id;
  if v_owner is null or v_owner <> p_user_id then
    raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.deck_practice_days p
     where p.user_id = p_user_id and p.deck_id = p_deck_id and p.day = p_today - 1
  ) then
    raise exception 'FRUIT_NOT_READY' using errcode = 'P0001';
  end if;

  -- Lock the purse, then claim today's fruit: the primary key lets only the first claim through.
  perform 1 from public.users u where u.id = p_user_id for update;
  insert into public.tree_harvests (user_id, deck_id, day, coins)
  values (p_user_id, p_deck_id, p_today, v_fruit)
  on conflict (user_id, deck_id, day) do nothing;
  if not found then
    raise exception 'FRUIT_NOT_READY' using errcode = 'P0001';
  end if;

  update public.users u set coins = u.coins + v_fruit where u.id = p_user_id returning u.coins into v_total;
  return query select v_fruit, v_total;
end;
$$;

revoke all on function public.harvest_tree_fruit(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.harvest_tree_fruit(uuid, uuid, date) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- (service role) insert into public.deck_practice_days (user_id, deck_id, day) values ('<you>', '<tree>', current_date - 1);
-- (service role) select * from public.harvest_tree_fruit('<you>', '<tree>', current_date);   -- 2, purse + 2
-- (service role) select * from public.harvest_tree_fruit('<you>', '<tree>', current_date);   -- ERROR: FRUIT_NOT_READY (already harvested)
-- set role authenticated; select * from public.harvest_tree_fruit('<you>', '<tree>', current_date); -- ERROR: permission denied
-- set role authenticated; insert into public.tree_harvests values ('<you>', '<tree>', current_date, 2); -- ERROR: permission denied

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.harvest_tree_fruit(uuid, uuid, date);
-- drop table if exists public.tree_harvests;
-- drop table if exists public.deck_practice_days;

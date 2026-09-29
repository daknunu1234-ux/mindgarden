-- ============================================================================
-- Reliable starter purse for every signup (email + OAuth), and private-by-default trees
-- ----------------------------------------------------------------------------
-- A. Starter coins
--   • handle_new_user() reads OAuth (Google) metadata too: full_name → name, avatar_url →
--     picture, and always inserts coins = 300.
--   • ensure_user_profile(): creates the caller's missing public.users row (300 coins) and
--     returns their balance. The app calls it after every login (/auth/callback) and whenever
--     a balance read finds no row, so a signup whose trigger didn't run still gets its purse.
--     (users.coins is NOT NULL, so "coins IS NULL" can't happen: a missing ROW is the real gap.)
--   • Backfill: every auth user without a profile row gets one now, with 300 coins.
--   • plant_deck() makes sure the profile row exists before charging, so a player with a
--     missing row sees a real balance instead of a misleading INSUFFICIENT_COINS.
-- B. Sharing
--   • decks.is_public already exists (NOT NULL). New trees are now private by default
--     (DEFAULT false); existing trees keep their current visibility.
--
-- Order: after 20260928000500_seed_economy.sql. Safe to re-run. Rollback at the bottom.
-- ============================================================================

begin;

-- A1. Signup trigger: email and OAuth metadata, 300 coins.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, coins)
  values (
    new.id,
    coalesce(new.email, ''),
    -- Email signups send full_name; Google sends full_name and/or name.
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ''),
    -- Google puts the photo in picture.
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''), ''),
    300  -- starting purse (STARTING_COINS in shared/lib/economy.ts)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A2. Self-healing profile: the caller's row, created with the starter purse if missing.
create or replace function public.ensure_user_profile()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_coins integer;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  insert into public.users (id, email, full_name, avatar_url, coins)
  select u.id,
         coalesce(u.email, ''),
         nullif(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), ''),
         nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', ''), ''),
         300
    from auth.users u
   where u.id = v_user
  on conflict (id) do nothing;   -- an existing row (and its balance) is never touched

  select coins into v_coins from public.users where id = v_user;
  return coalesce(v_coins, 0);
end;
$$;

revoke all on function public.ensure_user_profile() from public, anon;
grant execute on function public.ensure_user_profile() to authenticated, service_role;

-- A3. Backfill profiles that the trigger never created.
insert into public.users (id, email, full_name, avatar_url, coins)
select u.id,
       coalesce(u.email, ''),
       nullif(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), ''),
       nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', ''), ''),
       300
  from auth.users u
 where not exists (select 1 from public.users p where p.id = u.id)
on conflict (id) do nothing;

-- B1. Trees are private until their owner shares them.
alter table public.decks alter column is_public set default false;

-- A4 + B2. plant_deck: profile row guaranteed, private by default.
create or replace function public.plant_deck(
  p_title       text,
  p_slug        text,
  p_description text,
  p_is_public   boolean,
  p_tree_type   text
)
returns table (deck_id uuid, remaining_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_left integer;
  v_deck uuid;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  -- A player whose profile row is missing gets it (with the starter purse) before paying.
  perform public.ensure_user_profile();

  update public.users
     set coins = coins - 100  -- seed price (SEED_PRICE_COINS in shared/lib/economy.ts)
   where id = v_user and coins >= 100
  returning coins into v_left;

  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = 'A tree seed costs 100 coins';
  end if;

  insert into public.decks (user_id, title, slug, description, is_public, tree_type)
  values (v_user, p_title, p_slug, p_description, coalesce(p_is_public, false), coalesce(p_tree_type, 'oak'))
  returning id into v_deck;

  return query select v_deck, v_left;
end;
$$;

revoke all on function public.plant_deck(text, text, text, boolean, text) from public, anon;
grant execute on function public.plant_deck(text, text, text, boolean, text) to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select count(*) from auth.users u where not exists (select 1 from public.users p where p.id = u.id);  -- 0
-- select column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'decks' and column_name = 'is_public';               -- false

-- ============================================================================
-- Rollback (profiles created by the backfill are kept)
-- ============================================================================
-- begin;
-- drop function if exists public.ensure_user_profile();
-- alter table public.decks alter column is_public set default true;
-- commit;

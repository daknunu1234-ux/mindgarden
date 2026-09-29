-- ============================================================================
-- Seed economy: 300 🪙 starting purse, 100 🪙 per tree seed
-- ----------------------------------------------------------------------------
-- • New gardeners start with 300 coins (3 seeds): users.coins DEFAULT 300, and the
--   signup trigger sets it explicitly.
-- • Existing gardeners are topped up to at least 300 once (coins = greatest(coins, 300)).
-- • Planting a tree costs 100 coins. plant_deck() charges and inserts in ONE transaction:
--   no coins → nothing is inserted; a slug collision (23505) rolls the charge back too.
-- • Players can no longer INSERT into decks directly (that would skip the fee): the
--   only way to plant is plant_deck(), which runs as the signed-in player (auth.uid()).
-- • dev_grant_coins(): test top-ups for the Coin Shop's "Simulate Top-up (Dev Mode)".
--   Service role only; the Next.js server refuses to call it in production builds.
--   Real payments (webhooks) come in a later milestone.
--
-- Order: after 20260928000300_user_coins.sql (needs users.coins). Safe to re-run.
-- Rollback at the bottom.
-- ============================================================================

begin;

-- 1. Starting purse.
alter table public.users alter column coins set default 300;

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
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    300  -- starting purse: 3 tree seeds (keep in sync with STARTING_COINS in shared/lib/economy.ts)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- (Re)attach the trigger in case the dashboard-built schema named it differently.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. One-time top-up for gardeners who signed up before the seed economy.
update public.users set coins = greatest(coins, 300) where coins < 300;

-- 3. Paid planting. Runs as the caller: auth.uid() is the owner, never a client-supplied id.
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

  -- Charge first: the row lock makes concurrent plants queue up, and coins >= 100 in the
  -- WHERE means a purse can never go negative.
  update public.users
     set coins = coins - 100  -- seed price (SEED_PRICE_COINS in shared/lib/economy.ts)
   where id = v_user and coins >= 100
  returning coins into v_left;

  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = 'A tree seed costs 100 coins';
  end if;

  -- A duplicate slug raises 23505 here and undoes the charge above (same transaction).
  insert into public.decks (user_id, title, slug, description, is_public, tree_type)
  values (v_user, p_title, p_slug, p_description, coalesce(p_is_public, true), coalesce(p_tree_type, 'oak'))
  returning id into v_deck;

  return query select v_deck, v_left;
end;
$$;

revoke all on function public.plant_deck(text, text, text, boolean, text) from public, anon;
grant execute on function public.plant_deck(text, text, text, boolean, text) to authenticated, service_role;

-- Planting only through plant_deck (which pays). Owners still update / delete their decks.
revoke insert on table public.decks from anon, authenticated;

-- 4. Test top-ups (no real payment yet). Server-only; amount capped to the shop's packages.
create or replace function public.dev_grant_coins(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 100 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  update public.users set coins = coins + p_amount where id = p_user_id returning coins into v_total;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_total;
end;
$$;

revoke all on function public.dev_grant_coins(uuid, integer) from public, anon, authenticated;
grant execute on function public.dev_grant_coins(uuid, integer) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'users' and column_name = 'coins';   -- 300
-- select min(coins) from public.users;                                                 -- ≥ 300 right after
-- set role authenticated;
-- insert into public.decks (user_id, title, slug) values (gen_random_uuid(), 'x', 'x'); -- ERROR: permission denied
-- select public.dev_grant_coins(gen_random_uuid(), 10);                               -- ERROR: permission denied
-- reset role;

-- ============================================================================
-- Rollback (restores free planting; balances are not reverted)
-- ============================================================================
-- begin;
-- drop function if exists public.plant_deck(text, text, text, boolean, text);
-- drop function if exists public.dev_grant_coins(uuid, integer);
-- grant insert on table public.decks to authenticated;
-- alter table public.users alter column coins set default 0;
-- commit;

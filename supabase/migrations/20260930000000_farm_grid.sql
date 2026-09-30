-- ============================================================================
-- Farm grid (Hay Day style): placeable trees, structures, landscape, decorations and animals
-- ----------------------------------------------------------------------------
-- Each gardener's farm is a 16 × 16 isometric grid (tiles 0–15 on both axes). Everything on it is a
-- row of garden_placements with its top-left tile (grid_x, grid_y) and footprint (width × height).
--   • Trees are the player's own decks, placed for free; every other item is bought with coins.
--   • The catalogue (price + footprint) lives HERE, in purchase_and_place_item(): the client only
--     says what and where, so it can't choose its own price or size. The same numbers are in
--     src/features/garden/lib/farmCatalog.ts (a test checks they match).
--   • No overlaps, no tile outside the grid, one placement per deck: checked in the function.
--   • Players read their own farm, and a visitor sees another farm's items and PUBLIC trees only.
--     They can delete (pick up) their own placements, but never insert or update directly.
--
-- Buffs (mirrored by src/features/garden/lib/farmBuffs.ts, tested):
--   • Stream next to a tree (x±1 or y±1)                → ×1.2 coins earned on that tree's statements
--   • Farmer's House whose 4 × 4 area (its 2 × 2 + 1 tile
--     all round) covers the tree                        → ×1.5; both stack to ×1.8
--   • Woodshop anywhere on the farm                     → chopping (deleting) a tree refunds
--     floor(25% of its statements) coins, at most 50 (half a seed, so chopping never profits)
--   Coins are still paid once per statement mastered (award_mastery_coin); the multiplier applies to
--   that payout, with the fraction carried over in users.coin_carry so ×1.2 is not lost to rounding.
--
-- Order: after 20260928001000_display_names.sql. Safe to re-run.
-- ============================================================================

begin;

-- 1. Placements ---------------------------------------------------------------
create table if not exists public.garden_placements (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  item_type  text        not null check (item_type in ('tree', 'fence', 'stream', 'farmer_house', 'woodshop', 'rockery', 'animal')),
  -- A tree is a deck: deleting (chopping) the deck removes its placement too.
  deck_id    uuid        references public.decks (id) on delete cascade,
  grid_x     integer     not null check (grid_x between 0 and 15),
  grid_y     integer     not null check (grid_y between 0 and 15),
  width      integer     not null default 1 check (width between 1 and 2),
  height     integer     not null default 1 check (height between 1 and 2),
  variant    text        check (variant is null or char_length(variant) <= 20),
  created_at timestamptz not null default now(),
  constraint unique_farm_tile unique (user_id, grid_x, grid_y),
  constraint garden_tree_has_deck check ((item_type = 'tree') = (deck_id is not null)),
  constraint garden_inside_grid check (grid_x + width <= 16 and grid_y + height <= 16)
);

create index if not exists idx_garden_placements_user_id on public.garden_placements (user_id);
-- A deck stands on at most one tile.
create unique index if not exists idx_garden_placements_deck_id on public.garden_placements (deck_id) where deck_id is not null;

-- 2. RLS (hard rule 9) ----------------------------------------------------------
alter table public.garden_placements enable row level security;

drop policy if exists "garden_placements: read own or public" on public.garden_placements;
create policy "garden_placements: read own or public" on public.garden_placements
  for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or item_type <> 'tree'
    or exists (select 1 from public.decks d where d.id = garden_placements.deck_id and d.is_public)
  );

drop policy if exists "garden_placements: delete own" on public.garden_placements;
create policy "garden_placements: delete own" on public.garden_placements
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.garden_placements from anon, authenticated;
grant select on table public.garden_placements to anon, authenticated;
grant delete on table public.garden_placements to authenticated;
grant select, insert, update, delete on table public.garden_placements to service_role;

-- 3. Buy (or plant) and place, atomically -----------------------------------------
-- Price and footprint come from the catalogue below, never from the client. Trees are free and
-- must be the caller's own unplaced deck; animals need variant 'cow' or 'pig'.
create or replace function public.purchase_and_place_item(
  p_item_type text,
  p_x         integer,
  p_y         integer,
  p_deck_id   uuid default null,
  p_variant   text default null
)
returns table (placement_id uuid, remaining_coins integer, cost integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- OUT columns share names with table columns: prefer the columns.
declare
  v_user  uuid := auth.uid();
  v_cost  integer;
  v_w     integer := 1;
  v_h     integer := 1;
  v_left  integer;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  -- Catalogue (keep in sync with farmCatalog.ts). In a PL/pgSQL CASE statement every statement,
  -- including the last one of each branch, ends with a semicolon.
  case p_item_type
    when 'tree'         then v_cost := 0;
    when 'farmer_house' then v_cost := 50; v_w := 2; v_h := 2;
    when 'woodshop'     then v_cost := 50; v_w := 2; v_h := 2;
    when 'stream'       then v_cost := 5;
    when 'fence'        then v_cost := 1;
    when 'rockery'      then v_cost := 2;
    when 'animal'       then v_cost := 5;
    else raise exception 'UNKNOWN_ITEM' using errcode = 'P0001';
  end case;

  if p_item_type = 'animal' and coalesce(p_variant, '') not in ('cow', 'pig') then
    raise exception 'UNKNOWN_ITEM' using errcode = 'P0001';
  end if;
  if p_item_type = 'tree' then
    if p_deck_id is null or not exists (select 1 from public.decks d where d.id = p_deck_id and d.user_id = v_user) then
      raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.garden_placements g where g.deck_id = p_deck_id) then
      raise exception 'TREE_ALREADY_PLACED' using errcode = 'P0001';
    end if;
  end if;

  if p_x < 0 or p_y < 0 or p_x + v_w > 16 or p_y + v_h > 16 then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Serialize this gardener's placements (and purse) while checking for overlaps.
  perform 1 from public.users u where u.id = v_user for update;
  if exists (
    select 1 from public.garden_placements g
     where g.user_id = v_user
       and g.grid_x < p_x + v_w and p_x < g.grid_x + g.width
       and g.grid_y < p_y + v_h and p_y < g.grid_y + g.height
  ) then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.users u set coins = u.coins - v_cost
   where u.id = v_user and u.coins >= v_cost
  returning u.coins into v_left;
  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = format('This costs %s coins', v_cost);
  end if;

  insert into public.garden_placements (user_id, item_type, deck_id, grid_x, grid_y, width, height, variant)
  values (v_user, p_item_type, case when p_item_type = 'tree' then p_deck_id end, p_x, p_y, v_w, v_h,
          case when p_item_type = 'animal' then p_variant end)
  returning id into v_id;

  return query select v_id, v_left, v_cost;
end;
$$;

revoke all on function public.purchase_and_place_item(text, integer, integer, uuid, text) from public, anon;
grant execute on function public.purchase_and_place_item(text, integer, integer, uuid, text) to authenticated, service_role;

-- 4. Coin buffs on mastery payouts --------------------------------------------------
alter table public.users add column if not exists coin_carry numeric(6,3) not null default 0 check (coin_carry >= 0 and coin_carry < 1);

-- ×1.2 for a stream next to the tree's tile, ×1.5 inside a Farmer's House 4 × 4 area, stacked.
create or replace function public.farm_coin_multiplier(p_user_id uuid, p_deck_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (case when exists (
              select 1 from public.garden_placements s
               where s.user_id = p_user_id and s.item_type = 'stream'
                 and abs(s.grid_x - t.grid_x) + abs(s.grid_y - t.grid_y) = 1
            ) then 1.2 else 1 end)
         * (case when exists (
              select 1 from public.garden_placements h
               where h.user_id = p_user_id and h.item_type = 'farmer_house'
                 and t.grid_x between h.grid_x - 1 and h.grid_x + 2
                 and t.grid_y between h.grid_y - 1 and h.grid_y + 2
            ) then 1.5 else 1 end)
      from public.garden_placements t
     where t.user_id = p_user_id and t.item_type = 'tree' and t.deck_id = p_deck_id
  ), 1)::numeric;
$$;

revoke all on function public.farm_coin_multiplier(uuid, uuid) from public, anon, authenticated;
grant execute on function public.farm_coin_multiplier(uuid, uuid) to service_role;

-- award_mastery_coin (migration 20260928000400): same once-per-item claim at 5/5, same signature,
-- but the payout is 1 × the farm multiplier of the item's tree, with the fraction carried over.
create or replace function public.award_mastery_coin(p_user_id uuid, p_item_id uuid)
returns table (coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- OUT columns share names with table columns: prefer the columns.
declare
  v_claimed boolean := false;
  v_total   integer;
  v_deck    uuid;
  v_amount  numeric;
  v_pay     integer;
begin
  update public.user_progress
     set coin_awarded_at = now()
   where user_id = p_user_id
     and knowledge_item_id = p_item_id
     and mastery_level = 5
     and coin_awarded_at is null
  returning true into v_claimed;

  -- No row claimed leaves v_claimed NULL (not false): only a real claim pays.
  if not coalesce(v_claimed, false) then
    select u.coins into v_total from public.users u where u.id = p_user_id;
    return query select 0, coalesce(v_total, 0);
    return;
  end if;

  select n.deck_id into v_deck
    from public.knowledge_items ki join public.mindmap_nodes n on n.id = ki.node_id
   where ki.id = p_item_id;

  select 1 * public.farm_coin_multiplier(p_user_id, v_deck) + u.coin_carry into v_amount
    from public.users u where u.id = p_user_id for update;
  v_pay := floor(coalesce(v_amount, 1))::integer;

  update public.users u
     set coins = u.coins + v_pay,
         coin_carry = coalesce(v_amount, 1) - v_pay
   where u.id = p_user_id
  returning u.coins into v_total;
  return query select v_pay, coalesce(v_total, 0);
end;
$$;

revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;

-- 5. Chop a tree (delete the deck) with the Woodshop refund -------------------------
-- Owner only. Deletes the deck (roots, statements, progress and its placement cascade) and, when
-- the owner has a Woodshop placed, refunds least(floor(statements × 0.25), 50) coins.
create or replace function public.uproot_deck(p_deck_id uuid)
returns table (deck_id uuid, refund integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- OUT columns share names with table columns: prefer the columns.
declare
  v_user       uuid := auth.uid();
  v_statements integer;
  v_refund     integer := 0;
  v_total      integer;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;
  if not exists (select 1 from public.decks d where d.id = p_deck_id and d.user_id = v_user) then
    raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_statements
    from public.knowledge_items ki join public.mindmap_nodes n on n.id = ki.node_id
   where n.deck_id = p_deck_id;
  if exists (select 1 from public.garden_placements g where g.user_id = v_user and g.item_type = 'woodshop') then
    v_refund := least(floor(v_statements * 0.25)::integer, 50);
  end if;

  delete from public.decks d where d.id = p_deck_id and d.user_id = v_user;
  update public.users u set coins = u.coins + v_refund where u.id = v_user returning u.coins into v_total;

  return query select p_deck_id, v_refund, coalesce(v_total, 0);
end;
$$;

revoke all on function public.uproot_deck(uuid) from public, anon;
grant execute on function public.uproot_deck(uuid) to authenticated, service_role;

-- 6. Backfill: existing trees get a tile (every other tile from (1, 1), 7 per row), so today's
--    farms don't open empty. Newer or overflowing trees wait in the Shop's Trees tab.
insert into public.garden_placements (user_id, item_type, deck_id, grid_x, grid_y)
select d.user_id, 'tree', d.id, 1 + (d.n % 7) * 2, 1 + (d.n / 7) * 2
  from (
    select d.id, d.user_id, (row_number() over (partition by d.user_id order by d.created_at, d.id) - 1)::integer as n
      from public.decks d
     where not exists (select 1 from public.garden_placements g where g.deck_id = d.id)
  ) d
 where d.n < 49
on conflict do nothing;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where tablename = 'garden_placements';     -- t
-- set role authenticated; insert into public.garden_placements (user_id, item_type, grid_x, grid_y)
--   values (auth.uid(), 'woodshop', 0, 0);                                                -- ERROR: permission denied
-- select * from public.purchase_and_place_item('stream', 3, 4);                           -- as a player: charges 5 🪙

-- ============================================================================
-- Rollback
-- ============================================================================
-- (re-run award_mastery_coin from 20260928000400_mastery_scale_5.sql)
-- drop function if exists public.uproot_deck(uuid);
-- drop function if exists public.farm_coin_multiplier(uuid, uuid);
-- drop function if exists public.purchase_and_place_item(text, integer, integer, uuid, text);
-- alter table public.users drop column if exists coin_carry;
-- drop table if exists public.garden_placements;

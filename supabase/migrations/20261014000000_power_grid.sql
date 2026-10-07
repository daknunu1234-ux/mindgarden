-- ============================================================================
-- Power grid, windmills, Furniture Factory, Seaport and the island's export loop
-- ----------------------------------------------------------------------------
-- New buildings (keep in sync with src/features/garden/lib/farmCatalog.ts; tests check):
--   windmill_small     2 × 2   60 coins   power field: footprint + 1 tile around (4 × 4)
--   windmill_large     6 × 6  100 coins   power field: footprint + 3 tiles around (12 × 12)
--   furniture_factory  2 × 2  120 coins   needs power
--   seaport            6 × 2  150 coins   needs power; coast only (its 6-tile edge on the shore:
--                                         grid_y = 0 or grid_y + 2 = 16)
-- A building that needs power works while its footprint touches a power field
-- (farm_building_powered(); lib/powerGrid.ts checkIsPowered).
--
-- Retired: farmer_house and woodshop are no longer sold (ITEM_RETIRED). Those already standing keep
-- working, moving and paying their buffs (farm_coin_multiplier(), uproot_deck() are unchanged).
--
-- Export loop (lib/farmEconomy.ts): settle_farm_economy() brings the caller's farm up to date from
-- timestamps: trees make timber, animals produce, powered factories turn 2 timber into 1 furniture,
-- and a powered seaport's cargo ship calls every 4 hours, buying the stock for up to 15 coins. All on
-- the server; players can read their stock but never write it.
--
-- Order: after 20260930000000_farm_grid.sql and 20261002000000_move_garden_placement.sql (it
-- re-creates both functions). Any time after them, before or with the deploy of the power-grid code
-- (older code never sends the new item types). Safe to re-run.
-- ============================================================================

begin;

-- 1. Bigger footprints and the new item types -------------------------------------
do $$
declare
  r record;
begin
  -- The inline checks from 20260930000000 (item_type list; width / height between 1 and 2), whatever
  -- their generated names.
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.garden_placements'::regclass
       and con.contype = 'c'
       and (pg_get_constraintdef(con.oid) like '%item_type%' or pg_get_constraintdef(con.oid) ~ '(width|height).*BETWEEN 1 AND 2|(width|height) >= 1')
       and con.conname not in ('garden_tree_has_deck', 'garden_inside_grid')
  loop
    execute format('alter table public.garden_placements drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.garden_placements
  add constraint garden_placements_item_type_check check (item_type in (
    'tree', 'fence', 'stream', 'farmer_house', 'woodshop', 'rockery', 'animal',
    'windmill_small', 'windmill_large', 'furniture_factory', 'seaport')),
  add constraint garden_placements_width_check check (width between 1 and 6),
  add constraint garden_placements_height_check check (height between 1 and 6);

-- 2. Power ---------------------------------------------------------------------------
-- How far a power source's field reaches beyond its footprint (0: not a power source).
create or replace function public.farm_power_reach(p_item_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_item_type when 'windmill_small' then 1 when 'windmill_large' then 3 else 0 end;
$$;

-- Whether a placement works: true unless it needs power (furniture_factory, seaport) and touches no
-- power field of the same gardener.
create or replace function public.farm_building_powered(p_placement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.item_type not in ('furniture_factory', 'seaport') then true
    else exists (
      select 1 from public.garden_placements w
       where w.user_id = b.user_id
         and w.id <> b.id
         and public.farm_power_reach(w.item_type) > 0
         and w.grid_x - public.farm_power_reach(w.item_type) < b.grid_x + b.width
         and b.grid_x < w.grid_x + w.width + public.farm_power_reach(w.item_type)
         and w.grid_y - public.farm_power_reach(w.item_type) < b.grid_y + b.height
         and b.grid_y < w.grid_y + w.height + public.farm_power_reach(w.item_type)
    )
  end
  from public.garden_placements b
  where b.id = p_placement_id;
$$;

revoke all on function public.farm_power_reach(text) from public;
grant execute on function public.farm_power_reach(text) to anon, authenticated, service_role;
revoke all on function public.farm_building_powered(uuid) from public, anon, authenticated;
grant execute on function public.farm_building_powered(uuid) to service_role;

-- 3. Buy and place (catalogue + retired items + the coast) -----------------------------
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

  -- Catalogue (keep in sync with farmCatalog.ts). Every branch ends with a semicolon.
  case p_item_type
    when 'tree'              then v_cost := 0;
    when 'windmill_small'    then v_cost := 60; v_w := 2; v_h := 2;
    when 'windmill_large'    then v_cost := 100; v_w := 6; v_h := 6;
    when 'furniture_factory' then v_cost := 120; v_w := 2; v_h := 2;
    when 'seaport'           then v_cost := 150; v_w := 6; v_h := 2;
    when 'stream'            then v_cost := 5;
    when 'fence'             then v_cost := 1;
    when 'rockery'           then v_cost := 2;
    when 'animal'            then v_cost := 5;
    when 'farmer_house', 'woodshop' then raise exception 'ITEM_RETIRED' using errcode = 'P0001';
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
  -- The seaport stands on the shore: its 6-tile edge on the first or the last rows.
  if p_item_type = 'seaport' and not (p_y = 0 or p_y + v_h = 16) then
    raise exception 'NOT_COASTAL' using errcode = 'P0001';
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

-- 4. Move (as 20261002000000, plus: a seaport stays on the coast) -----------------------
create or replace function public.move_garden_placement(p_placement_id uuid, p_new_x integer, p_new_y integer)
returns table (placement_id uuid, grid_x integer, grid_y integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- OUT columns share names with table columns: prefer the columns.
declare
  v_user uuid := auth.uid();
  v_w    integer;
  v_h    integer;
  v_type text;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  perform 1 from public.users u where u.id = v_user for update;

  select g.width, g.height, g.item_type into v_w, v_h, v_type
    from public.garden_placements g
   where g.id = p_placement_id and g.user_id = v_user
     for update;
  if not found then
    raise exception 'PLACEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_new_x is null or p_new_y is null or p_new_x < 0 or p_new_y < 0 or p_new_x + v_w > 16 or p_new_y + v_h > 16 then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_type = 'seaport' and not (p_new_y = 0 or p_new_y + v_h = 16) then
    raise exception 'NOT_COASTAL' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.garden_placements g
     where g.user_id = v_user
       and g.id <> p_placement_id
       and g.grid_x < p_new_x + v_w and p_new_x < g.grid_x + g.width
       and g.grid_y < p_new_y + v_h and p_new_y < g.grid_y + g.height
  ) then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.garden_placements g
     set grid_x = p_new_x, grid_y = p_new_y
   where g.id = p_placement_id and g.user_id = v_user;

  return query select p_placement_id, p_new_x, p_new_y;
end;
$$;

revoke all on function public.move_garden_placement(uuid, integer, integer) from public, anon;
grant execute on function public.move_garden_placement(uuid, integer, integer) to authenticated, service_role;

-- 5. The island's stock (one row per gardener) ----------------------------------------
create table if not exists public.farm_economy (
  user_id        uuid           primary key references public.users (id) on delete cascade,
  timber         numeric(10, 3) not null default 0 check (timber >= 0),
  produce        numeric(10, 3) not null default 0 check (produce >= 0),
  furniture      numeric(10, 3) not null default 0 check (furniture >= 0),
  last_tick_at   timestamptz    not null default now(),
  last_export_at timestamptz    not null default now(),
  last_payout    integer        not null default 0 check (last_payout >= 0)
);

alter table public.farm_economy enable row level security;

drop policy if exists "farm_economy: read own" on public.farm_economy;
create policy "farm_economy: read own" on public.farm_economy
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.farm_economy from anon, authenticated;
grant select on table public.farm_economy to authenticated;
grant select, insert, update, delete on table public.farm_economy to service_role;

-- 6. Settle: production since the last visit, and the ship -------------------------------
-- Rates (keep in sync with lib/farmEconomy.ts): timber 1 / tree / hour, produce 1 / animal / hour,
-- each powered factory 1 furniture / hour from 2 timber; caps timber 60, produce 40, furniture 30;
-- at most 48 hours counted at once. A powered seaport's ship calls every 4 hours and pays
-- floor(furniture × 3 + produce × 0.5 + timber × 0.2) coins, at most 15; what it can't pay for stays.
create or replace function public.settle_farm_economy()
returns table (timber numeric, produce numeric, furniture numeric, payout integer, total_coins integer, last_export_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user      uuid := auth.uid();
  v_row       public.farm_economy%rowtype;
  v_hours     numeric;
  v_trees     integer;
  v_animals   integer;
  v_factories integer;
  v_port      boolean;
  v_made      numeric;
  v_value     numeric;
  v_pay       integer := 0;
  v_keep      numeric;
  v_total     integer;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  -- One settlement at a time per gardener (the purse row is the lock, as for purchases).
  perform 1 from public.users u where u.id = v_user for update;
  insert into public.farm_economy (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_row from public.farm_economy e where e.user_id = v_user for update;

  v_hours := least(greatest(extract(epoch from (now() - v_row.last_tick_at)) / 3600.0, 0), 48);

  select count(*) filter (where g.item_type = 'tree'),
         count(*) filter (where g.item_type = 'animal'),
         count(*) filter (where g.item_type = 'furniture_factory' and public.farm_building_powered(g.id)),
         bool_or(g.item_type = 'seaport' and public.farm_building_powered(g.id))
    into v_trees, v_animals, v_factories, v_port
    from public.garden_placements g
   where g.user_id = v_user;

  v_row.timber  := least(v_row.timber + v_trees * 1 * v_hours, 60);
  v_row.produce := least(v_row.produce + v_animals * 1 * v_hours, 40);
  v_made := greatest(0, least(v_factories * 1 * v_hours, v_row.timber / 2, 30 - v_row.furniture));
  v_row.furniture := v_row.furniture + v_made;
  v_row.timber := v_row.timber - v_made * 2;

  if coalesce(v_port, false) and now() - v_row.last_export_at >= interval '4 hours' then
    v_value := floor(v_row.furniture * 3 + v_row.produce * 0.5 + v_row.timber * 0.2);
    if v_value > 0 then
      v_pay := least(v_value, 15)::integer;
      v_keep := 1 - v_pay / v_value;
      v_row.timber := v_row.timber * v_keep;
      v_row.produce := v_row.produce * v_keep;
      v_row.furniture := v_row.furniture * v_keep;
    end if;
    v_row.last_export_at := now();
  end if;

  update public.farm_economy e set
    timber = round(v_row.timber, 3),
    produce = round(v_row.produce, 3),
    furniture = round(v_row.furniture, 3),
    last_tick_at = now(),
    last_export_at = v_row.last_export_at,
    last_payout = case when v_pay > 0 then v_pay else e.last_payout end
   where e.user_id = v_user;

  if v_pay > 0 then
    update public.users u set coins = u.coins + v_pay where u.id = v_user returning u.coins into v_total;
  else
    select u.coins into v_total from public.users u where u.id = v_user;
  end if;

  return query select round(v_row.timber, 3), round(v_row.produce, 3), round(v_row.furniture, 3), v_pay, v_total, v_row.last_export_at;
end;
$$;

revoke all on function public.settle_farm_economy() from public, anon;
grant execute on function public.settle_farm_economy() to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select * from public.purchase_and_place_item('woodshop', 0, 0);          -- ERROR: ITEM_RETIRED
-- select * from public.purchase_and_place_item('seaport', 5, 5);           -- ERROR: NOT_COASTAL
-- select * from public.purchase_and_place_item('seaport', 5, 14);          -- on the south-west shore
-- select * from public.settle_farm_economy();                              -- the caller's stock, payout
-- set role authenticated; update public.farm_economy set timber = 999;    -- ERROR: permission denied

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run the functions of 20260930000000 (purchase_and_place_item) and 20261002000000
-- (move_garden_placement); drop function public.settle_farm_economy(); drop table public.farm_economy;
-- drop function public.farm_building_powered(uuid); drop function public.farm_power_reach(text);
-- (the item_type / size checks can stay wider; placements of the new types would have to go first).

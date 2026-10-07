-- ============================================================================
-- Road logistics: Roads and Delivery Trucks replace the railway
-- ----------------------------------------------------------------------------
-- road  1 × 1  1 coin  joins the roads beside it. Keep in sync with src/features/garden/lib/farmCatalog.ts
-- and lib/roads.ts (tests check).
--   • Saved islands keep their layout: every Railroad Track tile becomes a Road on the same tile.
--   • Freight Trains are gone: each standing one is removed and its 30 coins refunded to its owner
--     (it stood on tracks, so its tiles stay covered by the new roads).
--   • The item type check drops rail_track and freight_train and allows road; the old one-per-tile
--     rule is restored for everything (trains were the only items sharing tiles).
--   • farm_candy_linked(): a powered Candy Factory and a powered Seaport joined by one connected
--     stretch of road (a road right beside each). No vehicle to buy: the Delivery Truck comes with
--     the road. settle_farm_economy() calls it as before (every whole candy box exports for 15 coins).
--   • purchase_and_place_item() / move_garden_placement(): re-created without the train-on-track
--     rules; buying a rail_track or freight_train raises ITEM_RETIRED.
--   • The trigger that kept a track under a train (garden_track_in_use) is dropped.
--
-- Order: after 20261017000000_unified_windmill.sql. Run it WITH the deploy of the matching code (the
-- client no longer knows tracks or trains). Safe to re-run. Never re-run 20261015000000,
-- 20261016000000 or 20261017000000 after it (they bring back the railway rules and item types).
-- ============================================================================

begin;

-- 1. Freight Trains leave: their owners get the 30 coins back ---------------------------
drop trigger if exists garden_track_in_use on public.garden_placements;
drop function if exists public.garden_track_in_use();

with gone as (
  delete from public.garden_placements where item_type = 'freight_train' returning user_id
), refunds as (
  select user_id, count(*) * 30 as coins from gone group by user_id
)
update public.users u set coins = u.coins + r.coins from refunds r where u.id = r.user_id;

-- 2. Tracks become roads on the same tiles ------------------------------------------------
update public.garden_placements set item_type = 'road', width = 1, height = 1 where item_type = 'rail_track';

-- 3. Item types and one item per top tile again -------------------------------------------
alter table public.garden_placements drop constraint if exists garden_placements_item_type_check;
alter table public.garden_placements
  add constraint garden_placements_item_type_check check (item_type in (
    'tree', 'fence', 'stream', 'farmer_house', 'woodshop', 'rockery', 'animal',
    'windmill_small', 'furniture_factory', 'seaport', 'candy_factory', 'road'));

alter table public.garden_placements drop constraint if exists unique_farm_tile;
drop index if exists public.unique_farm_train_tile;
drop index if exists public.unique_farm_tile;
create unique index unique_farm_tile on public.garden_placements (user_id, grid_x, grid_y);

-- 4. The road link: a powered Candy Factory and a powered Seaport joined by one stretch of road
--    (lib/roads.ts roadLinks / candyLinked).
create or replace function public.farm_candy_linked(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  s record;
  v_linked boolean;
begin
  for c in
    select g.* from public.garden_placements g
     where g.user_id = p_user_id and g.item_type = 'candy_factory' and public.farm_building_powered(g.id)
  loop
    for s in
      select g.* from public.garden_placements g
       where g.user_id = p_user_id and g.item_type = 'seaport' and public.farm_building_powered(g.id)
    loop
      with recursive roads as (
        select r.grid_x as x, r.grid_y as y from public.garden_placements r
         where r.user_id = p_user_id and r.item_type = 'road'
      ),
      -- Every road connected to a road right beside the factory (sharing an edge with it).
      reach (x, y) as (
        select r.x, r.y from roads r
         where (r.x between c.grid_x and c.grid_x + c.width - 1 and (r.y = c.grid_y - 1 or r.y = c.grid_y + c.height))
            or (r.y between c.grid_y and c.grid_y + c.height - 1 and (r.x = c.grid_x - 1 or r.x = c.grid_x + c.width))
        union
        select r.x, r.y from roads r join reach q on abs(r.x - q.x) + abs(r.y - q.y) = 1
      )
      select exists (
               select 1 from reach q
                where (q.x between s.grid_x and s.grid_x + s.width - 1 and (q.y = s.grid_y - 1 or q.y = s.grid_y + s.height))
                   or (q.y between s.grid_y and s.grid_y + s.height - 1 and (q.x = s.grid_x - 1 or q.x = s.grid_x + s.width))
             )
        into v_linked;
      if v_linked then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

revoke all on function public.farm_candy_linked(uuid) from public, anon, authenticated;
grant execute on function public.farm_candy_linked(uuid) to service_role;

-- 5. Buy and place: roads, no trains (otherwise as 20261017000000) -------------------------
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
    when 'furniture_factory' then v_cost := 50; v_w := 2; v_h := 2;
    when 'candy_factory'     then v_cost := 50; v_w := 2; v_h := 2;
    when 'seaport'           then v_cost := 100; v_w := 6; v_h := 2;
    when 'road'              then v_cost := 1;
    when 'stream'            then v_cost := 5;
    when 'fence'             then v_cost := 1;
    when 'rockery'           then v_cost := 2;
    when 'animal'            then v_cost := 5;
    when 'farmer_house', 'woodshop', 'windmill_large', 'rail_track', 'freight_train' then raise exception 'ITEM_RETIRED' using errcode = 'P0001';
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
  if p_item_type = 'seaport' and not (p_y = 0 or p_y + v_h = 16) then
    raise exception 'NOT_COASTAL' using errcode = 'P0001';
  end if;

  perform 1 from public.users u where u.id = v_user for update;
  -- Nothing else on those tiles.
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

-- 6. Move: the coast; nothing else shares a tile (otherwise as 20261015000000) -------------
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

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select count(*) from public.garden_placements where item_type in ('rail_track', 'freight_train');  -- 0
-- select * from public.purchase_and_place_item('road', 3, 3);                -- 1 coin
-- select * from public.purchase_and_place_item('freight_train', 8, 8);       -- ITEM_RETIRED
-- select * from public.settle_farm_economy();                               -- candy exported over a road

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run sections 1, 4, 5, 6 and 7 of 20261015000000_rail_logistics.sql (item types, the partial
-- tile indexes, farm_candy_linked, purchase_and_place_item, move_garden_placement and the track
-- trigger), then purchase_and_place_item() of 20261017000000 for today's windmill. Roads stay roads
-- (no record of which were tracks); refunded trains are not restored.

-- ============================================================================
-- The Grand Windmill: the Large Windmill becomes a 2 × 2 tower powering a 6 × 6 area
-- ----------------------------------------------------------------------------
-- windmill_large: footprint 6 × 6 → 2 × 2, power reach 3 → 2 (its field: footprint + 2 tiles all
-- round = 6 × 6). Price unchanged (60). Keep in sync with src/features/garden/lib/farmCatalog.ts
-- (tests check).
--   • farm_power_reach(): windmill_large 2.
--   • purchase_and_place_item(): re-created from 20261015000000 with the new size (nothing else).
--   • Large windmills already standing shrink to 2 × 2 on their own top tile (a smaller footprint
--     can't overlap anything new). Their field shrinks too: buildings beyond it lose power.
--
-- Order: after 20261015000000_rail_logistics.sql. With the deploy of the matching code (the Shop
-- shows the 2 × 2 size and the 6 × 6 zone). Safe to re-run.
-- ============================================================================

begin;

-- 1. The new reach ---------------------------------------------------------------------
create or replace function public.farm_power_reach(p_item_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_item_type when 'windmill_small' then 1 when 'windmill_large' then 2 else 0 end;
$$;

revoke all on function public.farm_power_reach(text) from public;
grant execute on function public.farm_power_reach(text) to anon, authenticated, service_role;

-- 2. Standing Large Windmills become 2 × 2 towers ---------------------------------------
update public.garden_placements set width = 2, height = 2 where item_type = 'windmill_large' and (width <> 2 or height <> 2);

-- 3. Buy and place: the Large Windmill is 2 × 2 (otherwise as 20261015000000) -------------
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
    when 'windmill_small'    then v_cost := 30; v_w := 2; v_h := 2;
    when 'windmill_large'    then v_cost := 60; v_w := 2; v_h := 2;
    when 'furniture_factory' then v_cost := 50; v_w := 2; v_h := 2;
    when 'candy_factory'     then v_cost := 50; v_w := 2; v_h := 2;
    when 'seaport'           then v_cost := 100; v_w := 6; v_h := 2;
    when 'rail_track'        then v_cost := 1;
    when 'freight_train'     then v_cost := 30; v_w := 1; v_h := 3;
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
  if p_item_type = 'seaport' and not (p_y = 0 or p_y + v_h = 16) then
    raise exception 'NOT_COASTAL' using errcode = 'P0001';
  end if;

  perform 1 from public.users u where u.id = v_user for update;
  -- Nothing else on those tiles (a Freight Train stands on tracks: those don't count for it).
  if exists (
    select 1 from public.garden_placements g
     where g.user_id = v_user
       and g.grid_x < p_x + v_w and p_x < g.grid_x + g.width
       and g.grid_y < p_y + v_h and p_y < g.grid_y + g.height
       and not (p_item_type = 'freight_train' and g.item_type = 'rail_track')
  ) then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  -- A Freight Train needs a track under each of its tiles.
  if p_item_type = 'freight_train' and (
    select count(*) from public.garden_placements g
     where g.user_id = v_user and g.item_type = 'rail_track'
       and g.grid_x between p_x and p_x + v_w - 1
       and g.grid_y between p_y and p_y + v_h - 1
  ) <> v_w * v_h then
    raise exception 'NOT_ON_TRACK' using errcode = 'P0001';
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

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select public.farm_power_reach('windmill_large');                                  -- 2
-- select * from public.purchase_and_place_item('windmill_large', 0, 0);               -- a 2 × 2 placement
-- select count(*) from public.garden_placements where item_type = 'windmill_large' and width <> 2;  -- 0

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run farm_power_reach() of 20261014000000 and purchase_and_place_item() of 20261015000000. Towers
-- shrunk to 2 × 2 stay that size (their old 6 × 6 tiles may be taken by now).

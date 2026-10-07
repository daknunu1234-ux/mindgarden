-- ============================================================================
-- Railway logistics: Candy Factory, Railroad Track, Freight Train; fruit instead of harvest coins
-- ----------------------------------------------------------------------------
-- Prices (keep in sync with src/features/garden/lib/farmCatalog.ts; tests check):
--   windmill_small 30, windmill_large 60, furniture_factory 50, seaport 100 (were 60 / 100 / 120 / 150),
--   candy_factory  2 × 2  50   needs power; turns 10 fruit into 1 candy box (1 an hour)
--   rail_track     1 × 1   1   joins the tracks beside it
--   freight_train  1 × 3  30   stands only on three Railroad Track tiles (NOT_ON_TRACK)
-- A track a train stands on can't be moved or picked up (TRACK_IN_USE).
--
-- Harvesting a ripe tree now gives FRUIT (2 🍎, farm_economy.fruit) instead of 2 coins:
-- harvest_tree_fruit() is re-created (its result is now fruit_earned / total_fruit).
--
-- Export: settle_farm_economy() now also runs the Candy Factories (powered: 10 fruit → 1 box an hour,
-- at most 20 boxes stored) and, when a Freight Train stands on track that links a powered Candy
-- Factory to a powered Seaport (farm_candy_linked(): a stretch of connected track touching both
-- footprints), exports every whole box for 15 coins. Its result gains fruit, candy, candy_shipped and
-- candy_payout. The furniture / timber / produce cargo ship (every 4 hours, at most 15) is unchanged.
--
-- Order: after 20261014000000_power_grid.sql (it re-creates its functions) and
-- 20261003000000_tree_fruit.sql. Run it WITH the deploy: the new code reads fruit, and the old code
-- would show coins for a harvest that now gives fruit. Safe to re-run.
-- ============================================================================

begin;

-- 1. Item types ----------------------------------------------------------------------
alter table public.garden_placements drop constraint if exists garden_placements_item_type_check;
alter table public.garden_placements
  add constraint garden_placements_item_type_check check (item_type in (
    'tree', 'fence', 'stream', 'farmer_house', 'woodshop', 'rockery', 'animal',
    'windmill_small', 'windmill_large', 'furniture_factory', 'seaport',
    'candy_factory', 'rail_track', 'freight_train'));

-- One item per top tile, except that a Freight Train stands on track: the old unique key on the
-- top tile becomes two partial unique indexes (everything but trains; trains among themselves).
alter table public.garden_placements drop constraint if exists unique_farm_tile;
create unique index if not exists unique_farm_tile on public.garden_placements (user_id, grid_x, grid_y) where item_type <> 'freight_train';
create unique index if not exists unique_farm_train_tile on public.garden_placements (user_id, grid_x, grid_y) where item_type = 'freight_train';

-- 2. Inventory: fruit and candy -------------------------------------------------------
alter table public.farm_economy add column if not exists fruit numeric(10, 3) not null default 0 check (fruit >= 0);
alter table public.farm_economy add column if not exists candy numeric(10, 3) not null default 0 check (candy >= 0);
alter table public.farm_economy add column if not exists last_candy_payout integer not null default 0 check (last_candy_payout >= 0);

-- 3. Power: the Candy Factory needs it too ---------------------------------------------
create or replace function public.farm_building_powered(p_placement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.item_type not in ('furniture_factory', 'seaport', 'candy_factory') then true
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

revoke all on function public.farm_building_powered(uuid) from public, anon, authenticated;
grant execute on function public.farm_building_powered(uuid) to service_role;

-- 4. The freight link: a powered Candy Factory and a powered Seaport joined by one stretch of track
--    that carries a Freight Train. (lib/railway.ts railLink.)
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
      with recursive tracks as (
        select t.grid_x as x, t.grid_y as y from public.garden_placements t
         where t.user_id = p_user_id and t.item_type = 'rail_track'
      ),
      -- Every track connected to a track right beside the factory (sharing an edge with it).
      reach (x, y) as (
        select t.x, t.y from tracks t
         where (t.x between c.grid_x and c.grid_x + c.width - 1 and (t.y = c.grid_y - 1 or t.y = c.grid_y + c.height))
            or (t.y between c.grid_y and c.grid_y + c.height - 1 and (t.x = c.grid_x - 1 or t.x = c.grid_x + c.width))
        union
        select t.x, t.y from tracks t join reach r on abs(t.x - r.x) + abs(t.y - r.y) = 1
      )
      select exists (
               select 1 from reach r
                where (r.x between s.grid_x and s.grid_x + s.width - 1 and (r.y = s.grid_y - 1 or r.y = s.grid_y + s.height))
                   or (r.y between s.grid_y and s.grid_y + s.height - 1 and (r.x = s.grid_x - 1 or r.x = s.grid_x + s.width))
             )
         and exists (
               select 1 from reach r
                 join public.garden_placements tr
                   on tr.user_id = p_user_id and tr.item_type = 'freight_train'
                  and r.x between tr.grid_x and tr.grid_x + tr.width - 1
                  and r.y between tr.grid_y and tr.grid_y + tr.height - 1
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

-- 5. Buy and place: today's catalogue, the coast, and trains on tracks -------------------
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
    when 'windmill_large'    then v_cost := 60; v_w := 6; v_h := 6;
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

-- 6. Move: the coast, trains on tracks, never a track from under a train ----------------
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
  v_x    integer;
  v_y    integer;
  v_type text;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  perform 1 from public.users u where u.id = v_user for update;

  select g.width, g.height, g.item_type, g.grid_x, g.grid_y into v_w, v_h, v_type, v_x, v_y
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
  if v_type = 'rail_track' and exists (
    select 1 from public.garden_placements t
     where t.user_id = v_user and t.item_type = 'freight_train'
       and v_x between t.grid_x and t.grid_x + t.width - 1
       and v_y between t.grid_y and t.grid_y + t.height - 1
  ) then
    raise exception 'TRACK_IN_USE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.garden_placements g
     where g.user_id = v_user
       and g.id <> p_placement_id
       and g.grid_x < p_new_x + v_w and p_new_x < g.grid_x + g.width
       and g.grid_y < p_new_y + v_h and p_new_y < g.grid_y + g.height
       and not (v_type = 'freight_train' and g.item_type = 'rail_track')
  ) then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_type = 'freight_train' and (
    select count(*) from public.garden_placements g
     where g.user_id = v_user and g.item_type = 'rail_track'
       and g.grid_x between p_new_x and p_new_x + v_w - 1
       and g.grid_y between p_new_y and p_new_y + v_h - 1
  ) <> v_w * v_h then
    raise exception 'NOT_ON_TRACK' using errcode = 'P0001';
  end if;

  update public.garden_placements g
     set grid_x = p_new_x, grid_y = p_new_y
   where g.id = p_placement_id and g.user_id = v_user;

  return query select p_placement_id, p_new_x, p_new_y;
end;
$$;

revoke all on function public.move_garden_placement(uuid, integer, integer) from public, anon;
grant execute on function public.move_garden_placement(uuid, integer, integer) to authenticated, service_role;

-- 7. A track under a train can't be picked up (the player's own delete; cascades from a deleted
--    gardener run deeper and pass).
create or replace function public.garden_track_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.item_type = 'rail_track' and pg_trigger_depth() = 1 and exists (
    select 1 from public.garden_placements t
     where t.user_id = old.user_id and t.item_type = 'freight_train'
       and old.grid_x between t.grid_x and t.grid_x + t.width - 1
       and old.grid_y between t.grid_y and t.grid_y + t.height - 1
  ) then
    raise exception 'TRACK_IN_USE' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists garden_track_in_use on public.garden_placements;
create trigger garden_track_in_use
  before delete on public.garden_placements
  for each row execute function public.garden_track_in_use();

-- 8. Harvest: fruit instead of coins ---------------------------------------------------
drop function if exists public.harvest_tree_fruit(uuid, uuid, date);
create function public.harvest_tree_fruit(p_user_id uuid, p_deck_id uuid, p_today date)
returns table (fruit_earned integer, total_fruit integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fruit constant integer := 2; -- FRUIT_PER_HARVEST
  v_owner uuid;
  v_total numeric;
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

  -- Lock the gardener, then claim today's fruit: the primary key lets only the first claim through.
  -- (tree_harvests.coins now records the fruit picked.)
  perform 1 from public.users u where u.id = p_user_id for update;
  insert into public.tree_harvests (user_id, deck_id, day, coins)
  values (p_user_id, p_deck_id, p_today, v_fruit)
  on conflict (user_id, deck_id, day) do nothing;
  if not found then
    raise exception 'FRUIT_NOT_READY' using errcode = 'P0001';
  end if;

  insert into public.farm_economy as e (user_id, fruit) values (p_user_id, v_fruit)
  on conflict (user_id) do update set fruit = e.fruit + excluded.fruit
  returning e.fruit into v_total;
  return query select v_fruit, floor(v_total)::integer;
end;
$$;

revoke all on function public.harvest_tree_fruit(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.harvest_tree_fruit(uuid, uuid, date) to service_role;

-- 9. Settle: candy and the freight link, on top of the cargo ship ------------------------
drop function if exists public.settle_farm_economy();
create function public.settle_farm_economy()
returns table (
  timber numeric, produce numeric, furniture numeric, fruit numeric, candy numeric,
  payout integer, candy_shipped integer, candy_payout integer, total_coins integer, last_export_at timestamptz
)
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
  v_candies   integer;
  v_port      boolean;
  v_made      numeric;
  v_value     numeric;
  v_pay       integer := 0;
  v_keep      numeric;
  v_shipped   integer := 0;
  v_candy_pay integer := 0;
  v_total     integer;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  perform 1 from public.users u where u.id = v_user for update;
  insert into public.farm_economy (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_row from public.farm_economy e where e.user_id = v_user for update;

  v_hours := least(greatest(extract(epoch from (now() - v_row.last_tick_at)) / 3600.0, 0), 48);

  select count(*) filter (where g.item_type = 'tree'),
         count(*) filter (where g.item_type = 'animal'),
         count(*) filter (where g.item_type = 'furniture_factory' and public.farm_building_powered(g.id)),
         count(*) filter (where g.item_type = 'candy_factory' and public.farm_building_powered(g.id)),
         bool_or(g.item_type = 'seaport' and public.farm_building_powered(g.id))
    into v_trees, v_animals, v_factories, v_candies, v_port
    from public.garden_placements g
   where g.user_id = v_user;

  -- Timber, produce, furniture (as 20261014000000).
  v_row.timber  := least(v_row.timber + v_trees * 1 * v_hours, 60);
  v_row.produce := least(v_row.produce + v_animals * 1 * v_hours, 40);
  v_made := greatest(0, least(v_factories * 1 * v_hours, v_row.timber / 2, 30 - v_row.furniture));
  v_row.furniture := v_row.furniture + v_made;
  v_row.timber := v_row.timber - v_made * 2;

  -- Candy: each powered Candy Factory makes 1 box an hour from 10 fruit (store at most 20).
  v_made := greatest(0, least(v_candies * 1 * v_hours, v_row.fruit / 10, 20 - v_row.candy));
  v_row.candy := v_row.candy + v_made;
  v_row.fruit := v_row.fruit - v_made * 10;

  -- The Freight Train: linked to the Seaport, every whole box is exported for 15 coins.
  if v_row.candy >= 1 and public.farm_candy_linked(v_user) then
    v_shipped := floor(v_row.candy)::integer;
    v_candy_pay := v_shipped * 15;
    v_row.candy := v_row.candy - v_shipped;
  end if;

  -- The cargo ship (as 20261014000000).
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
    fruit = round(v_row.fruit, 3),
    candy = round(v_row.candy, 3),
    last_tick_at = now(),
    last_export_at = v_row.last_export_at,
    last_payout = case when v_pay > 0 then v_pay else e.last_payout end,
    last_candy_payout = case when v_candy_pay > 0 then v_candy_pay else e.last_candy_payout end
   where e.user_id = v_user;

  if v_pay + v_candy_pay > 0 then
    update public.users u set coins = u.coins + v_pay + v_candy_pay where u.id = v_user returning u.coins into v_total;
  else
    select u.coins into v_total from public.users u where u.id = v_user;
  end if;

  return query select round(v_row.timber, 3), round(v_row.produce, 3), round(v_row.furniture, 3), round(v_row.fruit, 3), round(v_row.candy, 3),
                      v_pay, v_shipped, v_candy_pay, v_total, v_row.last_export_at;
end;
$$;

revoke all on function public.settle_farm_economy() from public, anon;
grant execute on function public.settle_farm_economy() to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select * from public.purchase_and_place_item('rail_track', 3, 3);         -- 1 coin
-- select * from public.purchase_and_place_item('freight_train', 8, 8);      -- ERROR: NOT_ON_TRACK (no tracks)
-- (service role) select * from public.harvest_tree_fruit('<you>', '<tree>', current_date);  -- 2 fruit, no coins
-- select * from public.settle_farm_economy();                              -- candy made / shipped, payouts

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run the functions of 20261014000000 (farm_building_powered, purchase_and_place_item,
-- move_garden_placement, settle_farm_economy: drop the new one first) and 20261003000000
-- (harvest_tree_fruit: drop the new one first); drop trigger garden_track_in_use on
-- public.garden_placements; drop function public.garden_track_in_use(); drop function
-- public.farm_candy_linked(uuid). Fruit and candy columns can stay.

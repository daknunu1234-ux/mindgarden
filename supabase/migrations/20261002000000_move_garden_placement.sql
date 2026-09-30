-- ============================================================================
-- Move a farm placement (Move mode)
-- ----------------------------------------------------------------------------
-- move_garden_placement(p_placement_id, p_new_x, p_new_y) moves one of the caller's own trees or items
-- to a new top tile, keeping its footprint (1 × 1 or 2 × 2). Players still can't UPDATE
-- garden_placements directly (no grant); this function is the only way to move something, and it
-- checks, in one transaction:
--   • ownership: the placement is the caller's (auth.uid()), else PLACEMENT_NOT_FOUND;
--   • bounds: the whole footprint stays on the 16 × 16 grid, else TILE_UNAVAILABLE;
--   • collisions: no other placement of the caller's overlaps the new footprint (the moved item
--     itself doesn't count, so a 2 × 2 can shuffle one tile over), else TILE_UNAVAILABLE.
-- The caller's users row is locked first, like purchase_and_place_item(), so a move and a purchase
-- can't race into the same tiles. Nothing is charged or refunded.
-- Buffs follow automatically: farm_coin_multiplier() reads the current tiles at every payout, and
-- stream / fence auto-tiling is drawn from the current tiles.
--
-- Order: after 20261001000000_ten_tree_species.sql (needs 20260930000000_farm_grid.sql). Safe to re-run.
-- ============================================================================

begin;

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
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  -- Serialize this gardener's placements (and purse) while checking the new spot.
  perform 1 from public.users u where u.id = v_user for update;

  select g.width, g.height into v_w, v_h
    from public.garden_placements g
   where g.id = p_placement_id and g.user_id = v_user
     for update;
  if not found then
    raise exception 'PLACEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_new_x is null or p_new_y is null or p_new_x < 0 or p_new_y < 0 or p_new_x + v_w > 16 or p_new_y + v_h > 16 then
    raise exception 'TILE_UNAVAILABLE' using errcode = 'P0001';
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
-- select * from public.move_garden_placement('<your placement id>', 3, 4);      -- as its owner: moves it
-- select * from public.move_garden_placement('<someone else''s id>', 3, 4);     -- ERROR: PLACEMENT_NOT_FOUND
-- set role authenticated; update public.garden_placements set grid_x = 0;        -- ERROR: permission denied (still no UPDATE grant)

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.move_garden_placement(uuid, integer, integer);

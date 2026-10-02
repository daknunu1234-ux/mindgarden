-- ============================================================================
-- Special trees pay ×1.5 mastery coins
-- ----------------------------------------------------------------------------
-- A special tree is one whose seed costs 180 🪙: Crystal Flora, Cosmic Nebula, Chrono Willow
-- (seed_price(), migration 20261006000000). Every statement mastered on such a tree (its first 5/5)
-- pays 1.5 times what it would on a standard tree. The app shows the same rule
-- (shared/lib/economy.ts SPECIAL_COIN_MULTIPLIER, shared/lib/treeSkins.ts isSpecialTree; a test keeps
-- the numbers equal).
--
-- species_coin_multiplier(tree_type)   1.5 for a species priced at 180, else 1.
-- award_mastery_coin(user, item)       same once-per-item claim at 5/5 and same signature as before
--                                      (migration 20260930000000_farm_grid.sql); the payout is now
--                                      1 × the farm multiplier × the species multiplier. The fraction
--                                      is carried in users.coin_carry as before, so ×1.5 is exact
--                                      over time (1, 2, 1, 2, … coins), never rounded away or up.
--                                      The two multipliers stack: a special tree beside a stream and
--                                      inside a Farmer's House area pays 1.5 × 1.8 = ×2.7.
-- The species is read when the coin is paid: a tree changed to a special species (the Workshop
-- charges the 80 🪙 difference) pays ×1.5 from then on; coins already paid are not touched.
--
-- Order: after 20261006000000_species_seed_prices.sql (it uses seed_price()). Run it with, or any
-- time after, the deploy of the code that shows the bonus: before it, the app shows "1.5x" on special
-- trees but the database still pays ×1. Safe to re-run.
-- ============================================================================

begin;

create or replace function public.species_coin_multiplier(p_tree_type text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when public.seed_price(coalesce(p_tree_type, 'oak')) = 180 then 1.5  -- SPECIAL_COIN_MULTIPLIER
    else 1
  end::numeric;
$$;

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
  v_species text;
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

  select n.deck_id, d.tree_type into v_deck, v_species
    from public.knowledge_items ki
    join public.mindmap_nodes n on n.id = ki.node_id
    join public.decks d on d.id = n.deck_id
   where ki.id = p_item_id;

  select 1 * public.farm_coin_multiplier(p_user_id, v_deck) * public.species_coin_multiplier(v_species) + u.coin_carry into v_amount
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

revoke all on function public.species_coin_multiplier(text) from public, anon, authenticated;
grant execute on function public.species_coin_multiplier(text) to service_role;
revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select public.species_coin_multiplier('oak'), public.species_coin_multiplier('cosmic_nebula'), public.species_coin_multiplier(null);  -- 1, 1.5, 1
-- (service role, two statements at 5/5 on a special tree with no farm buff, coin_carry 0)
--   select * from public.award_mastery_coin('<you>', '<item 1>');   -- 1, purse + 1   (carry 0.5)
--   select * from public.award_mastery_coin('<you>', '<item 2>');   -- 2, purse + 3   (carry 0)
--   select * from public.award_mastery_coin('<you>', '<item 2>');   -- 0: already paid
-- set role authenticated; select public.species_coin_multiplier('oak');   -- ERROR: permission denied

-- ============================================================================
-- Rollback
-- ============================================================================
-- re-run the award_mastery_coin() of 20260930000000_farm_grid.sql (farm multiplier only), then
-- drop function if exists public.species_coin_multiplier(text);

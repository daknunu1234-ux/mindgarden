-- ============================================================================
-- Seed prices per species: surreal trees cost 180 🪙
-- ----------------------------------------------------------------------------
-- A seed used to cost 100 🪙 whatever the species. Now the three surreal species (crystal_flora,
-- cosmic_nebula, chrono_willow) cost 180 🪙; every other species stays at 100. The same numbers live
-- in the app (shared/lib/economy.ts SEED_PRICE_COINS / SURREAL_SEED_PRICE_COINS, shared/lib/
-- treeSkins.ts `price`); a test keeps them equal.
--
-- seed_price(tree_type)      the price list: 180 for the three surreal ids, else 100.
-- plant_deck()               charges seed_price(p_tree_type) instead of a flat 100.
-- clone_deck()               charges seed_price(the tree's species) + least(statements, 50):
--                            a standard tree 100–150 as before, a surreal one 180–230, so cloning is
--                            never a cheaper way to a surreal tree than planting one.
-- decks_charge_species_upgrade   trigger: changing a planted tree to a species that costs more
--                            charges the owner the difference (a standard tree → a surreal one: 80 🪙)
--                            in the same statement; a short purse refuses the change
--                            (INSUFFICIENT_COINS). Changing to a cheaper or equal species is free and
--                            refunds nothing. Without it the Tree Workshop's species picker would be
--                            a free way round the price. Only player updates are charged
--                            (auth.uid() set): maintenance from the SQL Editor is not.
--
-- Order: after 20261005000000_surreal_tree_species.sql. Run it together with deploying the code that
-- shows the new prices: before it, the database still charges 100 for a surreal seed (the app would
-- show 180 but take 100); the older code with this migration shows 100 but is charged correctly.
-- Safe to re-run.
-- ============================================================================

begin;

create or replace function public.seed_price(p_tree_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tree_type in ('crystal_flora', 'cosmic_nebula', 'chrono_willow') then 180  -- SURREAL_SEED_PRICE_COINS
    else 100                                                                          -- SEED_PRICE_COINS
  end;
$$;

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
  v_user  uuid := auth.uid();
  v_price integer := public.seed_price(coalesce(p_tree_type, 'oak'));
  v_left  integer;
  v_deck  uuid;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  -- A player whose profile row is missing gets it (with the starter purse) before paying.
  perform public.ensure_user_profile();

  update public.users
     set coins = coins - v_price
   where id = v_user and coins >= v_price
  returning coins into v_left;

  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = format('This tree seed costs %s coins', v_price);
  end if;

  insert into public.decks (user_id, title, slug, description, is_public, tree_type)
  values (v_user, p_title, p_slug, p_description, coalesce(p_is_public, false), coalesce(p_tree_type, 'oak'))
  returning id into v_deck;

  return query select v_deck, v_left;
end;
$$;

revoke all on function public.plant_deck(text, text, text, boolean, text) from public, anon;
grant execute on function public.plant_deck(text, text, text, boolean, text) to authenticated, service_role;

create or replace function public.clone_deck(p_source_deck_id uuid, p_slug text)
returns table (deck_id uuid, remaining_coins integer, cost integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_source public.decks%rowtype;
  v_items  integer;
  v_cost   integer;
  v_left   integer;
  v_deck   uuid;
  v_map    jsonb := '{}'::jsonb;  -- old node id → new node id
  v_node   record;
  v_new    uuid;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_source from public.decks where id = p_source_deck_id;
  if not found or not v_source.is_public then
    raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_source.user_id = v_user then
    raise exception 'CANNOT_CLONE_OWN_DECK' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_items
    from public.knowledge_items ki
    join public.mindmap_nodes n on n.id = ki.node_id
   where n.deck_id = v_source.id;
  v_cost := public.seed_price(v_source.tree_type) + least(v_items, 50);  -- cloneCost() in shared/lib/economy.ts

  perform public.ensure_user_profile();

  update public.users set coins = coins - v_cost
   where id = v_user and coins >= v_cost
  returning coins into v_left;
  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = format('Cloning this tree costs %s coins', v_cost);
  end if;

  -- The copy is inserted with its species already set, so the upgrade trigger (updates only) never fires.
  insert into public.decks (user_id, title, slug, description, is_public, tree_type)
  values (v_user, v_source.title, p_slug, v_source.description, false, v_source.tree_type)
  returning id into v_deck;

  -- Nodes parents-first, so every parent's new id is known before its children.
  for v_node in
    with recursive tree as (
      select n.id, n.parent_id, n.title, n.sort_order, 0 as depth
        from public.mindmap_nodes n
       where n.deck_id = v_source.id and n.parent_id is null
      union all
      select c.id, c.parent_id, c.title, c.sort_order, t.depth + 1
        from public.mindmap_nodes c
        join tree t on c.parent_id = t.id
       where c.deck_id = v_source.id
    )
    select * from tree order by depth, sort_order, title
  loop
    insert into public.mindmap_nodes (deck_id, parent_id, title, sort_order)
    values (v_deck, (v_map ->> v_node.parent_id::text)::uuid, v_node.title, v_node.sort_order)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(v_node.id::text, v_new);
  end loop;

  -- Statements with their trap rules (oldest first, as authored). Progress is NOT copied.
  insert into public.knowledge_items (node_id, prompt, correct_stmt, trap_rules)
  select (v_map ->> ki.node_id::text)::uuid, ki.prompt, ki.correct_stmt, ki.trap_rules
    from public.knowledge_items ki
    join public.mindmap_nodes n on n.id = ki.node_id
   where n.deck_id = v_source.id
   order by ki.created_at, ki.id;

  return query select v_deck, v_left, v_cost;
end;
$$;

revoke all on function public.clone_deck(uuid, text) from public, anon;
grant execute on function public.clone_deck(uuid, text) to authenticated, service_role;

-- Changing a planted tree to a pricier species pays the difference.
create or replace function public.charge_species_upgrade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diff integer;
begin
  if new.tree_type is not distinct from old.tree_type then
    return new;
  end if;
  v_diff := public.seed_price(new.tree_type) - public.seed_price(old.tree_type);
  -- Only a player's own change is charged; maintenance without a session (SQL Editor) is not.
  if v_diff > 0 and auth.uid() is not null then
    update public.users set coins = coins - v_diff
     where id = new.user_id and coins >= v_diff;
    if not found then
      raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = format('Changing to this species costs %s coins', v_diff);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.charge_species_upgrade() from public, anon, authenticated;

drop trigger if exists decks_charge_species_upgrade on public.decks;
create trigger decks_charge_species_upgrade
  before update of tree_type on public.decks
  for each row execute function public.charge_species_upgrade();

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select public.seed_price('oak'), public.seed_price('chrono_willow'), public.seed_price('sakura');   -- 100, 180, 100
-- (as a player with 300 🪙) select * from public.plant_deck('T', 't-surreal', null, false, 'cosmic_nebula');   -- purse 120
-- (as a player with 120 🪙) select * from public.plant_deck('T', 't-surreal-2', null, false, 'crystal_flora'); -- ERROR: INSUFFICIENT_COINS
-- (as the owner) update public.decks set tree_type = 'chrono_willow' where slug = '<an oak of yours>';         -- purse − 80
-- (as the owner) update public.decks set tree_type = 'oak' where slug = '<that tree>';                         -- purse unchanged

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop trigger if exists decks_charge_species_upgrade on public.decks;
-- drop function if exists public.charge_species_upgrade();
-- then re-run the plant_deck() of 20260928000600_profiles_and_sharing.sql and the clone_deck() of
-- 20260928000700_clone_deck.sql (flat 100 / least(100 + statements, 150)), and
-- drop function if exists public.seed_price(text);

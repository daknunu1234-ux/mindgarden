-- ============================================================================
-- Clone a shared tree into your own garden: min(100 + statements, 150) 🪙
-- ----------------------------------------------------------------------------
-- Visitors may explore someone else's shared tree read-only, but can't edit or practise it.
-- To make it theirs they clone it: clone_deck() charges the fee and deep-copies the deck, its
-- mindmap (same hierarchy and order) and every statement with its trap rules, in ONE transaction.
--   • Runs as the caller (auth.uid()); only another gardener's PUBLIC tree can be cloned.
--   • Cost = least(100 + statement count, 150) (cloneCost in shared/lib/economy.ts).
--   • Short purse → INSUFFICIENT_COINS, nothing copied; a slug clash (23505) rolls everything back.
--   • The copy is private, owned by the cloner, and starts with NO progress (every item 0/5, no
--     mastery coin paid yet): user_progress is never copied.
--
-- Order: after 20260928000600_profiles_and_sharing.sql (uses ensure_user_profile). Safe to re-run.
-- ============================================================================

begin;

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
  v_cost := least(100 + v_items, 150);  -- cloneCost() in shared/lib/economy.ts

  perform public.ensure_user_profile();

  update public.users set coins = coins - v_cost
   where id = v_user and coins >= v_cost
  returning coins into v_left;
  if not found then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001', hint = format('Cloning this tree costs %s coins', v_cost);
  end if;

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

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select count(*) from public.mindmap_nodes where deck_id = '<clone id>';     -- = source node count
-- select count(*) from public.user_progress up join public.knowledge_items ki on ki.id = up.knowledge_item_id
--   join public.mindmap_nodes n on n.id = ki.node_id where n.deck_id = '<clone id>';   -- 0

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.clone_deck(uuid, text);

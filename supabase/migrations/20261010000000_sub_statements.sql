-- ============================================================================
-- Sub-statements, statement order and moving statements between roots
-- ----------------------------------------------------------------------------
-- knowledge_items.parent_item_id   NULL = a statement; else the statement this sub-statement sits
--                                  under. One level only (a sub-statement has no sub-statements),
--                                  and always in the SAME root as its parent: the foreign key is
--                                  composite, (parent_item_id, node_id) → (id, node_id).
--                                  ON UPDATE CASCADE: moving a statement to another root (UPDATE
--                                  node_id) carries its sub-statements along in the same statement.
--                                  ON DELETE CASCADE: deleting a statement deletes its sub-statements
--                                  (and everyone's progress on them, as for any statement).
-- knowledge_items.sort_order       Order among a root's statements (and among one statement's
--                                  sub-statements). Defaults to the insert time in epoch seconds, so
--                                  new rows append; the app writes a midpoint to insert a statement
--                                  right below another one (the Tree Workshop's Enter key). Existing
--                                  rows take their created_at, so their order doesn't change.
--
-- Both levels are ordinary knowledge items to the drill: a sub-statement is drilled, mastered and
-- paid like any statement of its root (nothing in the progress, coin or tournament functions changes).
--
-- clone_deck() is re-created (same signature, same price) to copy the hierarchy and the order.
--
-- Order: any time after 20261006000000_species_seed_prices.sql (it re-creates that file's
-- clone_deck()). Run it BEFORE or WITH the deploy of the code that reads these columns: it only adds
-- columns, so older code keeps working, while newer code ordering by sort_order fails without it.
-- Never re-run 20261006000000 after it (its clone_deck() would flatten sub-statements again).
-- Safe to re-run.
-- ============================================================================

begin;

alter table public.knowledge_items add column if not exists parent_item_id uuid;
alter table public.knowledge_items add column if not exists sort_order double precision;

update public.knowledge_items
   set sort_order = extract(epoch from created_at)::double precision
 where sort_order is null;

alter table public.knowledge_items
  alter column sort_order set default (extract(epoch from clock_timestamp())::double precision),
  alter column sort_order set not null;

-- The composite foreign key needs a unique target.
alter table public.knowledge_items drop constraint if exists knowledge_items_id_node_key;
alter table public.knowledge_items add constraint knowledge_items_id_node_key unique (id, node_id);

alter table public.knowledge_items drop constraint if exists knowledge_items_parent_item_fkey;
alter table public.knowledge_items
  add constraint knowledge_items_parent_item_fkey
  foreign key (parent_item_id, node_id) references public.knowledge_items (id, node_id)
  on update cascade on delete cascade;

alter table public.knowledge_items drop constraint if exists knowledge_items_no_self_parent;
alter table public.knowledge_items add constraint knowledge_items_no_self_parent check (parent_item_id <> id);

create index if not exists idx_knowledge_items_parent_item_id on public.knowledge_items (parent_item_id);

-- One level: a sub-statement's parent must be a statement, and a statement with sub-statements
-- can't itself become a sub-statement.
create or replace function public.knowledge_items_one_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_item_id is null then
    return new;
  end if;
  if exists (select 1 from public.knowledge_items p where p.id = new.parent_item_id and p.parent_item_id is not null) then
    raise exception 'SUB_STATEMENT_TOO_DEEP' using errcode = 'P0001', hint = 'A sub-statement cannot have sub-statements';
  end if;
  if exists (select 1 from public.knowledge_items c where c.parent_item_id = new.id) then
    raise exception 'SUB_STATEMENT_TOO_DEEP' using errcode = 'P0001', hint = 'A statement with sub-statements cannot become a sub-statement';
  end if;
  return new;
end;
$$;

drop trigger if exists knowledge_items_one_level on public.knowledge_items;
create trigger knowledge_items_one_level
  before insert or update of parent_item_id on public.knowledge_items
  for each row execute function public.knowledge_items_one_level();

-- Column privileges (20260928000100_hide_knowledge_answers.sql): new columns are hidden until
-- granted. Neither one is secret: players read them like id / prompt, owners write them (RLS:
-- "items: insert / update if deck owner" still decides which rows).
grant select (parent_item_id, sort_order) on table public.knowledge_items to anon, authenticated;
grant insert (parent_item_id, sort_order) on table public.knowledge_items to authenticated;
grant update (parent_item_id, sort_order) on table public.knowledge_items to authenticated;

-- clone_deck(): as in 20261006000000, plus sub-statements and the statement order.
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
  v_imap   jsonb := '{}'::jsonb;  -- old statement id → new statement id
  v_node   record;
  v_item   record;
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

  -- Statements before sub-statements (so every parent's new id is known), each with its trap rules
  -- and its place in the order. Progress is NOT copied.
  for v_item in
    select ki.id, ki.node_id, ki.parent_item_id, ki.prompt, ki.correct_stmt, ki.trap_rules, ki.sort_order
      from public.knowledge_items ki
      join public.mindmap_nodes n on n.id = ki.node_id
     where n.deck_id = v_source.id
     order by (ki.parent_item_id is not null), ki.sort_order, ki.created_at, ki.id
  loop
    insert into public.knowledge_items (node_id, parent_item_id, prompt, correct_stmt, trap_rules, sort_order)
    values (
      (v_map ->> v_item.node_id::text)::uuid,
      (v_imap ->> v_item.parent_item_id::text)::uuid,
      v_item.prompt,
      v_item.correct_stmt,
      v_item.trap_rules,
      v_item.sort_order
    )
    returning id into v_new;
    v_imap := v_imap || jsonb_build_object(v_item.id::text, v_new);
  end loop;

  return query select v_deck, v_left, v_cost;
end;
$$;

revoke all on function public.clone_deck(uuid, text) from public, anon;
grant execute on function public.clone_deck(uuid, text) to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'knowledge_items' and column_name in ('parent_item_id', 'sort_order');
-- (as the owner) insert a sub-statement under a statement of ANOTHER root → ERROR: violates foreign key
-- (as the owner) insert a sub-statement under a sub-statement → ERROR: SUB_STATEMENT_TOO_DEEP
-- (as the owner) update public.knowledge_items set node_id = '<other root>' where id = '<statement>';
--   select node_id from public.knowledge_items where parent_item_id = '<statement>';   -- '<other root>'
-- (as the owner) delete from public.knowledge_items where id = '<statement>';            -- its sub-statements go too

-- ============================================================================
-- Rollback
-- ============================================================================
-- re-run the clone_deck() of 20261006000000_species_seed_prices.sql, then
-- drop trigger if exists knowledge_items_one_level on public.knowledge_items;
-- drop function if exists public.knowledge_items_one_level();
-- alter table public.knowledge_items drop constraint if exists knowledge_items_parent_item_fkey;
-- alter table public.knowledge_items drop constraint if exists knowledge_items_no_self_parent;
-- alter table public.knowledge_items drop constraint if exists knowledge_items_id_node_key;
-- alter table public.knowledge_items drop column if exists parent_item_id, drop column if exists sort_order;

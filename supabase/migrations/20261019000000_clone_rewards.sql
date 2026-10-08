-- ============================================================================
-- Tree cloning: a quality gate, a creator reward, a clone log and owner notifications
-- ----------------------------------------------------------------------------
-- Keep in sync with src/shared/lib/economy.ts (CLONE_MIN_STATEMENTS, CLONE_CREATOR_REWARD, cloneCost;
-- tests check).
--   • clone_deck(): a tree can be cloned only with at least 50 statements (CLONE_TOO_SMALL); never
--     your own (CANNOT_CLONE_OWN_DECK, as before). The cloner still pays the dynamic price, the
--     species' seed + min(statements, 50) (so 150, or 230 for a surreal species, once the gate is met);
--     the tree's creator now earns exactly +50 coins per clone. Both purses are locked in id order (two
--     gardeners cloning each other's trees at once never deadlock). A gardener may clone as many trees
--     as their coins cover.
--   • plant_clones: one row per clone (who cloned whose tree, the copy, what was paid and earned).
--     The cloner and the creator can read their rows; only clone_deck() writes them.
--   • notifications: messages for a gardener ("🎉 A player cloned your tree '<title>'! You earned
--     +50 🪙"). Readable by their owner, who may only mark them read (read_at); written by functions.
--
-- Order: after 20261018000000_road_logistics.sql (and 20261013000000_content_nodes.sql, whose
-- clone_deck() this re-creates). With the deploy of the matching code (the clone button shows the
-- 50-statement requirement; the farm shows notifications). Safe to re-run.
-- ============================================================================

begin;

-- 1. The clone log ---------------------------------------------------------------------------
create table if not exists public.plant_clones (
  id             uuid        primary key default gen_random_uuid(),
  source_deck_id uuid        references public.decks (id) on delete set null,
  clone_deck_id  uuid        references public.decks (id) on delete set null,
  cloner_id      uuid        not null references public.users (id) on delete cascade,
  owner_id       uuid        not null references public.users (id) on delete cascade,
  statements     integer     not null check (statements >= 0),
  cost           integer     not null check (cost >= 0),
  owner_reward   integer     not null check (owner_reward >= 0),
  created_at     timestamptz not null default now(),
  check (cloner_id <> owner_id)
);
create index if not exists plant_clones_owner_idx on public.plant_clones (owner_id, created_at desc);
create index if not exists plant_clones_cloner_idx on public.plant_clones (cloner_id, created_at desc);

alter table public.plant_clones enable row level security;
revoke all on public.plant_clones from anon, authenticated;
grant select on public.plant_clones to authenticated;
drop policy if exists "plant_clones: cloner or owner reads" on public.plant_clones;
create policy "plant_clones: cloner or owner reads" on public.plant_clones
  for select to authenticated using (auth.uid() = cloner_id or auth.uid() = owner_id);

-- 2. Notifications -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  kind       text        not null check (kind in ('tree_cloned')),
  message    text        not null check (char_length(message) between 1 and 300),
  data       jsonb       not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "notifications: owner reads" on public.notifications;
create policy "notifications: owner reads" on public.notifications
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "notifications: owner marks read" on public.notifications;
create policy "notifications: owner marks read" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Clone: the gate, the price, the reward, the log, the notice -----------------------------
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
  v_reward constant integer := 50;  -- CLONE_CREATOR_REWARD
  v_min    constant integer := 50;  -- CLONE_MIN_STATEMENTS
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
    from public.content_nodes c where c.deck_id = v_source.id and c.node_type = 'statement';
  if v_items < v_min then
    raise exception 'CLONE_TOO_SMALL' using errcode = 'P0001', hint = format('This tree has %s of the %s statements a clone needs', v_items, v_min);
  end if;
  v_cost := public.seed_price(v_source.tree_type) + least(v_items, 50);  -- cloneCost() in shared/lib/economy.ts

  perform public.ensure_user_profile();
  -- Both purses, in id order (no deadlock between two gardeners cloning each other's trees).
  perform 1 from public.users u where u.id in (v_user, v_source.user_id) order by u.id for update;

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

  -- Parents first, so every parent's new id is known before its children.
  for v_node in
    with recursive tree as (
      select c.id, c.parent_id, c.content, c.node_type, c.trap_rules, c.sort_order, 0 as depth
        from public.content_nodes c
       where c.deck_id = v_source.id and c.parent_id is null
      union all
      select c.id, c.parent_id, c.content, c.node_type, c.trap_rules, c.sort_order, t.depth + 1
        from public.content_nodes c
        join tree t on c.parent_id = t.id
       where c.deck_id = v_source.id
    )
    select * from tree order by depth, sort_order, id
  loop
    insert into public.content_nodes (deck_id, parent_id, content, node_type, trap_rules, sort_order)
    values (v_deck, (v_map ->> v_node.parent_id::text)::uuid, v_node.content, v_node.node_type, v_node.trap_rules, v_node.sort_order)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(v_node.id::text, v_new);
  end loop;

  -- The creator's reward, the log and the notice.
  update public.users set coins = coins + v_reward where id = v_source.user_id;
  insert into public.plant_clones (source_deck_id, clone_deck_id, cloner_id, owner_id, statements, cost, owner_reward)
  values (v_source.id, v_deck, v_user, v_source.user_id, v_items, v_cost, v_reward);
  insert into public.notifications (user_id, kind, message, data)
  values (
    v_source.user_id,
    'tree_cloned',
    left(format('🎉 A player cloned your tree ''%s''! You earned +%s 🪙', v_source.title, v_reward), 300),
    jsonb_build_object('deck_id', v_source.id, 'reward', v_reward)
  );

  return query select v_deck, v_left, v_cost;
end;
$$;

revoke all on function public.clone_deck(uuid, text) from public, anon;
grant execute on function public.clone_deck(uuid, text) to authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select * from public.clone_deck('<a public tree with 50+ statements>', 'copy-slug');  -- cost 150 (230 surreal)
-- select * from public.clone_deck('<a public tree with 12 statements>', 'copy-slug');   -- CLONE_TOO_SMALL
-- select * from public.plant_clones order by created_at desc limit 1;                     -- the log row
-- select message from public.notifications order by created_at desc limit 1;              -- the creator's notice

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run clone_deck() of 20261013000000_content_nodes.sql; drop table public.notifications; drop
-- table public.plant_clones. Rewards already paid stay paid.

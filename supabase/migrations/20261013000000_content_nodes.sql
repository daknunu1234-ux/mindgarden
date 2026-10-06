-- ============================================================================
-- Unified content nodes: roots and statements in ONE hierarchy
-- ----------------------------------------------------------------------------
-- public.content_nodes replaces public.mindmap_nodes (roots) + public.knowledge_items (statements).
-- Every row is a node of one tree's outline:
--   id          uuid PK (the old root / statement ids are kept: progress, links, coins carry over)
--   deck_id     the tree
--   parent_id   the node above (NULL = a top-level root); same tree (composite FK), no cycles
--   content     a root's title or a statement's text (≤ 500 characters; statements plain text)
--   node_type   'root' | 'statement' (default 'statement'); toggling it is one UPDATE
--   trap_rules  a statement's trap rules (service role only, like before)
--   sort_order  order among siblings (roots and statements share one order)
-- Practice selects node_type = 'statement' in a tree (or under a root): no table join.
-- Rules (trigger content_nodes_shape): a top-level node is a root (TOP_LEVEL_STATEMENT), and a node
-- can't go under itself or its own branch (NODE_CYCLE). Any node may sit under any node otherwise.
--
-- Data: every mindmap_nodes row becomes a root, every knowledge_items row a statement under its
-- statement (sub-statements) or else its root. Sibling order is re-sequenced 1, 2, 3… so the
-- outline reads exactly as before: a root's statements (in their order) first, then its sub-roots.
-- user_progress and deck_tournament_item_progress now reference content_nodes(id) (the column
-- names stay knowledge_item_id). The old tables are kept, renamed legacy_mindmap_nodes /
-- legacy_knowledge_items and closed to players, so this can be rolled back;
-- 20261013000100_drop_legacy_trees.sql drops them once the app runs on content_nodes.
--
-- Answer secrecy (20260928000100): statement text is now readable by anyone who can read the tree
-- (RLS still hides private trees). Visitors already read every statement of a shared tree
-- (getDeckReader) and only the owner is graded, so nothing secret is exposed; trap_rules stay
-- service-role only.
--
-- Functions re-created on content_nodes: award_mastery_coin (coins), uproot_deck (refund count),
-- clone_deck (copy), record_tournament_answer (item check); new indent_content_node (Tab /
-- Shift+Tab in place). Dropped if present: the never-shipped promote_statement_to_root,
-- convert_root_to_statement, indent_statement, indent_mindmap_node, renumber_mindmap_children.
--
-- Order: after 20261010000000_sub_statements.sql (parent_item_id, sort_order) and
-- 20261009000000_special_tree_coin_bonus.sql (species_coin_multiplier). Run it WITH the deploy of
-- the content-node code: the old code reads mindmap_nodes / knowledge_items, which this renames.
-- Not re-runnable (it moves data); roll back with the block at the end.
-- ============================================================================

begin;

-- 0. Functions from never-shipped drafts (in case one was applied by hand).
drop function if exists public.promote_statement_to_root(uuid);
drop function if exists public.convert_root_to_statement(uuid, boolean);
drop function if exists public.indent_statement(uuid, text);
drop function if exists public.indent_mindmap_node(uuid, text);
drop function if exists public.renumber_mindmap_children(uuid, uuid);

-- 1. The table (constraints that need the data in place come after the copy).
create table public.content_nodes (
  id         uuid             primary key default gen_random_uuid(),
  deck_id    uuid             not null references public.decks (id) on delete cascade,
  parent_id  uuid,
  content    text             not null check (char_length(btrim(content)) > 0 and char_length(content) <= 500),
  node_type  text             not null default 'statement' check (node_type in ('root', 'statement')),
  trap_rules jsonb            not null default '{}'::jsonb check (jsonb_typeof(trap_rules) = 'object'),
  sort_order double precision not null default 0,
  created_at timestamptz      not null default now(),
  -- Target of the same-tree parent FK.
  constraint content_nodes_id_deck_key unique (id, deck_id),
  constraint content_nodes_no_self_parent check (parent_id <> id),
  -- Plain text only (hard rule 1) for statements, as correct_stmt was.
  constraint content_nodes_plain_statement check (node_type = 'root' or content !~ '\\[A-Za-z]+')
);

-- 2. Copy: roots, then statements (ids kept).
insert into public.content_nodes (id, deck_id, parent_id, content, node_type, trap_rules, sort_order)
select n.id, n.deck_id, n.parent_id, n.title, 'root', '{}'::jsonb, 0
  from public.mindmap_nodes n;

insert into public.content_nodes (id, deck_id, parent_id, content, node_type, trap_rules, sort_order, created_at)
select ki.id, n.deck_id, coalesce(ki.parent_item_id, ki.node_id), ki.correct_stmt, 'statement', ki.trap_rules, 0, ki.created_at
  from public.knowledge_items ki
  join public.mindmap_nodes n on n.id = ki.node_id;

-- 3. One order per parent, as the outline showed it: statements (their order) before sub-roots
--    (theirs: sort_order, then title).
update public.content_nodes c
   set sort_order = o.rn
  from (
    select u.id,
           row_number() over (partition by u.deck_id, u.parent_id order by u.grp, u.s, u.t, u.id)::double precision as rn
      from (
        select ki.id, n.deck_id, coalesce(ki.parent_item_id, ki.node_id) as parent_id, 0 as grp,
               ki.sort_order::double precision as s, ki.created_at::text as t
          from public.knowledge_items ki
          join public.mindmap_nodes n on n.id = ki.node_id
        union all
        select n.id, n.deck_id, n.parent_id, 1, n.sort_order::double precision, n.title::text
          from public.mindmap_nodes n
      ) u
  ) o
 where c.id = o.id;

-- 4. Shape: same-tree parents (deleting a node deletes its branch), indexes, rules.
alter table public.content_nodes
  add constraint content_nodes_parent_fkey
  foreign key (parent_id, deck_id) references public.content_nodes (id, deck_id) on delete cascade;

create index idx_content_nodes_deck_id   on public.content_nodes (deck_id);
create index idx_content_nodes_parent_id on public.content_nodes (parent_id);
create index idx_content_nodes_deck_type on public.content_nodes (deck_id, node_type);

create or replace function public.content_nodes_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null and new.node_type <> 'root' then
    raise exception 'TOP_LEVEL_STATEMENT' using errcode = 'P0001', hint = 'A top-level node is a root';
  end if;
  if new.parent_id is not null and tg_op = 'UPDATE' and exists (
    with recursive up as (
      select c.id, c.parent_id from public.content_nodes c where c.id = new.parent_id
      union all
      select c.id, c.parent_id from public.content_nodes c join up on c.id = up.parent_id
    )
    select 1 from up where up.id = new.id
  ) then
    raise exception 'NODE_CYCLE' using errcode = 'P0001', hint = 'A node cannot go under its own branch';
  end if;
  return new;
end;
$$;

create trigger content_nodes_shape
  before insert or update of parent_id, node_type on public.content_nodes
  for each row execute function public.content_nodes_shape();

-- 5. Row Level Security: readable with the tree (public or own), written by its owner.
alter table public.content_nodes enable row level security;

create policy "content: read if deck readable" on public.content_nodes
  for select to anon, authenticated
  using (exists (
    select 1 from public.decks d
     where d.id = content_nodes.deck_id and (d.is_public or d.user_id = (select auth.uid()))
  ));
create policy "content: insert if deck owner" on public.content_nodes
  for insert to authenticated
  with check (exists (select 1 from public.decks d where d.id = content_nodes.deck_id and d.user_id = (select auth.uid())));
create policy "content: update if deck owner" on public.content_nodes
  for update to authenticated
  using (exists (select 1 from public.decks d where d.id = content_nodes.deck_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.decks d where d.id = content_nodes.deck_id and d.user_id = (select auth.uid())));
create policy "content: delete if deck owner" on public.content_nodes
  for delete to authenticated
  using (exists (select 1 from public.decks d where d.id = content_nodes.deck_id and d.user_id = (select auth.uid())));

-- Column privileges: only the service role reads trap_rules (decks/services/answers.ts); owners write
-- them (a new statement, Alt turning a root into one). A node never changes tree (no UPDATE of
-- deck_id).
revoke all on table public.content_nodes from anon, authenticated;
grant select (id, deck_id, parent_id, content, node_type, sort_order, created_at) on table public.content_nodes to anon, authenticated;
grant insert (deck_id, parent_id, content, node_type, trap_rules, sort_order) on table public.content_nodes to authenticated;
grant update (parent_id, content, node_type, trap_rules, sort_order) on table public.content_nodes to authenticated;
grant delete on table public.content_nodes to authenticated;
grant select, insert, update, delete on table public.content_nodes to service_role;

-- 6. Progress follows the statements to content_nodes (same ids, same column names).
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
     where con.contype = 'f'
       and ref.oid = 'public.knowledge_items'::regclass
       and rel.relname in ('user_progress', 'deck_tournament_item_progress')
       and rel.relnamespace = 'public'::regnamespace
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
  -- Policies that check the item exists in knowledge_items (whatever their name: the hosted base
  -- schema was built in the dashboard) go; the two below replace them.
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'user_progress'
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%knowledge_items%'
  loop
    execute format('drop policy %I on public.user_progress', r.policyname);
  end loop;
end $$;

-- None can exist (the old keys cascaded), but a dangling row would block the new key.
delete from public.user_progress p where not exists (select 1 from public.content_nodes c where c.id = p.knowledge_item_id);
delete from public.deck_tournament_item_progress p where not exists (select 1 from public.content_nodes c where c.id = p.knowledge_item_id);

alter table public.user_progress
  add constraint user_progress_content_node_fkey
  foreign key (knowledge_item_id) references public.content_nodes (id) on delete cascade;
alter table public.deck_tournament_item_progress
  add constraint deck_tournament_item_progress_content_node_fkey
  foreign key (knowledge_item_id) references public.content_nodes (id) on delete cascade;

drop policy if exists "progress: insert own" on public.user_progress;
create policy "progress: insert own" on public.user_progress
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.content_nodes c where c.id = user_progress.knowledge_item_id and c.node_type = 'statement')
  );
drop policy if exists "progress: update own" on public.user_progress;
create policy "progress: update own" on public.user_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.content_nodes c where c.id = user_progress.knowledge_item_id)
  );

-- 7. Functions on content_nodes.

-- Mastery coin: as in 20261009000000 (farm × species multiplier, carry), the tree read from the node.
create or replace function public.award_mastery_coin(p_user_id uuid, p_item_id uuid)
returns table (coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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

  if not coalesce(v_claimed, false) then
    select u.coins into v_total from public.users u where u.id = p_user_id;
    return query select 0, coalesce(v_total, 0);
    return;
  end if;

  select c.deck_id, d.tree_type into v_deck, v_species
    from public.content_nodes c
    join public.decks d on d.id = c.deck_id
   where c.id = p_item_id;

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
revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;

-- Chop with the Woodshop refund: as in 20260930000000, statements counted by type.
create or replace function public.uproot_deck(p_deck_id uuid)
returns table (deck_id uuid, refund integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user       uuid := auth.uid();
  v_statements integer;
  v_refund     integer := 0;
  v_total      integer;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;
  if not exists (select 1 from public.decks d where d.id = p_deck_id and d.user_id = v_user) then
    raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_statements
    from public.content_nodes c where c.deck_id = p_deck_id and c.node_type = 'statement';
  if exists (select 1 from public.garden_placements g where g.user_id = v_user and g.item_type = 'woodshop') then
    v_refund := least(floor(v_statements * 0.25)::integer, 50);
  end if;

  delete from public.decks d where d.id = p_deck_id and d.user_id = v_user;
  update public.users u set coins = u.coins + v_refund where u.id = v_user returning u.coins into v_total;

  return query select p_deck_id, v_refund, coalesce(v_total, 0);
end;
$$;
revoke all on function public.uproot_deck(uuid) from public, anon;
grant execute on function public.uproot_deck(uuid) to authenticated, service_role;

-- Clone: as in 20261006000000 / 20261010000000 (same price), every node copied parents-first with
-- its type, order and trap rules. Progress is NOT copied.
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
    from public.content_nodes c where c.deck_id = v_source.id and c.node_type = 'statement';
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

  return query select v_deck, v_left, v_cost;
end;
$$;
revoke all on function public.clone_deck(uuid, text) from public, anon;
grant execute on function public.clone_deck(uuid, text) to authenticated, service_role;

-- Tournament answer: as in 20260928000900, the item must be a statement of this tree.
create or replace function public.record_tournament_answer(
  p_user_id            uuid,
  p_deck_id            uuid,
  p_item_id            uuid,
  p_is_correct         boolean,
  p_day                date,
  p_drillable_item_ids uuid[]
)
returns table (
  mastery_level      integer,
  previous_level     integer,
  current_points     integer,
  max_points         integer,
  mastery_percentage numeric,
  days_count         integer,
  is_graduated       boolean,
  just_graduated     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_deck        public.decks%rowtype;
  v_participant public.deck_tournament_participants%rowtype;
  v_prev        integer;
  v_level       integer;
  v_max         integer := 5 * coalesce(cardinality(p_drillable_item_ids), 0);
  v_points      integer;
  v_graduating  boolean;
begin
  select * into v_deck from public.decks d where d.id = p_deck_id;
  if not found or not v_deck.is_public or not v_deck.is_tournament_open then
    raise exception 'TOURNAMENT_CLOSED' using errcode = 'P0001';
  end if;
  if v_deck.user_id = p_user_id then
    raise exception 'TOURNAMENT_HOST' using errcode = 'P0001';
  end if;
  if not (p_item_id = any (p_drillable_item_ids)) or not exists (
    select 1 from public.content_nodes c
     where c.id = p_item_id and c.deck_id = p_deck_id and c.node_type = 'statement'
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.deck_tournament_participants as p (deck_id, user_id, max_points, last_practiced_date)
  values (p_deck_id, p_user_id, v_max, p_day)
  on conflict (deck_id, user_id) do nothing;

  select * into v_participant from public.deck_tournament_participants p
   where p.deck_id = p_deck_id and p.user_id = p_user_id
     for update;
  if v_participant.is_graduated then
    raise exception 'TOURNAMENT_GRADUATED' using errcode = 'P0001';
  end if;

  select ip.mastery_level into v_prev from public.deck_tournament_item_progress ip
   where ip.participant_id = v_participant.id and ip.knowledge_item_id = p_item_id
     for update;
  v_prev  := coalesce(v_prev, 0);
  v_level := case when p_is_correct then least(v_prev + 1, 5) else greatest(v_prev - 1, 0) end;

  insert into public.deck_tournament_item_progress as ip (participant_id, knowledge_item_id, mastery_level)
  values (v_participant.id, p_item_id, v_level)
  on conflict (participant_id, knowledge_item_id) do update set mastery_level = excluded.mastery_level;

  select coalesce(sum(ip.mastery_level), 0)::integer into v_points
    from public.deck_tournament_item_progress ip
   where ip.participant_id = v_participant.id
     and ip.knowledge_item_id = any (p_drillable_item_ids);
  v_points     := least(v_points, v_max);
  v_graduating := v_max > 0 and v_points >= v_max;

  update public.deck_tournament_participants p set
    current_points      = v_points,
    max_points          = v_max,
    days_count          = case when p_day > p.last_practiced_date then p.days_count + 1 else p.days_count end,
    last_practiced_date = greatest(p.last_practiced_date, p_day),
    is_graduated        = v_graduating,
    graduated_at        = case when v_graduating then now() else null end,
    updated_at          = now()
   where p.id = v_participant.id
  returning * into v_participant;

  return query select v_level, v_prev, v_participant.current_points, v_participant.max_points,
                      v_participant.mastery_percentage, v_participant.days_count,
                      v_participant.is_graduated, v_graduating;
end;
$$;
revoke all on function public.record_tournament_answer(uuid, uuid, uuid, boolean, date, uuid[]) from public, anon, authenticated;
grant execute on function public.record_tournament_answer(uuid, uuid, uuid, boolean, date, uuid[]) to service_role;

-- Tab / Shift+Tab, IN PLACE (the Tree Workshop). The outline shows each node followed by its
-- branch; only parents change, so no row moves up or down.
--   'in'   the node becomes the LAST child of the sibling right above it (NO_ROW_ABOVE).
--   'out'  the node goes up one level, right below its old parent; the siblings that were below it
--          become ITS children, after its own (ALREADY_TOP for a top-level root;
--          TOP_LEVEL_STATEMENT for a statement whose parent is top-level).
create or replace function public.indent_content_node(p_node_id uuid, p_direction text)
returns table (node_id uuid, parent_id uuid, moved_children integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user   uuid := auth.uid();
  v_node   record;
  v_parent record;
  v_target uuid;
  v_base   double precision;
  v_next   double precision;
  v_moved  integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_UNAUTHORIZED' using errcode = '28000';
  end if;
  if p_direction not in ('in', 'out') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', hint = 'direction is in or out';
  end if;

  select c.id, c.deck_id, c.parent_id, c.node_type, c.sort_order, c.created_at, d.user_id
    into v_node
    from public.content_nodes c
    join public.decks d on d.id = c.deck_id
   where c.id = p_node_id
     for update of c;
  if not found then
    raise exception 'NODE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_node.user_id <> v_user then
    raise exception 'AUTH_FORBIDDEN' using errcode = '42501';
  end if;

  if p_direction = 'in' then
    select s.id into v_target
      from public.content_nodes s
     where s.deck_id = v_node.deck_id and s.parent_id is not distinct from v_node.parent_id
       and (s.sort_order, s.created_at, s.id) < (v_node.sort_order, v_node.created_at, p_node_id)
     order by s.sort_order desc, s.created_at desc, s.id desc
     limit 1;
    if v_target is null then
      raise exception 'NO_ROW_ABOVE' using errcode = 'P0001', hint = 'Nothing above to nest under';
    end if;
    select coalesce(max(c.sort_order), 0) + 1 into v_base from public.content_nodes c where c.parent_id = v_target;
    update public.content_nodes set parent_id = v_target, sort_order = v_base where id = p_node_id;
    return query select p_node_id, v_target, 0;
    return;
  end if;

  if v_node.parent_id is null then
    raise exception 'ALREADY_TOP' using errcode = 'P0001', hint = 'Already a top-level root';
  end if;
  select p.id, p.parent_id, p.sort_order into v_parent from public.content_nodes p where p.id = v_node.parent_id;
  if v_parent.parent_id is null and v_node.node_type <> 'root' then
    raise exception 'TOP_LEVEL_STATEMENT' using errcode = 'P0001', hint = 'A top-level node is a root';
  end if;
  -- 1. The siblings below it become its children, after its own (their order kept).
  select coalesce(max(c.sort_order), 0) into v_base from public.content_nodes c where c.parent_id = p_node_id;
  update public.content_nodes m
     set parent_id = p_node_id, sort_order = v_base + o.rn
    from (
      select s.id, row_number() over (order by s.sort_order, s.created_at, s.id)::double precision as rn
        from public.content_nodes s
       where s.parent_id = v_node.parent_id
         and (s.sort_order, s.created_at, s.id) > (v_node.sort_order, v_node.created_at, p_node_id)
    ) o
   where m.id = o.id;
  get diagnostics v_moved = row_count;
  -- 2. It goes up, right below its old parent (between it and the next sibling up there).
  select min(s.sort_order) into v_next
    from public.content_nodes s
   where s.deck_id = v_node.deck_id and s.parent_id is not distinct from v_parent.parent_id
     and s.sort_order > v_parent.sort_order;
  update public.content_nodes
     set parent_id = v_parent.parent_id,
         sort_order = case when v_next is null then v_parent.sort_order + 1 else v_parent.sort_order + (v_next - v_parent.sort_order) / 2 end
   where id = p_node_id;
  return query select p_node_id, v_parent.parent_id, v_moved;
end;
$$;
revoke all on function public.indent_content_node(uuid, text) from public, anon;
grant execute on function public.indent_content_node(uuid, text) to authenticated, service_role;

-- 8. The old tables step aside (kept for rollback, closed to players).
drop trigger if exists knowledge_items_one_level on public.knowledge_items;
drop function if exists public.knowledge_items_one_level();
alter table public.knowledge_items rename to legacy_knowledge_items;
alter table public.mindmap_nodes rename to legacy_mindmap_nodes;
revoke all on table public.legacy_knowledge_items from anon, authenticated;
revoke all on table public.legacy_mindmap_nodes from anon, authenticated;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select (select count(*) from public.legacy_mindmap_nodes) + (select count(*) from public.legacy_knowledge_items) as before,
--        (select count(*) from public.content_nodes) as after;                                   -- equal
-- select count(*) from public.content_nodes where parent_id is null and node_type <> 'root';    -- 0
-- select count(*) from public.user_progress p left join public.content_nodes c on c.id = p.knowledge_item_id where c.id is null;  -- 0
-- (as the owner) update public.content_nodes set node_type = 'root' where id = '<statement>';   -- toggles in place
-- (as the owner) select * from public.indent_content_node('<node>', 'in');                      -- nests under the row above

-- ============================================================================
-- Rollback (before 20261013000100 drops the legacy tables; new nodes since are lost)
-- ============================================================================
-- begin;
-- alter table public.user_progress drop constraint user_progress_content_node_fkey;
-- alter table public.deck_tournament_item_progress drop constraint deck_tournament_item_progress_content_node_fkey;
-- alter table public.legacy_mindmap_nodes rename to mindmap_nodes;
-- alter table public.legacy_knowledge_items rename to knowledge_items;
-- delete from public.user_progress p where not exists (select 1 from public.knowledge_items k where k.id = p.knowledge_item_id);
-- alter table public.user_progress add foreign key (knowledge_item_id) references public.knowledge_items (id) on delete cascade;
-- (same for deck_tournament_item_progress), re-run the policies of 20260928000000 for user_progress,
-- the grants of 20260928000100 and 20261010000000, the functions of 20261009000000 (award_mastery_coin),
-- 20260930000000 (uproot_deck), 20261010000000 (clone_deck), 20260928000900 (record_tournament_answer),
-- then drop function public.indent_content_node(uuid, text); drop table public.content_nodes;
-- commit;

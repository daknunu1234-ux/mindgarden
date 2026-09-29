-- ============================================================================
-- Mind Tournament: owners host a mastery race on a shared tree; visitors compete in isolation
-- ----------------------------------------------------------------------------
-- A contestant drills the host's tree with their OWN tournament mastery per statement (0–5).
-- It never touches user_progress, practice_days (streaks) or coins: tournament progress lives
-- only in the two tables below.
--   • Max points  = 5 × N, N = the tree's DRILLABLE statements (those the trap engine can ask).
--   • Mastery %   = current_points / max_points × 100 (generated column, 2 decimals).
--   • days_count  = distinct local calendar days with at least one answer on THIS tree
--                   (the player's local day, same rule as practice_days; not the server's UTC date).
--   • Graduation  = current_points reaches max_points (every drillable statement at 5/5):
--                   is_graduated + graduated_at are set once and never cleared (Bia Trạng Nguyên).
--                   A graduate's row is frozen: later answers are refused by the function.
-- Boards: Active Learners (not graduated) by mastery % DESC, days ASC, updated_at ASC;
--         Hall of Fame (graduated) by days ASC, graduated_at ASC.
--
-- Writes: only public.record_tournament_answer(), EXECUTE for service_role only. The Next.js
-- server grades every answer (trap engine) before calling it, so a player can't post points,
-- days or graduation through the REST API. Players read their own rows; boards come from the
-- two SECURITY DEFINER board functions, which expose a display name (full_name) but never email.
--
-- Order: after 20260928000800_tree_visits.sql. Safe to re-run.
-- ============================================================================

begin;

-- 1. Hosting switch on the tree (owners already UPDATE their own decks through RLS).
alter table public.decks add column if not exists is_tournament_open boolean not null default false;

-- 2. One row per contestant per tree.
create table if not exists public.deck_tournament_participants (
  id                  uuid        primary key default gen_random_uuid(),
  deck_id             uuid        not null references public.decks (id) on delete cascade,
  user_id             uuid        not null references public.users (id) on delete cascade,
  current_points      integer     not null default 0 check (current_points >= 0),
  max_points          integer     not null default 0 check (max_points >= 0),
  mastery_percentage  numeric(5,2) generated always as (
                        round((current_points::numeric / nullif(max_points, 0)) * 100, 2)
                      ) stored,
  days_count          integer     not null default 1 check (days_count >= 1),
  is_graduated        boolean     not null default false,
  graduated_at        timestamptz null,
  last_practiced_date date        not null default current_date,
  updated_at          timestamptz not null default now(),
  constraint unique_deck_participant unique (deck_id, user_id),
  constraint tournament_points_within_max check (current_points <= max_points),
  constraint tournament_graduation_consistent check (is_graduated = (graduated_at is not null))
);

create index if not exists idx_tournament_participants_user_id on public.deck_tournament_participants (user_id);

-- 3. The contestant's tournament mastery per statement (isolated from user_progress).
create table if not exists public.deck_tournament_item_progress (
  id                uuid    primary key default gen_random_uuid(),
  participant_id    uuid    not null references public.deck_tournament_participants (id) on delete cascade,
  knowledge_item_id uuid    not null references public.knowledge_items (id) on delete cascade,
  mastery_level     integer not null default 0 check (mastery_level between 0 and 5),
  constraint unique_participant_statement unique (participant_id, knowledge_item_id)
);

create index if not exists idx_tournament_item_progress_item_id on public.deck_tournament_item_progress (knowledge_item_id);

-- 4. RLS (hard rule 9): players read their own rows only; nobody but the service role writes.
alter table public.deck_tournament_participants enable row level security;
alter table public.deck_tournament_item_progress enable row level security;

drop policy if exists "tournament_participants: read own" on public.deck_tournament_participants;
create policy "tournament_participants: read own" on public.deck_tournament_participants
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tournament_item_progress: read own" on public.deck_tournament_item_progress;
create policy "tournament_item_progress: read own" on public.deck_tournament_item_progress
  for select to authenticated
  using (exists (
    select 1 from public.deck_tournament_participants p
     where p.id = deck_tournament_item_progress.participant_id
       and p.user_id = (select auth.uid())
  ));

revoke all on table public.deck_tournament_participants from anon, authenticated;
revoke all on table public.deck_tournament_item_progress from anon, authenticated;
grant select on table public.deck_tournament_participants to authenticated;
grant select on table public.deck_tournament_item_progress to authenticated;
grant select, insert, update, delete on table public.deck_tournament_participants to service_role;
grant select, insert, update, delete on table public.deck_tournament_item_progress to service_role;

-- 5. One graded answer. Called by the server (service role) AFTER it graded the answer with the
-- trap engine. p_drillable_item_ids = the tree's drillable statements right now: max_points is
-- 5 × their count and current_points sums the contestant's levels over exactly those items.
-- p_day = the contestant's local calendar day.
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
-- The OUT columns (mastery_level, days_count, …) share names with table columns: prefer columns.
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
    select 1 from public.knowledge_items ki join public.mindmap_nodes n on n.id = ki.node_id
     where ki.id = p_item_id and n.deck_id = p_deck_id
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Join on the first answer (days_count 1 for that day), then lock the row so concurrent
  -- answers from the same contestant apply one at a time.
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
    -- A new calendar day counts once, however many answers it holds.
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

-- 6. Boards. Readable by anyone who can read the tree (public, or its owner), even after the host
-- closes the tournament: graduates stay engraved. display_name = full_name (NULL → the app shows
-- a friendly pseudonym); email is never returned.
create or replace function public.get_tournament_active_board(p_deck_id uuid)
returns table (
  rank               bigint,
  user_id            uuid,
  display_name       text,
  current_points     integer,
  max_points         integer,
  mastery_percentage numeric,
  days_count         integer,
  updated_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by p.mastery_percentage desc nulls last, p.days_count asc, p.updated_at asc),
         p.user_id, u.full_name::text, p.current_points, p.max_points, p.mastery_percentage, p.days_count, p.updated_at
    from public.deck_tournament_participants p
    join public.decks d on d.id = p.deck_id
    left join public.users u on u.id = p.user_id
   where p.deck_id = p_deck_id
     and not p.is_graduated
     and (d.is_public or d.user_id = (select auth.uid()))
   order by p.mastery_percentage desc nulls last, p.days_count asc, p.updated_at asc
   limit 50;
$$;

create or replace function public.get_tournament_hall_of_fame(p_deck_id uuid)
returns table (
  rank           bigint,
  user_id        uuid,
  display_name   text,
  max_points     integer,
  days_count     integer,
  graduated_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by p.days_count asc, p.graduated_at asc),
         p.user_id, u.full_name::text, p.max_points, p.days_count, p.graduated_at
    from public.deck_tournament_participants p
    join public.decks d on d.id = p.deck_id
    left join public.users u on u.id = p.user_id
   where p.deck_id = p_deck_id
     and p.is_graduated
     and (d.is_public or d.user_id = (select auth.uid()))
   order by p.days_count asc, p.graduated_at asc;
$$;

revoke all on function public.get_tournament_active_board(uuid) from public;
revoke all on function public.get_tournament_hall_of_fame(uuid) from public;
grant execute on function public.get_tournament_active_board(uuid) to anon, authenticated, service_role;
grant execute on function public.get_tournament_hall_of_fame(uuid) to anon, authenticated, service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where tablename like 'deck_tournament%';   -- t, t
-- set role authenticated; insert into public.deck_tournament_participants (deck_id, user_id)
--   values ('<deck>', auth.uid());                                                       -- ERROR: permission denied
-- reset role;
-- select * from public.get_tournament_active_board('<public deck id>');                  -- as anon: rows, no email

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.get_tournament_hall_of_fame(uuid);
-- drop function if exists public.get_tournament_active_board(uuid);
-- drop function if exists public.record_tournament_answer(uuid, uuid, uuid, boolean, date, uuid[]);
-- drop table if exists public.deck_tournament_item_progress;
-- drop table if exists public.deck_tournament_participants;
-- alter table public.decks drop column if exists is_tournament_open;

-- ============================================================================
-- Daily Rush: one sudden-death run a day, coins = the streak
-- ----------------------------------------------------------------------------
-- Once per calendar day a gardener may play a Daily Rush on ONE of their own trees: 8 seconds a
-- card, a right answer brings the next card, a wrong answer or a timeout ends the run, and the run
-- pays 1 🪙 per card answered in a row (features/rush/lib/rules.ts; a test keeps the numbers equal).
--
-- daily_rush_runs       one row per gardener per local day: today's run. Its primary key is what
--                       makes it one play a day. It holds the tree, the seed the server builds the
--                       cards from, the streak so far and when the current card was dealt. No
--                       per-answer rows: the streak is updated in place.
-- start_daily_rush()    claims today's run (RUSH_ALREADY_PLAYED on a second try), on a tree the
--                       gardener owns.
-- answer_daily_rush()   one card's verdict, in one transaction under the run's row lock. The app
--                       server grades the pick (the client never says whether it was right); this
--                       function checks the clock itself: an answer that arrives after the limit is a
--                       timeout whatever was picked. Right and in time: streak + 1 and the next card's
--                       clock starts. Otherwise, or on the last card, the run finishes and
--                       users.coins grows by the streak, at once.
-- settle_daily_rush()   pays a run that was abandoned mid-card (tab closed): after its card's time
--                       is long over, it finishes with the streak it had.
-- All three are service role only: the server computes the day from its own clock and the player's
-- timezone, so a player can pick neither the day nor the verdict.
--
-- Order: after 20261007000000_drop_unused_progress_columns.sql. Safe to re-run.
-- ============================================================================

begin;

create table if not exists public.daily_rush_runs (
  user_id             uuid        not null references public.users(id) on delete cascade,
  day                 date        not null,
  -- The tree played. Chopping it ends the run's card supply; the row stays (the day is used).
  deck_id             uuid        references public.decks(id) on delete set null,
  seed                text        not null check (seed ~ '^[0-9a-z]{1,32}$'),
  time_zone           text        not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  streak              integer     not null default 0 check (streak between 0 and 30),  -- RUSH_MAX_STREAK
  status              text        not null default 'active' check (status in ('active', 'finished')),
  coins               integer     not null default 0 check (coins between 0 and 30),
  question_started_at timestamptz not null default now(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  primary key (user_id, day)
);
create index if not exists idx_daily_rush_runs_deck_id on public.daily_rush_runs(deck_id);

alter table public.daily_rush_runs enable row level security;

drop policy if exists "daily_rush_runs: read own" on public.daily_rush_runs;
create policy "daily_rush_runs: read own" on public.daily_rush_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Players read their own runs; only the server writes.
revoke insert, update, delete on public.daily_rush_runs from anon, authenticated;
grant select on public.daily_rush_runs to authenticated;

create or replace function public.start_daily_rush(p_user_id uuid, p_deck_id uuid, p_day date, p_seed text, p_time_zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_user_id is null or p_deck_id is null or p_day is null or p_seed is null then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  select d.user_id into v_owner from public.decks d where d.id = p_deck_id;
  if v_owner is null or v_owner <> p_user_id then
    raise exception 'DECK_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The primary key lets only the day's first run through.
  insert into public.daily_rush_runs (user_id, day, deck_id, seed, time_zone)
  values (p_user_id, p_day, p_deck_id, p_seed, coalesce(nullif(p_time_zone, ''), 'UTC'))
  on conflict (user_id, day) do nothing;
  if not found then
    raise exception 'RUSH_ALREADY_PLAYED' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.answer_daily_rush(
  p_user_id   uuid,
  p_day       date,
  p_expected  integer,  -- the streak the app graded against (the card's index)
  p_correct   boolean,  -- the app server's verdict on the pick
  p_timed_out boolean,  -- the client's clock ran out (no pick)
  p_last      boolean,  -- this was the run's last card
  p_limit_ms  integer   -- time allowed per card, network grace included
)
returns table (run_streak integer, is_finished boolean, outcome text, coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run    public.daily_rush_runs%rowtype;
  v_late   boolean;
  v_streak integer;
  v_reason text;
  v_total  integer;
begin
  select * into v_run from public.daily_rush_runs r
   where r.user_id = p_user_id and r.day = p_day
     for update;
  if not found or v_run.status <> 'active' then
    raise exception 'RUSH_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_run.streak <> p_expected then
    raise exception 'RUSH_OUT_OF_SYNC' using errcode = 'P0001';
  end if;

  -- The database's own clock decides whether the answer came in time.
  v_late := clock_timestamp() - v_run.question_started_at > make_interval(secs => p_limit_ms / 1000.0);

  if coalesce(p_correct, false) and not coalesce(p_timed_out, false) and not v_late then
    v_streak := v_run.streak + 1;
    if not coalesce(p_last, false) then
      update public.daily_rush_runs r
         set streak = v_streak, question_started_at = clock_timestamp()
       where r.user_id = p_user_id and r.day = p_day;
      return query select v_streak, false, 'correct'::text, 0, null::integer;
      return;
    end if;
    v_reason := 'complete';
  else
    v_streak := v_run.streak;
    v_reason := case when v_late or coalesce(p_timed_out, false) then 'timeout' else 'wrong' end;
  end if;

  -- The run is over: it pays its streak, in the same transaction.
  update public.daily_rush_runs r
     set streak = v_streak, coins = v_streak, status = 'finished', finished_at = now()
   where r.user_id = p_user_id and r.day = p_day;
  if v_streak > 0 then
    update public.users u set coins = u.coins + v_streak where u.id = p_user_id returning u.coins into v_total;
  else
    select u.coins into v_total from public.users u where u.id = p_user_id;
  end if;
  return query select v_streak, true, v_reason, v_streak, v_total;
end;
$$;

-- An abandoned run (its card's time ran out long ago and no answer came) finishes with its streak.
create or replace function public.settle_daily_rush(p_user_id uuid, p_stale_ms integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid integer;
begin
  with done as (
    update public.daily_rush_runs r
       set coins = r.streak, status = 'finished', finished_at = now()
     where r.user_id = p_user_id
       and r.status = 'active'
       and clock_timestamp() - r.question_started_at > make_interval(secs => p_stale_ms / 1000.0)
    returning r.streak
  )
  select coalesce(sum(streak), 0)::integer into v_paid from done;

  if v_paid > 0 then
    update public.users u set coins = u.coins + v_paid where u.id = p_user_id;
  end if;
  return v_paid;
end;
$$;

revoke all on function public.start_daily_rush(uuid, uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.answer_daily_rush(uuid, date, integer, boolean, boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.settle_daily_rush(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_daily_rush(uuid, uuid, date, text, text) to service_role;
grant execute on function public.answer_daily_rush(uuid, date, integer, boolean, boolean, boolean, integer) to service_role;
grant execute on function public.settle_daily_rush(uuid, integer) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- (service role) select public.start_daily_rush('<you>', '<tree>', current_date, 'abc123', 'UTC');           -- ok
-- (service role) select public.start_daily_rush('<you>', '<tree>', current_date, 'abc123', 'UTC');           -- ERROR: RUSH_ALREADY_PLAYED
-- (service role) select * from public.answer_daily_rush('<you>', current_date, 0, true, false, false, 10500); -- 1, false, correct
-- (service role) select * from public.answer_daily_rush('<you>', current_date, 1, false, false, false, 10500); -- 1, true, wrong, 1, purse + 1
-- (service role) select * from public.answer_daily_rush('<you>', current_date, 1, true, false, false, 10500);  -- ERROR: RUSH_NOT_ACTIVE
-- set role authenticated; select public.start_daily_rush('<you>', '<tree>', current_date + 1, 'x', 'UTC');   -- ERROR: permission denied
-- set role authenticated; insert into public.daily_rush_runs (user_id, day, seed) values ('<you>', current_date + 1, 'x'); -- ERROR: permission denied

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.settle_daily_rush(uuid, integer);
-- drop function if exists public.answer_daily_rush(uuid, date, integer, boolean, boolean, boolean, integer);
-- drop function if exists public.start_daily_rush(uuid, uuid, date, text, text);
-- drop table if exists public.daily_rush_runs;

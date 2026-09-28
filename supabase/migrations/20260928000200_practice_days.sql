-- ============================================================================
-- Daily streaks: one row per player per local calendar day with practice
-- ----------------------------------------------------------------------------
-- user_progress can't rebuild streaks: its only timestamp (last_practiced_at) is
-- overwritten on every answer, one row per item. This log keeps the history, so the
-- app computes current + best streak from it (src/features/progress/lib/streak.ts).
--
-- day       = the player's local date when they answered (browser IANA timezone,
--             validated on the server, UTC fallback)
-- time_zone = that timezone, reused by pages that can't ask the browser (profile, header)
--
-- Writes only through the service role (Next.js server, submitDrillResult), so a
-- player can't add days through the REST API. Players may read their own rows.
-- Apply in the Supabase SQL Editor. Safe to re-run. Rollback at the bottom.
-- ============================================================================

begin;

create table if not exists public.practice_days (
  user_id    uuid        not null references public.users (id) on delete cascade,
  day        date        not null,
  time_zone  text        not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- RLS in the same migration (hard rule 9).
alter table public.practice_days enable row level security;

drop policy if exists "practice_days: read own" on public.practice_days;
create policy "practice_days: read own" on public.practice_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: API roles can't write. Make the grants match.
revoke all on table public.practice_days from anon, authenticated;
grant select on table public.practice_days to authenticated;
grant select, insert, update, delete on table public.practice_days to service_role;

-- Backfill what history survives: each item's last practice day (UTC, the only zone known).
insert into public.practice_days (user_id, day, time_zone)
select distinct user_id, (last_practiced_at at time zone 'UTC')::date, 'UTC'
from public.user_progress
where last_practiced_at is not null
on conflict (user_id, day) do nothing;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select count(*) from public.practice_days;                        -- backfilled rows
-- set role anon;     select * from public.practice_days;            -- ERROR: permission denied
-- reset role;
-- select tablename, rowsecurity from pg_tables where tablename = 'practice_days';   -- t

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop table if exists public.practice_days;

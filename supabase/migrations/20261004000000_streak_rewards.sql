-- ============================================================================
-- Streak rewards: milestone days of the daily watering streak pay 🪙
-- ----------------------------------------------------------------------------
-- The streak grows only when the gardener waters a tree (a saved practice answer writes today's
-- practice_days row, once per local day). Opening the game never writes it. On the day a streak
-- reaches a milestone, that day pays a bonus (progress/lib/streak.ts streakReward):
--   7 days → 7 🪙 · 30 days → 30 🪙 · every 100 days (100, 200, 300…) → as many 🪙 as days.
-- Any other day pays nothing.
--
-- streak_rewards         one row per gardener per local day that paid a bonus: the ledger that makes a
--                        milestone day pay once, however many trees are watered that day.
-- award_streak_reward()  service role only. It does NOT trust a streak sent by the app: it counts the
--                        run of consecutive practice_days ending on p_day itself, applies the rule,
--                        writes the ledger row and adds the coins, in one transaction under the purse
--                        lock. A day without practice, a non-milestone day or a second call that day
--                        pays 0.
--
-- Order: after 20261003000000_tree_fruit.sql (needs practice_days and users.coins).
-- Safe to re-run.
-- ============================================================================

begin;

create table if not exists public.streak_rewards (
  user_id    uuid not null references public.users(id) on delete cascade,
  day        date not null,
  streak     integer not null check (streak > 0),
  coins      integer not null check (coins > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.streak_rewards enable row level security;

drop policy if exists "streak_rewards: read own" on public.streak_rewards;
create policy "streak_rewards: read own" on public.streak_rewards
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Players read their own rows; only the server writes.
revoke insert, update, delete on public.streak_rewards from anon, authenticated;
grant select on public.streak_rewards to authenticated;

create or replace function public.award_streak_reward(p_user_id uuid, p_day date)
returns table (streak integer, coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_streak integer;
  v_reward integer;
  v_total  integer;
begin
  if p_user_id is null or p_day is null then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  -- Lock the purse first, so two answers at once can't both claim the day.
  select u.coins into v_total from public.users u where u.id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The run of consecutive watered days ending on p_day (0 if p_day itself wasn't watered):
  -- consecutive days share the same (day - row_number) anchor.
  select count(*)::integer into v_streak
    from (
      select p.day, p.day - (row_number() over (order by p.day))::integer as anchor
        from public.practice_days p
       where p.user_id = p_user_id and p.day <= p_day
    ) runs
   where runs.anchor = (
      select q.anchor
        from (
          select p.day, p.day - (row_number() over (order by p.day))::integer as anchor
            from public.practice_days p
           where p.user_id = p_user_id and p.day <= p_day
        ) q
       where q.day = p_day
   );

  -- streakReward: 7 → 7, 30 → 30, every 100 → the streak itself, else 0.
  v_reward := case
    when v_streak = 7 then 7
    when v_streak = 30 then 30
    when v_streak >= 100 and v_streak % 100 = 0 then v_streak
    else 0
  end;

  if v_reward > 0 then
    insert into public.streak_rewards (user_id, day, streak, coins)
    values (p_user_id, p_day, v_streak, v_reward)
    on conflict (user_id, day) do nothing;
    if found then
      update public.users u set coins = u.coins + v_reward where u.id = p_user_id returning u.coins into v_total;
    else
      v_reward := 0; -- already paid today
    end if;
  end if;

  return query select v_streak, v_reward, v_total;
end;
$$;

revoke all on function public.award_streak_reward(uuid, date) from public, anon, authenticated;
grant execute on function public.award_streak_reward(uuid, date) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- (service role) insert into public.practice_days (user_id, day) select '<you>', current_date - g from generate_series(0, 6) g on conflict do nothing;
-- (service role) select * from public.award_streak_reward('<you>', current_date);   -- 7, 7, purse + 7
-- (service role) select * from public.award_streak_reward('<you>', current_date);   -- 7, 0, same purse (already paid today)
-- (service role) select * from public.award_streak_reward('<you>', current_date - 1); -- 6, 0 (not a milestone)
-- set role authenticated; select * from public.award_streak_reward('<you>', current_date); -- ERROR: permission denied
-- set role authenticated; insert into public.streak_rewards values ('<you>', current_date, 7, 7); -- ERROR: permission denied

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.award_streak_reward(uuid, date);
-- drop table if exists public.streak_rewards;

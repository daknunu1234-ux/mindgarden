-- ============================================================================
-- Gold coins: 1 🪙 the first time a player masters an item (5/5, see 20260928000400), once per item ever
-- ----------------------------------------------------------------------------
-- users.coins                  the stored balance (replaces the old HUD-only
--                              "5 per mastery step" figure, which was computed)
-- user_progress.coin_awarded_at when this player's coin for this item was paid;
--                              NULL = not paid yet. Makes the reward one-time:
--                              5/5 → 4/5 (wrong answer) → 5/5 again pays nothing.
-- award_mastery_coin(user, item) atomically claims the flag and adds the coin.
--
-- Anti-cheat invariants (DATABASE.md "Gold coins"):
--   • users.coins changes only through award_mastery_coin, run by the service role.
--     Players can't UPDATE it (users grants: full_name, avatar_url only).
--   • coin_awarded_at is never writable by players (column grants below), so a paid
--     item can't be reset and farmed again.
--   • The claim is one UPDATE … WHERE coin_awarded_at IS NULL: two concurrent answers
--     can't both pay. Balance ≤ number of (player, item) pairs ever mastered.
--   • coins >= 0 (CHECK); there is nothing to spend yet.
--
-- Order: after 20260928000000 / 000100 / 000200; before or after 000400 (both pay at 5/5). Safe to re-run. Rollback at the bottom.
-- ============================================================================

begin;

-- 1. Columns.
alter table public.users
  add column if not exists coins integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_coins_nonnegative' and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_coins_nonnegative check (coins >= 0);
  end if;
end;
$$;

alter table public.user_progress
  add column if not exists coin_awarded_at timestamptz;

-- 2. Players write their own progress rows (RLS: owner + item readable), but only these
--    columns. coin_awarded_at stays server-only; SELECT is unchanged (the app reads it).
revoke insert, update on table public.user_progress from anon, authenticated;
grant insert (user_id, knowledge_item_id, mastery_level, mistake_count, last_practiced_at)
  on table public.user_progress to authenticated;
grant update (mastery_level, mistake_count, last_practiced_at)
  on table public.user_progress to authenticated;

-- users.coins: make sure API roles can't update it (the baseline already limits UPDATE to
-- full_name / avatar_url; repeated here so this migration holds on its own).
revoke update on table public.users from anon, authenticated;
grant update (full_name, avatar_url) on table public.users to authenticated;

-- 3. The award: claim the item's flag, then pay. Returns what was earned and the new total.
create or replace function public.award_mastery_coin(p_user_id uuid, p_item_id uuid)
returns table (coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
  v_total   integer;
begin
  update public.user_progress
     set coin_awarded_at = now()
   where user_id = p_user_id
     and knowledge_item_id = p_item_id
     and mastery_level = 5
     and coin_awarded_at is null
  returning true into v_claimed;

  if v_claimed then
    update public.users set coins = coins + 1 where id = p_user_id returning coins into v_total;
    return query select 1, coalesce(v_total, 0);
  else
    select u.coins into v_total from public.users u where u.id = p_user_id;
    return query select 0, coalesce(v_total, 0);
  end if;
end;
$$;

-- Only the Next.js server (service role) may call it.
revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;

-- 4. Backfill: items already at 3/3 are paid now (1 coin each) and marked, so nobody
--    starts behind and nothing is paid twice later.
with paid as (
  update public.user_progress
     set coin_awarded_at = now()
   where mastery_level = 5 and coin_awarded_at is null
  returning user_id
), per_user as (
  select user_id, count(*)::integer as n from paid group by user_id
)
update public.users u
   set coins = u.coins + per_user.n
  from per_user
 where u.id = per_user.user_id;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select id, coins from public.users order by coins desc limit 5;
-- select count(*) filter (where coin_awarded_at is not null) as paid,
--        count(*) filter (where mastery_level = 5)            as mastered
--   from public.user_progress;                                -- equal right after the backfill
-- set role authenticated;
-- update public.user_progress set coin_awarded_at = null;     -- ERROR: permission denied
-- select public.award_mastery_coin(gen_random_uuid(), gen_random_uuid());  -- ERROR: permission denied
-- reset role;

-- ============================================================================
-- Rollback
-- ============================================================================
-- begin;
-- drop function if exists public.award_mastery_coin(uuid, uuid);
-- alter table public.user_progress drop column if exists coin_awarded_at;
-- alter table public.users drop constraint if exists users_coins_nonnegative;
-- alter table public.users drop column if exists coins;
-- grant insert, update on table public.user_progress to authenticated;
-- commit;

-- ============================================================================
-- Mastery scale 0–3 → 0–5 (5 net correct answers to master an item)
-- ----------------------------------------------------------------------------
-- • user_progress.mastery_level CHECK widened to 0–5. Existing values are kept as they are
--   (a former 3/3 item is now 3/5): no rescaling.
-- • award_mastery_coin pays at 5/5. Coins already paid (coin_awarded_at set) stay paid, so an
--   item paid under the old scale earns nothing when it later reaches 5/5.
--
-- Deploy order on the hosted project:
--   1. Run THIS migration (safe with the old app: it never writes above 3).
--   2. Deploy the app (it writes up to 5; before step 1 those answers would hit the old CHECK).
--   3. Run 20260928000300_user_coins.sql if it hasn't been run yet (order-independent with this
--      file: both define award_mastery_coin with the 5/5 rule).
-- Safe to re-run. Rollback at the bottom.
-- ============================================================================

begin;

-- 1. Drop whatever CHECK guards mastery_level (the dashboard-built schema may have named it
--    differently from the baseline's user_progress_mastery_level_check), then add the 0–5 one.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.user_progress'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%mastery_level%'
  loop
    execute format('alter table public.user_progress drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.user_progress
  add constraint user_progress_mastery_level_check check (mastery_level between 0 and 5);

-- 2. The coin is paid at the new top level. Created here too, so this file works whether or not
--    20260928000300 ran before it (the function body only resolves its tables when called).
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

revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.user_progress'::regclass and contype = 'c';   -- one mastery check: 0..5
-- select prosrc like '%mastery_level = 5%' from pg_proc where proname = 'award_mastery_coin';   -- t

-- ============================================================================
-- Rollback (only while no row is above 3)
-- ============================================================================
-- begin;
-- alter table public.user_progress drop constraint if exists user_progress_mastery_level_check;
-- alter table public.user_progress add constraint user_progress_mastery_level_check check (mastery_level between 0 and 3);
-- commit;

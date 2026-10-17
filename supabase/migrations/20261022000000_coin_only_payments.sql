-- ============================================================================
-- Payments sell coin packs only (Pro membership removed)
-- ----------------------------------------------------------------------------
-- Keep in sync with src/features/payment/lib/plans.ts (tests check).
--
--   • orders.plan_type: only 'COIN_PACK' from now on. Pending Pro orders (if any) are cancelled; an
--     old Pro row that was paid stays as history (the new check is NOT VALID in that case, so it holds
--     for every new or changed row without rewriting the past).
--   • fulfill_order(order_code, amount_paid): re-created to credit the order's coins to the buyer's
--     purse, exactly once, and nothing else. It returns (fulfilled, status, user_id, coins_added,
--     total_coins); an order that isn't a coin pack is refused with NOT_A_COIN_PACK.
--   • users.pro_until: dropped when no gardener has ever had Pro; otherwise kept (a notice says so)
--     so nobody's record is lost.
--
-- Order: after 20261021000000_payments.sql, with the deploy of the coin-only payment code (the old
-- code reads pro_until and the old fulfill_order() result). Safe to re-run.
-- ============================================================================

begin;

-- 1. Coin packs only ------------------------------------------------------------------------
update public.orders set status = 'CANCELLED' where plan_type <> 'COIN_PACK' and status = 'PENDING';

alter table public.orders drop constraint if exists orders_plan_type_check;
alter table public.orders add constraint orders_plan_type_check check (plan_type = 'COIN_PACK') not valid;
do $$
begin
  if not exists (select 1 from public.orders where plan_type <> 'COIN_PACK') then
    alter table public.orders validate constraint orders_plan_type_check;
  end if;
end;
$$;

-- 2. Fulfil = credit the coins, once ------------------------------------------------------------
drop function if exists public.fulfill_order(bigint, numeric);
create function public.fulfill_order(p_order_code bigint, p_amount_paid numeric)
returns table (fulfilled boolean, status text, user_id uuid, coins_added integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order public.orders%rowtype;
  v_coins integer;
begin
  select * into v_order from public.orders o where o.order_code = p_order_code for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'PAID' then
    -- Already credited (a repeated webhook, or the return page after the webhook): nothing more.
    select u.coins into v_coins from public.users u where u.id = v_order.user_id;
    return query select false, v_order.status, v_order.user_id, 0, coalesce(v_coins, 0);
    return;
  end if;

  if v_order.plan_type <> 'COIN_PACK' or v_order.coins <= 0 then
    raise exception 'NOT_A_COIN_PACK' using errcode = 'P0001';
  end if;
  if p_amount_paid is null or p_amount_paid < v_order.amount then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001', hint = format('Paid %s of %s', p_amount_paid, v_order.amount);
  end if;

  update public.orders o set status = 'PAID', paid_at = now() where o.id = v_order.id;
  update public.users u set coins = u.coins + v_order.coins where u.id = v_order.user_id
  returning u.coins into v_coins;

  return query select true, 'PAID'::text, v_order.user_id, v_order.coins, coalesce(v_coins, 0);
end;
$$;

revoke all on function public.fulfill_order(bigint, numeric) from public, anon, authenticated;
grant execute on function public.fulfill_order(bigint, numeric) to service_role;

-- 3. No more Pro membership ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'pro_until') then
    if exists (select 1 from public.users where pro_until is not null) then
      raise notice 'users.pro_until kept: some gardeners have a Pro membership on record';
    else
      alter table public.users drop column pro_until;
    end if;
  end if;
end;
$$;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select pg_get_constraintdef(oid), convalidated from pg_constraint where conname = 'orders_plan_type_check';
--   -- CHECK ((plan_type = 'COIN_PACK'::text)), true
-- select column_name from information_schema.columns where table_name = 'users' and column_name = 'pro_until';  -- none
-- select * from public.fulfill_order(<a pending coin order>, <its amount>);   -- fulfilled = true, coins_added = its coins

-- ============================================================================
-- Rollback
-- ============================================================================
-- Re-run section 2 (fulfill_order) and the users.pro_until column of 20261021000000_payments.sql, and
-- restore its plan_type check: check (plan_type in ('PRO_1M', 'PRO_LIFETIME', 'COIN_PACK')).

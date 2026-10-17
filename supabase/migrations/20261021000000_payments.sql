-- ============================================================================
-- Payments with PayOS (VietQR): orders, Pro membership, paid coin packs
-- ----------------------------------------------------------------------------
-- Keep in sync with src/features/payment/lib/plans.ts (plan types, PRO_MONTH_DAYS; tests check).
--
--   • users.pro_until: when the gardener's Pro membership ends (null = never had one; 'infinity' =
--     lifetime). Players read their own row as before; no player can write it (users UPDATE stays
--     granted on full_name / avatar_url only).
--   • orders: one row per checkout. Written by the server only (service role): the price comes from
--     the server's catalogue, never the browser. The buyer reads their own orders (RLS).
--       order_code   the number PayOS knows the order by (unique, a JavaScript-safe integer)
--       status       'PENDING' → 'PAID' | 'CANCELLED' (a CANCELLED order that PayOS reports paid after
--                    all is still fulfilled: the money arrived)
--       plan_type    'PRO_1M' (30 more days of Pro) | 'PRO_LIFETIME' | 'COIN_PACK' (+coins)
--   • fulfill_order(order_code, amount_paid): service role only. Called by the webhook (signature
--     verified by the app) and by the return page's reconcile (status read back from PayOS). Marks the
--     order PAID and grants it in one transaction, exactly once however many times it is called.
--   • cancel_order(order_code): service role only; a PENDING order becomes CANCELLED.
--
-- Order: any time after 20260928000500_seed_economy.sql (users.coins). Before or with the deploy of
-- the payment code (without it, checkout answers "Payments are not set up yet"). Safe to re-run.
-- ============================================================================

begin;

-- 1. Pro membership --------------------------------------------------------------------------
alter table public.users add column if not exists pro_until timestamptz;

-- 2. Orders -----------------------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid        primary key default gen_random_uuid(),
  order_code      bigint      not null unique check (order_code > 0 and order_code <= 9007199254740991),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  amount          numeric(12, 0) not null check (amount > 0),
  status          text        not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
  plan_type       text        not null check (plan_type in ('PRO_1M', 'PRO_LIFETIME', 'COIN_PACK')),
  -- The catalogue entry bought ('pro-1m', 'coins-50', …) and, for a coin pack, how many coins it gives.
  product_id      text        not null check (char_length(product_id) between 1 and 40),
  coins           integer     not null default 0 check (coins >= 0),
  payment_link_id text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((plan_type = 'COIN_PACK') = (coins > 0))
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

create or replace function public.touch_orders_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders
  for each row execute function public.touch_orders_updated_at();

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant select, insert, update on public.orders to service_role;
drop policy if exists "orders: buyer reads own" on public.orders;
create policy "orders: buyer reads own" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);

-- 3. Fulfil a paid order, exactly once --------------------------------------------------------
create or replace function public.fulfill_order(p_order_code bigint, p_amount_paid numeric)
returns table (fulfilled boolean, status text, user_id uuid, plan_type text, coins_added integer, total_coins integer, pro_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order public.orders%rowtype;
  v_coins integer;
  v_pro   timestamptz;
begin
  select * into v_order from public.orders o where o.order_code = p_order_code for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'PAID' then
    -- Already granted (a repeated webhook, or the return page after the webhook): nothing more.
    select u.coins, u.pro_until into v_coins, v_pro from public.users u where u.id = v_order.user_id;
    return query select false, v_order.status, v_order.user_id, v_order.plan_type, 0, coalesce(v_coins, 0), v_pro;
    return;
  end if;

  if p_amount_paid is null or p_amount_paid < v_order.amount then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001', hint = format('Paid %s of %s', p_amount_paid, v_order.amount);
  end if;

  update public.orders o set status = 'PAID', paid_at = now() where o.id = v_order.id;

  perform 1 from public.users u where u.id = v_order.user_id for update;
  if v_order.plan_type = 'COIN_PACK' then
    update public.users u set coins = u.coins + v_order.coins where u.id = v_order.user_id;
  elsif v_order.plan_type = 'PRO_LIFETIME' then
    update public.users u set pro_until = 'infinity' where u.id = v_order.user_id;
  else
    -- 30 more days, counted from today or from the end of the current membership, whichever is later.
    update public.users u
       set pro_until = greatest(coalesce(u.pro_until, now()), now()) + interval '30 days'  -- PRO_MONTH_DAYS
     where u.id = v_order.user_id;
  end if;

  select u.coins, u.pro_until into v_coins, v_pro from public.users u where u.id = v_order.user_id;
  return query select true, 'PAID'::text, v_order.user_id, v_order.plan_type,
    case when v_order.plan_type = 'COIN_PACK' then v_order.coins else 0 end, coalesce(v_coins, 0), v_pro;
end;
$$;

revoke all on function public.fulfill_order(bigint, numeric) from public, anon, authenticated;
grant execute on function public.fulfill_order(bigint, numeric) to service_role;

-- 4. Cancel an unpaid order -------------------------------------------------------------------
create or replace function public.cancel_order(p_order_code bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.orders o set status = 'CANCELLED'
   where o.order_code = p_order_code and o.status = 'PENDING'
  returning o.status into v_status;
  if v_status is null then
    select o.status into v_status from public.orders o where o.order_code = p_order_code;
  end if;
  return v_status;
end;
$$;

revoke all on function public.cancel_order(bigint) from public, anon, authenticated;
grant execute on function public.cancel_order(bigint) to service_role;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select has_table_privilege('authenticated', 'public.orders', 'insert');                -- false
-- select has_column_privilege('authenticated', 'public.users', 'pro_until', 'update');   -- false
-- select * from public.fulfill_order(<a pending order_code>, <its amount>);              -- fulfilled = true
-- select * from public.fulfill_order(<the same order_code>, <its amount>);               -- fulfilled = false

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.fulfill_order(bigint, numeric);
-- drop function if exists public.cancel_order(bigint);
-- drop table if exists public.orders;
-- drop function if exists public.touch_orders_updated_at();
-- alter table public.users drop column if exists pro_until;   -- removes every Pro membership

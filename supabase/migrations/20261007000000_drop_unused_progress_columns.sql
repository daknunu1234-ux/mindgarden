-- ============================================================================
-- Drop three progress columns nothing reads
-- ----------------------------------------------------------------------------
-- A practice answer stores progress only: the item's mastery_level and last_practiced_at in its
-- one user_progress row, and at most one practice_days row (the player's day) and one
-- deck_practice_days row (the tree's day). The app never stored per-answer rows, answer times or
-- the pick itself. Three columns were still written on every answer and read by nothing:
--
--   user_progress.mistake_count   a tally of wrong answers per item, never shown or used
--   users.streak_count            a copy of the current streak (the streak is computed from
--   users.last_active_at          practice_days every time, never from these)
--
-- The app has stopped writing them. This drops them.
--
-- ⚠ DESTRUCTIVE: the values are gone for good. Run it only AFTER the code that no longer writes
-- these columns is deployed: older code still sends mistake_count with every answer (answers would
-- fail to save) and updates users.streak_count (only logged). Optional: leaving the columns in place
-- is harmless (they just stop changing).
--
-- Order: after 20261006000000_species_seed_prices.sql. No function, trigger, policy or index uses
-- these columns. Column grants on mistake_count (20260928000300_user_coins.sql) go with the column;
-- do not re-run that file afterwards (its grant names the dropped column). Safe to re-run.
-- ============================================================================

begin;

alter table public.user_progress drop column if exists mistake_count;
alter table public.users drop column if exists streak_count;
alter table public.users drop column if exists last_active_at;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'user_progress' order by ordinal_position;
--   -- id, user_id, knowledge_item_id, mastery_level, last_practiced_at, coin_awarded_at
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'users' and column_name in ('streak_count', 'last_active_at');   -- 0 rows

-- ============================================================================
-- Rollback (the columns come back empty: the old values are not recoverable)
-- ============================================================================
-- alter table public.user_progress add column if not exists mistake_count int not null default 0 check (mistake_count >= 0);
-- grant insert (mistake_count), update (mistake_count) on public.user_progress to authenticated;
-- alter table public.users add column if not exists streak_count int not null default 0 check (streak_count >= 0);
-- alter table public.users add column if not exists last_active_at date;

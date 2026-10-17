-- ============================================================================
-- Practice progress is written by the server only (part 2 of 2: the lock)
-- ----------------------------------------------------------------------------
-- Players lose INSERT / UPDATE on user_progress (they had mastery_level and last_practiced_at since
-- 20260928000300). From here on a row changes only through record_practice_answer() and
-- touch_practised() (20261020000000, service role) and award_mastery_coin(); deletes stay cascades
-- only. Players still read their own rows (the "progress: read own" policy and SELECT are untouched).
--
-- Order: only AFTER the code that calls record_practice_answer() is deployed (the code before it
-- writes with the player's session and would fail to save every answer). Safe to re-run.
-- ============================================================================

begin;

revoke insert, update, delete, truncate on table public.user_progress from anon, authenticated;

drop policy if exists "progress: insert own" on public.user_progress;
drop policy if exists "progress: update own" on public.user_progress;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select has_table_privilege('authenticated', 'public.user_progress', 'insert'),   -- false
--        has_table_privilege('authenticated', 'public.user_progress', 'select');   -- true
-- select has_column_privilege('authenticated', 'public.user_progress', 'mastery_level', 'update');  -- false
-- select policyname, cmd from pg_policies where tablename = 'user_progress';       -- SELECT only

-- ============================================================================
-- Rollback
-- ============================================================================
-- grant insert (user_id, knowledge_item_id, mastery_level, last_practiced_at) on public.user_progress to authenticated;
-- grant update (mastery_level, last_practiced_at) on public.user_progress to authenticated;
-- and re-create the two policies of 20261013000000_content_nodes.sql (section 6).

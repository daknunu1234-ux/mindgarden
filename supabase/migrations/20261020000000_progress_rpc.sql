-- ============================================================================
-- Practice progress is written by the server only (part 1 of 2: the functions)
-- ----------------------------------------------------------------------------
-- Until now the app wrote user_progress with the player's own session, so players held INSERT /
-- UPDATE on mastery_level: anyone could set a statement to 4/5 (or 5/5) through the API and collect
-- its mastery coin without drilling, and two answers at once could lose a step (read, then write).
-- These two functions replace those writes; 20261020000100_lock_progress_writes.sql then takes the
-- players' write privileges away.
--
-- record_practice_answer()  service role only. One graded answer of the tree's OWNER: the
--                           statement's level moves ±1 (0–5, progress/lib/masteryRules.ts nextMastery)
--                           under a row lock, last_practiced_at = now(), and on 5/5 the mastery coin
--                           is claimed by award_mastery_coin() in the same transaction. Refuses
--                           (ITEM_NOT_FOUND) anything that is not a statement of a tree p_user_id owns.
-- touch_practised()         service role only. A finished Daily Rush marks the statements it asked
--                           practised now: last_practiced_at only, mastery untouched; a statement
--                           never practised gets its row at 0/5. Ids that are not statements of the
--                           gardener's own trees are skipped.
--
-- Order: after 20261013000000_content_nodes.sql (and 20261009000000, whose award_mastery_coin() it
-- calls). BEFORE or WITH the deploy of the matching code (progress/services/practice.ts), which
-- cannot save an answer without it. Safe to re-run.
-- ============================================================================

begin;

create or replace function public.record_practice_answer(p_user_id uuid, p_item_id uuid, p_correct boolean)
returns table (previous_level integer, new_level integer, coins_earned integer, total_coins integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_previous integer;
  v_next     integer;
  v_earned   integer := 0;
  v_total    integer;
begin
  if not exists (
    select 1
      from public.content_nodes c
      join public.decks d on d.id = c.deck_id
     where c.id = p_item_id and c.node_type = 'statement' and d.user_id = p_user_id
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The row exists from here on (a first answer creates it at 0/5), so the lock below always holds
  -- something: two answers at once for one statement take their steps one after the other.
  insert into public.user_progress (user_id, knowledge_item_id, mastery_level)
  values (p_user_id, p_item_id, 0)
  on conflict do nothing;

  select p.mastery_level into v_previous
    from public.user_progress p
   where p.user_id = p_user_id and p.knowledge_item_id = p_item_id
     for update;

  v_next := case when p_correct then least(v_previous + 1, 5) else greatest(v_previous - 1, 0) end;

  update public.user_progress p
     set mastery_level = v_next, last_practiced_at = now()
   where p.user_id = p_user_id and p.knowledge_item_id = p_item_id;

  if v_next = 5 then
    -- Pays once per statement ever (coin_awarded_at); 0 and the balance on a repeat.
    select a.coins_earned, a.total_coins into v_earned, v_total
      from public.award_mastery_coin(p_user_id, p_item_id) a;
  else
    select u.coins into v_total from public.users u where u.id = p_user_id;
  end if;

  return query select v_previous, v_next, coalesce(v_earned, 0), coalesce(v_total, 0);
end;
$$;

revoke all on function public.record_practice_answer(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_practice_answer(uuid, uuid, boolean) to service_role;

create or replace function public.touch_practised(p_user_id uuid, p_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with mine as (
    select c.id
      from public.content_nodes c
      join public.decks d on d.id = c.deck_id
     where c.id = any (p_item_ids) and c.node_type = 'statement' and d.user_id = p_user_id
  ), fresh as (
    update public.user_progress p
       set last_practiced_at = now()
      from mine
     where p.user_id = p_user_id and p.knowledge_item_id = mine.id
    returning p.knowledge_item_id
  ), added as (
    insert into public.user_progress (user_id, knowledge_item_id, mastery_level, last_practiced_at)
    select p_user_id, mine.id, 0, now()
      from mine
     where not exists (
       select 1 from public.user_progress p where p.user_id = p_user_id and p.knowledge_item_id = mine.id
     )
    on conflict do nothing
    returning knowledge_item_id
  )
  select (select count(*) from fresh) + (select count(*) from added) into v_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.touch_practised(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.touch_practised(uuid, uuid[]) to service_role;

commit;

-- ============================================================================
-- Verify (SQL Editor, which runs as a superuser)
-- ============================================================================
-- select * from public.record_practice_answer('<owner>', '<one of their statements>', true);   -- level +1
-- select * from public.record_practice_answer('<owner>', '<someone else''s statement>', true);  -- ITEM_NOT_FOUND
-- select public.touch_practised('<owner>', array['<statement>']::uuid[]);                       -- 1
-- select has_function_privilege('authenticated', 'public.record_practice_answer(uuid, uuid, boolean)', 'execute');  -- false

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop function if exists public.record_practice_answer(uuid, uuid, boolean);
-- drop function if exists public.touch_practised(uuid, uuid[]);
-- (only together with the code that calls them, and never while 20261020000100 is applied)

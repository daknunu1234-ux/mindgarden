-- ============================================================================
-- Custom display names: the public name a gardener chooses (Garden Name)
-- ----------------------------------------------------------------------------
-- users.display_name is OPT-IN and public: it shows on the Mind Tournament boards, in other
-- gardeners' Visited Gardens, on the visitor banner and in the header. Without one, the app shows
-- the id-derived pseudonym ("Mossy Owl").
--   • Separate from full_name on purpose: full_name is filled from Google sign-in (a real name) and
--     stays private. Before this migration the tournament boards returned full_name; they now
--     return display_name only.
--   • Players edit only their own (RLS "users: update self" + a column grant); 2–30 characters,
--     no angle brackets (the app sanitizes first; the CHECK is the last guard).
--   • get_display_names(ids) lets anyone look up chosen names by id (never emails or full names),
--     because users RLS keeps whole profiles private.
--
-- Order: after 20260928000900_mind_tournament.sql (replaces its two board functions). Safe to re-run.
-- ============================================================================

begin;

alter table public.users add column if not exists display_name varchar(30);

alter table public.users drop constraint if exists users_display_name_check;
alter table public.users add constraint users_display_name_check check (
  display_name is null or (char_length(btrim(display_name)) between 2 and 30 and display_name !~ '[<>]')
);

-- Players may change their own display name (the update policy already limits rows to self).
grant update (display_name) on table public.users to authenticated;

-- Public name lookup: chosen display names only, for at most 200 ids per call.
create or replace function public.get_display_names(p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name::text
    from public.users u
   where u.id = any (p_user_ids[1:200])
     and u.display_name is not null;
$$;

revoke all on function public.get_display_names(uuid[]) from public;
grant execute on function public.get_display_names(uuid[]) to anon, authenticated, service_role;

-- The tournament boards: same shape as before, but the public name is display_name (never full_name).
create or replace function public.get_tournament_active_board(p_deck_id uuid)
returns table (
  rank               bigint,
  user_id            uuid,
  display_name       text,
  current_points     integer,
  max_points         integer,
  mastery_percentage numeric,
  days_count         integer,
  updated_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by p.mastery_percentage desc nulls last, p.days_count asc, p.updated_at asc),
         p.user_id, u.display_name::text, p.current_points, p.max_points, p.mastery_percentage, p.days_count, p.updated_at
    from public.deck_tournament_participants p
    join public.decks d on d.id = p.deck_id
    left join public.users u on u.id = p.user_id
   where p.deck_id = p_deck_id
     and not p.is_graduated
     and (d.is_public or d.user_id = (select auth.uid()))
   order by p.mastery_percentage desc nulls last, p.days_count asc, p.updated_at asc
   limit 50;
$$;

create or replace function public.get_tournament_hall_of_fame(p_deck_id uuid)
returns table (
  rank           bigint,
  user_id        uuid,
  display_name   text,
  max_points     integer,
  days_count     integer,
  graduated_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by p.days_count asc, p.graduated_at asc),
         p.user_id, u.display_name::text, p.max_points, p.days_count, p.graduated_at
    from public.deck_tournament_participants p
    join public.decks d on d.id = p.deck_id
    left join public.users u on u.id = p.user_id
   where p.deck_id = p_deck_id
     and p.is_graduated
     and (d.is_public or d.user_id = (select auth.uid()))
   order by p.days_count asc, p.graduated_at asc;
$$;

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- update public.users set display_name = 'Linh' where id = auth.uid();          -- as a player: 1 row
-- update public.users set display_name = '<b>x</b>' where id = auth.uid();      -- ERROR: violates users_display_name_check
-- select * from public.get_display_names(array['<id>']::uuid[]);                -- as anon: (id, 'Linh'), no email

-- ============================================================================
-- Rollback
-- ============================================================================
-- (re-run the board functions from 20260928000900_mind_tournament.sql)
-- drop function if exists public.get_display_names(uuid[]);
-- alter table public.users drop constraint if exists users_display_name_check;
-- revoke update (display_name) on table public.users from authenticated;
-- alter table public.users drop column if exists display_name;

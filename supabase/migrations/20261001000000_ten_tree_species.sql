-- ============================================================================
-- Ten tree species
-- ----------------------------------------------------------------------------
-- The species catalogue (src/shared/lib/treeSkins.ts) grows to ten: oak, pine, birch, cherry, willow,
-- mystic, palm, citrus, maple, cactus. Four earlier species retire and become their closest
-- successor (the same map as treeSkins.ts LEGACY_TREE_TYPES, so trees look the same before and after):
--   sakura → cherry · saguaro → cactus · apple → citrus · bamboo → palm
-- Any other unknown value (never written by the app) becomes oak, the app's fallback. Then
-- decks.tree_type is limited to the ten ids.
--
-- Order: after 20260930000000_farm_grid.sql. Deploy the code FIRST (it renders both the old and the
-- new ids, and only writes new ones): code still running the six-species catalogue would try to
-- write 'sakura' / 'bamboo' / 'apple' / 'saguaro' and hit the check below. Safe to re-run.
-- ============================================================================

begin;

update public.decks
   set tree_type = case tree_type
                     when 'sakura'  then 'cherry'
                     when 'saguaro' then 'cactus'
                     when 'apple'   then 'citrus'
                     when 'bamboo'  then 'palm'
                     else 'oak'
                   end
 where tree_type not in ('oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus');

alter table public.decks drop constraint if exists decks_tree_type_check;
alter table public.decks
  add constraint decks_tree_type_check
  check (tree_type in ('oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus'));

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select tree_type, count(*) from public.decks group by 1 order by 1;          -- only the ten ids
-- update public.decks set tree_type = 'sakura' where false;                     -- (no-op) a real row → ERROR: violates decks_tree_type_check

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.decks drop constraint if exists decks_tree_type_check;
-- (the renamed rows keep their new species; the app renders both)

-- ============================================================================
-- Surreal tree species
-- ----------------------------------------------------------------------------
-- The species catalogue (src/shared/lib/treeSkins.ts) grows from ten to thirteen with three surreal
-- species: crystal_flora (Crystal Flora), cosmic_nebula (Cosmic Nebula), chrono_willow (Chrono
-- Willow). They are cosmetic like every species: same price, same rules, only the drawing differs.
-- This widens decks_tree_type_check (20261001000000_ten_tree_species.sql) to the thirteen ids. No
-- row changes.
--
-- Order: after 20261004000000_streak_rewards.sql. Run it BEFORE (or together with) deploying the
-- code that offers the new species: it is safe with the older code (which only writes the first ten
-- ids), while the new code planting a surreal tree before this runs hits the old check.
-- Safe to re-run. Do NOT re-run 20261001000000_ten_tree_species.sql after this one: it would turn
-- surreal trees into oaks and narrow the check again.
-- ============================================================================

begin;

alter table public.decks drop constraint if exists decks_tree_type_check;
alter table public.decks
  add constraint decks_tree_type_check
  check (tree_type in ('oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus', 'crystal_flora', 'cosmic_nebula', 'chrono_willow'));

commit;

-- ============================================================================
-- Verify
-- ============================================================================
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'decks_tree_type_check';   -- thirteen ids
-- update public.decks set tree_type = 'chrono_willow' where false;                                -- (no-op) a real row → accepted

-- ============================================================================
-- Rollback
-- ============================================================================
-- update public.decks set tree_type = 'mystic' where tree_type in ('crystal_flora', 'cosmic_nebula', 'chrono_willow');
-- alter table public.decks drop constraint if exists decks_tree_type_check;
-- alter table public.decks add constraint decks_tree_type_check
--   check (tree_type in ('oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus'));

-- ============================================================================
-- Drop the legacy root / statement tables (after the move to content_nodes)
-- ----------------------------------------------------------------------------
-- 20261013000000_content_nodes.sql copied every root and statement into public.content_nodes and
-- renamed the old tables legacy_mindmap_nodes / legacy_knowledge_items for rollback. Once the app
-- runs on content_nodes and the data checks out, this drops them.
--
-- DESTRUCTIVE and OPTIONAL: run it only after the content-node deploy, when no rollback is needed.
-- Statements added after the move live only in content_nodes; nothing reads the legacy tables.
-- ============================================================================

begin;

drop table if exists public.legacy_knowledge_items;
drop table if exists public.legacy_mindmap_nodes;

commit;

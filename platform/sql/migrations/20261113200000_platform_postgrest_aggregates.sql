-- Copied 1:1 from the NPM tool (supabase/migrations/20260921130000_enable_postgrest_aggregates.sql). A platform migration since
-- 2026-11-13 (before: npm-base): the NPM lists (company totals, hull event chart, treemaps) count and sum on the server, and any
-- app may do the same. Version 20261113200000 (first 20261110100500): newer than every platform migration an existing COMPASS
-- database has applied, so the CLI accepts it without --include-all; the statement is idempotent.
--
-- Enable PostgREST aggregate functions (select=ship_type,id.count()).
--
-- The Fleet page's ship type treemap counted vessels by paging through every
-- row of vessels_overview 1000 at a time (~176 requests, each evaluating the
-- whole view) and tallying in the browser. With aggregates enabled it asks the
-- server for one grouped result instead. Count a column (id.count()), not a bare
-- count(): that compiles to COUNT(view.*), a whole-row reference that forces every
-- join in the view to be evaluated and defeats join pruning.
alter role authenticator set pgrst.db_aggregates_enabled = 'true';
notify pgrst, 'reload config';

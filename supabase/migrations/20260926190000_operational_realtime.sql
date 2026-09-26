-- Realtime invalidates authorized operational views; PostgreSQL commands remain authoritative.
-- Keep this list aligned with src/lib/realtime/route-sources.ts.
do $$
declare v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  foreach v_table in array array[
    'material_requests', 'material_request_lines',
    'inventory_balances', 'inventory_transfers', 'inventory_transfer_items', 'inventory_transactions', 'inventory_stock_counts',
    'equipment_requests', 'assets', 'daily_reports', 'project_progress_entries'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r' and c.relrowsecurity
    ) or not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v_table and cmd = 'SELECT'
    ) or not has_column_privilege('authenticated', format('public.%I', v_table), 'id', 'SELECT') then
      -- Valued movement tables intentionally grant SELECT on safe columns only.
      -- Realtime checks primary-key visibility and filters the remaining columns.
      raise exception 'Realtime source public.% lacks RLS or authenticated SELECT on its primary key', v_table;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

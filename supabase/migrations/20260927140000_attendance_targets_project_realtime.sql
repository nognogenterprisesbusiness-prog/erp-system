-- New attendance postings require operational targets. Existing posted history is unchanged.
create function private.guard_attendance_operational_targets()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.projects p
    join public.project_sites s on s.project_id = p.id
    where p.id = new.project_id and s.id = new.project_site_id
      and p.archived_at is null and p.status in ('active', 'on_hold')
      and s.status = 'active'
  ) then
    raise exception 'Attendance requires an active project and site' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.id = new.employee_id and e.archived_at is null and e.status = 'active'
  ) then
    raise exception 'Attendance requires an active employee' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger attendance_operational_targets before insert on public.project_attendance
for each row execute function private.guard_attendance_operational_targets();
revoke all on function private.guard_attendance_operational_targets() from public, anon, authenticated;

-- Realtime is an invalidation hint only; financial tables keep their Admin-only RLS.
-- Do not publish rate/basis tables or expose cost snapshots to Foremen.
do $$
declare v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing';
  end if;
  foreach v_table in array array[
    'projects', 'project_sites', 'project_assignments',
    'project_attendance', 'project_attendance_reversals',
    'project_equipment_usage', 'project_equipment_usage_reversals',
    'project_additional_expenses', 'project_expense_reversals', 'project_budget_changes',
    'client_invoices', 'client_payments', 'client_payment_reversals',
    'daily_report_resource_links'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r' and c.relrowsecurity
    ) or not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v_table and cmd = 'SELECT'
    ) or not has_column_privilege('authenticated', format('public.%I', v_table), 'id', 'SELECT') then
      raise exception 'Realtime source public.% lacks authenticated row-scoped SELECT access', v_table;
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

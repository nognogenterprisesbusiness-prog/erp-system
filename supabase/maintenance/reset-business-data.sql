-- Manual staging maintenance only. Run the ENTIRE file in the staging SQL Editor.
-- This is intentionally not a migration and is never run during deployment.
-- Preserves auth.*, profiles (including preferences/photos), user_roles,
-- units, geographical reference data, notification types, schema and policies.
-- Operational records and categories are emptied; no seed is run afterward.
-- No business-data backup or replacement seed is created.
-- Remove business photos through the Storage API after the SQL reset succeeds.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temporary table reset_result (
  table_name text not null,
  removed_rows bigint not null
) on commit preserve rows;

do $reset$
declare
  v_preserved constant text[] := array[
    'public.profiles', 'public.user_roles', 'public.units_of_measure',
    'public.notification_types', 'public.geo_regions', 'public.geo_provinces',
    'public.geo_municipalities', 'public.geo_barangays'
  ];
  v_business constant text[] := array[
    'private.asset_return_authorizations',
    'public.asset_categories', 'public.asset_events', 'public.asset_locations',
    'public.assets', 'public.audit_logs', 'public.client_invoices',
    'public.client_payment_reversals', 'public.client_payments',
    'public.daily_report_events', 'public.daily_report_resource_links',
    'public.daily_reports', 'public.employee_attendance_basis',
    'public.employee_categories', 'public.employee_events',
    'public.employee_private_contacts', 'public.employee_project_assignments',
    'public.employees', 'public.equipment_details', 'public.equipment_hour_rates',
    'public.equipment_requests', 'public.inventory_balances',
    'public.inventory_command_receipts', 'public.inventory_legacy_transit_values',
    'public.inventory_locations', 'public.inventory_low_stock_alerts',
    'public.inventory_opening_values', 'public.inventory_stock_counts',
    'public.inventory_transactions', 'public.inventory_transfer_items',
    'public.inventory_transfer_variances', 'public.inventory_transfers',
    'public.inventory_valuations', 'public.labor_rates', 'public.material_categories',
    'public.material_request_cancellation_receipts',
    'public.material_request_decision_receipts', 'public.material_request_dispatches',
    'public.material_request_events', 'public.material_request_fulfillment_events',
    'public.material_request_fulfillment_receipts', 'public.material_request_lines',
    'public.material_request_reservation_events', 'public.material_request_reservations',
    'public.material_requests', 'public.materials', 'public.notification_outbox',
    'public.notification_read_events', 'public.notifications',
    'public.project_additional_expenses', 'public.project_assignments',
    'public.project_attendance', 'public.project_attendance_reversals',
    'public.project_budget_changes', 'public.project_equipment_usage',
    'public.project_equipment_usage_reversals', 'public.project_expense_reversals',
    'public.project_material_plan_lines', 'public.project_progress_entries',
    'public.project_sites', 'public.project_warehouses', 'public.projects',
    'public.purchase_order_lines', 'public.purchase_order_receipts',
    'public.purchase_orders', 'public.qr_codes', 'public.qr_events',
    'public.supplier_categories', 'public.supplier_events', 'public.supplier_materials',
    'public.supplier_prices', 'public.suppliers', 'public.valuation_command_receipts',
    'public.vehicle_details', 'public.warehouse_assignments', 'public.warehouses'
  ];
  v_number_sequences constant text[] := array[
    'public.inventory_transfer_number_seq', 'public.daily_report_number_seq',
    'public.purchase_order_number_seq', 'public.client_invoice_number_seq',
    'public.material_request_number_seq'
  ];
  v_targets text[];
  v_unknown text;
  v_table text;
  v_rows bigint;
  v_auth_before jsonb;
  v_profiles_before jsonb;
  v_roles_before jsonb;
begin
  if current_user <> 'postgres' then
    raise exception 'Run this staging maintenance script as postgres in the Supabase SQL Editor';
  end if;

  select string_agg(n.nspname || '.' || c.relname, ', ' order by n.nspname, c.relname)
  into v_unknown
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
    and not (n.nspname || '.' || c.relname = any(v_preserved || v_business));
  if v_unknown is not null then
    raise exception 'Unreviewed tables found; nothing was reset: %', v_unknown;
  end if;

  select array_agg(format('%I.%I', n.nspname, c.relname) order by n.nspname, c.relname)
  into v_targets
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname || '.' || c.relname = any(v_business);
  if coalesce(cardinality(v_targets), 0) = 0 or to_regclass('public.projects') is null then
    raise exception 'ERP business tables not found; nothing was reset';
  end if;

  -- Lock operational tables so counts and reset describe the same state.
  execute 'lock table ' || array_to_string(v_targets, ', ') || ' in access exclusive mode';
  lock table public.profiles, public.user_roles in share mode;
  select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]'::jsonb)
    into v_auth_before from auth.users u;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
    into v_profiles_before from public.profiles p;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.user_id, r.role), '[]'::jsonb)
    into v_roles_before from public.user_roles r;

  foreach v_table in array v_targets loop
    execute format('select count(*) from %s', v_table) into v_rows;
    insert into reset_result values (v_table, v_rows);
  end loop;

  -- RESTRICT prevents accidental removal of any table outside the reviewed set.
  execute 'truncate table ' || array_to_string(v_targets, ', ') || ' restart identity restrict';
  foreach v_table in array v_number_sequences loop
    if to_regclass(v_table) is not null then
      execute format('alter sequence %s restart', v_table);
    end if;
  end loop;

  foreach v_table in array v_targets loop
    execute format('select count(*) from %s', v_table) into v_rows;
    if v_rows <> 0 then
      raise exception 'Reset verification failed for %; transaction rolled back', v_table;
    end if;
  end loop;
  if v_auth_before is distinct from (select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]'::jsonb) from auth.users u)
    or v_profiles_before is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.profiles p)
    or v_roles_before is distinct from (select coalesce(jsonb_agg(to_jsonb(r) order by r.user_id, r.role), '[]'::jsonb) from public.user_roles r)
  then
    raise exception 'Preserved user data changed; reset rolled back';
  end if;
end;
$reset$;

commit;

select count(*) as emptied_tables, sum(removed_rows) as removed_business_rows
from reset_result;
select 'auth.users' as preserved_table, count(*) as remaining_rows from auth.users
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.user_roles', count(*) from public.user_roles;
drop table reset_result;

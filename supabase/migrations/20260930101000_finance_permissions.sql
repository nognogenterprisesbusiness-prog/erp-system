-- Finance can view project financial records, issue invoices, and record payments.
-- Stock posting, procurement, budget/rate changes, and corrections stay Admin-only.
begin;

drop policy if exists projects_finance_select on public.projects;
create policy projects_finance_select on public.projects for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_sites_finance_select on public.project_sites;
create policy project_sites_finance_select on public.project_sites for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists employees_finance_select on public.employees;
create policy employees_finance_select on public.employees for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists employee_categories_finance_select on public.employee_categories;
create policy employee_categories_finance_select on public.employee_categories for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists employee_events_finance_select on public.employee_events;
create policy employee_events_finance_select on public.employee_events for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists employee_assignments_finance_select on public.employee_project_assignments;
create policy employee_assignments_finance_select on public.employee_project_assignments for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists labor_rates_finance_select on public.labor_rates;
create policy labor_rates_finance_select on public.labor_rates for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));

drop policy if exists client_invoices_finance_role_select on public.client_invoices;
create policy client_invoices_finance_role_select on public.client_invoices for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists client_payments_finance_role_select on public.client_payments;
create policy client_payments_finance_role_select on public.client_payments for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists client_payment_reversals_finance_role_select on public.client_payment_reversals;
create policy client_payment_reversals_finance_role_select on public.client_payment_reversals for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_attendance_finance_role_select on public.project_attendance;
create policy project_attendance_finance_role_select on public.project_attendance for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_attendance_reversals_finance_role_select on public.project_attendance_reversals;
create policy project_attendance_reversals_finance_role_select on public.project_attendance_reversals for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists equipment_hour_rates_finance_role_select on public.equipment_hour_rates;
create policy equipment_hour_rates_finance_role_select on public.equipment_hour_rates for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_equipment_usage_finance_role_select on public.project_equipment_usage;
create policy project_equipment_usage_finance_role_select on public.project_equipment_usage for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_equipment_usage_reversals_finance_role_select on public.project_equipment_usage_reversals;
create policy project_equipment_usage_reversals_finance_role_select on public.project_equipment_usage_reversals for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_additional_expenses_finance_role_select on public.project_additional_expenses;
create policy project_additional_expenses_finance_role_select on public.project_additional_expenses for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_expense_reversals_finance_role_select on public.project_expense_reversals;
create policy project_expense_reversals_finance_role_select on public.project_expense_reversals for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));
drop policy if exists project_budget_changes_finance_role_select on public.project_budget_changes;
create policy project_budget_changes_finance_role_select on public.project_budget_changes for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));

create or replace function public.issue_client_invoice(
  p_idempotency_key uuid, p_project_id uuid, p_description text,
  p_issued_on date, p_due_on date, p_amount numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.client_invoices;
  v_project public.projects;
  v_billed numeric(18,2);
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to issue invoices' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_issued_on is null or p_due_on is null or p_due_on < p_issued_on
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or char_length(trim(coalesce(p_description, ''))) not between 3 and 300 then
    raise exception 'Invalid invoice details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'description', trim(p_description),
    'issued_on', p_issued_on, 'due_on', p_due_on, 'amount', p_amount);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.client_invoices where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.issued_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another invoice' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_project from public.projects where id = p_project_id and archived_at is null for update;
  if not found or v_project.status not in ('active','on_hold','completed') then
    raise exception 'The project is not eligible for billing' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_billed from public.client_invoices
  where project_id = p_project_id and status = 'issued';
  if v_billed + p_amount > v_project.contract_amount then
    raise exception 'Invoice exceeds remaining project contract value' using errcode = '22023';
  end if;
  insert into public.client_invoices (
    id, invoice_number, project_id, project_code, project_name, client_name, description, issued_on, due_on,
    amount, issued_by, idempotency_key, command_payload
  ) values (
    v_id, 'INV-' || to_char(p_issued_on, 'YYYY') || '-' || lpad(nextval('public.client_invoice_number_seq')::text, 6, '0'),
    p_project_id, v_project.code, v_project.name, v_project.client_name, trim(p_description), p_issued_on, p_due_on,
    p_amount, v_actor, p_idempotency_key, v_payload
  );
  return v_id;
end;
$$;

create or replace function public.record_client_payment(
  p_idempotency_key uuid, p_invoice_id uuid, p_amount numeric,
  p_paid_on date, p_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.client_payments;
  v_invoice public.client_invoices;
  v_paid numeric(18,2);
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to record payments' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_invoice_id is null or p_paid_on is null or p_amount is null or p_amount <= 0
    or p_amount <> round(p_amount, 2)
    or char_length(trim(coalesce(p_reference, ''))) not between 3 and 100 then
    raise exception 'Invalid payment details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('invoice', p_invoice_id, 'amount', p_amount,
    'paid_on', p_paid_on, 'reference', trim(p_reference));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.client_payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another payment' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_invoice from public.client_invoices where id = p_invoice_id for update;
  if not found or v_invoice.status <> 'issued' then
    raise exception 'Invoice is not payable' using errcode = '22023';
  end if;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.client_payments p left join public.client_payment_reversals r on r.payment_id = p.id
  where p.invoice_id = p_invoice_id and r.id is null;
  if v_paid + p_amount > v_invoice.amount then
    raise exception 'Payment exceeds invoice outstanding balance' using errcode = '22023';
  end if;
  insert into public.client_payments (id, invoice_id, amount, paid_on, reference, recorded_by, idempotency_key, command_payload)
  values (v_id, p_invoice_id, p_amount, p_paid_on, trim(p_reference), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create or replace function public.get_client_invoice_balances(p_invoice_ids uuid[])
returns table(invoice_id uuid, paid_amount numeric, outstanding_amount numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view billing' using errcode = '42501';
  end if;
  if coalesce(array_length(p_invoice_ids, 1), 0) > 100 then
    raise exception 'Too many invoices requested' using errcode = '22023';
  end if;
  return query select i.id,
    coalesce(sum(p.amount) filter (where r.id is null), 0)::numeric,
    case when i.status = 'void' then 0::numeric
      else i.amount - coalesce(sum(p.amount) filter (where r.id is null), 0) end::numeric
  from public.client_invoices i
  left join public.client_payments p on p.invoice_id = i.id
  left join public.client_payment_reversals r on r.payment_id = p.id
  where i.id = any(p_invoice_ids)
  group by i.id;
end;
$$;

create or replace function public.get_billable_projects()
returns table(id uuid, code text, name text, client_name text, contract_amount numeric, status public.project_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view billing projects' using errcode = '42501';
  end if;
  return query select p.id, p.code, p.name, p.client_name, p.contract_amount, p.status
  from public.projects p
  where p.archived_at is null and p.status in ('active','on_hold','completed') and p.contract_amount > 0
  order by p.code limit 500;
end;
$$;

create or replace function public.get_project_management_summary(p_project_id uuid)
returns table(project_code text, project_name text, contract_amount numeric, approved_budget numeric,
  material_cost numeric, labor_cost numeric, equipment_cost numeric, additional_cost numeric,
  total_cost numeric, invoiced_amount numeric, cash_received numeric, billed_margin numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_project public.projects; v_material numeric; v_labor numeric; v_equipment numeric;
  v_additional numeric; v_budget numeric; v_invoiced numeric; v_cash numeric;
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view project management summary' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = p_project_id;
  if v_project.id is null then raise exception 'Project not found' using errcode = '22023'; end if;
  if exists(select 1 from public.inventory_transactions t where t.project_id = p_project_id
    and t.transaction_type = 'MATERIAL_CONSUMPTION' and t.cost_total is null
    and not exists(select 1 from public.inventory_transactions r where r.reversal_of = t.id)) then
    raise exception 'Project has unvalued material consumption' using errcode = '22023';
  end if;
  select coalesce(sum(t.cost_total), 0) into v_material from public.inventory_transactions t
  where t.project_id = p_project_id and t.transaction_type = 'MATERIAL_CONSUMPTION'
    and not exists(select 1 from public.inventory_transactions r where r.reversal_of = t.id);
  select coalesce(sum(a.cost_total), 0) into v_labor from public.project_attendance a
  where a.project_id = p_project_id and not exists(select 1 from public.project_attendance_reversals r where r.attendance_id = a.id);
  select coalesce(sum(u.cost_total), 0) into v_equipment from public.project_equipment_usage u
  where u.project_id = p_project_id and not exists(select 1 from public.project_equipment_usage_reversals r where r.usage_id = u.id);
  select coalesce(sum(e.amount), 0) into v_additional from public.project_additional_expenses e
  where e.project_id = p_project_id and not exists(select 1 from public.project_expense_reversals r where r.expense_id = e.id);
  select v_project.initial_budget + coalesce(sum(change_amount), 0) into v_budget from public.project_budget_changes
  where project_id = p_project_id;
  select coalesce(sum(amount), 0) into v_invoiced from public.client_invoices where project_id = p_project_id and status = 'issued';
  select coalesce(sum(p.amount), 0) into v_cash from public.client_payments p
  join public.client_invoices i on i.id = p.invoice_id
  where i.project_id = p_project_id and i.status = 'issued'
    and not exists(select 1 from public.client_payment_reversals r where r.payment_id = p.id);
  return query select v_project.code, v_project.name, v_project.contract_amount, v_budget,
    v_material, v_labor, v_equipment, v_additional, v_material + v_labor + v_equipment + v_additional,
    v_invoiced, v_cash, v_invoiced - (v_material + v_labor + v_equipment + v_additional);
end;
$$;

create or replace function public.get_project_labor_cost(p_project_id uuid)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v_total numeric;
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view project labor cost' using errcode = '42501';
  end if;
  select coalesce(sum(a.cost_total), 0) into v_total from public.project_attendance a
  left join public.project_attendance_reversals r on r.attendance_id = a.id
  where a.project_id = p_project_id and r.id is null;
  return v_total;
end;
$$;

create or replace function public.get_dashboard_monthly_project_costs(p_months integer default 6)
returns table(month_start date, material_cost numeric, labor_cost numeric,
  equipment_cost numeric, other_cost numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_first_month date; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if (select auth.uid()) is null or not private.has_any_role(
    array['admin','finance']::public.app_role[]
  ) then
    raise exception 'Not authorized to view project costs' using errcode = '42501';
  end if;
  if p_months is null or p_months not between 1 and 12 then
    raise exception 'Month count must be between 1 and 12' using errcode = '22023';
  end if;
  v_first_month := (date_trunc('month', v_today) - (p_months - 1) * interval '1 month')::date;
  if exists (
    select 1 from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and t.transaction_date >= v_first_month and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
  ) then
    raise exception 'Unvalued material consumption prevents monthly cost reporting' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved' and t.transaction_date >= v_first_month
      and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
  ) then
    raise exception 'Unvalued site stock loss prevents monthly cost reporting' using errcode = '22023';
  end if;

  return query
  with months as (
    select (date_trunc('month', v_today) - n * interval '1 month')::date as month
    from pg_catalog.generate_series(0, p_months - 1) as n
  ), costs as (
    select date_trunc('month', t.transaction_date)::date as month,
      t.cost_total as material, 0::numeric as labor, 0::numeric as equipment, 0::numeric as other
    from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and t.transaction_date >= v_first_month
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select date_trunc('month', a.work_date)::date, 0, a.cost_total, 0, 0
    from public.project_attendance a
    where a.work_date >= v_first_month
      and not exists (select 1 from public.project_attendance_reversals r where r.attendance_id = a.id)
    union all
    select date_trunc('month', u.use_date)::date, 0, 0, u.cost_total, 0
    from public.project_equipment_usage u
    where u.use_date >= v_first_month
      and not exists (select 1 from public.project_equipment_usage_reversals r where r.usage_id = u.id)
    union all
    select date_trunc('month', e.expense_date)::date, 0, 0, 0, e.amount
    from public.project_additional_expenses e
    where e.expense_date >= v_first_month
      and not exists (select 1 from public.project_expense_reversals r where r.expense_id = e.id)
    union all
    select date_trunc('month', t.transaction_date)::date, 0, 0, 0, t.cost_total
    from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved' and t.transaction_date >= v_first_month
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select date_trunc('month', v.approved_at at time zone 'Asia/Manila')::date, 0, 0, 0, v.cost_total
    from public.inventory_transfer_variances v
    join public.inventory_transfer_items i on i.id = v.transfer_item_id
    join public.inventory_transfers tr on tr.id = i.transfer_id
    join public.inventory_locations src on src.id = tr.source_location_id
    join public.inventory_locations dst on dst.id = tr.destination_location_id
    where (v.approved_at at time zone 'Asia/Manila')::date >= v_first_month
      and (src.project_site_id is not null or dst.project_site_id is not null)
  )
  select m.month, coalesce(sum(c.material), 0), coalesce(sum(c.labor), 0),
    coalesce(sum(c.equipment), 0), coalesce(sum(c.other), 0)
  from months m left join costs c on c.month = m.month
  group by m.month order by m.month;
end; $$;

create or replace function public.get_dashboard_totals()
returns table(total_sales numeric, total_expenses numeric, total_material_value numeric,
  unvalued_stock bigint, unvalued_expenses bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view financial totals' using errcode = '42501';
  end if;
  return query
  with costs as (
    select t.cost_total as amount from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select a.cost_total from public.project_attendance a
    where not exists (select 1 from public.project_attendance_reversals r where r.attendance_id = a.id)
    union all
    select u.cost_total from public.project_equipment_usage u
    where not exists (select 1 from public.project_equipment_usage_reversals r where r.usage_id = u.id)
    union all
    select e.amount from public.project_additional_expenses e
    where not exists (select 1 from public.project_expense_reversals r where r.expense_id = e.id)
    union all
    select t.cost_total from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved'
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select v.cost_total from public.inventory_transfer_variances v
    join public.inventory_transfer_items i on i.id = v.transfer_item_id
    join public.inventory_transfers tr on tr.id = i.transfer_id
    join public.inventory_locations src on src.id = tr.source_location_id
    join public.inventory_locations dst on dst.id = tr.destination_location_id
    where src.project_site_id is not null or dst.project_site_id is not null
  ), expenses as (
    select sum(c.amount) as total, count(*) filter (where c.amount is null) as unknown from costs c
  ), stock as (
    select sum(v.total_value) as total,
      count(*) filter (where v.quantity_on_hand > 0 and v.total_value is null) as unknown
    from public.inventory_valuations v
  )
  select (select coalesce(sum(i.amount), 0) from public.client_invoices i where i.status = 'issued'),
    case when e.unknown > 0 then null::numeric else coalesce(e.total, 0) end,
    case when s.unknown > 0 then null::numeric else coalesce(s.total, 0) end,
    s.unknown, e.unknown
  from expenses e cross join stock s;
end; $$;

commit;

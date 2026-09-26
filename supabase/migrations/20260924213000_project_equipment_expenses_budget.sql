-- Explicit management charge rates; not depreciation, payroll, or tax accounting.
create table public.equipment_hour_rates (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  hourly_rate numeric(18,2) not null check (hourly_rate > 0),
  effective_start_date date not null,
  effective_end_date date,
  approved_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint equipment_hour_rate_dates check (effective_end_date is null or effective_end_date >= effective_start_date)
);
create index equipment_hour_rates_asset_date_idx on public.equipment_hour_rates(asset_id, effective_start_date desc);

create table public.project_equipment_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  asset_code text not null,
  asset_name text not null,
  use_date date not null,
  hours_used numeric(6,2) not null check (hours_used > 0 and hours_used <= 24),
  rate_id uuid not null references public.equipment_hour_rates(id) on delete restrict,
  hourly_rate_snapshot numeric(18,2) not null check (hourly_rate_snapshot > 0),
  cost_total numeric(18,2) not null check (cost_total >= 0),
  work_note text not null check (char_length(trim(work_note)) between 3 and 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now()
);
create index project_equipment_usage_project_idx on public.project_equipment_usage(project_id, use_date desc);
create index project_equipment_usage_asset_date_idx on public.project_equipment_usage(asset_id, use_date);

create table public.project_equipment_usage_reversals (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null unique references public.project_equipment_usage(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);

create table public.project_additional_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  expense_date date not null,
  category text not null check (category in ('permit','subcontract','utilities','other')),
  description text not null check (char_length(trim(description)) between 3 and 500),
  external_reference text not null check (char_length(trim(external_reference)) between 3 and 120),
  amount numeric(18,2) not null check (amount > 0),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now()
);
create index project_additional_expenses_project_idx on public.project_additional_expenses(project_id, expense_date desc);
create unique index project_additional_expenses_reference_unique on public.project_additional_expenses(project_id, lower(external_reference));

create table public.project_expense_reversals (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null unique references public.project_additional_expenses(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);

create table public.project_budget_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  change_amount numeric(18,2) not null check (change_amount <> 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  approved_by uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);
create index project_budget_changes_project_idx on public.project_budget_changes(project_id, approved_at desc);

alter table public.equipment_hour_rates enable row level security;
alter table public.project_equipment_usage enable row level security;
alter table public.project_equipment_usage_reversals enable row level security;
alter table public.project_additional_expenses enable row level security;
alter table public.project_expense_reversals enable row level security;
alter table public.project_budget_changes enable row level security;
revoke all on public.equipment_hour_rates, public.project_equipment_usage,
  public.project_equipment_usage_reversals, public.project_additional_expenses,
  public.project_expense_reversals, public.project_budget_changes from public, anon, authenticated;
grant select on public.equipment_hour_rates, public.project_equipment_usage,
  public.project_equipment_usage_reversals, public.project_additional_expenses,
  public.project_expense_reversals, public.project_budget_changes to authenticated;
create policy equipment_hour_rates_finance_read on public.equipment_hour_rates for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy project_equipment_usage_finance_read on public.project_equipment_usage for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy project_equipment_usage_reversals_finance_read on public.project_equipment_usage_reversals for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy project_additional_expenses_finance_read on public.project_additional_expenses for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy project_expense_reversals_finance_read on public.project_expense_reversals for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy project_budget_changes_finance_read on public.project_budget_changes for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create trigger equipment_hour_rates_audit after insert or update on public.equipment_hour_rates for each row execute function private.audit_row_change();
create trigger project_equipment_usage_audit after insert on public.project_equipment_usage for each row execute function private.audit_row_change();
create trigger project_equipment_usage_reversals_audit after insert on public.project_equipment_usage_reversals for each row execute function private.audit_row_change();
create trigger project_additional_expenses_audit after insert on public.project_additional_expenses for each row execute function private.audit_row_change();
create trigger project_expense_reversals_audit after insert on public.project_expense_reversals for each row execute function private.audit_row_change();
create trigger project_budget_changes_audit after insert on public.project_budget_changes for each row execute function private.audit_row_change();

create function private.protect_initial_project_budget()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.initial_budget is distinct from old.initial_budget
    and (old.status <> 'draft' or exists(select 1 from public.project_budget_changes where project_id = old.id)) then
    raise exception 'Initial budget is locked; post an approved budget change' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger projects_protect_initial_budget before update of initial_budget on public.projects
for each row execute function private.protect_initial_project_budget();
revoke execute on function private.protect_initial_project_budget() from public, anon, authenticated;

create function public.set_equipment_hour_rate(p_asset_id uuid, p_hourly_rate numeric, p_effective_start_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_asset public.assets; v_current public.equipment_hour_rates; v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can set equipment rates' using errcode = '42501';
  end if;
  if p_asset_id is null or p_hourly_rate is null or p_hourly_rate <= 0 or p_hourly_rate <> round(p_hourly_rate, 2)
    or p_effective_start_date is null then raise exception 'Invalid equipment rate' using errcode = '22023'; end if;
  select * into v_asset from public.assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.asset_kind <> 'equipment' or v_asset.archived_at is not null then
    raise exception 'Equipment is unavailable' using errcode = '22023';
  end if;
  if exists(select 1 from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date >= p_effective_start_date) then
    raise exception 'A rate already starts on or after this date' using errcode = '22023';
  end if;
  select * into v_current from public.equipment_hour_rates
    where asset_id = p_asset_id and effective_end_date is null for update;
  if v_current.id is not null then
    if p_effective_start_date <= v_current.effective_start_date then
      raise exception 'New rate must start after the current rate' using errcode = '22023';
    end if;
    update public.equipment_hour_rates set effective_end_date = p_effective_start_date - 1 where id = v_current.id;
  end if;
  if exists(select 1 from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date <= p_effective_start_date
    and (effective_end_date is null or effective_end_date >= p_effective_start_date)) then
    raise exception 'Equipment rate periods cannot overlap' using errcode = '22023';
  end if;
  insert into public.equipment_hour_rates (id, asset_id, hourly_rate, effective_start_date, approved_by)
  values (v_id, p_asset_id, p_hourly_rate, p_effective_start_date, v_actor);
  return v_id;
end;
$$;

create function public.post_project_equipment_usage(
  p_idempotency_key uuid, p_project_id uuid, p_asset_id uuid,
  p_use_date date, p_hours numeric, p_work_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.project_equipment_usage;
  v_asset public.assets;
  v_rate public.equipment_hour_rates;
  v_total_hours numeric;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can post equipment usage cost' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_asset_id is null or p_use_date is null
    or p_hours is null or p_hours <= 0 or p_hours > 24 or p_hours <> round(p_hours, 2)
    or char_length(trim(coalesce(p_work_note, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment usage' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'asset', p_asset_id,
    'date', p_use_date, 'hours', p_hours, 'note', trim(p_work_note));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_equipment_usage where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another usage' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_asset from public.assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.asset_kind <> 'equipment' or v_asset.archived_at is not null
    or v_asset.status not in ('available','assigned','in_use') then
    raise exception 'Equipment is unavailable' using errcode = '22023';
  end if;
  if not exists(select 1 from public.asset_locations al
    join public.inventory_locations il on il.id = al.inventory_location_id
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where al.id = v_asset.current_location_id and ps.project_id = p_project_id
      and p.archived_at is null and p.status in ('active','on_hold')
      and ps.status = 'active') then
    raise exception 'Equipment must be located at an active site in this project' using errcode = '22023';
  end if;
  if exists(select 1 from public.project_equipment_usage u
    left join public.project_equipment_usage_reversals r on r.usage_id = u.id
    where u.asset_id = p_asset_id and u.project_id = p_project_id and u.use_date = p_use_date and r.id is null) then
    raise exception 'Equipment usage already posted for this project and date' using errcode = '23505';
  end if;
  select coalesce(sum(u.hours_used), 0) into v_total_hours from public.project_equipment_usage u
  left join public.project_equipment_usage_reversals r on r.usage_id = u.id
  where u.asset_id = p_asset_id and u.use_date = p_use_date and r.id is null;
  if v_total_hours + p_hours > 24 then
    raise exception 'Equipment usage exceeds 24 hours for this date' using errcode = '22023';
  end if;
  select * into v_rate from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date <= p_use_date and (effective_end_date is null or effective_end_date >= p_use_date)
    order by effective_start_date desc limit 1;
  if v_rate.id is null then
    raise exception 'No approved equipment rate for this date' using errcode = '22023';
  end if;
  insert into public.project_equipment_usage (id, project_id, asset_id, asset_code, asset_name,
    use_date, hours_used, rate_id, hourly_rate_snapshot, cost_total, work_note,
    recorded_by, idempotency_key, command_payload)
  values (v_id, p_project_id, p_asset_id, v_asset.code, v_asset.name,
    p_use_date, p_hours, v_rate.id, v_rate.hourly_rate, round(p_hours * v_rate.hourly_rate, 2),
    trim(p_work_note), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.post_project_additional_expense(
  p_idempotency_key uuid, p_project_id uuid, p_expense_date date,
  p_category text, p_description text, p_external_reference text, p_amount numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_payload jsonb; v_existing public.project_additional_expenses; v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can post additional project expense' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_expense_date is null
    or p_category not in ('permit','subcontract','utilities','other')
    or char_length(trim(coalesce(p_description, ''))) not between 3 and 500
    or char_length(trim(coalesce(p_external_reference, ''))) not between 3 and 120
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Invalid additional expense' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'date', p_expense_date,
    'category', p_category, 'description', trim(p_description),
    'reference', trim(p_external_reference), 'amount', p_amount);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_additional_expenses where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another expense' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  perform 1 from public.projects where id = p_project_id and archived_at is null and status in ('active','on_hold','completed') for update;
  if not found then raise exception 'Project is not available for expense posting' using errcode = '22023'; end if;
  insert into public.project_additional_expenses (id, project_id, expense_date, category, description,
    external_reference, amount, recorded_by, idempotency_key, command_payload)
  values (v_id, p_project_id, p_expense_date, p_category, trim(p_description), trim(p_external_reference),
    p_amount, v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.adjust_project_budget(
  p_idempotency_key uuid, p_project_id uuid, p_change_amount numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_payload jsonb; v_existing public.project_budget_changes;
  v_project public.projects; v_changes numeric; v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can adjust project budget' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_change_amount is null
    or p_change_amount = 0 or p_change_amount <> round(p_change_amount, 2)
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Invalid budget change' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'change', p_change_amount, 'reason', trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_budget_changes where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.approved_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another budget change' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_project from public.projects where id = p_project_id and archived_at is null for update;
  if v_project.id is null then raise exception 'Project not found' using errcode = '22023'; end if;
  select coalesce(sum(change_amount), 0) into v_changes from public.project_budget_changes where project_id = p_project_id;
  if v_project.initial_budget + v_changes + p_change_amount < 0 then
    raise exception 'Adjusted budget cannot be negative' using errcode = '22023';
  end if;
  insert into public.project_budget_changes (id, project_id, change_amount, reason, approved_by, idempotency_key, command_payload)
  values (v_id, p_project_id, p_change_amount, trim(p_reason), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.reverse_project_cost_entry(
  p_idempotency_key uuid, p_kind text, p_entry_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_payload jsonb; v_id uuid := gen_random_uuid();
  v_existing_id uuid; v_existing_actor uuid; v_existing_payload jsonb; v_asset_id uuid; v_project_id uuid;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can reverse project cost' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_entry_id is null or p_kind not in ('equipment','expense')
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Invalid cost correction' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('kind', p_kind, 'entry', p_entry_id, 'reason', trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  if p_kind = 'equipment' then
    select id, reversed_by, command_payload into v_existing_id, v_existing_actor, v_existing_payload
      from public.project_equipment_usage_reversals where idempotency_key = p_idempotency_key;
  else
    select id, reversed_by, command_payload into v_existing_id, v_existing_actor, v_existing_payload
      from public.project_expense_reversals where idempotency_key = p_idempotency_key;
  end if;
  if v_existing_id is not null then
    if v_existing_actor <> v_actor or v_existing_payload <> v_payload then
      raise exception 'Idempotency key already used for another correction' using errcode = '23505';
    end if;
    return v_existing_id;
  end if;
  if (p_kind = 'equipment' and exists(select 1 from public.project_expense_reversals where idempotency_key = p_idempotency_key))
    or (p_kind = 'expense' and exists(select 1 from public.project_equipment_usage_reversals where idempotency_key = p_idempotency_key)) then
    raise exception 'Idempotency key already used for another correction' using errcode = '23505';
  end if;
  if p_kind = 'equipment' then
    select asset_id, project_id into v_asset_id, v_project_id from public.project_equipment_usage where id = p_entry_id;
    if v_asset_id is null then raise exception 'Equipment usage not found' using errcode = '22023'; end if;
    perform 1 from public.assets where id = v_asset_id for update;
    if exists(select 1 from public.project_equipment_usage_reversals where usage_id = p_entry_id) then
      raise exception 'Equipment usage already reversed' using errcode = '23505';
    end if;
    insert into public.project_equipment_usage_reversals (id, usage_id, reason, reversed_by, idempotency_key, command_payload)
    values (v_id, p_entry_id, trim(p_reason), v_actor, p_idempotency_key, v_payload);
  else
    select project_id into v_project_id from public.project_additional_expenses where id = p_entry_id;
    if v_project_id is null then raise exception 'Expense not found' using errcode = '22023'; end if;
    perform 1 from public.projects where id = v_project_id for update;
    if exists(select 1 from public.project_expense_reversals where expense_id = p_entry_id) then
      raise exception 'Expense already reversed' using errcode = '23505';
    end if;
    insert into public.project_expense_reversals (id, expense_id, reason, reversed_by, idempotency_key, command_payload)
    values (v_id, p_entry_id, trim(p_reason), v_actor, p_idempotency_key, v_payload);
  end if;
  return v_id;
end;
$$;

create function public.get_project_management_summary(p_project_id uuid)
returns table(project_code text, project_name text, contract_amount numeric, approved_budget numeric,
  material_cost numeric, labor_cost numeric, equipment_cost numeric, additional_cost numeric,
  total_cost numeric, invoiced_amount numeric, cash_received numeric, billed_margin numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_project public.projects; v_material numeric; v_labor numeric; v_equipment numeric;
  v_additional numeric; v_budget numeric; v_invoiced numeric; v_cash numeric;
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin']::public.app_role[]) then
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

revoke execute on function public.set_equipment_hour_rate(uuid,numeric,date),
  public.post_project_equipment_usage(uuid,uuid,uuid,date,numeric,text),
  public.post_project_additional_expense(uuid,uuid,date,text,text,text,numeric),
  public.adjust_project_budget(uuid,uuid,numeric,text),
  public.reverse_project_cost_entry(uuid,text,uuid,text),
  public.get_project_management_summary(uuid) from public, anon;
grant execute on function public.set_equipment_hour_rate(uuid,numeric,date),
  public.post_project_equipment_usage(uuid,uuid,uuid,date,numeric,text),
  public.post_project_additional_expense(uuid,uuid,date,text,text,text,numeric),
  public.adjust_project_budget(uuid,uuid,numeric,text),
  public.reverse_project_cost_entry(uuid,text,uuid,text),
  public.get_project_management_summary(uuid) to authenticated;

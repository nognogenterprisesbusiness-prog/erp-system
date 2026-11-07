-- Simple payroll for departments and staff.
-- Attendance pay = posted, non-reversed project attendance cost in the period
-- (already rate-snapshotted). Other earnings and deductions are entered
-- manually; no statutory (SSS/PhilHealth/Pag-IBIG/tax) rules are computed.
-- Payroll is a payment record only: it never posts project costs again.
begin;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index departments_name_unique on public.departments (lower(trim(name))) where archived_at is null;

alter table public.employees add column department_id uuid references public.departments(id);
create index employees_department_idx on public.employees (department_id) where archived_at is null;

create sequence public.payroll_number_seq;
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_number text not null unique,
  department_id uuid references public.departments(id),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'draft' check (status in ('draft','finalized','paid','voided')),
  notes text not null default '' check (char_length(notes) <= 500),
  idempotency_key uuid not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_by uuid references public.profiles(id),
  finalized_at timestamptz,
  paid_by uuid references public.profiles(id),
  paid_on date,
  payment_reference text check (payment_reference is null or char_length(trim(payment_reference)) between 2 and 120),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(trim(void_reason)) between 3 and 500),
  constraint payroll_period check (period_end >= period_start and period_end - period_start <= 62),
  constraint payroll_finalized_pair check ((finalized_at is null) = (finalized_by is null)),
  constraint payroll_paid_fields check ((status = 'paid') = (paid_on is not null) or status = 'voided'),
  constraint payroll_void_fields check ((status = 'voided') = (voided_at is not null and void_reason is not null))
);
create index payroll_runs_period_idx on public.payroll_runs (period_start desc, created_at desc);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id),
  employee_id uuid not null references public.employees(id),
  employee_code text not null,
  employee_name text not null,
  department_id uuid references public.departments(id),
  days_worked integer not null default 0 check (days_worked >= 0),
  attendance_pay numeric(18,2) not null default 0 check (attendance_pay >= 0),
  other_earnings numeric(18,2) not null default 0 check (other_earnings >= 0 and other_earnings < 10000000),
  deductions numeric(18,2) not null default 0 check (deductions >= 0 and deductions < 10000000),
  net_pay numeric(18,2) generated always as (attendance_pay + other_earnings - deductions) stored,
  notes text not null default '' check (char_length(notes) <= 300),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index payroll_lines_employee_idx on public.payroll_lines (employee_id);

create trigger departments_audit after insert or update or delete on public.departments for each row execute function private.audit_row_change();
create trigger payroll_runs_audit after insert or update or delete on public.payroll_runs for each row execute function private.audit_row_change();
create trigger payroll_lines_audit after insert or update or delete on public.payroll_lines for each row execute function private.audit_row_change();

alter table public.departments enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;
revoke all on public.departments, public.payroll_runs, public.payroll_lines from public, anon, authenticated;
grant select on public.departments, public.payroll_runs, public.payroll_lines to authenticated;
revoke all on sequence public.payroll_number_seq from public, anon, authenticated;
create policy departments_read on public.departments for select to authenticated
  using ((select private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[])));
create policy payroll_runs_read on public.payroll_runs for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
create policy payroll_lines_read on public.payroll_lines for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[])));

create function private.payroll_attendance(p_employee_id uuid, p_start date, p_end date)
returns table(days integer, pay numeric) language sql stable security definer set search_path='' as $$
  select count(distinct a.work_date) filter (where a.attendance_status = 'present')::integer,
    coalesce(sum(a.cost_total), 0)::numeric
  from public.project_attendance a
  where a.employee_id = p_employee_id and a.work_date between p_start and p_end
    and not exists (select 1 from public.project_attendance_reversals r where r.attendance_id = a.id)
$$;
revoke all on function private.payroll_attendance(uuid,date,date) from public, anon, authenticated;

create function public.save_department(p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'Enter a department name' using errcode='22023';
  end if;
  if p_id is null then
    insert into public.departments(name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  else
    update public.departments set name = trim(p_name) where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Department is unavailable' using errcode='22023'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'A department with this name already exists' using errcode='23505';
end $$;

create function public.set_employee_department(p_employee_id uuid, p_department_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id = p_department_id and archived_at is null) then
    raise exception 'Choose an active department' using errcode='22023';
  end if;
  update public.employees set department_id = p_department_id, updated_by = auth.uid(), updated_at = now()
  where id = p_employee_id and archived_at is null;
  if not found then raise exception 'Employee is unavailable' using errcode='22023'; end if;
end $$;

create function public.create_payroll_run(
  p_key uuid, p_department_id uuid, p_period_start date, p_period_end date, p_pay_date date, p_notes text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_run public.payroll_runs; v_id uuid := gen_random_uuid(); v_overlap text; v_count integer;
begin
  if not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Payroll access required' using errcode='42501';
  end if;
  if p_key is null or p_period_start is null or p_period_end is null or p_pay_date is null
    or p_period_end < p_period_start or p_period_end - p_period_start > 62
    or p_pay_date < p_period_start or char_length(coalesce(p_notes,'')) > 500 then
    raise exception 'Invalid payroll period' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payroll-runs', 0));
  select * into v_run from public.payroll_runs where idempotency_key = p_key;
  if found then
    if v_run.department_id is distinct from p_department_id or v_run.period_start <> p_period_start
      or v_run.period_end <> p_period_end or v_run.pay_date <> p_pay_date then
      raise exception 'Payroll request already used' using errcode='23505';
    end if;
    return v_run.id;
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id = p_department_id and archived_at is null) then
    raise exception 'Choose an active department' using errcode='22023';
  end if;
  -- One active payroll per employee per period, so nobody is paid twice.
  select string_agg(distinct e.code, ', ') into v_overlap
  from public.employees e
  join public.payroll_lines l on l.employee_id = e.id
  join public.payroll_runs r on r.id = l.run_id and r.status <> 'voided'
  where e.archived_at is null and e.status in ('active','on_leave')
    and (p_department_id is null or e.department_id = p_department_id)
    and r.period_start <= p_period_end and r.period_end >= p_period_start;
  if v_overlap is not null then
    raise exception 'Overlapping payroll already includes: %', left(v_overlap, 300) using errcode='23505';
  end if;
  insert into public.payroll_runs(id, payroll_number, department_id, period_start, period_end, pay_date, notes, idempotency_key, created_by)
  values (v_id, 'PR-' || to_char(p_period_end, 'YYYY') || '-' || lpad(nextval('public.payroll_number_seq')::text, 5, '0'),
    p_department_id, p_period_start, p_period_end, p_pay_date, coalesce(trim(p_notes),''), p_key, auth.uid());
  insert into public.payroll_lines(run_id, employee_id, employee_code, employee_name, department_id, days_worked, attendance_pay)
  select v_id, e.id, e.code, e.last_name || ', ' || e.first_name, e.department_id, a.days, a.pay
  from public.employees e
  cross join lateral private.payroll_attendance(e.id, p_period_start, p_period_end) a
  where e.archived_at is null and e.status in ('active','on_leave')
    and (p_department_id is null or e.department_id = p_department_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'No active employees for this payroll' using errcode='22023'; end if;
  return v_id;
end $$;

create function public.update_payroll_line(p_line_id uuid, p_other_earnings numeric, p_deductions numeric, p_notes text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_line public.payroll_lines;
begin
  if not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Payroll access required' using errcode='42501';
  end if;
  if p_other_earnings is null or p_deductions is null or p_other_earnings < 0 or p_deductions < 0
    or p_other_earnings >= 10000000 or p_deductions >= 10000000
    or p_other_earnings <> round(p_other_earnings, 2) or p_deductions <> round(p_deductions, 2)
    or char_length(coalesce(p_notes,'')) > 300 then
    raise exception 'Invalid payroll amounts' using errcode='22023';
  end if;
  select l.* into v_line from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
  where l.id = p_line_id for update of l, r;
  if not found then raise exception 'Payroll line is unavailable' using errcode='22023'; end if;
  if (select status from public.payroll_runs where id = v_line.run_id) <> 'draft' then
    raise exception 'Only a draft payroll can be edited' using errcode='55000';
  end if;
  if v_line.attendance_pay + p_other_earnings - p_deductions < 0 then
    raise exception 'Deductions cannot exceed gross pay' using errcode='22023';
  end if;
  update public.payroll_lines set other_earnings = p_other_earnings, deductions = p_deductions,
    notes = coalesce(trim(p_notes),''), updated_at = now() where id = p_line_id;
end $$;

create function public.finalize_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_run public.payroll_runs;
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll is unavailable' using errcode='22023'; end if;
  if v_run.status = 'finalized' then return; end if;
  if v_run.status <> 'draft' then raise exception 'Only a draft payroll can be finalized' using errcode='55000'; end if;
  -- Lock in the attendance posted up to now.
  update public.payroll_lines l set (days_worked, attendance_pay) =
    (select a.days, a.pay from private.payroll_attendance(l.employee_id, v_run.period_start, v_run.period_end) a),
    updated_at = now()
  where l.run_id = p_run_id;
  if exists (select 1 from public.payroll_lines where run_id = p_run_id and net_pay < 0) then
    raise exception 'Deductions cannot exceed gross pay' using errcode='22023';
  end if;
  update public.payroll_runs set status = 'finalized', finalized_by = auth.uid(), finalized_at = now() where id = p_run_id;
end $$;

create function public.mark_payroll_paid(p_run_id uuid, p_paid_on date, p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare v_run public.payroll_runs;
begin
  if not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Payroll access required' using errcode='42501';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Manila')::date
    or p_reference is null or char_length(trim(p_reference)) not between 2 and 120 then
    raise exception 'Enter the payment date and reference' using errcode='22023';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll is unavailable' using errcode='22023'; end if;
  if v_run.status = 'paid' and v_run.paid_on = p_paid_on and v_run.payment_reference = trim(p_reference) then return; end if;
  if v_run.status <> 'finalized' then raise exception 'Finalize the payroll before marking it paid' using errcode='55000'; end if;
  update public.payroll_runs set status = 'paid', paid_by = auth.uid(), paid_on = p_paid_on, payment_reference = trim(p_reference)
  where id = p_run_id;
end $$;

create function public.void_payroll_run(p_run_id uuid, p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Enter a reason' using errcode='22023';
  end if;
  update public.payroll_runs set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = trim(p_reason)
  where id = p_run_id and status <> 'voided';
  if not found then raise exception 'Payroll is already voided or unavailable' using errcode='55000'; end if;
end $$;

revoke all on function public.save_department(uuid,text), public.set_employee_department(uuid,uuid),
  public.create_payroll_run(uuid,uuid,date,date,date,text), public.update_payroll_line(uuid,numeric,numeric,text),
  public.finalize_payroll_run(uuid), public.mark_payroll_paid(uuid,date,text), public.void_payroll_run(uuid,text)
  from public, anon;
grant execute on function public.save_department(uuid,text), public.set_employee_department(uuid,uuid),
  public.create_payroll_run(uuid,uuid,date,date,date,text), public.update_payroll_line(uuid,numeric,numeric,text),
  public.finalize_payroll_run(uuid), public.mark_payroll_paid(uuid,date,text), public.void_payroll_run(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
commit;

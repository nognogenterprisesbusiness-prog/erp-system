-- Attendance is posted per employee/project/day. Historical rate snapshots are
-- independent from later rate changes; this is project cost, not payroll.
create table public.project_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  assignment_id uuid not null references public.employee_project_assignments(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null references public.project_sites(id) on delete restrict,
  work_date date not null,
  attendance_status text not null check (attendance_status in ('present','absent')),
  hours_worked numeric(6,2) not null check (hours_worked between 0 and 24),
  billable_units numeric(8,4) not null check (billable_units >= 0),
  rate_id uuid references public.labor_rates(id) on delete restrict,
  rate_type public.labor_rate_type,
  rate_snapshot numeric(18,2),
  cost_total numeric(18,2) not null check (cost_total >= 0),
  note text not null check (char_length(trim(note)) between 3 and 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint project_attendance_cost_shape check (
    (attendance_status = 'absent' and hours_worked = 0 and billable_units = 0
      and rate_id is null and rate_type is null and rate_snapshot is null and cost_total = 0)
    or (attendance_status = 'present' and hours_worked > 0 and billable_units > 0
      and rate_id is not null and rate_type is not null and rate_snapshot > 0)
  )
);
create index project_attendance_project_date_idx on public.project_attendance(project_id, work_date desc);
create index project_attendance_employee_date_idx on public.project_attendance(employee_id, work_date);

create table public.project_attendance_reversals (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null unique references public.project_attendance(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);

alter table public.project_attendance enable row level security;
alter table public.project_attendance_reversals enable row level security;
revoke all on public.project_attendance, public.project_attendance_reversals from public, anon, authenticated;
grant select on public.project_attendance, public.project_attendance_reversals to authenticated;
create policy project_attendance_finance_read on public.project_attendance for select to authenticated
using ((select private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])));
create policy project_attendance_reversals_finance_read on public.project_attendance_reversals for select to authenticated
using ((select private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])));
create trigger project_attendance_audit after insert on public.project_attendance
for each row execute function private.audit_row_change();
create trigger project_attendance_reversals_audit after insert on public.project_attendance_reversals
for each row execute function private.audit_row_change();

create function public.post_project_attendance(
  p_idempotency_key uuid, p_assignment_id uuid, p_work_date date,
  p_status text, p_hours numeric, p_rate_type public.labor_rate_type,
  p_day_fraction numeric, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.project_attendance;
  v_assignment public.employee_project_assignments;
  v_employee public.employees;
  v_rate public.labor_rates;
  v_billable numeric(8,4);
  v_hours numeric(6,2);
  v_cost numeric(18,2);
  v_id uuid := gen_random_uuid();
  v_other_hours numeric(6,2);
begin
  if v_actor is null or not private.has_any_role(array['super_admin','owner','admin']::public.app_role[]) then
    raise exception 'Only an administrator can post project attendance cost' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_assignment_id is null or p_work_date is null
    or p_status not in ('present','absent')
    or char_length(trim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Invalid attendance details' using errcode = '22023';
  end if;
  if (p_status = 'absent' and (coalesce(p_hours, 0) <> 0 or coalesce(p_day_fraction, 0) <> 0 or p_rate_type is not null))
    or (p_status = 'present' and (p_hours is null or p_hours <= 0 or p_hours > 24
      or p_hours <> round(p_hours, 2) or p_rate_type is null)) then
    raise exception 'Invalid attendance hours or rate type' using errcode = '22023';
  end if;
  if p_status = 'present' and p_rate_type = 'daily'
    and (p_day_fraction is null or p_day_fraction <= 0 or p_day_fraction > 1 or p_day_fraction <> round(p_day_fraction, 4)) then
    raise exception 'Enter an explicit fraction of a paid day' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('assignment', p_assignment_id, 'date', p_work_date,
    'status', p_status, 'hours', p_hours, 'rate_type', p_rate_type,
    'day_fraction', p_day_fraction, 'note', trim(p_note));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_attendance where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another attendance record' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_assignment from public.employee_project_assignments where id = p_assignment_id;
  if v_assignment.id is null or p_work_date < v_assignment.start_date
    or (v_assignment.end_date is not null and p_work_date > v_assignment.end_date) then
    raise exception 'Employee was not assigned to the project on this date' using errcode = '22023';
  end if;
  select * into v_employee from public.employees where id = v_assignment.employee_id for update;
  if v_employee.id is null or p_work_date < v_employee.hire_date then
    raise exception 'Employee was not hired on this date' using errcode = '22023';
  end if;
  if exists(select 1 from public.project_attendance a
    left join public.project_attendance_reversals r on r.attendance_id = a.id
    where a.employee_id = v_employee.id and a.project_id = v_assignment.project_id
      and a.work_date = p_work_date and r.id is null) then
    raise exception 'Attendance already posted for employee, project and date' using errcode = '23505';
  end if;
  v_hours := case when p_status = 'present' then p_hours else 0 end;
  select coalesce(sum(a.hours_worked), 0) into v_other_hours from public.project_attendance a
  left join public.project_attendance_reversals r on r.attendance_id = a.id
  where a.employee_id = v_employee.id and a.work_date = p_work_date and r.id is null;
  if v_other_hours + v_hours > 24 then
    raise exception 'Employee hours exceed 24 for this date' using errcode = '22023';
  end if;
  if p_status = 'present' then
    select * into v_rate from public.labor_rates where employee_id = v_employee.id
      and rate_type = p_rate_type and effective_start_date <= p_work_date
      and (effective_end_date is null or effective_end_date >= p_work_date)
    order by effective_start_date desc limit 1;
    if v_rate.id is null then
      raise exception 'No approved labor rate for this employee and date' using errcode = '22023';
    end if;
    v_billable := case when p_rate_type = 'hourly' then p_hours else p_day_fraction end;
    v_cost := round(v_billable * v_rate.rate_amount, 2);
  else
    v_billable := 0; v_cost := 0;
  end if;
  insert into public.project_attendance (id, employee_id, assignment_id, project_id, project_site_id,
    work_date, attendance_status, hours_worked, billable_units, rate_id, rate_type, rate_snapshot,
    cost_total, note, recorded_by, idempotency_key, command_payload)
  values (v_id, v_employee.id, v_assignment.id, v_assignment.project_id, v_assignment.project_site_id,
    p_work_date, p_status, v_hours, v_billable, v_rate.id, v_rate.rate_type, v_rate.rate_amount,
    v_cost, trim(p_note), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.reverse_project_attendance(p_idempotency_key uuid, p_attendance_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.project_attendance_reversals;
  v_attendance public.project_attendance;
  v_payload jsonb;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['super_admin','owner','admin']::public.app_role[]) then
    raise exception 'Only an administrator can reverse attendance' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_attendance_id is null
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A reversal reason is required' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('attendance', p_attendance_id, 'reason', trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_attendance_reversals where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.reversed_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another reversal' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_attendance from public.project_attendance where id = p_attendance_id;
  if v_attendance.id is null then raise exception 'Attendance record not found' using errcode = '22023'; end if;
  perform 1 from public.employees where id = v_attendance.employee_id for update;
  if exists(select 1 from public.project_attendance_reversals where attendance_id = p_attendance_id) then
    raise exception 'Attendance already reversed' using errcode = '23505';
  end if;
  insert into public.project_attendance_reversals (id, attendance_id, reason, reversed_by, idempotency_key, command_payload)
  values (v_id, p_attendance_id, trim(p_reason), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.get_project_labor_cost(p_project_id uuid)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v_total numeric;
begin
  if (select auth.uid()) is null or not (
    private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])
    or (private.has_any_role(array['project_manager']::public.app_role[]) and private.can_access_project(p_project_id))
  ) then
    raise exception 'Not authorized to view project labor cost' using errcode = '42501';
  end if;
  select coalesce(sum(a.cost_total), 0) into v_total from public.project_attendance a
  left join public.project_attendance_reversals r on r.attendance_id = a.id
  where a.project_id = p_project_id and r.id is null;
  return v_total;
end;
$$;

revoke execute on function public.post_project_attendance(uuid,uuid,date,text,numeric,public.labor_rate_type,numeric,text) from public, anon;
revoke execute on function public.reverse_project_attendance(uuid,uuid,text) from public, anon;
revoke execute on function public.get_project_labor_cost(uuid) from public, anon;
grant execute on function public.post_project_attendance(uuid,uuid,date,text,numeric,public.labor_rate_type,numeric,text) to authenticated;
grant execute on function public.reverse_project_attendance(uuid,uuid,text) to authenticated;
grant execute on function public.get_project_labor_cost(uuid) to authenticated;

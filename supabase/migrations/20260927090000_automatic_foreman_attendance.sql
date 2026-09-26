create function private.can_record_project_attendance(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(array['admin']::public.app_role[]) or
    (private.has_any_role(array['foreman']::public.app_role[]) and exists (
      select 1 from public.project_assignments pa
      where pa.project_id = p_project_id and pa.user_id = auth.uid()
        and pa.assignment_role = 'foreman' and pa.status = 'active'
    ))
$$;
revoke all on function private.can_record_project_attendance(uuid) from public, anon;
grant execute on function private.can_record_project_attendance(uuid) to authenticated;

create table public.employee_attendance_basis (
  id uuid not null unique default gen_random_uuid(),
  employee_id uuid primary key references public.employees(id) on delete restrict,
  rate_type public.labor_rate_type not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.employee_attendance_basis enable row level security;
revoke all on public.employee_attendance_basis from public, anon, authenticated;
grant select on public.employee_attendance_basis to authenticated;
create policy attendance_basis_admin_read on public.employee_attendance_basis for select to authenticated
using (private.has_any_role(array['admin']::public.app_role[]));
create trigger attendance_basis_audit after insert or update on public.employee_attendance_basis
for each row execute function private.audit_row_change();

create function public.set_employee_attendance_basis(p_employee_id uuid, p_rate_type public.labor_rate_type)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can configure attendance costing' using errcode = '42501';
  end if;
  if p_rate_type is null then raise exception 'Choose a costing basis' using errcode = '22023'; end if;
  perform 1 from public.employees where id = p_employee_id for update;
  if not found then raise exception 'Employee not found'; end if;
  insert into public.employee_attendance_basis(employee_id, rate_type, updated_by)
  values(p_employee_id,p_rate_type,auth.uid())
  on conflict(employee_id) do update set rate_type=excluded.rate_type,updated_by=excluded.updated_by,updated_at=now();
end;
$$;

create function public.get_attendance_rate_basis(p_employee_id uuid, p_work_date date)
returns public.labor_rate_type language plpgsql stable security definer set search_path = '' as $$
declare v_basis public.labor_rate_type; v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.employee_project_assignments a where a.employee_id=p_employee_id
    and private.can_record_project_attendance(a.project_id)
  ) and not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized for employee' using errcode = '42501';
  end if;
  select rate_type into v_basis from public.employee_attendance_basis where employee_id=p_employee_id;
  if v_basis is null then
    select count(distinct rate_type), min(rate_type::text)::public.labor_rate_type into v_count,v_basis
    from public.labor_rates where employee_id=p_employee_id and effective_start_date<=p_work_date
      and (effective_end_date is null or effective_end_date>=p_work_date);
    if v_count<>1 then raise exception 'Admin must configure attendance costing basis' using errcode = '22023'; end if;
  end if;
  return v_basis;
end;
$$;
revoke all on function public.set_employee_attendance_basis(uuid,public.labor_rate_type),public.get_attendance_rate_basis(uuid,date) from public,anon;
grant execute on function public.set_employee_attendance_basis(uuid,public.labor_rate_type),public.get_attendance_rate_basis(uuid,date) to authenticated;

create function public.get_project_attendance_operations(p_project_id uuid, p_offset integer default 0, p_limit integer default 20)
returns table(id uuid,employee_id uuid,assignment_id uuid,project_id uuid,project_site_id uuid,
  work_date date,attendance_status text,hours_worked numeric,note text,created_at timestamptz,
  reversed boolean,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_record_project_attendance(p_project_id) then
    raise exception 'Not authorized for attendance' using errcode = '42501';
  end if;
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid pagination'; end if;
  return query select a.id,a.employee_id,a.assignment_id,a.project_id,a.project_site_id,a.work_date,
    a.attendance_status,a.hours_worked,a.note,a.created_at,
    exists(select 1 from public.project_attendance_reversals r where r.attendance_id=a.id),count(*) over()
  from public.project_attendance a where a.project_id=p_project_id
  order by a.work_date desc,a.id desc offset p_offset limit p_limit;
end;
$$;
revoke all on function public.get_project_attendance_operations(uuid,integer,integer) from public,anon;
grant execute on function public.get_project_attendance_operations(uuid,integer,integer) to authenticated;

create function private.guard_consumable_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.material_kind='reusable' then
    raise exception 'Legacy reusable materials are read-only; reconcile stock before registering Equipment' using errcode='22023';
  end if;
  if new.material_kind<>'consumable' then
    raise exception 'Register reusable tools in Equipment' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger materials_consumable_catalog before insert or update on public.materials
for each row execute function private.guard_consumable_catalog();
revoke all on function private.guard_consumable_catalog() from public,anon,authenticated;
create or replace function public.post_project_attendance(
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
  if v_actor is null or not private.has_any_role(array['admin','foreman']::public.app_role[]) then
    raise exception 'Only an administrator or assigned foreman can record attendance' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_assignment_id is null or p_work_date is null
    or p_status is null or p_status not in ('present','absent')
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
    if not private.can_record_project_attendance(v_existing.project_id) then
      raise exception 'Not authorized for this project' using errcode = '42501';
    end if;
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another attendance record' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_assignment from public.employee_project_assignments where id = p_assignment_id for update;
  if v_assignment.id is not null and not private.can_record_project_attendance(v_assignment.project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501';
  end if;
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
    if p_rate_type is distinct from public.get_attendance_rate_basis(v_employee.id, p_work_date) then
      raise exception 'Attendance rate basis must match the administrator configured basis' using errcode = '22023';
    end if;
    if p_rate_type = 'daily' and p_day_fraction not in (0.5,1) then
      raise exception 'Choose a full or half paid day' using errcode = '22023';
    end if;
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

-- HR manages workforce records and prepares payroll; it is not a Finance or Admin role.
begin;
create or replace function private.can_manage_workforce()
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_any_role(array['admin','hr']::public.app_role[])
$$;


CREATE OR REPLACE FUNCTION public.post_labor_rate(p_employee_id uuid, p_rate_type public.labor_rate_type, p_rate_amount numeric, p_effective_start_date date, p_effective_end_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_rate_amount <= 0 or (p_effective_end_date is not null and p_effective_end_date < p_effective_start_date) then
    raise exception 'invalid labor rate values' using errcode = '22023';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and archived_at is null) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text || ':' || p_rate_type::text, 0));
  insert into public.labor_rates (
    employee_id, rate_type, rate_amount, effective_start_date, effective_end_date, approved_by
  ) values (
    p_employee_id, p_rate_type, p_rate_amount, p_effective_start_date, p_effective_end_date, v_actor
  ) returning id into v_id;
  perform private.record_employee_event(p_employee_id, 'rate_added', null, null, 'Labor rate version added', '{}'::jsonb, v_actor);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_labor_rate(p_rate_id uuid, p_effective_end_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := (select auth.uid()); v_rate public.labor_rates;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_rate from public.labor_rates where id = p_rate_id and effective_end_date is null for update;
  if v_rate.id is null then raise exception 'open labor rate not found' using errcode = 'P0002'; end if;
  if p_effective_end_date < v_rate.effective_start_date then raise exception 'labor rate end date precedes start date' using errcode = '22023'; end if;
  update public.labor_rates set effective_end_date = p_effective_end_date where id = p_rate_id;
  perform private.record_employee_event(v_rate.employee_id, 'rate_closed', null, null, 'Labor rate version closed', '{}'::jsonb, v_actor);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_employee(p_id uuid, p_code text, p_first_name text, p_middle_name text, p_last_name text, p_contact_number text, p_category_id uuid, p_employment_type text, p_status public.employee_status, p_hire_date date, p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.employees;
  v_event public.employee_event_type;
  v_linked_profile uuid;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not private.has_any_role(array['admin']::public.app_role[]) then
    select profile_id into v_linked_profile from public.employees where id=p_id for update;
    if p_profile_id is distinct from v_linked_profile then
      raise exception 'Only Admin can link employee accounts' using errcode='42501';
    end if;
  end if;
  if p_status = 'separated' then raise exception 'use the archive workflow to separate an employee' using errcode = '22023'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$'
    or char_length(trim(p_first_name)) not between 2 and 80
    or char_length(trim(p_last_name)) not between 2 and 80
    or char_length(trim(p_contact_number)) not between 7 and 40
    or trim(p_contact_number) !~ '^[0-9+() .-]+$'
    or char_length(trim(p_employment_type)) not between 2 and 80
  then raise exception 'invalid employee values' using errcode = '22023'; end if;
  if not exists (select 1 from public.employee_categories where id = p_category_id and archived_at is null) then
    raise exception 'employee category is missing or archived' using errcode = '22023';
  end if;
  if p_profile_id is not null and not exists (select 1 from public.profiles where id = p_profile_id and is_active) then
    raise exception 'linked user account is unavailable' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.employees (
      code, first_name, middle_name, last_name, category_id, employment_type, status,
      hire_date, profile_id, created_by, updated_by
    ) values (
      trim(p_code), trim(p_first_name), nullif(trim(p_middle_name), ''), trim(p_last_name), p_category_id,
      trim(p_employment_type), p_status, p_hire_date, p_profile_id, v_actor, v_actor
    ) returning id into v_id;
    insert into public.employee_private_contacts (employee_id, contact_number, updated_by)
    values (v_id, trim(p_contact_number), v_actor);
    perform private.record_employee_event(v_id, 'registered', null, p_status, 'Employee registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.employees where id = p_id and archived_at is null for update;
    if v_old.id is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    update public.employees set
      code = trim(p_code), first_name = trim(p_first_name), middle_name = nullif(trim(p_middle_name), ''),
      last_name = trim(p_last_name), category_id = p_category_id, employment_type = trim(p_employment_type),
      status = p_status, hire_date = p_hire_date, profile_id = p_profile_id, updated_by = v_actor
    where id = p_id;
    update public.employee_private_contacts
    set contact_number = trim(p_contact_number), updated_by = v_actor, updated_at = now()
    where employee_id = p_id;
    if not found then
      insert into public.employee_private_contacts (employee_id, contact_number, updated_by)
      values (p_id, trim(p_contact_number), v_actor);
    end if;
    v_id := p_id;
    v_event := case
      when v_old.status <> p_status then 'status_changed'
      when v_old.profile_id is distinct from p_profile_id then 'profile_linked'
      else 'details_updated'
    end;
    perform private.record_employee_event(v_id, v_event, v_old.status, p_status, 'Employee record updated', jsonb_build_object('code', trim(p_code)), v_actor);
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_department(p_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not private.has_any_role(array['admin','hr']::public.app_role[]) then
    raise exception 'Employee management access required' using errcode='42501';
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
end $function$;

CREATE OR REPLACE FUNCTION public.set_employee_department(p_employee_id uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.has_any_role(array['admin','hr']::public.app_role[]) then
    raise exception 'Employee management access required' using errcode='42501';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id = p_department_id and archived_at is null) then
    raise exception 'Choose an active department' using errcode='22023';
  end if;
  update public.employees set department_id = p_department_id, updated_by = auth.uid(), updated_at = now()
  where id = p_employee_id and archived_at is null;
  if not found then raise exception 'Employee is unavailable' using errcode='22023'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.replace_employee_id_card(p_employee_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.has_any_role(array['admin','hr']::public.app_role[]) then
    raise exception 'Employee management access required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Enter a reason of 3 to 500 characters' using errcode = '22023';
  end if;
  perform 1 from public.employees where id = p_employee_id and archived_at is null for update;
  if not found then raise exception 'Employee not found' using errcode = '22023'; end if;
  update public.employee_id_cards set status = 'replaced', replaced_at = now(), replaced_by = v_actor,
    replace_reason = trim(p_reason)
  where employee_id = p_employee_id and status = 'active';
  insert into public.employee_id_cards (employee_id, issued_by) values (p_employee_id, v_actor) returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_payroll_run(p_key uuid, p_department_id uuid, p_period_start date, p_period_end date, p_pay_date date, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_run public.payroll_runs; v_id uuid := gen_random_uuid(); v_overlap text; v_count integer;
begin
  if not private.has_any_role(array['admin','finance','hr']::public.app_role[]) then
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
end $function$;

CREATE OR REPLACE FUNCTION public.update_payroll_line(p_line_id uuid, p_other_earnings numeric, p_deductions numeric, p_notes text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_line public.payroll_lines;
begin
  if not private.has_any_role(array['admin','finance','hr']::public.app_role[]) then
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_payroll_totals(p_run_ids uuid[])
 RETURNS TABLE(run_id uuid, employee_count bigint, gross numeric, deductions numeric, net numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.has_any_role(array['admin','finance','hr']::public.app_role[]) then raise exception 'Payroll access required' using errcode='42501'; end if;
 return query select l.run_id,count(*),coalesce(sum(l.attendance_pay+l.other_earnings),0),coalesce(sum(l.deductions),0),coalesce(sum(l.net_pay),0) from public.payroll_lines l where l.run_id=any(p_run_ids) group by l.run_id;
end $function$;

CREATE OR REPLACE FUNCTION public.search_attendance_overview(p_date date, p_project_id uuid DEFAULT NULL::uuid, p_query text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if not private.has_any_role(array['admin','finance','hr']::public.app_role[]) then raise exception 'Attendance access required' using errcode='42501'; end if;
 if p_date is null or p_page<1 or p_page>1000000 or p_status not in ('all','present','absent','unmarked') or length(coalesce(p_query,''))>100 then raise exception 'Invalid attendance filters' using errcode='22023'; end if;
 with scoped as (
 select a.id,a.position_title,a.project_id,
 jsonb_build_object('code',e.code,'first_name',e.first_name,'last_name',e.last_name) as employee,
 jsonb_build_object('code',p.code,'name',p.name) as project,
 jsonb_build_object('name',s.name) as site,
 case when t.id is null then null else jsonb_build_object('attendance_status',t.attendance_status,'hours_worked',t.hours_worked,'rate_snapshot',t.rate_snapshot,'cost_total',t.cost_total) end as attendance,
 coalesce(t.attendance_status::text,'unmarked') as status,e.last_name,e.first_name
 from public.employee_project_assignments a join public.employees e on e.id=a.employee_id join public.projects p on p.id=a.project_id join public.project_sites s on s.id=a.project_site_id
 left join lateral (select x.* from public.project_attendance x where x.assignment_id=a.id and x.work_date=p_date and not exists(select 1 from public.project_attendance_reversals r where r.attendance_id=x.id) order by x.created_at desc,x.id limit 1) t on true
 where a.start_date<=p_date and (a.end_date is null or a.end_date>=p_date) and (p_project_id is null or a.project_id=p_project_id)
 and (coalesce(trim(p_query),'')='' or strpos(lower(concat_ws(' ',e.code,e.first_name,e.last_name,a.position_title,p.name,s.name)),lower(trim(p_query)))>0)
 ), matched as (select * from scoped where p_status='all' or status=p_status), page as (select * from matched order by last_name,first_name,id limit 25 offset ((p_page-1)*25))
 select jsonb_build_object('count',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'status'-'last_name'-'first_name') from page),'[]'::jsonb)) into v_result;
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION private.can_read_attendance_photo(p_project uuid, p_site uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (private.has_any_role(array['admin','hr']::public.app_role[])
    or private.mobile_site_role(p_project,p_site,'foreman'));
$function$;

create policy employees_hr_read on public.employees for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy employee_categories_hr_read on public.employee_categories for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy employee_private_contacts_hr_read on public.employee_private_contacts for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy employee_project_assignments_hr_read on public.employee_project_assignments for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy employee_events_hr_read on public.employee_events for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy labor_rates_hr_read on public.labor_rates for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy departments_hr_read on public.departments for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy payroll_runs_hr_read on public.payroll_runs for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy payroll_lines_hr_read on public.payroll_lines for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy project_attendance_hr_read on public.project_attendance for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy project_attendance_reversals_hr_read on public.project_attendance_reversals for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy employee_id_cards_hr_read on public.employee_id_cards for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));

create policy attendance_scans_hr_read on public.attendance_scans for select to authenticated using ((select private.has_any_role(array['hr']::public.app_role[])));


-- Return names and identifiers needed for staffing without granting access to project contracts or finances.
create function public.get_hr_workforce_references(p_kind text,p_ids uuid[] default null,p_query text default '',p_project_id uuid default null,p_offset integer default 0,p_limit integer default 100)
returns table(id uuid,name text,code text,project_id uuid,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_any_role(array['admin','hr']::public.app_role[]) then raise exception 'HR access required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('project','site','actor') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 or length(coalesce(p_query,''))>100 or cardinality(p_ids)>1000 or (p_kind='actor' and p_ids is null) then raise exception 'Invalid workforce reference filters' using errcode='22023'; end if;
 if p_kind='project' then
  return query select p.id,p.name,p.code,null::uuid,count(*) over() from public.projects p
  where (p_ids is null or p.id=any(p_ids)) and (p_ids is not null or (p.archived_at is null and p.status not in ('completed','cancelled')))
   and (coalesce(trim(p_query),'')='' or strpos(lower(p.name||' '||p.code),lower(trim(p_query)))>0)
  order by p.name,p.id limit p_limit offset p_offset;
 elsif p_kind='site' then
  return query select s.id,s.name,null::text,s.project_id,count(*) over() from public.project_sites s
  where (p_ids is null or s.id=any(p_ids)) and (p_ids is not null or s.status='active') and (p_project_id is null or s.project_id=p_project_id)
   and (coalesce(trim(p_query),'')='' or strpos(lower(s.name),lower(trim(p_query)))>0)
  order by s.name,s.id limit p_limit offset p_offset;
 else
  return query select p.id,p.full_name,null::text,null::uuid,count(*) over() from public.profiles p
  where p.id=any(p_ids) and (exists(select 1 from public.employee_events e where e.actor_id=p.id)
   or exists(select 1 from public.employee_project_assignments a where a.assigned_by=p.id or a.ended_by=p.id)
   or exists(select 1 from public.labor_rates r where r.approved_by=p.id)
   or exists(select 1 from public.employees e where e.profile_id=p.id))
  order by p.full_name,p.id limit p_limit offset p_offset;
 end if;
end $$;
revoke all on function public.get_hr_workforce_references(text,uuid[],text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_hr_workforce_references(text,uuid[],text,uuid,integer,integer) to authenticated;
commit;

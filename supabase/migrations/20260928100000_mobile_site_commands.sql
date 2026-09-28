-- Mobile operational views never expose payroll, rates, budgets or costs.
create table private.mobile_api_limits (
  actor uuid not null references public.profiles(id) on delete cascade,
  is_write boolean not null, minute bigint not null, hits integer not null,
  primary key(actor,is_write)
);
revoke all on private.mobile_api_limits from public,anon,authenticated;
create function public.guard_mobile_api(p_write boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_minute bigint:=floor(extract(epoch from now())/60); v_hits integer;
begin
  if auth.uid() is null or not private.has_any_role(array['foreman','engineer']::public.app_role[]) then
    raise exception 'Not authorized for mobile' using errcode='42501';
  end if;
  insert into private.mobile_api_limits(actor,is_write,minute,hits) values(auth.uid(),p_write,v_minute,1)
  on conflict(actor,is_write) do update set minute=excluded.minute,
    hits=case when mobile_api_limits.minute=excluded.minute then mobile_api_limits.hits+1 else 1 end
  returning hits into v_hits;
  return v_hits<=case when p_write then 30 else 180 end;
end;
$$;
revoke all on function public.guard_mobile_api(boolean) from public,anon;
grant execute on function public.guard_mobile_api(boolean) to authenticated;

create function private.can_view_mobile_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(array['admin']::public.app_role[]) or exists (
    select 1 from public.project_assignments a join public.profiles p on p.id=a.user_id
    join public.user_roles r on r.user_id=a.user_id and r.role::text=a.assignment_role::text
    where a.project_id=p_project_id and a.user_id=auth.uid() and a.status='active'
      and p.is_active and r.role in ('engineer','foreman')
  ) or exists (
    select 1 from public.project_sites s
    join public.profiles p on p.id=auth.uid() and p.is_active
    join public.user_roles r on r.user_id=p.id
    where s.project_id=p_project_id and s.status='active'
      and ((s.foreman_id=p.id and r.role='foreman') or (s.engineer_id=p.id and r.role='engineer'))
  )
$$;
revoke all on function private.can_view_mobile_project(uuid) from public,anon;
grant execute on function private.can_view_mobile_project(uuid) to authenticated;

create function private.can_view_mobile_site(p_project_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.project_sites s
    join public.projects project on project.id=s.project_id and project.archived_at is null
    join public.profiles p on p.id=auth.uid() and p.is_active
    where s.id=p_site_id and s.project_id=p_project_id and s.status='active'
      and (private.has_any_role(array['admin']::public.app_role[]) or exists (
        select 1 from public.user_roles r where r.user_id=p.id
          and ((s.foreman_id=p.id and r.role='foreman') or (s.engineer_id=p.id and r.role='engineer'))
      ) or exists (
        select 1 from public.project_assignments a join public.user_roles r on r.user_id=a.user_id
          and r.role::text=a.assignment_role::text
        where a.project_id=p_project_id and a.user_id=p.id and a.status='active'
          and a.assignment_role in ('foreman','engineer')
      ))
  )
$$;
revoke all on function private.can_view_mobile_site(uuid,uuid) from public,anon;
grant execute on function private.can_view_mobile_site(uuid,uuid) to authenticated;

create function private.mobile_site_role(p_project_id uuid,p_site_id uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_view_mobile_site(p_project_id,p_site_id) and (
    private.has_any_role(array['admin']::public.app_role[]) or exists (
      select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text=p_role
        and (exists (select 1 from public.project_assignments a
          where a.project_id=p_project_id and a.user_id=r.user_id and a.status='active' and a.assignment_role::text=p_role)
          or exists (select 1 from public.project_sites s where s.id=p_site_id
            and ((p_role='foreman' and s.foreman_id=r.user_id) or (p_role='engineer' and s.engineer_id=r.user_id))))
    )
  )
$$;
revoke all on function private.mobile_site_role(uuid,uuid,text) from public,anon;
grant execute on function private.mobile_site_role(uuid,uuid,text) to authenticated;

create function public.get_mobile_projects(p_search text default '',p_id uuid default null,p_offset integer default 0,p_limit integer default 20)
returns table(record jsonb,total_count bigint) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then
    raise exception 'Invalid project query' using errcode='22023';
  end if;
  return query select jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'status',p.status,
    'start_date',p.start_date,'target_completion_date',p.target_completion_date,'photo_path',p.photo_path,
    'progress',g.completion_percent,'assignment_role',a.assignment_role,'address',p.address,'description',p.description,
    'site_permissions',case when p_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',s.id,
      'can_record',private.mobile_site_role(p.id,s.id,'foreman'),
      'can_review',private.mobile_site_role(p.id,s.id,'engineer')) order by s.id)
      from public.project_sites s where s.project_id=p.id and private.can_view_mobile_site(p.id,s.id)),'[]'::jsonb) end),count(*) over()
  from public.projects p join lateral (
    select scope.assignment_role from (
      select x.assignment_role::text as assignment_role from public.project_assignments x
      join public.user_roles r on r.user_id=x.user_id and r.role::text=x.assignment_role::text
      where x.project_id=p.id and x.user_id=auth.uid() and x.status='active'
        and x.assignment_role in ('foreman','engineer')
      union
      select r.role::text from public.project_sites s join public.user_roles r on r.user_id=auth.uid()
      where s.project_id=p.id and s.status='active'
        and ((s.foreman_id=auth.uid() and r.role='foreman') or (s.engineer_id=auth.uid() and r.role='engineer'))
    ) scope order by (scope.assignment_role='foreman') desc limit 1
  ) a on true
  left join lateral (select x.completion_percent from public.project_progress_entries x where x.project_id=p.id
    and private.can_view_mobile_site(p.id,x.project_site_id)
    order by x.progress_date desc,x.recorded_at desc,x.id desc limit 1) g on true
  where p.archived_at is null and private.can_view_mobile_project(p.id) and (p_id is null or p.id=p_id)
    and position(lower(coalesce(p_search,'')) in lower(concat(p.code,' ',p.name)))>0
  order by p.name,p.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.get_mobile_projects(text,uuid,integer,integer) from public,anon;
grant execute on function public.get_mobile_projects(text,uuid,integer,integer) to authenticated;

create function public.mark_mobile_notification_unread(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  update public.notifications set read_at=null where id=p_id and recipient_id=auth.uid()
    and (expires_at is null or expires_at>now()) and private.notification_scope_allowed(type_code,project_id,warehouse_id)
    returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.mark_mobile_notification_unread(uuid) from public,anon;
grant execute on function public.mark_mobile_notification_unread(uuid) to authenticated;

-- Adapt only site QR access; other registry rules stay in the existing resolver.
create function public.resolve_mobile_qr_code(p_identifier text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_code public.qr_codes; v_site public.project_sites; v_project_code text;
begin
  select * into v_code from public.qr_codes where public_identifier=p_identifier
    and status='active' and entity_type='project_site';
  if not found then return public.resolve_qr_code(p_identifier); end if;
  select * into v_site from public.project_sites where id=v_code.project_site_id;
  if not private.can_view_mobile_site(v_site.project_id,v_site.id) then
    raise exception 'Not authorized for site code' using errcode='42501';
  end if;
  select code into v_project_code from public.projects where id=v_site.project_id;
  return jsonb_build_object('entity_type','project_site','entity_id',v_site.id,
    'name',v_site.name,'code',v_project_code,'project_id',v_site.project_id);
end;
$$;
revoke all on function public.resolve_mobile_qr_code(text) from public,anon;
grant execute on function public.resolve_mobile_qr_code(text) to authenticated;

alter table public.equipment_requests add column submission_key uuid unique,
  add column submission_payload jsonb;
create function public.submit_equipment_request_once(
  p_key uuid,p_asset_id uuid,p_project_id uuid,p_site_id uuid,
  p_needed_on date,p_expected_return_on date,p_purpose text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_existing public.equipment_requests; v_id uuid;
begin
  if auth.uid() is null or not private.can_view_mobile_site(p_project_id,p_site_id) or p_key is null then
    raise exception 'Not authorized for equipment request' using errcode='42501';
  end if;
  v_payload:=jsonb_build_object('asset',p_asset_id,'project',p_project_id,'site',p_site_id,
    'needed',p_needed_on,'return',p_expected_return_on,'purpose',trim(p_purpose));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into v_existing from public.equipment_requests where submission_key=p_key;
  if found then
    if v_existing.requested_by<>auth.uid() or v_existing.submission_payload<>v_payload then
      raise exception 'Idempotency key already used' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  v_id:=public.submit_equipment_request(p_asset_id,p_project_id,p_site_id,p_needed_on,p_expected_return_on,p_purpose);
  update public.equipment_requests set submission_key=p_key,submission_payload=v_payload where id=v_id;
  return v_id;
end;
$$;

create function public.post_project_attendance_batch(p_project_id uuid,p_site_id uuid,p_work_date date,p_entries jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare v_entry jsonb; v_assignment public.employee_project_assignments;
  v_basis public.labor_rate_type; v_ids uuid[]:='{}'; v_id uuid;
begin
  if not private.can_record_project_attendance(p_project_id) or not private.mobile_site_role(p_project_id,p_site_id,'foreman') then
    raise exception 'Only assigned Foremen may record attendance' using errcode='42501';
  end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' then raise exception 'Invalid attendance batch' using errcode='22023'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 or p_work_date is null or p_site_id is null then
    raise exception 'Invalid attendance batch' using errcode='22023';
  end if;
  if (select count(distinct e->>'assignmentId') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries)
    or (select count(distinct e->>'idempotencyKey') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then
    raise exception 'Duplicate attendance entry' using errcode='22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) order by value->>'assignmentId' loop
    select * into v_assignment from public.employee_project_assignments where id=(v_entry->>'assignmentId')::uuid;
    if v_assignment.id is null or v_assignment.project_id<>p_project_id or v_assignment.project_site_id<>p_site_id then
      raise exception 'Worker is not assigned to this site' using errcode='42501';
    end if;
    v_basis:=case when v_entry->>'status'='absent' then null
      else public.get_attendance_rate_basis(v_assignment.employee_id,p_work_date) end;
    v_id:=public.post_project_attendance((v_entry->>'idempotencyKey')::uuid,v_assignment.id,p_work_date,
      v_entry->>'status',(v_entry->>'hours')::numeric,v_basis,
      case when v_basis='daily' then nullif(v_entry->>'dayFraction','')::numeric else null end,v_entry->>'note');
    v_ids:=array_append(v_ids,v_id);
  end loop;
  return v_ids;
end;
$$;

create function public.get_mobile_site_operations(p_kind text,p_project_id uuid,p_site_id uuid,
  p_date date default current_date,p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(record jsonb,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_view_mobile_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for project site' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  if p_kind='workers' then
    return query select jsonb_build_object('id',a.id,'employee_id',e.id,'name',concat(e.first_name,' ',e.last_name),
      'project_site_id',a.project_site_id,'basis',case when private.mobile_site_role(p_project_id,p_site_id,'foreman') then
        coalesce(b.rate_type,(select case when count(distinct r.rate_type)=1 then min(r.rate_type::text)::public.labor_rate_type end
          from public.labor_rates r where r.employee_id=e.id and r.effective_start_date<=p_date and (r.effective_end_date is null or r.effective_end_date>=p_date))) end),count(*) over()
    from public.employee_project_assignments a join public.employees e on e.id=a.employee_id
    left join public.employee_attendance_basis b on b.employee_id=e.id
    where a.project_id=p_project_id and a.project_site_id=p_site_id and a.start_date<=p_date
      and (a.end_date is null or a.end_date>=p_date) and e.archived_at is null and e.status='active'
      and position(lower(coalesce(p_search,'')) in lower(concat(e.first_name,' ',e.last_name,' ',e.code)))>0
    order by e.last_name,e.first_name,a.id offset p_offset limit p_limit;
  elsif p_kind='attendance' then
    return query select jsonb_build_object('id',a.id,'employee_id',e.id,'name',concat(e.first_name,' ',e.last_name),
      'project_site_id',a.project_site_id,'work_date',a.work_date,'attendance_status',a.attendance_status,
      'hours_worked',a.hours_worked,'note',a.note,'reversed',exists(select 1 from public.project_attendance_reversals r where r.attendance_id=a.id)),count(*) over()
    from public.project_attendance a join public.employees e on e.id=a.employee_id
    where a.project_id=p_project_id and a.project_site_id=p_site_id and a.work_date=p_date
      and position(lower(coalesce(p_search,'')) in lower(concat(e.first_name,' ',e.last_name)))>0
    order by e.last_name,a.id offset p_offset limit p_limit;
  elsif p_kind='equipment-history' then
    return query select jsonb_build_object('id',a.id,'name',a.asset_name,'date',a.use_date,
      'hours',a.hours_used,'note',a.work_note,'reversed',exists(select 1 from public.project_equipment_usage_reversals r where r.usage_id=a.id)),count(*) over()
    from public.project_equipment_usage a where a.project_id=p_project_id and a.project_site_id=p_site_id
      and position(lower(coalesce(p_search,'')) in lower(a.asset_name))>0
    order by a.use_date desc,a.id offset p_offset limit p_limit;
  elsif p_kind='equipment-options' then
    return query select jsonb_build_object('id',a.id,'code',a.code,'name',a.name),count(*) over()
    from public.assets a join public.asset_locations al on al.id=a.current_location_id and al.archived_at is null
    join public.inventory_locations location on location.id=al.inventory_location_id
    join public.projects project on project.id=p_project_id and project.status='active' and project.archived_at is null
    where a.asset_kind='equipment' and a.archived_at is null and a.status='available'
      and (location.project_site_id=p_site_id or exists (
        select 1 from public.project_warehouses pw join public.warehouses w on w.id=pw.warehouse_id and w.status='active'
        where pw.project_id=p_project_id and pw.warehouse_id=location.warehouse_id
      ))
      and not exists(select 1 from public.equipment_requests request where request.asset_id=a.id and request.status in ('approved','checked_out'))
      and position(lower(coalesce(p_search,'')) in lower(concat(a.code,' ',a.name)))>0
    order by a.name,a.id offset p_offset limit p_limit;
  else raise exception 'Unknown operational view' using errcode='22023'; end if;
end;
$$;
revoke all on function public.submit_equipment_request_once(uuid,uuid,uuid,uuid,date,date,text),
  public.post_project_attendance_batch(uuid,uuid,date,jsonb),
  public.get_mobile_site_operations(text,uuid,uuid,date,text,integer,integer) from public,anon;
grant execute on function public.submit_equipment_request_once(uuid,uuid,uuid,uuid,date,date,text),
  public.post_project_attendance_batch(uuid,uuid,date,jsonb),
  public.get_mobile_site_operations(text,uuid,uuid,date,text,integer,integer) to authenticated;

-- Lock the report while linking activity so submission cannot race an edit.
create function private.guard_report_activity_edit() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_report public.daily_reports; v_report_id uuid;
begin
  v_report_id:=case when tg_op='DELETE' then old.report_id else new.report_id end;
  select * into v_report from public.daily_reports where id=v_report_id for update;
  if v_report.id is null or auth.uid() is null or not private.can_view_mobile_site(v_report.project_id,v_report.project_site_id)
    or (v_report.prepared_by<>auth.uid() and not private.has_any_role(array['admin']::public.app_role[])) then
    raise exception 'Only the report preparer can edit linked activity' using errcode='42501';
  end if;
  if v_report.status<>'draft' then raise exception 'Only draft reports can change linked activity' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_report_activity_edit() from public,anon,authenticated;
create trigger report_activity_edit_guard before insert or delete on public.daily_report_resource_links
for each row execute function private.guard_report_activity_edit();

create function private.guard_foreman_usage_site() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not private.has_any_role(array['admin']::public.app_role[])
    and not private.mobile_site_role(new.project_id,new.project_site_id,'foreman') then
    raise exception 'Only the assigned site foreman may post hours' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_foreman_usage_site() from public,anon,authenticated;
create trigger mobile_attendance_site_role before insert on public.project_attendance
for each row execute function private.guard_foreman_usage_site();
create trigger mobile_equipment_site_role before insert on public.project_equipment_usage
for each row execute function private.guard_foreman_usage_site();

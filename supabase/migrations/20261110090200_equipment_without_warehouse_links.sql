-- Equipment requests use an active source warehouse, independently of project warehouse links.
begin;
create or replace function private.equipment_source_for_project(p_location_id uuid,p_project_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.projects p
    join public.project_sites target on target.project_id=p.id and target.id=p_site_id and target.status='active'
    join public.asset_locations al on al.id=p_location_id and al.archived_at is null
    join public.inventory_locations loc on loc.id=al.inventory_location_id
    left join public.warehouses w on w.id=loc.warehouse_id and w.status='active'
    where p.id=p_project_id and p.status='active' and p.archived_at is null
      and (w.id is not null or loc.project_site_id=target.id)
  );
$$;

create or replace function public.get_requestable_equipment(p_project_id uuid,p_project_site_id uuid)
returns table(asset_id uuid,asset_code text,asset_name text,asset_kind public.asset_kind)
language sql stable security definer set search_path='' as $$
  select a.id,a.code,a.name,a.asset_kind from public.assets a
  where auth.uid() is not null and not private.can_manage_assets()
    and private.has_any_role(array['engineer','foreman']::public.app_role[])
    and private.can_access_project_site(p_project_id,p_project_site_id)
    and a.archived_at is null and a.status='available'
    and private.equipment_source_for_project(a.current_location_id,p_project_id,p_project_site_id)
    and not exists(select 1 from public.equipment_requests r where r.asset_id=a.id and r.status in ('approved','checked_out'))
  order by a.code,a.id;
$$;
create or replace function public.get_mobile_site_operations(p_kind text,p_project_id uuid,p_site_id uuid,
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
    return query select jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'kind',a.asset_kind),count(*) over()
    from public.assets a join public.asset_locations al on al.id=a.current_location_id and al.archived_at is null
    join public.inventory_locations location on location.id=al.inventory_location_id
    join public.projects project on project.id=p_project_id and project.status='active' and project.archived_at is null
    where a.archived_at is null and a.status='available'
      and private.equipment_source_for_project(a.current_location_id,p_project_id,p_site_id)
      and not exists(select 1 from public.equipment_requests request where request.asset_id=a.id and request.status in ('approved','checked_out'))
      and position(lower(coalesce(p_search,'')) in lower(concat(a.code,' ',a.name)))>0
    order by a.name,a.id offset p_offset limit p_limit;
  else raise exception 'Unknown operational view' using errcode='22023'; end if;
end;
$$;
notify pgrst,'reload schema';
commit;

create function public.search_material_choices(p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,label text,unit_id uuid,total_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then raise exception 'Invalid search'; end if;
  return query select m.id,concat(m.code,' · ',m.name),m.base_unit_id,count(*) over()
  from public.materials m where m.is_active and m.archived_at is null and m.material_kind='consumable'
    and (p_search='' or position(lower(p_search) in lower(concat(m.code,' ',m.name)))>0)
  order by m.name,m.id offset p_offset limit p_limit;
end;
$$;
create function public.search_attendance_assignment_choices(p_project_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,label text,unit_id uuid,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_record_project_attendance(p_project_id) then raise exception 'Not authorized for project' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then raise exception 'Invalid search'; end if;
  return query select a.id,concat(e.code,' · ',e.first_name,' ',e.last_name,' · ',s.name),null::uuid,count(*) over()
  from public.employee_project_assignments a join public.employees e on e.id=a.employee_id
    join public.project_sites s on s.id=a.project_site_id
  where a.project_id=p_project_id and e.archived_at is null
    and (p_search='' or position(lower(p_search) in lower(concat(e.code,' ',e.first_name,' ',e.last_name,' ',s.name)))>0)
  order by e.last_name,e.first_name,a.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.search_material_choices(text,integer,integer),public.search_attendance_assignment_choices(uuid,text,integer,integer) from public,anon;
grant execute on function public.search_material_choices(text,integer,integer),public.search_attendance_assignment_choices(uuid,text,integer,integer) to authenticated;

create function public.search_site_material_choices(p_location_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,label text,unit_id uuid,available_quantity numeric,total_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then raise exception 'Invalid search'; end if;
  return query select m.id,concat(m.code,' · ',m.name),m.base_unit_id,b.available_quantity,count(*) over()
  from public.materials m join public.inventory_balances b on b.material_id=m.id
    join public.inventory_locations l on l.id=b.inventory_location_id
  where b.inventory_location_id=p_location_id and l.location_type='project_site' and b.available_quantity>0
    and m.is_active and m.archived_at is null and m.material_kind='consumable'
    and (p_search='' or position(lower(p_search) in lower(concat(m.code,' ',m.name)))>0)
  order by m.name,m.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.search_site_material_choices(uuid,text,integer,integer) from public,anon;
grant execute on function public.search_site_material_choices(uuid,text,integer,integer) to authenticated;

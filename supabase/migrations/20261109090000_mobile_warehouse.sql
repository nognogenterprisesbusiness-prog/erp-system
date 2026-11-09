-- Warehouse accounts can use the mobile read budget; warehouse posting stays in the ERP.
create or replace function public.guard_mobile_api(p_write boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_minute bigint := floor(extract(epoch from now()) / 60); v_hits integer;
begin
  if auth.uid() is null or not (
    private.has_any_role(array['foreman','engineer','driver']::public.app_role[])
    or (p_write is false and private.has_any_role(array['warehouse_staff']::public.app_role[]))
  ) then
    raise exception 'Not authorized for mobile' using errcode='42501';
  end if;
  insert into private.mobile_api_limits(actor,is_write,minute,hits) values(auth.uid(),p_write,v_minute,1)
  on conflict(actor,is_write) do update set minute=excluded.minute,
    hits=case when mobile_api_limits.minute=excluded.minute then mobile_api_limits.hits+1 else 1 end
  returning hits into v_hits;
  return v_hits <= case when p_write then 30 else 180 end;
end;
$$;

create function public.list_mobile_warehouse_dispatch(p_warehouse_id uuid, p_offset integer default 0, p_limit integer default 20)
returns table (id uuid, request_number text, project_name text, site_name text, required_date date, ready_lines bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.has_any_role(array['warehouse_staff']::public.app_role[])
    or not private.can_access_warehouse(p_warehouse_id)
    or not exists (select 1 from public.warehouses w where w.id=p_warehouse_id and w.status='active') then
    raise exception 'Warehouse access required' using errcode='42501';
  end if;
  if p_offset is null or p_offset not between 0 and 200000 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid dispatch pagination' using errcode='22023';
  end if;
  return query
  select r.id,r.request_number,p.name,s.name,r.required_date,count(res.id)
  from public.material_requests r
  join public.projects p on p.id=r.project_id
  join public.project_sites s on s.id=r.project_site_id
  join public.material_request_lines l on l.request_id=r.id
  join public.material_request_reservations res on res.request_line_id=l.id
  join public.inventory_locations loc on loc.id=res.inventory_location_id and loc.warehouse_id=p_warehouse_id
  where r.source_warehouse_id=p_warehouse_id
    and r.status in ('approved','partially_approved')
    and res.status='active' and res.remaining_quantity > 0
  group by r.id,p.name,s.name
  order by r.required_date,r.id offset p_offset limit p_limit;
end;
$$;
revoke execute on function public.list_mobile_warehouse_dispatch(uuid,integer,integer) from public,anon;
grant execute on function public.list_mobile_warehouse_dispatch(uuid,integer,integer) to authenticated;

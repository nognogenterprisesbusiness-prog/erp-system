-- Exact catalog selection uses the same scoped availability calculation as the list.
begin;
create function private.mobile_request_catalog(
  p_project_id uuid, p_site_id uuid, p_warehouse_id uuid default null,
  p_search text default '', p_offset integer default 0, p_limit integer default 20, p_material_id uuid default null
) returns table(id uuid, code text, name text, unit_id uuid, unit text, photo_path text,
  available_quantity numeric, warehouses jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_access_project_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for this project site' using errcode='42501';
  end if;
  if p_search is null or length(p_search)>100 or p_offset is null or p_offset<0
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid catalog page' using errcode='22023';
  end if;
  if p_warehouse_id is not null and not exists(select 1 from public.get_requestable_warehouses() w
    where w.project_id=p_project_id and w.warehouse_id=p_warehouse_id) then
    raise exception 'Not authorized for this project warehouse' using errcode='42501';
  end if;
  return query
    with linked as (select w.warehouse_id,w.name from public.get_requestable_warehouses() w
      where w.project_id=p_project_id and (p_warehouse_id is null or w.warehouse_id=p_warehouse_id))
    select m.id,m.code,m.name,m.base_unit_id,u.symbol,m.photo_path,
      coalesce(stock.available,0),coalesce(stock.sources,'[]'::jsonb),count(*) over()
    from public.materials m join public.units_of_measure u on u.id=m.base_unit_id
    left join lateral (
      select sum(coalesce(b.available_quantity,0)) available,
        jsonb_agg(jsonb_build_object('id',w.warehouse_id,'name',w.name,
          'available_quantity',coalesce(b.available_quantity,0)) order by w.name,w.warehouse_id) sources
      from linked w join public.inventory_locations l on l.warehouse_id=w.warehouse_id
      left join public.inventory_balances b on b.inventory_location_id=l.id and b.material_id=m.id
    ) stock on true
    where (p_material_id is null or m.id=p_material_id) and m.is_active and m.archived_at is null and m.material_kind='consumable'
      and (trim(p_search)='' or position(lower(trim(p_search)) in lower(m.name||' '||m.code))>0)
    order by m.name,m.id offset p_offset limit p_limit;
end; $$;

revoke all on function private.mobile_request_catalog(uuid,uuid,uuid,text,integer,integer,uuid) from public,anon,authenticated;
create or replace function public.list_mobile_request_catalog(
 p_project_id uuid,p_site_id uuid,p_warehouse_id uuid default null,p_search text default '',p_offset integer default 0,p_limit integer default 20
) returns table(id uuid, code text, name text, unit_id uuid, unit text, photo_path text,
 available_quantity numeric, warehouses jsonb, total_count bigint) language sql stable security definer set search_path='' as $$
 select * from private.mobile_request_catalog(p_project_id,p_site_id,p_warehouse_id,p_search,p_offset,p_limit,null);
$$;
create function public.get_mobile_request_catalog_material(p_project_id uuid,p_site_id uuid,p_material_id uuid)
returns table(id uuid, code text, name text, unit_id uuid, unit text, photo_path text,
 available_quantity numeric, warehouses jsonb, total_count bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if p_material_id is null then raise exception 'Choose a catalog material' using errcode='22023'; end if;
 return query select * from private.mobile_request_catalog(p_project_id,p_site_id,null,'',0,1,p_material_id);
end $$;
revoke all on function public.get_mobile_request_catalog_material(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_mobile_request_catalog_material(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

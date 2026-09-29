-- Show project staff only the stock currently available in a linked source warehouse.
-- Approval remains the atomic reservation boundary; this read is advisory.
begin;

-- An early manual run may have created the five-argument version.
drop function if exists public.search_requestable_warehouse_stock(uuid,uuid,text,integer,integer);
create or replace function public.search_requestable_warehouse_stock(
  p_project_id uuid, p_warehouse_id uuid, p_search text default '',
  p_offset integer default 0, p_limit integer default 20,
  p_material_id uuid default null
) returns table(id uuid, label text, unit_id uuid, available_quantity numeric, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_project_id is null or p_warehouse_id is null
    or p_offset < 0 or p_limit not between 1 and 100
    or length(coalesce(p_search, '')) > 100 then
    raise exception 'Invalid warehouse stock search' using errcode = '22023';
  end if;
  if not private.can_view_assigned_project(p_project_id)
    or not exists (
      select 1 from public.project_warehouses link
      join public.warehouses warehouse on warehouse.id = link.warehouse_id
      where link.project_id = p_project_id and link.warehouse_id = p_warehouse_id
        and warehouse.status = 'active'
    ) then
    raise exception 'Not authorized for this project warehouse' using errcode = '42501';
  end if;
  return query
    select material.id, concat(material.code, ' · ', material.name), material.base_unit_id,
      balance.available_quantity, count(*) over()
    from public.inventory_locations location
    join public.inventory_balances balance on balance.inventory_location_id = location.id
    join public.materials material on material.id = balance.material_id
    where location.warehouse_id = p_warehouse_id and balance.available_quantity > 0
      and material.material_kind = 'consumable' and material.is_active
      and material.archived_at is null
      and (p_material_id is null or material.id = p_material_id)
      and (p_search = '' or position(lower(p_search) in lower(concat(material.code, ' ', material.name))) > 0)
    order by material.name, material.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.search_requestable_warehouse_stock(uuid,uuid,text,integer,integer,uuid) from public, anon;
grant execute on function public.search_requestable_warehouse_stock(uuid,uuid,text,integer,integer,uuid) to authenticated;

commit;

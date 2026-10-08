-- One paged material list for inventory, including materials with no balance
-- at the selected location. Stock remains scoped by the existing location rule.
begin;

create function public.list_inventory_materials(
  p_query text default '', p_location_id uuid default null, p_category_id uuid default null,
  p_status text default 'active', p_low boolean default false,
  p_offset integer default 0, p_limit integer default 24
) returns table(
  material_id uuid, code text, name text, photo_path text,
  category_id uuid, category_name text, unit_name text, unit_symbol text,
  material_kind public.material_kind, minimum_stock_level numeric, is_active boolean,
  balance_id uuid, quantity_on_hand numeric, reserved_quantity numeric,
  available_quantity numeric, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_query is null or char_length(p_query) > 100
    or p_status is null or p_status not in ('active', 'inactive', 'all')
    or p_low is null or p_offset is null or p_offset < 0
    or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid inventory catalog filters' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.inventory_locations where id = p_location_id
  ) then
    raise exception 'Inventory location is not available' using errcode = '42501';
  end if;

  return query
    select m.id, m.code, m.name, m.photo_path, m.category_id,
      c.name, u.name, u.symbol, m.material_kind, m.minimum_stock_level,
      m.is_active, b.id, coalesce(b.quantity_on_hand, 0),
      coalesce(b.reserved_quantity, 0), coalesce(b.available_quantity, 0),
      count(*) over()
    from public.materials m
    join public.material_categories c on c.id = m.category_id
    join public.units_of_measure u on u.id = m.base_unit_id
    left join public.inventory_balances b
      on b.material_id = m.id and b.inventory_location_id = p_location_id
    where m.archived_at is null
      and (p_category_id is null or m.category_id = p_category_id)
      and (p_status = 'all' or m.is_active = (p_status = 'active'))
      and (not p_low or coalesce(b.available_quantity, 0) <= m.minimum_stock_level)
      and (trim(p_query) = '' or position(lower(trim(p_query)) in lower(m.name)) > 0
        or position(lower(trim(p_query)) in lower(m.code)) > 0)
    order by m.name, m.id
    offset p_offset limit p_limit;
end; $$;

revoke all on function public.list_inventory_materials(text,uuid,uuid,text,boolean,integer,integer)
  from public, anon;
grant execute on function public.list_inventory_materials(text,uuid,uuid,text,boolean,integer,integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;

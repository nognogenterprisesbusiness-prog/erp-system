create function public.list_inventory_balances(
  p_query text default '', p_location_id uuid default null, p_kind text default 'all',
  p_low boolean default false, p_offset integer default 0, p_limit integer default 24
) returns table(id uuid,material_id uuid,inventory_location_id uuid,quantity_on_hand numeric,
  reserved_quantity numeric,available_quantity numeric,updated_at timestamptz,material jsonb,total_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_offset<0 or p_limit not between 1 and 500 or p_kind not in ('all','warehouse','project_site') then
    raise exception 'Invalid inventory pagination' using errcode='22023';
  end if;
  return query select b.id,b.material_id,b.inventory_location_id,b.quantity_on_hand,b.reserved_quantity,
    b.available_quantity,b.updated_at,
    jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'description',m.description,'photo_path',m.photo_path,
      'category_id',m.category_id,'base_unit_id',m.base_unit_id,'material_kind',m.material_kind,
      'minimum_stock_level',m.minimum_stock_level,'is_active',m.is_active,'archived_at',m.archived_at,
      'categoryName',c.name,'unitName',u.name,'unitSymbol',u.symbol),count(*) over()
  from public.inventory_balances b join public.materials m on m.id=b.material_id
    join public.inventory_locations l on l.id=b.inventory_location_id
    join public.units_of_measure u on u.id=m.base_unit_id
    join public.material_categories c on c.id=m.category_id
  where m.is_active and m.archived_at is null
    and (p_location_id is null or b.inventory_location_id=p_location_id)
    and (p_kind='all' or l.location_type::text=p_kind)
    and (not p_low or b.available_quantity<=m.minimum_stock_level)
    and (coalesce(p_query,'')='' or position(lower(p_query) in lower(m.name))>0 or position(lower(p_query) in lower(m.code))>0)
  order by m.name,b.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.list_inventory_balances(text,uuid,text,boolean,integer,integer) from public,anon;
grant execute on function public.list_inventory_balances(text,uuid,text,boolean,integer,integer) to authenticated;

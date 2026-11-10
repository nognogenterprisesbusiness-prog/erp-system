create function public.get_material_request_source_stock(p_request_id uuid)
returns table(request_line_id uuid, on_hand numeric, available numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_view_material_request(p_request_id) then
    raise exception 'Request access required' using errcode='42501';
  end if;
  return query
  select l.id,
    case when private.can_access_warehouse(r.source_warehouse_id) then coalesce(b.quantity_on_hand,0) end,
    case when private.can_access_warehouse(r.source_warehouse_id) then coalesce(b.available_quantity,0) end
  from public.material_requests r
  join public.material_request_lines l on l.request_id=r.id
  left join public.inventory_locations loc on loc.warehouse_id=r.source_warehouse_id
  left join public.inventory_balances b on b.inventory_location_id=loc.id and b.material_id=l.material_id
  where r.id=p_request_id and r.source_warehouse_id is not null;
end;
$$;
revoke all on function public.get_material_request_source_stock(uuid) from public,anon;
grant execute on function public.get_material_request_source_stock(uuid) to authenticated;
notify pgrst,'reload schema';

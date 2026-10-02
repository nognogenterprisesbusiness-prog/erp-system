begin;
drop function public.get_warehouse_receivable_po_lines();
create or replace function public.get_warehouse_receivable_po_lines(p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table (line_id uuid, order_id uuid, po_number text, supplier_name text,
  warehouse_id uuid, warehouse_name text, ordered_on date, expected_on date,
  material_code text, material_name text, unit_symbol text,
  ordered_quantity numeric, received_quantity numeric, remaining_quantity numeric,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_search is null or char_length(p_search)>100 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid search page' using errcode='22023'; end if;
  if auth.uid() is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
    raise exception 'not authorized to receive purchase orders' using errcode = '42501';
  end if;
  return query
  select l.id, o.id, o.po_number, o.supplier_name, w.id, w.name, o.ordered_on, o.expected_on,
    m.code, m.name, u.symbol, l.ordered_quantity, l.received_quantity, l.ordered_quantity - l.received_quantity,count(*) over()
  from public.purchase_orders o
  join public.purchase_order_lines l on l.purchase_order_id = o.id
  join public.warehouses w on w.id = o.warehouse_id
  join public.materials m on m.id = l.material_id
  join public.units_of_measure u on u.id = l.unit_of_measure_id
  where o.status in ('issued','partially_received') and l.received_quantity < l.ordered_quantity
    and private.can_access_warehouse(o.warehouse_id)
    and concat_ws(' ',o.po_number,o.supplier_name,w.name,m.code,m.name) ilike '%' || replace(replace(replace(trim(p_search),'\','\\'),'%','\%'),'_','\_') || '%'

  order by o.expected_on nulls last, o.po_number, m.name, l.id
  limit p_limit offset p_offset;
end; $$;
revoke all on function public.get_warehouse_receivable_po_lines(text,integer,integer) from public,anon;
grant execute on function public.get_warehouse_receivable_po_lines(text,integer,integer) to authenticated;
drop function public.get_billable_projects();
create or replace function public.get_billable_projects(p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid, code text, name text, client_name text, contract_amount numeric, status public.project_status,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_search is null or char_length(p_search)>100 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid search page' using errcode='22023'; end if;
  if (select auth.uid()) is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view billing projects' using errcode = '42501';
  end if;
  return query select p.id, p.code, p.name, p.client_name, p.contract_amount, p.status,count(*) over()
  from public.projects p
  where p.archived_at is null and p.status in ('active','on_hold','completed') and p.contract_amount > 0
    and concat_ws(' ',p.code,p.name,p.client_name) ilike '%' || replace(replace(replace(trim(p_search),'\','\\'),'%','\%'),'_','\_') || '%'

  order by p.code,p.id limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_billable_projects(text,integer,integer) from public,anon;
grant execute on function public.get_billable_projects(text,integer,integer) to authenticated;
drop function public.get_delivery_vehicle_choices();
create or replace function public.get_delivery_vehicle_choices(p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid, label text,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_search is null or char_length(p_search)>100 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid search page' using errcode='22023'; end if;
  if auth.uid() is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
    raise exception 'Not authorized for delivery vehicles' using errcode = '42501';
  end if;
  return query select asset.id, concat(asset.code, ' · ', asset.name),count(*) over()
    from public.assets asset where asset.asset_kind = 'vehicle'
      and private.can_view_asset(asset.id) and asset.archived_at is null and asset.status in ('available','assigned','in_use')
    and concat_ws(' ',asset.code,asset.name) ilike '%' || replace(replace(replace(trim(p_search),'\','\\'),'%','\%'),'_','\_') || '%'

    order by asset.code,asset.id limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_delivery_vehicle_choices(text,integer,integer) from public,anon;
grant execute on function public.get_delivery_vehicle_choices(text,integer,integer) to authenticated;
commit;

begin;
create or replace function public.guard_mobile_api(p_write boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_minute bigint := floor(extract(epoch from now()) / 60); v_hits integer;
begin
  if auth.uid() is null or not (
    private.has_any_role(array['foreman','engineer','driver','warehouse_staff']::public.app_role[])
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
create or replace function public.list_mobile_warehouse_receipts(p_warehouse_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20)
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
  if not private.can_access_warehouse(p_warehouse_id) or not exists(select 1 from public.warehouses w where w.id=p_warehouse_id and w.status='active') then raise exception 'Warehouse access required' using errcode='42501'; end if;
  return query
  select l.id, o.id, o.po_number, o.supplier_name, w.id, w.name, o.ordered_on, o.expected_on,
    m.code, m.name, u.symbol, l.ordered_quantity, l.received_quantity, l.ordered_quantity - l.received_quantity,count(*) over()
  from public.purchase_orders o
  join public.purchase_order_lines l on l.purchase_order_id = o.id
  join public.warehouses w on w.id = o.warehouse_id
  join public.materials m on m.id = l.material_id
  join public.units_of_measure u on u.id = l.unit_of_measure_id
  where o.warehouse_id=p_warehouse_id and o.status in ('issued','partially_received') and l.received_quantity < l.ordered_quantity
    and private.can_access_warehouse(o.warehouse_id)
    and concat_ws(' ',o.po_number,o.supplier_name,w.name,m.code,m.name) ilike '%' || replace(replace(replace(trim(p_search),'\','\\'),'%','\%'),'_','\_') || '%'

  order by o.expected_on nulls last, o.po_number, m.name, l.id
  limit p_limit offset p_offset;
end; $$;
revoke all on function public.list_mobile_warehouse_receipts(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_mobile_warehouse_receipts(uuid,text,integer,integer) to authenticated;

create function public.list_request_release_allocations(p_warehouse_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20,p_request_id uuid default null)
returns table(id uuid,request_id uuid,request_number text,project_name text,site_name text,material_name text,material_code text,unit text,remaining numeric,warehouse_id uuid,warehouse_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) or not private.can_access_warehouse(p_warehouse_id)
   or not exists(select 1 from public.warehouses w where w.id=p_warehouse_id and w.status='active') then raise exception 'Warehouse access required' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 or p_search is null or length(p_search)>80 then raise exception 'Invalid page' using errcode='22023'; end if;
 return query select a.id,r.id,r.request_number,p.name,s.name,m.name,m.code,u.symbol,a.remaining_quantity,w.id,w.name
 from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id
 join public.material_requests r on r.id=l.request_id join public.projects p on p.id=r.project_id
 join public.project_sites s on s.id=r.project_site_id join public.materials m on m.id=l.material_id
 join public.units_of_measure u on u.id=l.unit_of_measure_id join public.inventory_locations loc on loc.id=a.inventory_location_id
 join public.warehouses w on w.id=loc.warehouse_id
 where w.id=p_warehouse_id and (p_request_id is null or r.id=p_request_id) and a.status='active' and a.remaining_quantity>0 and r.status in ('approved','partially_approved')
   and p.status='active' and p.archived_at is null and s.status='active'
   and position(lower(trim(p_search)) in lower(concat_ws(' ',r.request_number,p.name,s.name,m.name,m.code)))>0
 order by r.required_date,r.id,l.material_id,a.id offset p_offset limit p_limit;
end; $$;
revoke all on function public.list_request_release_allocations(uuid,text,integer,integer,uuid) from public,anon;
grant execute on function public.list_request_release_allocations(uuid,text,integer,integer,uuid) to authenticated;

create function public.receive_mobile_purchase_delivery(p_key uuid,p_line_id uuid,p_delivered numeric,p_accepted numeric,p_reference text,p_received_on date,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_inspection uuid; v_receipt uuid;
begin
 v_inspection:=public.inspect_purchase_delivery(p_key,p_line_id,p_delivered,p_accepted,p_reference,p_received_on,p_note);
 if p_accepted=0 then return v_inspection; end if;
 v_receipt:=public.receive_purchase_order_line(p_key,p_line_id,p_accepted,null,p_reference,p_received_on,null);
 return v_receipt;
end; $$;
revoke all on function public.receive_mobile_purchase_delivery(uuid,uuid,numeric,numeric,text,date,text) from public,anon;
grant execute on function public.receive_mobile_purchase_delivery(uuid,uuid,numeric,numeric,text,date,text) to authenticated;
notify pgrst,'reload schema';
commit;

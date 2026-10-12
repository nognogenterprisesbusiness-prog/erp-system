begin;
create function public.get_transfer_receiving_permissions(p_item_ids uuid[])
returns table(id uuid,can_receive boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_item_ids is null or cardinality(p_item_ids)>100 then raise exception 'Invalid transfer permission lookup' using errcode='22023'; end if;
 return query select i.id,private.can_receive_transfer_location(t.destination_location_id)
  and not exists(select 1 from public.material_request_dispatches d where d.transfer_item_id=i.id)
 from public.inventory_transfer_items i join public.inventory_transfers t on t.id=i.transfer_id where i.id=any(p_item_ids);
end $$;

create function public.list_mobile_site_deliveries(p_project_id uuid,p_site_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,transfer_id uuid,material_id uuid,name text,code text,unit text,photo_path text,reference text,
 source_name text,dispatched numeric,received numeric,remaining numeric,variance numeric,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_access_project_site(p_project_id,p_site_id) then raise exception 'Not authorized for this project site' using errcode='42501'; end if;
 if p_search is null or length(p_search)>100 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid delivery page' using errcode='22023'; end if;
 return query select i.id,t.id,m.id,m.name,m.code,u.symbol,m.photo_path,t.external_reference,w.name,
  i.dispatched_quantity,i.received_quantity,i.dispatched_quantity-i.received_quantity-i.variance_quantity,i.variance_quantity,count(*) over()
 from public.inventory_transfer_items i join public.inventory_transfers t on t.id=i.transfer_id
 join public.inventory_locations dst on dst.id=t.destination_location_id join public.project_sites s on s.id=dst.project_site_id
 join public.inventory_locations src on src.id=t.source_location_id join public.warehouses w on w.id=src.warehouse_id
 join public.materials m on m.id=i.material_id join public.units_of_measure u on u.id=i.unit_of_measure_id
 where s.id=p_site_id and s.project_id=p_project_id and t.status<>'cancelled'
 and not exists(select 1 from public.material_request_dispatches d where d.transfer_item_id=i.id)
 and (trim(p_search)='' or position(lower(trim(p_search)) in lower(m.name||' '||m.code||' '||t.external_reference))>0)
 order by t.created_at desc,i.id offset p_offset limit p_limit;
end $$;

create function public.receive_mobile_site_transfer(p_key uuid,p_project_id uuid,p_site_id uuid,p_transfer_item_id uuid,p_quantity numeric,p_quality_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_date date:=(now() at time zone 'Asia/Manila')::date;
 v_note text:=nullif(trim(coalesce(p_quality_note,'')),'');
begin
 if auth.uid() is null or not private.has_any_role(array['admin','engineer','foreman']::public.app_role[])
 or not private.can_access_project_site(p_project_id,p_site_id) then raise exception 'Not authorized to receive at this site' using errcode='42501'; end if;
 if p_key is null or p_transfer_item_id is null or (v_note is not null and char_length(v_note) not between 3 and 500) then raise exception 'Invalid site receipt details' using errcode='22023'; end if;
 if not exists(select 1 from public.inventory_transfer_items i join public.inventory_transfers t on t.id=i.transfer_id
 join public.inventory_locations l on l.id=t.destination_location_id join public.project_sites s on s.id=l.project_site_id
 where i.id=p_transfer_item_id and s.id=p_site_id and s.project_id=p_project_id
 and not exists(select 1 from public.material_request_dispatches d where d.transfer_item_id=i.id)) then
 raise exception 'Delivery is not available at this site; request deliveries use request inspection' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select t.transaction_date into v_date from public.inventory_command_receipts c join public.inventory_transactions t on t.id=c.result_id
 where c.idempotency_key=p_key;
 v_date:=coalesce(v_date,(now() at time zone 'Asia/Manila')::date);
 return public.receive_inventory_transfer(p_key,p_transfer_item_id,p_quantity,v_date,'Counted and accepted'||coalesce(' · '||v_note,''));
end $$;
revoke all on function public.get_transfer_receiving_permissions(uuid[]),public.list_mobile_site_deliveries(uuid,uuid,text,integer,integer),public.receive_mobile_site_transfer(uuid,uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.get_transfer_receiving_permissions(uuid[]),public.list_mobile_site_deliveries(uuid,uuid,text,integer,integer),public.receive_mobile_site_transfer(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;

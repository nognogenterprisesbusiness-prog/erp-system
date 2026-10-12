-- Warehouse stock entry and direct linked-site deliveries keep assigned-location scope.
begin;
create function private.can_record_warehouse_stock(p_location_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_any_role(array['admin','warehouse_staff']::public.app_role[])
 and private.can_operate_inventory_location(p_location_id)
 and exists(select 1 from public.inventory_locations l join public.warehouses w on w.id=l.warehouse_id where l.id=p_location_id and w.status='active');
$$;
create function private.warehouse_can_supply_site(p_source_id uuid,p_destination_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_manage_inventory() or (
 private.has_any_role(array['warehouse_staff']::public.app_role[]) and private.can_operate_inventory_location(p_source_id)
 and exists(select 1 from public.inventory_locations src join public.warehouses w on w.id=src.warehouse_id
 join public.project_warehouses pw on pw.warehouse_id=w.id join public.projects p on p.id=pw.project_id
 join public.project_sites s on s.project_id=p.id join public.inventory_locations dst on dst.project_site_id=s.id
 where src.id=p_source_id and dst.id=p_destination_id and w.status='active' and p.status='active'
 and p.archived_at is null and s.status='active'));
$$;
create function private.can_receive_transfer_location(p_location_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_operate_inventory_location(p_location_id) or (
 private.has_any_role(array['engineer','foreman']::public.app_role[]) and exists(
 select 1 from public.inventory_locations l join public.project_sites s on s.id=l.project_site_id
 where l.id=p_location_id and private.can_access_project_site(s.project_id,s.id)));
$$;
revoke all on function private.can_record_warehouse_stock(uuid),private.warehouse_can_supply_site(uuid,uuid),private.can_receive_transfer_location(uuid) from public,anon,authenticated;

create function public.list_warehouse_site_destinations()
returns table(id uuid,location_type public.inventory_location_type,warehouse_id uuid,project_site_id uuid,created_at timestamptz,name text,detail text,project_id uuid,source_location_ids uuid[])
language sql stable security definer set search_path='' as $$
 select dst.id,dst.location_type,dst.warehouse_id,dst.project_site_id,dst.created_at,s.name,p.name,p.id,
 array(select src.id from public.inventory_locations src join public.warehouses w on w.id=src.warehouse_id
  where w.status='active' and private.warehouse_can_supply_site(src.id,dst.id))
 from public.inventory_locations dst join public.project_sites s on s.id=dst.project_site_id join public.projects p on p.id=s.project_id
 where auth.uid() is not null and private.has_any_role(array['admin','warehouse_staff']::public.app_role[])
 and p.status='active' and p.archived_at is null and s.status='active'
 and (private.can_manage_inventory() or exists(select 1 from public.project_warehouses pw join public.inventory_locations src on src.warehouse_id=pw.warehouse_id
 where pw.project_id=p.id and private.warehouse_can_supply_site(src.id,dst.id)));
$$;
revoke all on function public.list_warehouse_site_destinations() from public,anon;
grant execute on function public.list_warehouse_site_destinations() to authenticated;

do $$ declare v_definition text; v_old text; v_signature regprocedure; begin
 v_signature:='public.post_valued_stock_in(uuid,uuid,uuid,numeric,uuid,numeric,text,date,text)'::regprocedure;
 v_definition:=pg_get_functiondef(v_signature);v_old:=v_definition;
 v_definition:=replace(v_definition,'if not private.can_manage_inventory()','if not private.can_record_warehouse_stock(p_destination_location_id)');
 if v_definition=v_old then raise exception 'Unexpected stock-in permission definition'; end if;
 execute v_definition;
 v_signature:='public.prepare_web_inventory_movement(uuid,text)'::regprocedure;
 v_definition:=pg_get_functiondef(v_signature);v_old:=v_definition;
 v_definition:=replace(v_definition,$old$p_mode<>'transfer'$old$, $new$p_mode not in ('transfer','stock-in')$new$);
 if v_definition=v_old then raise exception 'Unexpected web movement permission definition'; end if;
 execute v_definition;
 v_signature:='public.dispatch_inventory_transfer(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text)'::regprocedure;
 v_definition:=pg_get_functiondef(v_signature);v_old:=v_definition;
 v_definition:=replace(v_definition,$old$if not private.can_manage_inventory() then
      raise exception 'site dispatch requires an approved request or administrator exception'$old$, $new$if not private.warehouse_can_supply_site(p_source_location_id,p_destination_location_id) then
      raise exception 'Not authorized for this warehouse and site'$new$);
 v_definition:=replace(v_definition,'administrator exception reason is required','site delivery reason is required');
 if v_definition=v_old then raise exception 'Unexpected direct delivery definition'; end if;
 execute v_definition;
 v_signature:='private.dispatch_inventory_transfer_unrestricted(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text)'::regprocedure;
 v_definition:=pg_get_functiondef(v_signature);v_old:=v_definition;
 v_definition:=replace(v_definition,'not private.can_view_inventory_location(p_destination_location_id)','not (private.can_view_inventory_location(p_destination_location_id) or private.warehouse_can_supply_site(p_source_location_id,p_destination_location_id))');
 v_definition:=replace(v_definition,'v_destination_site and not private.can_manage_inventory()','v_destination_site and not private.warehouse_can_supply_site(p_source_location_id,p_destination_location_id)');
 if v_definition=v_old then raise exception 'Unexpected underlying direct delivery definition'; end if;
 execute v_definition;
 foreach v_signature in array array['public.receive_inventory_transfer(uuid,uuid,numeric,date,text)'::regprocedure,'private.receive_inventory_transfer_unrestricted(uuid,uuid,numeric,date,text)'::regprocedure] loop
 v_definition:=pg_get_functiondef(v_signature);v_old:=v_definition;
 if v_signature='public.receive_inventory_transfer(uuid,uuid,numeric,date,text)'::regprocedure then
  v_definition:=replace(v_definition,E'begin\n',$guard$begin
  if exists(select 1 from public.material_request_dispatches where transfer_item_id=p_transfer_item_id) then raise exception 'Request deliveries must use the request inspection flow' using errcode='42501'; end if;
$guard$);
 end if;
 v_definition:=replace(v_definition,'private.can_operate_inventory_location(t.destination_location_id)','private.can_receive_transfer_location(t.destination_location_id)');
 v_definition:=replace(v_definition,'private.can_operate_inventory_location(v_transfer.destination_location_id)','private.can_receive_transfer_location(v_transfer.destination_location_id)');
 if v_definition=v_old then raise exception 'Unexpected transfer receiver definition'; end if;
 execute v_definition;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

begin;

alter table public.material_sourcing_requests add column reported_material_id uuid
  references public.materials(id) on delete restrict;
create function public.submit_catalog_shortage(
  p_key uuid,p_project_id uuid,p_site_id uuid,p_warehouse_id uuid,p_material_id uuid,
  p_quantity numeric,p_needed_on date,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_material public.materials; v_unit text; v_id uuid; v_existing public.material_sourcing_requests;
begin
  if auth.uid() is null or not private.can_access_project_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for this project site' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into v_existing from public.material_sourcing_requests where idempotency_key=p_key;
  if found and v_existing.reported_material_id is distinct from p_material_id then
    raise exception 'Idempotency key already used for another material' using errcode='23505';
  end if;
  select * into v_material from public.materials where id=p_material_id and is_active and archived_at is null and material_kind='consumable';
  if not found then raise exception 'Choose an active catalog material' using errcode='22023'; end if;
  select symbol into v_unit from public.units_of_measure where id=v_material.base_unit_id;
  v_id:=public.submit_material_sourcing_request(p_key,p_project_id,p_site_id,p_warehouse_id,v_material.name,v_unit,p_quantity,p_needed_on,p_reason);
  if v_existing.id is null then
    update public.material_sourcing_requests set reported_material_id=p_material_id where id=v_id;
  end if;
  return v_id;
end; $$;
revoke all on function public.submit_catalog_shortage(uuid,uuid,uuid,uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.submit_catalog_shortage(uuid,uuid,uuid,uuid,uuid,numeric,date,text) to authenticated;

-- Advisory availability only. Existing reservation/posting commands remain authoritative.
create function public.list_mobile_request_catalog(
  p_project_id uuid, p_site_id uuid, p_warehouse_id uuid default null,
  p_search text default '', p_offset integer default 0, p_limit integer default 20
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
    where m.is_active and m.archived_at is null and m.material_kind='consumable'
      and (trim(p_search)='' or position(lower(trim(p_search)) in lower(m.name||' '||m.code))>0)
    order by m.name,m.id offset p_offset limit p_limit;
end; $$;

create function public.list_mobile_site_stock(
  p_project_id uuid,p_site_id uuid,p_search text default '',p_offset integer default 0,p_limit integer default 20
) returns table(id uuid,material_id uuid,name text,code text,unit_id uuid,unit text,photo_path text,
  on_hand numeric,reserved numeric,available numeric,total_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not coalesce((select c.can_read from public.get_project_site_capabilities(p_project_id,p_site_id) c),false) then
    raise exception 'Not authorized for this project site' using errcode='42501';
  end if;
  if p_search is null or length(p_search)>100 or p_offset is null or p_offset<0
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid stock page' using errcode='22023';
  end if;
  return query select b.id,m.id,m.name,m.code,m.base_unit_id,u.symbol,m.photo_path,
    b.quantity_on_hand,b.reserved_quantity,b.available_quantity,count(*) over()
    from public.inventory_balances b join public.inventory_locations l on l.id=b.inventory_location_id
    join public.project_sites s on s.id=l.project_site_id
    join public.materials m on m.id=b.material_id join public.units_of_measure u on u.id=m.base_unit_id
    where s.id=p_site_id and s.project_id=p_project_id and b.available_quantity>0
      and m.is_active and m.archived_at is null and m.material_kind='consumable'
      and (trim(p_search)='' or position(lower(trim(p_search)) in lower(m.name||' '||m.code))>0)
    order by m.name,b.id offset p_offset limit p_limit;
end; $$;

-- No prices or costs are returned, even though batch provenance requires protected tables.
create function public.get_mobile_stock_provenance(p_project_id uuid,p_site_id uuid,p_ids uuid[])
returns table(id uuid,direction text,reference text,location_name text,sources jsonb,request_id uuid,site_purchase_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_location uuid;
begin
  if auth.uid() is null or not private.can_access_project_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for this project site' using errcode='42501';
  end if;
  if p_ids is null or cardinality(p_ids)>100 then raise exception 'Invalid history page' using errcode='22023'; end if;
  select l.id into v_location from public.inventory_locations l where l.project_site_id=p_site_id;
  return query select t.id,case when t.destination_location_id=v_location then 'In' else 'Out' end,
    t.reference_document,coalesce(w.name,s.name),coalesce(provenance.sources,'[]'::jsonb),r.request_id,sp.id
    from public.inventory_transactions t
    left join public.inventory_locations other on other.id=case when t.destination_location_id=v_location then t.source_location_id else t.destination_location_id end
    left join public.warehouses w on w.id=other.warehouse_id
    left join public.project_sites s on s.id=other.project_site_id
    left join lateral (select mr.id request_id from public.material_request_dispatches d
      join public.material_request_lines ml on ml.id=d.request_line_id
      join public.material_requests mr on mr.id=ml.request_id
      where d.transfer_item_id=t.transfer_item_id and mr.project_id=p_project_id and mr.project_site_id=p_site_id limit 1) r on true
    left join public.site_purchase_lines spl on spl.inventory_transaction_id=coalesce(t.reversal_of,t.id)
    left join public.site_purchases sp on sp.id=spl.site_purchase_id and sp.project_id=p_project_id and sp.project_site_id=p_site_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name',src.name,'reference',src.reference,'quantity',src.quantity) order by src.name,src.reference) sources
      from (
        select coalesce(po.supplier_name,p.supplier_name,case when a.batch_number=0 then 'Opening stock' else 'Source unavailable' end) name,
          coalesce(po.po_number,p.purchase_number,origin.reference_document) reference,sum(a.quantity) quantity
        from (
          select ca.batch_number,ca.quantity from public.inventory_cost_allocations ca where ca.transaction_id=coalesce(t.reversal_of,t.id)
          union all select -1,t.quantity where not exists(select 1 from public.inventory_cost_allocations ca where ca.transaction_id=coalesce(t.reversal_of,t.id))
        ) a
        left join lateral (select l.source_transaction_id from public.inventory_cost_layers l
          where l.material_id=t.material_id and l.batch_number=a.batch_number and a.batch_number>0 and l.source_transaction_id is not null
          order by l.created_at,l.id limit 1) batch on true
        left join public.inventory_transactions origin on origin.id=case when a.batch_number=-1 then coalesce(t.reversal_of,t.id) else batch.source_transaction_id end
        left join public.purchase_order_receipts pr on pr.inventory_transaction_id=origin.id
        left join public.purchase_orders po on po.id=pr.purchase_order_id
        left join public.site_purchase_lines pl on pl.inventory_transaction_id=origin.id
        left join public.site_purchases p on p.id=pl.site_purchase_id
        group by po.supplier_name,p.supplier_name,a.batch_number=0,po.po_number,p.purchase_number,origin.reference_document
      ) src
    ) provenance on true
    where t.id=any(p_ids) and (t.source_location_id=v_location or t.destination_location_id=v_location);
end; $$;

revoke all on function public.list_mobile_request_catalog(uuid,uuid,uuid,text,integer,integer),
  public.list_mobile_site_stock(uuid,uuid,text,integer,integer),public.get_mobile_stock_provenance(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.list_mobile_request_catalog(uuid,uuid,uuid,text,integer,integer),
  public.list_mobile_site_stock(uuid,uuid,text,integer,integer),public.get_mobile_stock_provenance(uuid,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;

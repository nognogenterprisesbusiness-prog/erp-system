begin;

create index asset_events_previous_location_history on public.asset_events(previous_location_id,occurred_at desc,id);
create index asset_events_current_location_history on public.asset_events(current_location_id,occurred_at desc,id);

-- Read-only, quantity-only history. Moving a vehicle does not remove its site history.
create function public.list_mobile_vehicle_history(
 p_project_id uuid,p_site_id uuid,p_asset_id uuid default null,
 p_search text default '',p_offset integer default 0,p_limit integer default 20
) returns table(record jsonb,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_access_project_site(p_project_id,p_site_id) then
  raise exception 'Not authorized for this project site' using errcode='42501';
 end if;
 if p_search is null or length(p_search)>100 or p_offset is null or p_offset<0
  or p_limit is null or p_limit not between 1 and 100 then
  raise exception 'Invalid vehicle history page' using errcode='22023';
 end if;
 return query
 with site_locations as (
  select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id
  where il.project_site_id=p_site_id
 ), history as (
  select 'movement:'||e.id id,e.asset_id,e.occurred_at occurred_at,'movement' kind,
   replace(e.event_type::text,'_',' ') title,
   concat_ws(' → ',case when e.previous_location_id in(select id from site_locations) then 'This site' when e.previous_location_id is not null then 'Other location' end,
    case when e.current_location_id in(select id from site_locations) then 'This site' when e.current_location_id is not null then 'Other location' end) note,
   coalesce(e.current_status::text,'') status,null::text reference,null::uuid purchase_id,null::numeric hours
  from public.asset_events e where e.previous_location_id in(select id from site_locations) or e.current_location_id in(select id from site_locations)
  union all
  select 'request:'||r.id,r.asset_id,r.created_at,'request','Vehicle request',r.purpose,r.status,r.id::text,null,null
  from public.equipment_requests r where r.project_id=p_project_id and r.project_site_id=p_site_id
  union all
  select 'handover:'||r.id,r.asset_id,r.checked_out_at,'request','Vehicle handed over',r.purpose,r.status,r.id::text,null,null
  from public.equipment_requests r where r.project_id=p_project_id and r.project_site_id=p_site_id and r.checked_out_at is not null
  union all
  select 'return:'||r.id,r.asset_id,r.returned_at,'request','Vehicle returned',coalesce(r.return_note,''),r.status,r.id::text,null,null
  from public.equipment_requests r where r.project_id=p_project_id and r.project_site_id=p_site_id and r.returned_at is not null
  union all
  select 'usage:'||u.id,u.asset_id,u.created_at,'usage','Operating hours',u.work_note,
   case when exists(select 1 from public.project_equipment_usage_reversals r where r.usage_id=u.id) then 'reversed' else 'posted' end,
   u.use_date::text,null,u.hours_used
  from public.project_equipment_usage u where u.project_id=p_project_id and u.project_site_id=p_site_id
  union all
  select 'usage-reversal:'||r.id,u.asset_id,r.reversed_at,'usage','Operating hours corrected',r.reason,'reversed',u.use_date::text,null,u.hours_used
  from public.project_equipment_usage_reversals r join public.project_equipment_usage u on u.id=r.usage_id
  where u.project_id=p_project_id and u.project_site_id=p_site_id
  union all
  select 'delivery:'||m.transfer_id,m.vehicle_asset_id,m.created_at,'delivery','Material delivery',
   concat_ws(' · ','Driver: '||m.driver_name,(
    select string_agg(mat.name||': '||i.dispatched_quantity||' dispatched / '||i.received_quantity||' received / '||(i.dispatched_quantity-i.received_quantity-i.variance_quantity)||' remaining '||u.symbol, '; ' order by i.id)
    from public.inventory_transfer_items i join public.materials mat on mat.id=i.material_id
    join public.units_of_measure u on u.id=i.unit_of_measure_id where i.transfer_id=t.id)),
   t.status::text,m.delivery_reference,null,null
  from public.material_delivery_manifests m join public.inventory_transfers t on t.id=m.transfer_id
  join public.inventory_locations il on il.id=t.destination_location_id
  where il.project_site_id=p_site_id and m.vehicle_asset_id is not null
  union all
  select 'fuel:'||p.id,p.vehicle_id,p.created_at,'fuel','Diesel receipt',
   concat_ws(' · ',p.receipt_date::text,p.notes,case when p.reimbursed_on is not null then 'Reimbursed' end),
   case when exists(select 1 from public.project_expense_reversals r where r.expense_id=p.project_expense_id) then 'reversed' else p.status end,
   p.purchase_number,p.id,null
  from public.site_purchases p where p.project_id=p_project_id and p.project_site_id=p_site_id and p.purchase_kind='fuel'
 ), scoped as (
  select h.*,a.name,a.code from history h join public.assets a on a.id=h.asset_id and a.asset_kind='vehicle'
  where (p_asset_id is null or a.id=p_asset_id)
   and (trim(p_search)='' or position(lower(trim(p_search)) in lower(concat_ws(' ',a.name,a.code,h.title,h.reference)))>0)
 )
 select jsonb_build_object('id',s.id,'asset_id',s.asset_id,'name',s.name,'code',s.code,
  'occurred_at',s.occurred_at,'kind',s.kind,'title',s.title,'note',s.note,'status',s.status,
  'reference',s.reference,'purchase_id',s.purchase_id,'hours',s.hours),count(*) over()
 from scoped s order by s.occurred_at desc,s.id offset p_offset limit p_limit;
end; $$;
revoke all on function public.list_mobile_vehicle_history(uuid,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.list_mobile_vehicle_history(uuid,uuid,uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;

-- Quantity-only request tracking; site balances require site access independently.
begin;
create or replace function public.get_material_request_tracking(p_request_ids uuid[])
returns table(request_id uuid, request_line_id uuid, material_id uuid, project_name text, site_name text,
 site_on_hand numeric, site_available numeric, approved_quantity numeric, reserved numeric,
 dispatched numeric, received numeric, variance numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles
   where id=auth.uid() and is_active and not onboarding_required) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 if p_request_ids is null or cardinality(p_request_ids)>100 then
   raise exception 'Invalid request tracking page' using errcode='22023';
 end if;
 return query
 select r.id,l.id,l.material_id,p.name,s.name,
   case when private.can_access_project_site(r.project_id,r.project_site_id)
     then coalesce(b.quantity_on_hand,0) end,
   case when private.can_access_project_site(r.project_id,r.project_site_id)
     then coalesce(b.available_quantity,0) end,
   l.approved_quantity,coalesce(res.remaining_quantity,0),
   coalesce(del.dispatched,0),coalesce(del.received,0),coalesce(del.variance,0)
 from public.material_requests r
 join public.projects p on p.id=r.project_id
 join public.project_sites s on s.id=r.project_site_id and s.project_id=r.project_id
 join public.material_request_lines l on l.request_id=r.id
 left join public.inventory_locations loc on loc.project_site_id=r.project_site_id
 left join public.inventory_balances b on b.inventory_location_id=loc.id and b.material_id=l.material_id
 left join public.material_request_reservations res on res.request_line_id=l.id
 left join lateral (
   select sum(i.dispatched_quantity) as dispatched,sum(i.received_quantity) as received,sum(i.variance_quantity) as variance
   from public.material_request_dispatches d join public.inventory_transfer_items i on i.id=d.transfer_item_id
   where d.request_line_id=l.id
 ) del on true
 where r.id=any(p_request_ids) and private.can_view_material_request(r.id)
 order by r.id,l.id;
end; $$;
revoke all on function public.get_material_request_tracking(uuid[]) from public,anon;
grant execute on function public.get_material_request_tracking(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;

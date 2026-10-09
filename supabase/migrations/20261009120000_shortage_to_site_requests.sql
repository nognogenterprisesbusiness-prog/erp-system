-- Link out-of-stock reports to supplier purchases and to reviewable site
-- requests. Receipt never dispatches or posts site stock automatically.
begin;

alter table public.purchase_procurement_context
  add column material_sourcing_request_id uuid references public.material_sourcing_requests(id) on delete restrict,
  add column sourcing_material_id uuid references public.materials(id) on delete restrict,
  add constraint purchase_sourcing_pair check
    ((material_sourcing_request_id is null) = (sourcing_material_id is null));
create index purchase_procurement_sourcing_idx
  on public.purchase_procurement_context(material_sourcing_request_id)
  where material_sourcing_request_id is not null;

create table public.material_sourcing_request_links (
  id uuid primary key default gen_random_uuid(),
  material_sourcing_request_id uuid not null references public.material_sourcing_requests(id) on delete restrict,
  material_request_id uuid not null unique references public.material_requests(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(20,4) not null check (quantity > 0),
  idempotency_key uuid not null unique,
  note text not null check (char_length(trim(note)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index material_sourcing_request_links_report_idx
  on public.material_sourcing_request_links(material_sourcing_request_id,created_at);
alter table public.material_sourcing_request_links enable row level security;
revoke all on public.material_sourcing_request_links from public,anon,authenticated;
grant select on public.material_sourcing_request_links to authenticated;
create policy material_sourcing_request_links_read on public.material_sourcing_request_links
  for select to authenticated using (exists (
    select 1 from public.material_sourcing_requests report
    where report.id=material_sourcing_request_id
      and (report.requested_by=auth.uid() or
        private.can_access_project_site(report.project_id,report.project_site_id))
  ));
create trigger material_sourcing_request_links_audit after insert
  on public.material_sourcing_request_links for each row execute function private.audit_row_change();

create function private.reopen_rejected_sourcing_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('rejected','cancelled','partially_approved') and old.status is distinct from new.status then
    update public.material_sourcing_requests report
      set status='submitted',catalog_material_id=null,resolution_note=null,
        resolved_by=null,resolved_at=null
      where report.id in (select link.material_sourcing_request_id
        from public.material_sourcing_request_links link where link.material_request_id=new.id)
        and report.status='resolved';
  end if;
  return new;
end; $$;
revoke execute on function private.reopen_rejected_sourcing_request() from public,anon,authenticated;
create trigger sourcing_request_rejected after update of status on public.material_requests
  for each row execute function private.reopen_rejected_sourcing_request();

-- Existing site-staff requests remain site-staff only. The Admin exception is
-- scoped to this report, site, warehouse and submission key within the
-- audited shortage conversion transaction.
create or replace function private.enforce_material_request_submitter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.requested_by=auth.uid()
    and private.has_any_role(array['admin']::public.app_role[])
    and current_setting('app.shortage_request_key',true)=new.submission_key::text
    and exists(select 1 from public.material_sourcing_requests report
      where report.id::text=current_setting('app.shortage_report_id',true)
        and report.status='submitted' and report.project_id=new.project_id
        and report.project_site_id=new.project_site_id
        and report.source_warehouse_id=new.source_warehouse_id) then
    return new;
  end if;
  if auth.uid() is null or new.requested_by is distinct from auth.uid()
     or private.has_any_role(array['admin']::public.app_role[])
     or not private.has_any_role(array['engineer','foreman']::public.app_role[])
     or not private.can_access_project_site(new.project_id,new.project_site_id) then
    raise exception 'only staff assigned to this project site can submit material requests' using errcode='42501';
  end if;
  return new;
end; $$;

create function public.submit_sourcing_purchase(
  p_idempotency_key uuid,p_supplier_id uuid,p_warehouse_id uuid,
  p_ordered_on date,p_expected_on date,p_purpose text,p_lines jsonb,
  p_supplier_quotation_id uuid,p_report_id uuid,p_material_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_report public.material_sourcing_requests;
  v_context public.purchase_procurement_context;
  v_result jsonb;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can source an out-of-stock report' using errcode='42501';
  end if;
  if p_report_id is null or p_material_id is null or p_idempotency_key is null then
    raise exception 'Choose the shortage report and catalog material' using errcode='22023';
  end if;
  select * into v_report from public.material_sourcing_requests where id=p_report_id for update;
  if not found then raise exception 'Out-of-stock report not found' using errcode='P0002'; end if;
  select * into v_context from public.purchase_procurement_context where idempotency_key=p_idempotency_key;
  if found then
    if v_context.material_sourcing_request_id is distinct from p_report_id
      or v_context.sourcing_material_id is distinct from p_material_id then
      raise exception 'Retry has different shortage sourcing' using errcode='23505';
    end if;
    return public.submit_procurement_purchase(p_idempotency_key,p_supplier_id,p_warehouse_id,
      p_ordered_on,p_expected_on,p_purpose,p_lines,null,p_supplier_quotation_id);
  end if;
  if v_report.status <> 'submitted' or v_report.source_warehouse_id <> p_warehouse_id then
    raise exception 'Out-of-stock report is unavailable for this warehouse' using errcode='22023';
  end if;
  if not exists(select 1 from public.materials where id=p_material_id
      and is_active and archived_at is null and material_kind='consumable')
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    or not exists(select 1 from jsonb_array_elements(p_lines) line
      where line.value->>'materialId'=p_material_id::text) then
    raise exception 'Purchase must include the chosen shortage material' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_procurement_context context
    where context.material_sourcing_request_id=p_report_id
      and context.sourcing_material_id<>p_material_id) then
    raise exception 'This report is already sourced as a different material' using errcode='22023';
  end if;
  v_result := public.submit_procurement_purchase(p_idempotency_key,p_supplier_id,p_warehouse_id,
    p_ordered_on,p_expected_on,p_purpose,p_lines,null,p_supplier_quotation_id);
  update public.purchase_procurement_context
    set material_sourcing_request_id=p_report_id,sourcing_material_id=p_material_id
    where idempotency_key=p_idempotency_key;
  return v_result;
end; $$;
revoke all on function public.submit_sourcing_purchase(uuid,uuid,uuid,date,date,text,jsonb,uuid,uuid,uuid)
  from public,anon;
grant execute on function public.submit_sourcing_purchase(uuid,uuid,uuid,date,date,text,jsonb,uuid,uuid,uuid)
  to authenticated;

create function public.create_sourcing_material_request(
  p_idempotency_key uuid,p_report_id uuid,p_material_id uuid,p_quantity numeric,p_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_report public.material_sourcing_requests;
  v_link public.material_sourcing_request_links;
  v_location_id uuid; v_available numeric; v_allocated numeric; v_pending numeric;
  v_request_id uuid; v_note text:=trim(coalesce(p_note,''));
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can prepare the site request' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_report_id is null or p_material_id is null
    or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,4)
    or char_length(v_note) not between 3 and 500 then
    raise exception 'Invalid site request from shortage' using errcode='22023';
  end if;
  select * into v_report from public.material_sourcing_requests where id=p_report_id for update;
  if not found then raise exception 'Out-of-stock report not found' using errcode='P0002'; end if;
  select * into v_link from public.material_sourcing_request_links where idempotency_key=p_idempotency_key;
  if found then
    if v_link.material_sourcing_request_id<>p_report_id or v_link.material_id<>p_material_id
      or v_link.quantity<>p_quantity or v_link.note<>v_note or v_link.created_by<>v_actor then
      raise exception 'Retry has different site request details' using errcode='23505';
    end if;
    return v_link.material_request_id;
  end if;
  if v_report.status<>'submitted' or not exists(select 1 from public.materials
      where id=p_material_id and is_active and archived_at is null and material_kind='consumable') then
    raise exception 'Out-of-stock report or material is unavailable' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_procurement_context context
      where context.material_sourcing_request_id=p_report_id and context.sourcing_material_id<>p_material_id)
    or exists(select 1 from public.material_sourcing_request_links link
      where link.material_sourcing_request_id=p_report_id and link.material_id<>p_material_id) then
    raise exception 'Choose the material already linked to this report' using errcode='22023';
  end if;
  select coalesce(sum(case
      when request.status in ('rejected','cancelled') then 0
      when request.status='partially_approved' then coalesce(line.approved_quantity,0)
      else link.quantity end),0) into v_allocated
    from public.material_sourcing_request_links link
    join public.material_requests request on request.id=link.material_request_id
    left join public.material_request_lines line on line.request_id=request.id
      and line.material_id=link.material_id
    where link.material_sourcing_request_id=p_report_id;
  if p_quantity>v_report.requested_quantity-v_allocated then
    raise exception 'Site request exceeds remaining reported quantity' using errcode='22023';
  end if;
  select id into v_location_id from public.inventory_locations
    where warehouse_id=v_report.source_warehouse_id;
  select available_quantity into v_available from public.inventory_balances
    where inventory_location_id=v_location_id and material_id=p_material_id for update;
  select coalesce(sum(link.quantity),0) into v_pending
    from public.material_sourcing_request_links link
    join public.material_requests request on request.id=link.material_request_id
    where link.material_sourcing_request_id=p_report_id and request.status='submitted';
  if coalesce(v_available,0)-v_pending<p_quantity then
    raise exception 'Receive this quantity into the source warehouse first' using errcode='P0001';
  end if;
  perform pg_catalog.set_config('app.shortage_report_id',p_report_id::text,true);
  perform pg_catalog.set_config('app.shortage_request_key',p_idempotency_key::text,true);
  v_request_id:=public.submit_material_request(p_idempotency_key,v_report.project_id,
    v_report.project_site_id,v_report.source_warehouse_id,
    greatest(v_report.needed_on,(now() at time zone 'Asia/Manila')::date),
    left('Out-of-stock report '||v_report.id||': '||v_report.reason,500),
    jsonb_build_array(jsonb_build_object('materialId',p_material_id,'quantity',p_quantity)));
  perform pg_catalog.set_config('app.shortage_report_id','',true);
  perform pg_catalog.set_config('app.shortage_request_key','',true);
  insert into public.material_sourcing_request_links
    (material_sourcing_request_id,material_request_id,material_id,quantity,idempotency_key,note,created_by)
    values(p_report_id,v_request_id,p_material_id,p_quantity,p_idempotency_key,v_note,v_actor);
  if v_allocated+p_quantity=v_report.requested_quantity then
    update public.material_sourcing_requests set status='resolved',catalog_material_id=p_material_id,
      resolution_note=v_note,resolved_by=v_actor,resolved_at=now() where id=p_report_id;
  end if;
  return v_request_id;
end; $$;
revoke all on function public.create_sourcing_material_request(uuid,uuid,uuid,numeric,text)
  from public,anon;
grant execute on function public.create_sourcing_material_request(uuid,uuid,uuid,numeric,text)
  to authenticated;

-- Old clients may still dismiss reports, but must not close a shortage without
-- creating the reviewable request that leads to site delivery.
create or replace function public.resolve_material_sourcing_request(
  p_id uuid,p_action text,p_material_id uuid,p_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_report public.material_sourcing_requests;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can dismiss out-of-stock reports' using errcode='42501';
  end if;
  if p_action<>'dismissed' or p_material_id is not null
    or char_length(trim(coalesce(p_note,''))) not between 3 and 500 then
    raise exception 'Create a site request to resolve this shortage' using errcode='22023';
  end if;
  select * into v_report from public.material_sourcing_requests where id=p_id for update;
  if not found or v_report.status<>'submitted' then
    raise exception 'Out-of-stock report is not open' using errcode='22023';
  end if;
  if exists(select 1 from public.material_sourcing_request_links
      where material_sourcing_request_id=p_id) then
    raise exception 'A report with site requests cannot be dismissed' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_procurement_context context
      left join public.purchase_orders purchase on purchase.idempotency_key=context.idempotency_key
      left join public.purchase_approval_requests approval on approval.idempotency_key=context.idempotency_key
      where context.material_sourcing_request_id=p_id
        and (purchase.status is not null and purchase.status<>'cancelled'
          or approval.status='pending')) then
    raise exception 'Cancel the active purchase before dismissing this report' using errcode='22023';
  end if;
  update public.material_sourcing_requests set status='dismissed',resolution_note=trim(p_note),
    resolved_by=auth.uid(),resolved_at=now() where id=p_id;
  return p_id;
end; $$;

notify pgrst,'reload schema';
commit;

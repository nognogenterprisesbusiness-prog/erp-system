-- Diesel is a direct project expense, not an itemized material stock receipt.
begin;
alter table public.site_purchases alter column supplier_id drop not null;
alter table public.site_purchases
  add column purchase_kind text not null default 'inventory' check (purchase_kind in ('inventory','fuel')),
  add column receipt_amount numeric(18,2),
  add column vehicle_id uuid references public.assets(id) on delete restrict,
  add column project_expense_id uuid unique references public.project_additional_expenses(id) on delete restrict,
  add constraint site_purchase_kind_fields check (
    (purchase_kind='inventory' and supplier_id is not null and receipt_amount is null and vehicle_id is null and project_expense_id is null)
    or (purchase_kind='fuel' and supplier_id is null and receipt_amount is not null and receipt_amount>0 and vehicle_id is not null
      and ((status='approved') = (project_expense_id is not null)))
  );
create index site_purchases_vehicle_history on public.site_purchases(vehicle_id, receipt_date desc, id) where vehicle_id is not null;

-- Keep the installed inventory posting implementation intact and private.
alter function public.approve_site_purchase(uuid) set schema private;
revoke all on function private.approve_site_purchase(uuid) from public, anon, authenticated;

create function private.post_vehicle_fuel_expense(p_purchase_id uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.site_purchases; v_expense uuid := gen_random_uuid();
begin
  select * into v from public.site_purchases where id=p_purchase_id for update;
  if v.purchase_kind is distinct from 'fuel' then raise exception 'Fuel receipt not found' using errcode='22023'; end if;
  if v.status='approved' then return v.id; end if;
  if v.status<>'submitted' then raise exception 'This purchase was rejected' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='erp-site-purchase-receipts' and name=v.receipt_photo_path) then
    raise exception 'Add a receipt photo' using errcode='22023';
  end if;
  perform 1 from public.projects where id=v.project_id and archived_at is null and status in ('active','on_hold','completed') for update;
  if not found then raise exception 'Project is not available for expense posting' using errcode='22023'; end if;
  insert into public.project_additional_expenses(id,project_id,expense_date,category,description,external_reference,amount,recorded_by,idempotency_key,command_payload)
  values(v_expense,v.project_id,v.receipt_date,'other','Diesel · '||v.supplier_name,v.purchase_number,v.receipt_amount,
    v.submitted_by,v.idempotency_key,jsonb_build_object('fuel_receipt',v.id));
  update public.site_purchases set status='approved',decided_by=p_actor,decided_at=now(),project_expense_id=v_expense where id=v.id;
  return v.id;
end $$;
revoke all on function private.post_vehicle_fuel_expense(uuid,uuid) from public, anon, authenticated;

create function public.approve_site_purchase(p_purchase_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.site_purchases; v_total numeric;
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Only Admin or Finance can approve a site purchase' using errcode='42501';
  end if;
  select * into v from public.site_purchases where id=p_purchase_id for update;
  if not found then raise exception 'Site purchase not found' using errcode='P0002'; end if;
  select coalesce(v.receipt_amount,sum(round(quantity*unit_price,2))) into v_total from public.site_purchase_lines where site_purchase_id=v.id;
  if v_total>50000 and not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Purchases above PHP 50000 require Admin approval' using errcode='42501';
  end if;
  if v.purchase_kind='fuel' then return private.post_vehicle_fuel_expense(v.id,auth.uid()); end if;
  return private.approve_site_purchase(v.id);
end $$;
revoke all on function public.approve_site_purchase(uuid) from public, anon;
grant execute on function public.approve_site_purchase(uuid) to authenticated;

create function public.submit_vehicle_fuel_receipt(
  p_idempotency_key uuid, p_project_id uuid, p_site_id uuid, p_vehicle_id uuid,
  p_amount numeric, p_paid_with text, p_notes text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_existing public.site_purchases; v_payload jsonb; v_id uuid:=gen_random_uuid();
  v_vehicle public.assets; v_date date:=(now() at time zone 'Asia/Manila')::date; v_reference text;
  v_photo text; v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
  if v_actor is null or not private.has_any_role(array['admin','engineer']::public.app_role[])
    or not private.project_site_role(p_project_id,p_site_id,'engineer') then
    raise exception 'Not authorized to record fuel at this site' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_site_id is null or p_vehicle_id is null
    or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>=10000000000000000
    or p_paid_with is null or p_paid_with not in ('company_cash','own_money') or char_length(v_notes)>500 then
    raise exception 'Invalid diesel receipt details' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('kind','fuel','project',p_project_id,'site',p_site_id,'vehicle',p_vehicle_id,'amount',p_amount,'paid_with',p_paid_with,'notes',v_notes);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_existing from public.site_purchases where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.submitted_by<>v_actor or v_existing.command_payload<>v_payload then
      raise exception 'Idempotency key already used for different receipt details' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  perform 1 from public.project_sites s join public.projects p on p.id=s.project_id
    where s.id=p_site_id and p.id=p_project_id and s.status='active' and p.status='active' and p.archived_at is null for share of s,p;
  if not found then raise exception 'Project site is not active' using errcode='22023'; end if;
  select a.* into v_vehicle from public.assets a join public.asset_locations al on al.id=a.current_location_id
    join public.inventory_locations il on il.id=al.inventory_location_id
    where a.id=p_vehicle_id and a.asset_kind='vehicle' and a.archived_at is null
      and a.status in ('available','assigned','in_use') and al.archived_at is null and il.project_site_id=p_site_id for share of a;
  if not found then raise exception 'Choose a vehicle currently at this site' using errcode='42501'; end if;
  v_photo:=v_actor::text||'/'||p_idempotency_key::text||'/receipt.webp';
  if not exists(select 1 from storage.objects where bucket_id='erp-site-purchase-receipts' and name=v_photo) then
    raise exception 'Add a receipt photo' using errcode='22023';
  end if;
  v_reference:='SP-'||to_char(v_date,'YYYY')||'-'||lpad(nextval('public.site_purchase_number_seq')::text,6,'0');
  insert into public.site_purchases(id,purchase_number,project_id,project_site_id,supplier_name,receipt_number,receipt_date,
    receipt_photo_path,paid_with,notes,submitted_by,idempotency_key,command_payload,purchase_kind,receipt_amount,vehicle_id)
  values(v_id,v_reference,p_project_id,p_site_id,v_vehicle.code||' · '||v_vehicle.name,v_reference,v_date,
    v_photo,p_paid_with,v_notes,v_actor,p_idempotency_key,v_payload,'fuel',p_amount,p_vehicle_id);
  if p_amount<=50000 then perform private.post_vehicle_fuel_expense(v_id,v_actor); end if;
  return v_id;
end $$;
revoke all on function public.submit_vehicle_fuel_receipt(uuid,uuid,uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.submit_vehicle_fuel_receipt(uuid,uuid,uuid,uuid,numeric,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

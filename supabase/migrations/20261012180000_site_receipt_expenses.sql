-- Receipt expenses share the same once-only project posting as diesel.
begin;
alter table public.site_purchases drop constraint site_purchases_purchase_kind_check;
alter table public.site_purchases add constraint site_purchases_purchase_kind_check check(purchase_kind in ('inventory','fuel','expense'));
alter table public.site_purchases drop constraint site_purchase_kind_fields;
alter table public.site_purchases add constraint site_purchase_kind_fields check (
 (purchase_kind='inventory' and supplier_id is not null and receipt_amount is null and vehicle_id is null and project_expense_id is null)
 or (purchase_kind in ('fuel','expense') and supplier_id is null and receipt_amount is not null and receipt_amount>0
   and ((purchase_kind='fuel' and vehicle_id is not null) or (purchase_kind='expense' and vehicle_id is null))
   and ((status='approved')=(project_expense_id is not null)))
);
create function private.post_site_receipt_expense(p_purchase_id uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.site_purchases; v_expense uuid := gen_random_uuid();
begin
  select * into v from public.site_purchases where id=p_purchase_id for update;
  if v.purchase_kind not in ('fuel','expense') then raise exception 'Receipt expense not found' using errcode='22023'; end if;
  if v.status='approved' then return v.id; end if;
  if v.status<>'submitted' then raise exception 'This purchase was rejected' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='erp-site-purchase-receipts' and name=v.receipt_photo_path) then
    raise exception 'Add a receipt photo' using errcode='22023';
  end if;
  perform 1 from public.projects where id=v.project_id and archived_at is null and status in ('active','on_hold','completed') for update;
  if not found then raise exception 'Project is not available for expense posting' using errcode='22023'; end if;
  insert into public.project_additional_expenses(id,project_id,expense_date,category,description,external_reference,amount,recorded_by,idempotency_key,command_payload)
  values(v_expense,v.project_id,v.receipt_date,'other',case when v.purchase_kind='fuel' then 'Diesel · '||v.supplier_name else left('Site receipt expense'||coalesce(' · '||v.notes,''),500) end,v.purchase_number,v.receipt_amount,
    v.submitted_by,v.idempotency_key,jsonb_build_object('site_receipt',v.id,'kind',v.purchase_kind));
  update public.site_purchases set status='approved',decided_by=p_actor,decided_at=now(),project_expense_id=v_expense where id=v.id;
  return v.id;
end $$;
revoke all on function private.post_site_receipt_expense(uuid,uuid) from public,anon,authenticated;
do $$ declare v_definition text; v_signature regprocedure; begin
 foreach v_signature in array array['public.approve_site_purchase(uuid)'::regprocedure,'public.submit_vehicle_fuel_receipt(uuid,uuid,uuid,uuid,numeric,text,text)'::regprocedure] loop
  v_definition:=pg_get_functiondef(v_signature);
  if position('private.post_vehicle_fuel_expense' in v_definition)=0 then raise exception 'Unexpected receipt posting definition'; end if;
  v_definition:=replace(v_definition,'private.post_vehicle_fuel_expense','private.post_site_receipt_expense');
  v_definition:=replace(v_definition,$old$if v.purchase_kind='fuel' then$old$, $new$if v.purchase_kind in ('fuel','expense') then$new$);
  execute v_definition;
 end loop;
end $$;
drop function private.post_vehicle_fuel_expense(uuid,uuid);

create function public.submit_site_receipt_expense(
 p_idempotency_key uuid,p_project_id uuid,p_site_id uuid,p_amount numeric,p_paid_with text,p_notes text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_existing public.site_purchases; v_payload jsonb;
 v_id uuid:=gen_random_uuid(); v_date date:=(now() at time zone 'Asia/Manila')::date; v_reference text; v_photo text;
 v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if v_actor is null or not private.has_any_role(array['admin','engineer']::public.app_role[])
   or not private.project_site_role(p_project_id,p_site_id,'engineer') then
   raise exception 'Not authorized to record an expense at this site' using errcode='42501';
 end if;
 if p_idempotency_key is null or p_project_id is null or p_site_id is null or p_amount is null or p_amount<=0
   or p_amount<>round(p_amount,2) or p_amount>=10000000000000000 or p_paid_with is null
   or p_paid_with not in ('company_cash','own_money') or char_length(v_notes)>500 then
   raise exception 'Invalid receipt expense details' using errcode='22023';
 end if;
 v_payload:=jsonb_build_object('kind','expense','project',p_project_id,'site',p_site_id,'amount',p_amount,'paid_with',p_paid_with,'notes',v_notes);
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
 v_photo:=v_actor::text||'/'||p_idempotency_key::text||'/receipt.webp';
 if not exists(select 1 from storage.objects where bucket_id='erp-site-purchase-receipts' and name=v_photo) then
  raise exception 'Add a receipt photo' using errcode='22023';
 end if;
 v_reference:='SP-'||to_char(v_date,'YYYY')||'-'||lpad(nextval('public.site_purchase_number_seq')::text,6,'0');
 insert into public.site_purchases(id,purchase_number,project_id,project_site_id,supplier_name,receipt_number,receipt_date,
 receipt_photo_path,paid_with,notes,submitted_by,idempotency_key,command_payload,purchase_kind,receipt_amount)
 values(v_id,v_reference,p_project_id,p_site_id,'Receipt expense',v_reference,v_date,v_photo,p_paid_with,v_notes,v_actor,p_idempotency_key,v_payload,'expense',p_amount);
 if p_amount<=50000 then perform private.post_site_receipt_expense(v_id,v_actor); end if;
 return v_id;
end $$;
revoke all on function public.submit_site_receipt_expense(uuid,uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.submit_site_receipt_expense(uuid,uuid,uuid,numeric,text,text) to authenticated;
create function public.get_site_purchase_expense_status(p_purchase_ids uuid[])
returns table(purchase_id uuid,expense_reversed boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_purchase_ids is null or cardinality(p_purchase_ids)>100 then raise exception 'Invalid receipt lookup' using errcode='22023'; end if;
 return query select p.id,exists(select 1 from public.project_expense_reversals r where r.expense_id=p.project_expense_id)
 from public.site_purchases p where p.id=any(p_purchase_ids)
 and (private.has_any_role(array['admin','finance']::public.app_role[]) or private.can_access_project_site(p.project_id,p.project_site_id));
end $$;
revoke all on function public.get_site_purchase_expense_status(uuid[]) from public,anon;
grant execute on function public.get_site_purchase_expense_status(uuid[]) to authenticated;
create function private.refresh_site_receipt_expense_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.site_purchases set updated_at=now() where project_expense_id=new.expense_id;
 return new;
end $$;
revoke all on function private.refresh_site_receipt_expense_status() from public,anon,authenticated;
create trigger project_expense_reversals_refresh_receipt after insert on public.project_expense_reversals
for each row execute function private.refresh_site_receipt_expense_status();
notify pgrst,'reload schema';
commit;

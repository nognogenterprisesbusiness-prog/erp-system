begin;
alter table public.site_purchases add column if not exists receipt_number_generated boolean not null default false;

-- Reuse the audited inventory-receipt flow. No stock or cost posts at submission.
create or replace function public.submit_mobile_site_purchase(
 p_key uuid,p_project_id uuid,p_site_id uuid,p_supplier_id uuid,p_lines jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_existing public.site_purchases;
 v_date date:=(clock_timestamp() at time zone 'Asia/Manila')::date; v_id uuid;
begin
 if v_actor is null or not private.has_any_role(array['admin','engineer']::public.app_role[])
  or not private.project_site_role(p_project_id,p_site_id,'engineer') then
  raise exception 'Not the Engineer of this site' using errcode='42501';
 end if;
 if p_key is null or p_project_id is null or p_site_id is null or p_supplier_id is null then
  raise exception 'Choose the project site and actual hardware store' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select * into v_existing from public.site_purchases where idempotency_key=p_key;
 if found then
  if v_existing.submitted_by<>v_actor or v_existing.purchase_kind<>'inventory' or not v_existing.receipt_number_generated then
   raise exception 'Idempotency key already used for another purchase' using errcode='23505';
  end if;
  v_date:=v_existing.receipt_date;
 end if;
 v_id:=public.submit_site_purchase(p_key,p_project_id,p_site_id,p_supplier_id,null,null,null,
  'MOB-'||replace(p_key::text,'-',''),v_date,'company_cash',null,p_lines);
 update public.site_purchases set receipt_number_generated=true where id=v_id and not receipt_number_generated;
 return v_id;
end; $$;
revoke all on function public.submit_mobile_site_purchase(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.submit_mobile_site_purchase(uuid,uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

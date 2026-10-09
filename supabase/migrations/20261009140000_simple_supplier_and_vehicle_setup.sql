-- Retire supplier category management and use a typed vehicle description.
-- Existing reference data and optional vehicle details remain as history.
begin;

drop function public.save_supplier_category(uuid,text,text);
drop function public.archive_supplier_category(uuid);
revoke all on public.supplier_categories from anon, authenticated;

alter table public.assets
  alter column category_id drop not null,
  alter column brand drop not null,
  alter column model drop not null,
  alter column acquisition_date drop not null;
alter table public.assets add constraint assets_equipment_required_details check (
  asset_kind <> 'equipment' or (
    category_id is not null and brand is not null and model is not null and acquisition_date is not null
  )
);
alter table public.vehicle_details alter column manufacture_year drop not null;
alter table public.vehicle_details add column vehicle_type text;
-- Validate each existing subtype immediately so the backfill cannot leave
-- queued constraint-trigger events blocking the following table changes.
set constraints public.vehicle_details_match_asset immediate;
update public.vehicle_details v set vehicle_type = c.name
from public.assets a join public.asset_categories c on c.id=a.category_id
where a.id=v.asset_id;
alter table public.vehicle_details alter column vehicle_type set not null;
alter table public.vehicle_details add constraint vehicle_details_type_length
  check (char_length(trim(vehicle_type)) between 2 and 120);
set constraints public.vehicle_details_match_asset deferred;

create sequence private.vehicle_code_seq as bigint start with 1;
revoke all on sequence private.vehicle_code_seq from public, anon, authenticated;

drop function public.save_vehicle(uuid,text,text,text,uuid,text,text,date,public.asset_ownership_type,public.asset_status,uuid,text,text,smallint,numeric);
create function public.save_vehicle(
  p_id uuid, p_code text, p_name text, p_vehicle_type text, p_plate_number text,
  p_location_id uuid, p_ownership_type public.asset_ownership_type,
  p_status public.asset_status, p_condition_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.assets;
  v_event public.asset_event_type;
  v_sequence bigint;
  v_code text := upper(nullif(trim(coalesce(p_code,'')),''));
begin
  if v_actor is null or not private.can_manage_assets() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('available','under_maintenance','out_of_service')
    or p_ownership_type is null
    or char_length(trim(coalesce(p_name,''))) not between 2 and 160
    or char_length(trim(coalesce(p_vehicle_type,''))) not between 2 and 120
    or trim(coalesce(p_plate_number,'')) !~ '^[A-Z0-9 -]{2,20}$'
    or char_length(coalesce(p_condition_notes,'')) > 2000 then
    raise exception 'invalid vehicle values' using errcode = '22023';
  end if;
  if p_id is not null then
    select * into v_old from public.assets
      where id=p_id and asset_kind='vehicle' and archived_at is null for update;
    if v_old.id is null then raise exception 'vehicle not found' using errcode = 'P0002'; end if;
    if v_old.status in ('assigned','in_use') or exists (
      select 1 from public.equipment_requests where asset_id=p_id and status='checked_out'
    ) then
      raise exception 'return the vehicle before changing its registry details' using errcode = '55000';
    end if;
    v_code := coalesce(v_code,v_old.code);
  end if;
  if not exists (select 1 from public.asset_locations where id=p_location_id and archived_at is null)
    or not private.can_view_asset_location(p_location_id) then
    raise exception 'asset location is unavailable' using errcode = '42501';
  end if;
  if v_code is null then
    loop
      v_sequence := nextval('private.vehicle_code_seq');
      v_code := 'VEH-' || lpad(v_sequence::text,greatest(4,char_length(v_sequence::text)),'0');
      exit when not exists (select 1 from public.assets where code=v_code);
    end loop;
  end if;
  if v_code !~ '^[A-Z0-9-]{2,32}$' then
    raise exception 'invalid vehicle code' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.assets (
      asset_kind,code,name,ownership_type,status,current_location_id,condition_notes,created_by,updated_by
    ) values (
      'vehicle',v_code,trim(p_name),p_ownership_type,p_status,p_location_id,
      nullif(trim(p_condition_notes),''),v_actor,v_actor
    ) returning id into v_id;
    insert into public.vehicle_details(asset_id,vehicle_type,plate_number)
      values(v_id,trim(p_vehicle_type),trim(p_plate_number));
    perform private.record_asset_event(v_id,'registered',null,p_status,null,p_location_id,
      'Vehicle registered',jsonb_build_object('code',v_code,'vehicle_type',trim(p_vehicle_type)),v_actor);
  else
    update public.assets set code=v_code,name=trim(p_name),ownership_type=p_ownership_type,
      status=p_status,current_location_id=p_location_id,condition_notes=nullif(trim(p_condition_notes),''),
      updated_by=v_actor where id=p_id;
    update public.vehicle_details set vehicle_type=trim(p_vehicle_type),plate_number=trim(p_plate_number)
      where asset_id=p_id;
    v_id := p_id;
    v_event := case when v_old.current_location_id<>p_location_id then 'location_changed'
      when v_old.status<>p_status then 'status_changed' else 'details_updated' end;
    perform private.record_asset_event(v_id,v_event,v_old.status,p_status,v_old.current_location_id,
      p_location_id,'Vehicle record updated',jsonb_build_object('code',v_code,'vehicle_type',trim(p_vehicle_type)),v_actor);
  end if;
  return v_id;
end; $$;
revoke all on function public.save_vehicle(uuid,text,text,text,text,uuid,public.asset_ownership_type,public.asset_status,text) from public,anon;
grant execute on function public.save_vehicle(uuid,text,text,text,text,uuid,public.asset_ownership_type,public.asset_status,text) to authenticated;

create or replace function public.save_asset_category(p_id uuid,p_asset_kind public.asset_kind,p_name text,p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_asset_kind is distinct from 'equipment'::public.asset_kind
    or char_length(trim(coalesce(p_name,''))) not between 2 and 120
    or char_length(coalesce(p_description,'')) > 2000 then
    raise exception 'invalid equipment category' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.asset_categories(asset_kind,name,description,created_by,updated_by)
      values('equipment',trim(p_name),nullif(trim(p_description),''),v_actor,v_actor) returning id into v_id;
  else
    update public.asset_categories set name=trim(p_name),description=nullif(trim(p_description),''),updated_by=v_actor
      where id=p_id and asset_kind='equipment' and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'equipment category not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.archive_asset_category(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists(select 1 from public.assets where category_id=p_id and archived_at is null) then
    raise exception 'reassign or archive active assets before archiving this category' using errcode = '23503';
  end if;
  update public.asset_categories set archived_at=now(),archived_by=v_actor,updated_by=v_actor
    where id=p_id and asset_kind='equipment' and archived_at is null;
  if not found then raise exception 'equipment category not found' using errcode = 'P0002'; end if;
end; $$;

-- The existing save_supplier signature is retained for older server clients.
-- Its replacement below accepts no new classification and preserves old links.

create or replace function public.save_supplier(
  p_id uuid, p_code text, p_supplier_name text, p_business_name text, p_category_id uuid,
  p_contact_person text, p_contact_number text, p_email_address text, p_business_address text,
  p_city text, p_province text, p_tax_identification_number text, p_payment_terms text,
  p_status public.supplier_status, p_remarks text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.suppliers;
  v_event public.supplier_event_type;
  v_code text := upper(nullif(trim(coalesce(p_code, '')), ''));
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_person text := nullif(trim(coalesce(p_contact_person, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email_address, '')), ''));
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_province text := nullif(trim(coalesce(p_province, '')), '');
  v_terms text := nullif(trim(coalesce(p_payment_terms, '')), '');
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_id is not null then
    select * into v_old from public.suppliers where id = p_id and archived_at is null for update;
    if v_old.id is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
    v_code := coalesce(v_code, v_old.code);
  end if;
  if v_code is null then
    loop
      v_code := 'SUP-' || lpad(nextval('private.supplier_code_seq')::text, 4, '0');
      exit when not exists (select 1 from public.suppliers where code = v_code);
    end loop;
  end if;
  if v_code !~ '^[A-Z0-9-]{2,32}$'
    or char_length(trim(coalesce(p_supplier_name, ''))) not between 2 and 160
    or char_length(trim(coalesce(p_contact_number, ''))) not between 7 and 40
    or trim(p_contact_number) !~ '^[0-9+() .-]+$'
    or char_length(trim(coalesce(p_business_address, ''))) not between 3 and 300
    or (v_business is not null and char_length(v_business) not between 2 and 200)
    or (v_person is not null and char_length(v_person) not between 2 and 160)
    or (v_email is not null and (char_length(v_email) not between 3 and 254 or position('@' in v_email) <= 1))
    or (v_city is not null and char_length(v_city) not between 2 and 120)
    or (v_province is not null and char_length(v_province) not between 2 and 120)
    or (v_terms is not null and char_length(v_terms) not between 2 and 160)
  then raise exception 'invalid supplier values' using errcode = '22023'; end if;
  if p_category_id is not null then
    raise exception 'supplier categories have been retired' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.suppliers (
      code, supplier_name, business_name, contact_person, contact_number, email_address,
      business_address, city, province, tax_identification_number, payment_terms, status, remarks, created_by, updated_by
    ) values (
      v_code, trim(p_supplier_name), v_business, v_person, trim(p_contact_number), v_email,
      trim(p_business_address), v_city, v_province, nullif(trim(coalesce(p_tax_identification_number, '')), ''),
      v_terms, coalesce(p_status, 'active'), nullif(trim(coalesce(p_remarks, '')), ''), v_actor, v_actor
    ) returning id into v_id;
    perform private.record_supplier_event(v_id, 'registered', 'Supplier registered', jsonb_build_object('code', v_code), v_actor);
  else
    update public.suppliers set
      code = v_code, supplier_name = trim(p_supplier_name), business_name = v_business,
      contact_person = v_person, contact_number = trim(p_contact_number), email_address = v_email,
      business_address = trim(p_business_address), city = v_city, province = v_province,
      tax_identification_number = nullif(trim(coalesce(p_tax_identification_number, '')), ''), payment_terms = v_terms,
      status = coalesce(p_status, v_old.status), remarks = nullif(trim(coalesce(p_remarks, '')), ''), updated_by = v_actor
    where id = p_id;
    v_id := p_id;
    v_event := case when v_old.status <> coalesce(p_status, v_old.status) then 'status_changed' else 'details_updated' end;
    perform private.record_supplier_event(v_id, v_event, 'Supplier record updated', jsonb_build_object('code', v_code), v_actor);
  end if;
  return v_id;
end; $$;

notify pgrst, 'reload schema';
commit;

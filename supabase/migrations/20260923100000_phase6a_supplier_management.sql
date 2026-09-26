create type public.supplier_status as enum ('active', 'inactive');
create type public.material_availability_status as enum ('available', 'limited', 'unavailable', 'discontinued');
create type public.supplier_event_type as enum (
  'registered', 'details_updated', 'status_changed', 'archived',
  'material_added', 'material_updated', 'material_archived', 'price_added', 'price_closed'
);

create table public.supplier_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_categories_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index supplier_categories_name_unique on public.supplier_categories (lower(name)) where archived_at is null;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  supplier_name text not null check (char_length(trim(supplier_name)) between 2 and 160),
  business_name text not null check (char_length(trim(business_name)) between 2 and 200),
  category_id uuid not null references public.supplier_categories(id) on delete restrict,
  contact_person text not null check (char_length(trim(contact_person)) between 2 and 160),
  contact_number text not null check (char_length(trim(contact_number)) between 7 and 40 and contact_number ~ '^[0-9+() .-]+$'),
  email_address text not null check (char_length(trim(email_address)) between 3 and 254 and position('@' in email_address) > 1),
  business_address text not null check (char_length(trim(business_address)) between 3 and 300),
  city text not null check (char_length(trim(city)) between 2 and 120),
  province text not null check (char_length(trim(province)) between 2 and 120),
  tax_identification_number text check (tax_identification_number is null or char_length(trim(tax_identification_number)) between 3 and 40),
  payment_terms text not null check (char_length(trim(payment_terms)) between 2 and 160),
  status public.supplier_status not null default 'active',
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_archive_pair check ((archived_at is null) = (archived_by is null)),
  constraint suppliers_archived_status check (archived_at is null or status = 'inactive')
);
create unique index suppliers_tin_unique on public.suppliers (lower(tax_identification_number)) where tax_identification_number is not null;
create index suppliers_status_idx on public.suppliers (status, supplier_name) where archived_at is null;
create index suppliers_category_idx on public.suppliers (category_id, status) where archived_at is null;
create index suppliers_business_name_idx on public.suppliers (business_name) where archived_at is null;

create table public.supplier_materials (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  supplier_material_code text not null check (supplier_material_code = upper(supplier_material_code) and supplier_material_code ~ '^[A-Z0-9./-]{1,80}$'),
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  minimum_order_quantity numeric(20,4) not null check (minimum_order_quantity > 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 3650),
  availability_status public.material_availability_status not null default 'available',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_materials_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index supplier_materials_active_unique on public.supplier_materials (supplier_id, material_id, unit_of_measure_id) where archived_at is null;
create unique index supplier_materials_code_unique on public.supplier_materials (supplier_id, supplier_material_code) where archived_at is null;
create index supplier_materials_material_idx on public.supplier_materials (material_id, unit_of_measure_id, availability_status) where archived_at is null;
create index supplier_materials_supplier_idx on public.supplier_materials (supplier_id, availability_status) where archived_at is null;

create table public.supplier_prices (
  id uuid primary key default gen_random_uuid(),
  supplier_material_id uuid not null references public.supplier_materials(id) on delete restrict,
  unit_price numeric(18,2) not null check (unit_price > 0),
  effective_start_date date not null,
  effective_end_date date,
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_price_dates check (effective_end_date is null or effective_end_date >= effective_start_date)
);
create index supplier_prices_catalog_idx on public.supplier_prices (supplier_material_id, effective_start_date desc);

create table public.supplier_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  event_type public.supplier_event_type not null,
  summary text not null check (char_length(trim(summary)) between 2 and 500),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index supplier_events_supplier_idx on public.supplier_events (supplier_id, occurred_at desc);

create or replace function private.can_manage_suppliers()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['admin']::public.app_role[]) $$;

create or replace function private.can_view_suppliers()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['admin']::public.app_role[]) $$;

create or replace function private.record_supplier_event(
  p_supplier_id uuid, p_event_type public.supplier_event_type, p_summary text, p_details jsonb, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.supplier_events (supplier_id, event_type, summary, details, actor_id)
  values (p_supplier_id, p_event_type, trim(p_summary), coalesce(p_details, '{}'::jsonb), p_actor);
end;
$$;

create or replace function private.prevent_supplier_price_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.supplier_prices sp
    where sp.supplier_material_id = new.supplier_material_id
      and sp.id <> new.id
      and daterange(sp.effective_start_date, coalesce(sp.effective_end_date, 'infinity'::date), '[]')
          && daterange(new.effective_start_date, coalesce(new.effective_end_date, 'infinity'::date), '[]')
  ) then
    raise exception 'supplier price effective dates overlap an existing price' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger supplier_prices_prevent_overlap before insert or update on public.supplier_prices
  for each row execute function private.prevent_supplier_price_overlap();

create or replace function private.enforce_supplier_price_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'supplier price history is immutable' using errcode = '55000';
  end if;
  if new.supplier_material_id is distinct from old.supplier_material_id
    or new.unit_price is distinct from old.unit_price
    or new.effective_start_date is distinct from old.effective_start_date
    or new.currency is distinct from old.currency
    or new.recorded_by is distinct from old.recorded_by
    or new.created_at is distinct from old.created_at
    or old.effective_end_date is not null
    or new.effective_end_date is null
  then
    raise exception 'supplier price history is immutable; an open version may only be closed once' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger supplier_prices_enforce_history before update or delete on public.supplier_prices
  for each row execute function private.enforce_supplier_price_history();

create or replace function public.save_supplier_category(p_id uuid, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'invalid supplier category name' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.supplier_categories (name, description, created_by, updated_by)
    values (trim(p_name), nullif(trim(p_description), ''), v_actor, v_actor) returning id into v_id;
  else
    update public.supplier_categories set name = trim(p_name), description = nullif(trim(p_description), ''), updated_by = v_actor
    where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'supplier category not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_supplier_category(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.suppliers where category_id = p_id and archived_at is null) then
    raise exception 'reassign or archive active suppliers before archiving this category' using errcode = '23503';
  end if;
  update public.supplier_categories set archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id and archived_at is null;
  if not found then raise exception 'supplier category not found or already archived' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.save_supplier(
  p_id uuid, p_code text, p_supplier_name text, p_business_name text, p_category_id uuid,
  p_contact_person text, p_contact_number text, p_email_address text, p_business_address text,
  p_city text, p_province text, p_tax_identification_number text, p_payment_terms text,
  p_status public.supplier_status, p_remarks text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_old public.suppliers; v_event public.supplier_event_type;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$'
    or char_length(trim(p_supplier_name)) not between 2 and 160
    or char_length(trim(p_business_name)) not between 2 and 200
    or char_length(trim(p_contact_person)) not between 2 and 160
    or char_length(trim(p_contact_number)) not between 7 and 40
    or trim(p_contact_number) !~ '^[0-9+() .-]+$'
    or char_length(trim(p_email_address)) not between 3 and 254
    or position('@' in p_email_address) <= 1
    or char_length(trim(p_business_address)) not between 3 and 300
    or char_length(trim(p_city)) not between 2 and 120
    or char_length(trim(p_province)) not between 2 and 120
    or char_length(trim(p_payment_terms)) not between 2 and 160
  then raise exception 'invalid supplier values' using errcode = '22023'; end if;
  if not exists (select 1 from public.supplier_categories where id = p_category_id and archived_at is null) then
    raise exception 'supplier category is missing or archived' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.suppliers (
      code, supplier_name, business_name, category_id, contact_person, contact_number, email_address,
      business_address, city, province, tax_identification_number, payment_terms, status, remarks, created_by, updated_by
    ) values (
      trim(p_code), trim(p_supplier_name), trim(p_business_name), p_category_id, trim(p_contact_person), trim(p_contact_number),
      lower(trim(p_email_address)), trim(p_business_address), trim(p_city), trim(p_province), nullif(trim(p_tax_identification_number), ''),
      trim(p_payment_terms), p_status, nullif(trim(p_remarks), ''), v_actor, v_actor
    ) returning id into v_id;
    perform private.record_supplier_event(v_id, 'registered', 'Supplier registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.suppliers where id = p_id and archived_at is null for update;
    if v_old.id is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
    update public.suppliers set
      code = trim(p_code), supplier_name = trim(p_supplier_name), business_name = trim(p_business_name), category_id = p_category_id,
      contact_person = trim(p_contact_person), contact_number = trim(p_contact_number), email_address = lower(trim(p_email_address)),
      business_address = trim(p_business_address), city = trim(p_city), province = trim(p_province),
      tax_identification_number = nullif(trim(p_tax_identification_number), ''), payment_terms = trim(p_payment_terms),
      status = p_status, remarks = nullif(trim(p_remarks), ''), updated_by = v_actor
    where id = p_id;
    v_id := p_id;
    v_event := case when v_old.status <> p_status then 'status_changed' else 'details_updated' end;
    perform private.record_supplier_event(v_id, v_event, 'Supplier record updated', jsonb_build_object('code', trim(p_code)), v_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_supplier(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_supplier public.suppliers;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'archive reason is required' using errcode = '22023'; end if;
  select * into v_supplier from public.suppliers where id = p_id and archived_at is null for update;
  if v_supplier.id is null then raise exception 'supplier not found or already archived' using errcode = 'P0002'; end if;
  if exists (select 1 from public.supplier_materials where supplier_id = p_id and archived_at is null) then
    raise exception 'archive active supplier catalog entries before archiving this supplier' using errcode = '22023';
  end if;
  update public.suppliers set status = 'inactive', archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id;
  perform private.record_supplier_event(p_id, 'archived', trim(p_reason), '{}'::jsonb, v_actor);
end;
$$;

create or replace function public.save_supplier_material(
  p_id uuid, p_supplier_id uuid, p_material_id uuid, p_supplier_material_code text,
  p_unit_id uuid, p_minimum_order_quantity numeric, p_lead_time_days integer,
  p_availability_status public.material_availability_status
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_existing public.supplier_materials; v_scale smallint;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if trim(p_supplier_material_code) !~ '^[A-Z0-9./-]{1,80}$' or p_minimum_order_quantity <= 0 or (p_lead_time_days is not null and p_lead_time_days not between 0 and 3650) then
    raise exception 'invalid supplier material values' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and status = 'active' and archived_at is null) then
    raise exception 'supplier is unavailable' using errcode = '22023';
  end if;
  select u.decimal_scale into v_scale
  from public.materials m join public.units_of_measure u on u.id = m.base_unit_id and u.is_active
  where m.id = p_material_id and m.is_active and m.archived_at is null and m.base_unit_id = p_unit_id;
  if v_scale is null then raise exception 'material is unavailable or unit does not match its base unit' using errcode = '22023'; end if;
  if p_minimum_order_quantity <> round(p_minimum_order_quantity, v_scale) then raise exception 'minimum order quantity exceeds unit precision' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.supplier_materials (
      supplier_id, material_id, supplier_material_code, unit_of_measure_id, minimum_order_quantity,
      lead_time_days, availability_status, created_by, updated_by
    ) values (
      p_supplier_id, p_material_id, trim(p_supplier_material_code), p_unit_id, p_minimum_order_quantity,
      p_lead_time_days, p_availability_status, v_actor, v_actor
    ) returning id into v_id;
    perform private.record_supplier_event(p_supplier_id, 'material_added', 'Supplier material added', jsonb_build_object('supplier_material_id', v_id, 'material_id', p_material_id), v_actor);
  else
    select * into v_existing from public.supplier_materials where id = p_id and supplier_id = p_supplier_id and archived_at is null for update;
    if v_existing.id is null then raise exception 'supplier material not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.supplier_prices where supplier_material_id = p_id)
      and (v_existing.material_id <> p_material_id or v_existing.unit_of_measure_id <> p_unit_id)
    then raise exception 'material and unit cannot change after price history exists' using errcode = '22023'; end if;
    update public.supplier_materials set
      material_id = p_material_id, supplier_material_code = trim(p_supplier_material_code), unit_of_measure_id = p_unit_id,
      minimum_order_quantity = p_minimum_order_quantity, lead_time_days = p_lead_time_days,
      availability_status = p_availability_status, updated_by = v_actor
    where id = p_id;
    v_id := p_id;
    perform private.record_supplier_event(p_supplier_id, 'material_updated', 'Supplier material updated', jsonb_build_object('supplier_material_id', v_id, 'material_id', p_material_id), v_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_supplier_material(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_catalog public.supplier_materials;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_catalog from public.supplier_materials where id = p_id and archived_at is null for update;
  if v_catalog.id is null then raise exception 'supplier material not found or already archived' using errcode = 'P0002'; end if;
  if exists (select 1 from public.supplier_prices where supplier_material_id = p_id and effective_end_date is null) then
    raise exception 'close the current supplier price before archiving this catalog entry' using errcode = '22023';
  end if;
  update public.supplier_materials set archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id;
  perform private.record_supplier_event(v_catalog.supplier_id, 'material_archived', 'Supplier material archived', jsonb_build_object('supplier_material_id', p_id), v_actor);
end;
$$;

create or replace function public.post_supplier_price(
  p_supplier_material_id uuid, p_unit_price numeric, p_effective_start_date date,
  p_effective_end_date date, p_currency text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_supplier_id uuid;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_unit_price <= 0 or upper(trim(p_currency)) !~ '^[A-Z]{3}$'
    or (p_effective_end_date is not null and p_effective_end_date < p_effective_start_date)
  then raise exception 'invalid supplier price values' using errcode = '22023'; end if;
  select sm.supplier_id into v_supplier_id
  from public.supplier_materials sm join public.suppliers s on s.id = sm.supplier_id
  where sm.id = p_supplier_material_id and sm.archived_at is null and s.status = 'active' and s.archived_at is null;
  if v_supplier_id is null then raise exception 'supplier material is unavailable' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_supplier_material_id::text, 0));
  insert into public.supplier_prices (
    supplier_material_id, unit_price, effective_start_date, effective_end_date, currency, recorded_by
  ) values (
    p_supplier_material_id, p_unit_price, p_effective_start_date, p_effective_end_date, upper(trim(p_currency)), v_actor
  ) returning id into v_id;
  perform private.record_supplier_event(v_supplier_id, 'price_added', 'Supplier price version added', jsonb_build_object('supplier_material_id', p_supplier_material_id, 'price_id', v_id), v_actor);
  return v_id;
end;
$$;

create or replace function public.close_supplier_price(p_price_id uuid, p_effective_end_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_price public.supplier_prices; v_supplier_id uuid;
begin
  if v_actor is null or not private.can_manage_suppliers() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_price from public.supplier_prices where id = p_price_id and effective_end_date is null for update;
  if v_price.id is null then raise exception 'open supplier price not found' using errcode = 'P0002'; end if;
  if p_effective_end_date < v_price.effective_start_date then raise exception 'supplier price end date precedes start date' using errcode = '22023'; end if;
  update public.supplier_prices set effective_end_date = p_effective_end_date where id = p_price_id;
  select supplier_id into v_supplier_id from public.supplier_materials where id = v_price.supplier_material_id;
  perform private.record_supplier_event(v_supplier_id, 'price_closed', 'Supplier price version closed', jsonb_build_object('supplier_material_id', v_price.supplier_material_id, 'price_id', p_price_id), v_actor);
end;
$$;

create trigger supplier_categories_set_updated_at before update on public.supplier_categories for each row execute function private.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function private.set_updated_at();
create trigger supplier_materials_set_updated_at before update on public.supplier_materials for each row execute function private.set_updated_at();
create trigger supplier_prices_set_updated_at before update on public.supplier_prices for each row execute function private.set_updated_at();

create trigger supplier_categories_audit after insert or update or delete on public.supplier_categories for each row execute function private.audit_row_change();
create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function private.audit_row_change();
create trigger supplier_materials_audit after insert or update or delete on public.supplier_materials for each row execute function private.audit_row_change();
create trigger supplier_prices_audit after insert or update or delete on public.supplier_prices for each row execute function private.audit_row_change();
create trigger supplier_events_audit after insert on public.supplier_events for each row execute function private.audit_row_change();

alter table public.supplier_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_materials enable row level security;
alter table public.supplier_prices enable row level security;
alter table public.supplier_events enable row level security;

revoke all on table public.supplier_categories, public.suppliers, public.supplier_materials, public.supplier_prices, public.supplier_events from anon, authenticated;
grant select on table public.supplier_categories, public.suppliers, public.supplier_materials, public.supplier_prices, public.supplier_events to authenticated;

create policy supplier_categories_select_authorized on public.supplier_categories for select to authenticated using (private.can_view_suppliers());
create policy suppliers_select_authorized on public.suppliers for select to authenticated using (private.can_view_suppliers());
create policy supplier_materials_select_authorized on public.supplier_materials for select to authenticated using (private.can_view_suppliers());
create policy supplier_prices_select_authorized on public.supplier_prices for select to authenticated using (private.can_view_suppliers());
create policy supplier_events_select_authorized on public.supplier_events for select to authenticated using (private.can_view_suppliers());

revoke execute on function private.can_manage_suppliers(), private.can_view_suppliers(),
  private.record_supplier_event(uuid, public.supplier_event_type, text, jsonb, uuid), private.prevent_supplier_price_overlap(),
  private.enforce_supplier_price_history()
from public, anon, authenticated;
grant execute on function private.can_manage_suppliers(), private.can_view_suppliers() to authenticated;

revoke execute on function public.save_supplier_category(uuid, text, text), public.archive_supplier_category(uuid),
  public.save_supplier(uuid, text, text, text, uuid, text, text, text, text, text, text, text, text, public.supplier_status, text),
  public.archive_supplier(uuid, text),
  public.save_supplier_material(uuid, uuid, uuid, text, uuid, numeric, integer, public.material_availability_status),
  public.archive_supplier_material(uuid), public.post_supplier_price(uuid, numeric, date, date, text), public.close_supplier_price(uuid, date)
from public, anon;
grant execute on function public.save_supplier_category(uuid, text, text), public.archive_supplier_category(uuid),
  public.save_supplier(uuid, text, text, text, uuid, text, text, text, text, text, text, text, text, public.supplier_status, text),
  public.archive_supplier(uuid, text),
  public.save_supplier_material(uuid, uuid, uuid, text, uuid, numeric, integer, public.material_availability_status),
  public.archive_supplier_material(uuid), public.post_supplier_price(uuid, numeric, date, date, text), public.close_supplier_price(uuid, date)
to authenticated;

-- Site purchase (client feedback 2026-10-05): the Engineer buys materials at a
-- hardware store, records the receipt (with a photo) and submits it. Admin or
-- Finance approves it; the stock is then added directly at that project site
-- at the receipt price, and the price becomes the store's latest price.
-- No spending limit. Paid with company cash, or the Engineer's own money and
-- reimbursed later (Finance or Admin marks it reimbursed).
--
-- Rules: only materials already in inventory; a new store needs name, address
-- and contact number and is matched by name so it is not created twice; the
-- same receipt cannot be submitted twice for a store; approval posts stock once.
-- Project cost is still charged when the material is used at the site.
--
-- Also: the supplier "latest price" step is shared by purchase orders and site
-- purchases (private.record_supplier_purchase_price), so it exists once.
--
-- Safe to rerun: objects use IF NOT EXISTS / OR REPLACE / drop-before-create.

-- ---------------------------------------------------------------- shared price step
-- Finds or creates the supplier's entry for the material, then keeps the
-- supplier's latest price in step with the price just paid. Price history is
-- immutable: a newer date closes the current price the day before; a
-- back-dated or same-day different price leaves history unchanged (null id).
create or replace function private.record_supplier_purchase_price(
  p_supplier_id uuid, p_material public.materials, p_unit public.units_of_measure,
  p_unit_price numeric, p_price_date date, p_actor uuid, p_source text
) returns table (catalog_id uuid, price_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_catalog public.supplier_materials;
  v_price public.supplier_prices;
  v_price_id uuid;
  v_code text;
begin
  select * into v_catalog from public.supplier_materials
    where supplier_id = p_supplier_id and material_id = p_material.id
      and unit_of_measure_id = p_unit.id and archived_at is null;
  if v_catalog.id is null then
    v_code := p_material.code;
    if exists (select 1 from public.supplier_materials where supplier_id = p_supplier_id
      and supplier_material_code = v_code and archived_at is null) then
      v_code := left(p_material.code, 60) || '-' || upper(left(replace(p_material.id::text, '-', ''), 8));
    end if;
    insert into public.supplier_materials (supplier_id, material_id, supplier_material_code, unit_of_measure_id,
      minimum_order_quantity, availability_status, created_by, updated_by)
    values (p_supplier_id, p_material.id, v_code, p_unit.id, power(10::numeric, -p_unit.decimal_scale), 'available', p_actor, p_actor)
    returning * into v_catalog;
    perform private.record_supplier_event(p_supplier_id, 'material_added', 'Supplier material added from a ' || p_source,
      jsonb_build_object('supplier_material_id', v_catalog.id, 'material_id', p_material.id), p_actor);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_catalog.id::text, 0));
  select * into v_price from public.supplier_prices
    where supplier_material_id = v_catalog.id and effective_end_date is null and currency = 'PHP' limit 1;
  if v_price.id is not null and v_price.unit_price = p_unit_price then
    v_price_id := v_price.id;
  elsif (v_price.id is null or v_price.effective_start_date < p_price_date)
    and not exists (select 1 from public.supplier_prices where supplier_material_id = v_catalog.id
      and id is distinct from v_price.id and coalesce(effective_end_date, 'infinity'::date) >= p_price_date) then
    if v_price.id is not null then
      update public.supplier_prices set effective_end_date = p_price_date - 1 where id = v_price.id;
    end if;
    insert into public.supplier_prices (supplier_material_id, unit_price, effective_start_date, currency, recorded_by)
    values (v_catalog.id, p_unit_price, p_price_date, 'PHP', p_actor) returning id into v_price_id;
    perform private.record_supplier_event(p_supplier_id, 'price_added', 'Supplier price updated from a ' || p_source,
      jsonb_build_object('supplier_material_id', v_catalog.id, 'price_id', v_price_id), p_actor);
  end if;
  return query select v_catalog.id, v_price_id;
end; $$;

-- Purchase orders now use the shared price step (same behaviour as before).
create or replace function public.issue_purchase_order(
  p_idempotency_key uuid, p_supplier_id uuid, p_warehouse_id uuid,
  p_ordered_on date, p_expected_on date, p_purpose text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.purchase_orders;
  v_supplier public.suppliers;
  v_warehouse public.warehouses;
  v_order_id uuid := gen_random_uuid();
  v_line jsonb;
  v_material public.materials;
  v_unit public.units_of_measure;
  v_catalog_id uuid;
  v_price_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_purpose text := nullif(trim(coalesce(p_purpose, '')), '');
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can issue a purchase order' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_supplier_id is null or p_warehouse_id is null or p_ordered_on is null
    or (p_expected_on is not null and p_expected_on < p_ordered_on)
    or (v_purpose is not null and char_length(v_purpose) not between 3 and 500)
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'Invalid purchase order details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('supplier', p_supplier_id, 'warehouse', p_warehouse_id,
    'ordered_on', p_ordered_on, 'expected_on', p_expected_on, 'purpose', v_purpose, 'lines', p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.purchase_orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.issued_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another order' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_supplier from public.suppliers where id = p_supplier_id and status = 'active' and archived_at is null;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and status = 'active';
  if v_supplier.id is null or v_warehouse.id is null then
    raise exception 'Supplier or warehouse is not active' using errcode = '22023';
  end if;
  insert into public.purchase_orders (id, po_number, supplier_id, supplier_name, warehouse_id,
    warehouse_code, warehouse_name, ordered_on, expected_on, purpose, issued_by, idempotency_key, command_payload)
  values (v_order_id, 'PO-' || to_char(p_ordered_on, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    v_supplier.id, v_supplier.supplier_name, v_warehouse.id, v_warehouse.code, v_warehouse.name,
    p_ordered_on, p_expected_on, v_purpose, v_actor, p_idempotency_key, v_payload);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or (v_line->>'materialId') is null
      or (v_line->>'quantity') is null or (v_line->>'unitPrice') is null then
      raise exception 'Invalid purchase order line' using errcode = '22023';
    end if;
    select * into v_material from public.materials where id = (v_line->>'materialId')::uuid
      and is_active and archived_at is null and material_kind = 'consumable';
    select * into v_unit from public.units_of_measure where id = v_material.base_unit_id and is_active;
    if v_material.id is null or v_unit.id is null then
      raise exception 'Material or unit is not active' using errcode = '22023';
    end if;
    if v_material.id = any(v_seen) then raise exception 'Choose each material once' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_material.id);
    v_quantity := (v_line->>'quantity')::numeric;
    perform private.validate_inventory_quantity(v_quantity, v_unit.id);
    v_unit_price := (v_line->>'unitPrice')::numeric;
    if v_unit_price is null or v_unit_price <= 0 or v_unit_price <> round(v_unit_price, 2) then
      raise exception 'Enter a unit price greater than zero with up to two decimals' using errcode = '22023';
    end if;
    select catalog_id, price_id into v_catalog_id, v_price_id
      from private.record_supplier_purchase_price(v_supplier.id, v_material, v_unit, v_unit_price, p_ordered_on, v_actor, 'purchase order');
    insert into public.purchase_order_lines (purchase_order_id, supplier_material_id, material_id,
      material_code, material_name, unit_of_measure_id, unit_symbol, ordered_quantity, unit_price, supplier_price_id)
    values (v_order_id, v_catalog_id, v_material.id, v_material.code, v_material.name,
      v_unit.id, v_unit.symbol, v_quantity, v_unit_price, v_price_id);
  end loop;
  return v_order_id;
end; $$;

-- ---------------------------------------------------------------- site purchases
create sequence if not exists public.site_purchase_number_seq as bigint start with 1;

create table if not exists public.site_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null references public.project_sites(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name text not null,
  receipt_number text not null check (char_length(trim(receipt_number)) between 1 and 80),
  receipt_date date not null,
  receipt_photo_path text not null check (receipt_photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/receipt[.]webp$'),
  paid_with text not null check (paid_with in ('company_cash','own_money')),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(trim(rejection_reason)) between 3 and 500),
  reimbursed_on date,
  reimbursed_by uuid references public.profiles(id) on delete restrict,
  reimbursement_reference text check (reimbursement_reference is null or char_length(trim(reimbursement_reference)) between 2 and 120),
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_purchase_decision check (
    (status = 'submitted' and decided_by is null and decided_at is null and rejection_reason is null)
    or (status = 'approved' and decided_by is not null and decided_at is not null and rejection_reason is null)
    or (status = 'rejected' and decided_by is not null and decided_at is not null and rejection_reason is not null)
  ),
  constraint site_purchase_reimbursement check (
    (reimbursed_on is null and reimbursed_by is null and reimbursement_reference is null)
    or (reimbursed_on is not null and reimbursed_by is not null and reimbursement_reference is not null
      and paid_with = 'own_money' and status = 'approved')
  )
);
create index if not exists site_purchases_status_idx on public.site_purchases (status, created_at desc, id);
create index if not exists site_purchases_project_idx on public.site_purchases (project_id, project_site_id, created_at desc);
create index if not exists site_purchases_submitter_idx on public.site_purchases (submitted_by, created_at desc);
-- The same receipt from the same store can be submitted only once (unless rejected).
create unique index if not exists site_purchases_receipt_unique
  on public.site_purchases (supplier_id, lower(trim(receipt_number))) where status <> 'rejected';

create table if not exists public.site_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  site_purchase_id uuid not null references public.site_purchases(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code text not null,
  material_name text not null,
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  unit_symbol text not null,
  quantity numeric(20,4) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price > 0),
  inventory_transaction_id uuid unique references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (site_purchase_id, material_id)
);

alter table public.site_purchases enable row level security;
alter table public.site_purchase_lines enable row level security;
revoke all on public.site_purchases, public.site_purchase_lines from anon, authenticated;
grant select on public.site_purchases, public.site_purchase_lines to authenticated;
drop policy if exists site_purchases_read on public.site_purchases;
create policy site_purchases_read on public.site_purchases for select to authenticated using (
  private.has_any_role(array['admin','finance']::public.app_role[])
  or private.can_access_project_site(project_id, project_site_id)
);
drop policy if exists site_purchase_lines_read on public.site_purchase_lines;
create policy site_purchase_lines_read on public.site_purchase_lines for select to authenticated using (
  exists (select 1 from public.site_purchases p where p.id = site_purchase_id
    and (private.has_any_role(array['admin','finance']::public.app_role[])
      or private.can_access_project_site(p.project_id, p.project_site_id)))
);
drop trigger if exists site_purchases_audit on public.site_purchases;
create trigger site_purchases_audit after insert or update on public.site_purchases
for each row execute function private.audit_row_change();
drop trigger if exists site_purchases_set_updated_at on public.site_purchases;
create trigger site_purchases_set_updated_at before update on public.site_purchases
for each row execute function private.set_updated_at();

-- Receipt photos: uploaded by the submitter under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('erp-site-purchase-receipts', 'erp-site-purchase-receipts', false, 2000000, array['image/webp'])
on conflict (id) do nothing;
drop policy if exists site_purchase_receipt_insert on storage.objects;
create policy site_purchase_receipt_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-site-purchase-receipts'
  and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/receipt[.]webp$'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
  and private.has_any_role(array['admin','engineer']::public.app_role[])
);
drop policy if exists site_purchase_receipt_select on storage.objects;
create policy site_purchase_receipt_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-site-purchase-receipts'
  and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/receipt[.]webp$'
  and (
    split_part(storage.objects.name, '/', 1) = auth.uid()::text
    or exists (select 1 from public.site_purchases p where p.receipt_photo_path = storage.objects.name
      and (private.has_any_role(array['admin','finance']::public.app_role[])
        or private.can_access_project_site(p.project_id, p.project_site_id)))
  )
);

-- Stores the Engineer can pick (names only, no prices).
create or replace function public.get_site_purchase_suppliers()
returns table (id uuid, supplier_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','engineer','finance']::public.app_role[]) then
    raise exception 'not authorized for site purchases' using errcode = '42501';
  end if;
  return query select s.id, s.supplier_name from public.suppliers s
    where s.status = 'active' and s.archived_at is null order by s.supplier_name, s.id;
end; $$;

-- Lines: [{ "materialId": uuid, "quantity": number, "unitPrice": number }]
create or replace function public.submit_site_purchase(
  p_idempotency_key uuid, p_project_id uuid, p_site_id uuid,
  p_supplier_id uuid, p_new_supplier_name text, p_new_supplier_address text, p_new_supplier_contact text,
  p_receipt_number text, p_receipt_date date, p_paid_with text, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.site_purchases;
  v_supplier public.suppliers;
  v_id uuid := gen_random_uuid();
  v_photo text;
  v_line jsonb;
  v_material public.materials;
  v_unit public.units_of_measure;
  v_quantity numeric;
  v_unit_price numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_code text;
  v_name text := nullif(regexp_replace(trim(coalesce(p_new_supplier_name, '')), '\s+', ' ', 'g'), '');
  v_receipt text := nullif(trim(coalesce(p_receipt_number, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_actor is null or not private.has_any_role(array['admin','engineer']::public.app_role[]) then
    raise exception 'Only an Engineer can submit a site purchase' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_site_id is null or p_receipt_date is null
    or v_receipt is null or char_length(v_receipt) > 80 or p_paid_with not in ('company_cash','own_money')
    or (v_notes is not null and char_length(v_notes) > 500)
    or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception 'Invalid site purchase' using errcode = '22023';
  end if;
  if p_receipt_date > current_date then
    raise exception 'The receipt date cannot be in the future' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'site', p_site_id, 'supplier', p_supplier_id,
    'new_supplier', v_name, 'receipt', v_receipt, 'receipt_date', p_receipt_date, 'paid_with', p_paid_with,
    'notes', v_notes, 'lines', p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.site_purchases where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.submitted_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another site purchase' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if not private.project_site_role(p_project_id, p_site_id, 'engineer') then
    raise exception 'Not the Engineer of this site' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_sites s join public.projects p on p.id = s.project_id
    join public.inventory_locations l on l.project_site_id = s.id
    where s.id = p_site_id and s.project_id = p_project_id and s.status = 'active'
      and p.status = 'active' and p.archived_at is null) then
    raise exception 'The project site is not active' using errcode = '22023';
  end if;
  v_photo := v_actor::text || '/' || p_idempotency_key::text || '/receipt.webp';
  if not exists (select 1 from storage.objects where bucket_id = 'erp-site-purchase-receipts' and name = v_photo) then
    raise exception 'A receipt photo is required' using errcode = '22023';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers where id = p_supplier_id and status = 'active' and archived_at is null;
    if v_supplier.id is null then raise exception 'The store is not active' using errcode = '22023'; end if;
  else
    if v_name is null or char_length(v_name) not between 2 and 160
      or char_length(trim(coalesce(p_new_supplier_address, ''))) not between 3 and 300
      or char_length(trim(coalesce(p_new_supplier_contact, ''))) not between 7 and 40
      or trim(p_new_supplier_contact) !~ '^[0-9+() .-]+$' then
      raise exception 'Enter the store name, address and contact number' using errcode = '22023';
    end if;
    -- Reuse a store with the same name instead of creating it twice.
    select * into v_supplier from public.suppliers
      where lower(regexp_replace(trim(supplier_name), '\s+', ' ', 'g')) = lower(v_name) and archived_at is null;
    if v_supplier.id is null then
      loop
        v_code := 'SUP-' || lpad(nextval('private.supplier_code_seq')::text, 4, '0');
        exit when not exists (select 1 from public.suppliers where code = v_code);
      end loop;
      insert into public.suppliers (code, supplier_name, contact_number, business_address, status, created_by, updated_by)
      values (v_code, v_name, trim(p_new_supplier_contact), trim(p_new_supplier_address), 'active', v_actor, v_actor)
      returning * into v_supplier;
      perform private.record_supplier_event(v_supplier.id, 'registered', 'Supplier added from a site purchase',
        jsonb_build_object('code', v_code), v_actor);
    elsif v_supplier.status <> 'active' then
      raise exception 'A store with this name exists but is inactive' using errcode = '22023';
    end if;
  end if;

  insert into public.site_purchases (id, purchase_number, project_id, project_site_id, supplier_id, supplier_name,
    receipt_number, receipt_date, receipt_photo_path, paid_with, notes, submitted_by, idempotency_key, command_payload)
  values (v_id, 'SP-' || to_char(p_receipt_date, 'YYYY') || '-' || lpad(nextval('public.site_purchase_number_seq')::text, 6, '0'),
    p_project_id, p_site_id, v_supplier.id, v_supplier.supplier_name, v_receipt, p_receipt_date, v_photo,
    p_paid_with, v_notes, v_actor, p_idempotency_key, v_payload);

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or (v_line->>'materialId') is null
      or (v_line->>'quantity') is null or (v_line->>'unitPrice') is null then
      raise exception 'Invalid site purchase line' using errcode = '22023';
    end if;
    select * into v_material from public.materials where id = (v_line->>'materialId')::uuid
      and is_active and archived_at is null and material_kind = 'consumable';
    select * into v_unit from public.units_of_measure where id = v_material.base_unit_id and is_active;
    if v_material.id is null or v_unit.id is null then
      raise exception 'Choose materials that are already in inventory' using errcode = '22023';
    end if;
    if v_material.id = any(v_seen) then raise exception 'Choose each material once' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_material.id);
    v_quantity := (v_line->>'quantity')::numeric;
    perform private.validate_inventory_quantity(v_quantity, v_unit.id);
    v_unit_price := (v_line->>'unitPrice')::numeric;
    if v_unit_price is null or v_unit_price <= 0 or v_unit_price <> round(v_unit_price, 2) then
      raise exception 'Enter a unit price greater than zero with up to two decimals' using errcode = '22023';
    end if;
    insert into public.site_purchase_lines (site_purchase_id, material_id, material_code, material_name,
      unit_of_measure_id, unit_symbol, quantity, unit_price)
    values (v_id, v_material.id, v_material.code, v_material.name, v_unit.id, v_unit.symbol, v_quantity, v_unit_price);
  end loop;

  perform private.enqueue_notification_event(
    'site-purchase-submitted-' || v_id, 'PROCUREMENT', 'Site purchase awaiting approval',
    'An Engineer recorded a hardware store purchase for a project site.',
    'project', p_project_id, p_project_id, null, 'normal',
    array['admin','finance']::public.app_role[], '{}'::uuid[], null);
  return v_id;
end; $$;

-- Approve: post the stock at the site at the receipt price and update the
-- store's latest price. Approving again returns the same purchase.
create or replace function public.approve_site_purchase(p_purchase_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_purchase public.site_purchases;
  v_line public.site_purchase_lines;
  v_location uuid;
  v_material public.materials;
  v_unit public.units_of_measure;
  v_cost numeric;
  v_transaction uuid;
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Only Admin or Finance can approve a site purchase' using errcode = '42501';
  end if;
  select * into v_purchase from public.site_purchases where id = p_purchase_id for update;
  if v_purchase.id is null then raise exception 'Site purchase not found' using errcode = 'P0002'; end if;
  if v_purchase.status = 'approved' then return v_purchase.id; end if;
  if v_purchase.status <> 'submitted' then raise exception 'This site purchase was rejected' using errcode = '22023'; end if;
  select id into v_location from public.inventory_locations where project_site_id = v_purchase.project_site_id;
  if v_location is null then raise exception 'The site has no inventory location' using errcode = '22023'; end if;

  for v_line in select * from public.site_purchase_lines where site_purchase_id = v_purchase.id order by material_name, id loop
    select * into v_material from public.materials where id = v_line.material_id;
    select * into v_unit from public.units_of_measure where id = v_line.unit_of_measure_id;
    v_cost := round(v_line.quantity * v_line.unit_price, 2);
    v_transaction := gen_random_uuid();
    insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand)
    values (v_line.material_id, v_location, v_line.quantity)
    on conflict (material_id, inventory_location_id) do update
      set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
    insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, destination_location_id,
      transaction_type, reference_document, project_id, responsible_user_id, transaction_date, remarks, cost_total)
    values (v_transaction, v_line.material_id, v_line.quantity, v_line.unit_of_measure_id, v_location,
      'STOCK_IN', left(v_purchase.purchase_number || ' / ' || v_purchase.receipt_number, 120), v_purchase.project_id,
      v_purchase.submitted_by, v_purchase.receipt_date, left('Bought at ' || v_purchase.supplier_name, 2000), v_cost);
    update public.site_purchase_lines set inventory_transaction_id = v_transaction where id = v_line.id;
    perform private.record_supplier_purchase_price(v_purchase.supplier_id, v_material, v_unit, v_line.unit_price,
      v_purchase.receipt_date, v_actor, 'site purchase');
  end loop;

  update public.site_purchases set status = 'approved', decided_by = v_actor, decided_at = now() where id = v_purchase.id;
  return v_purchase.id;
end; $$;

create or replace function public.reject_site_purchase(p_purchase_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_purchase public.site_purchases;
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Only Admin or Finance can reject a site purchase' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Enter a reason of at least three characters' using errcode = '22023';
  end if;
  select * into v_purchase from public.site_purchases where id = p_purchase_id for update;
  if v_purchase.id is null then raise exception 'Site purchase not found' using errcode = 'P0002'; end if;
  if v_purchase.status = 'rejected' then return v_purchase.id; end if;
  if v_purchase.status <> 'submitted' then raise exception 'An approved site purchase cannot be rejected' using errcode = '22023'; end if;
  update public.site_purchases set status = 'rejected', decided_by = v_actor, decided_at = now(), rejection_reason = trim(p_reason)
    where id = v_purchase.id;
  return v_purchase.id;
end; $$;

create or replace function public.mark_site_purchase_reimbursed(p_purchase_id uuid, p_reimbursed_on date, p_reference text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_purchase public.site_purchases;
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Only Admin or Finance can mark a reimbursement' using errcode = '42501';
  end if;
  if p_reimbursed_on is null or char_length(trim(coalesce(p_reference, ''))) not between 2 and 120 then
    raise exception 'Enter the reimbursement date and reference' using errcode = '22023';
  end if;
  select * into v_purchase from public.site_purchases where id = p_purchase_id for update;
  if v_purchase.id is null then raise exception 'Site purchase not found' using errcode = 'P0002'; end if;
  if v_purchase.reimbursed_on is not null then return v_purchase.id; end if;
  if v_purchase.status <> 'approved' or v_purchase.paid_with <> 'own_money' then
    raise exception 'Only an approved purchase paid with own money can be reimbursed' using errcode = '22023';
  end if;
  update public.site_purchases set reimbursed_on = p_reimbursed_on, reimbursed_by = v_actor, reimbursement_reference = trim(p_reference)
    where id = v_purchase.id;
  return v_purchase.id;
end; $$;

revoke execute on function private.record_supplier_purchase_price(uuid,public.materials,public.units_of_measure,numeric,date,uuid,text)
  from public, anon, authenticated;
revoke execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb),
  public.get_site_purchase_suppliers(),
  public.submit_site_purchase(uuid,uuid,uuid,uuid,text,text,text,text,date,text,text,jsonb),
  public.approve_site_purchase(uuid), public.reject_site_purchase(uuid,text),
  public.mark_site_purchase_reimbursed(uuid,date,text) from public, anon;
grant execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb),
  public.get_site_purchase_suppliers(),
  public.submit_site_purchase(uuid,uuid,uuid,uuid,text,text,text,text,date,text,text,jsonb),
  public.approve_site_purchase(uuid), public.reject_site_purchase(uuid,text),
  public.mark_site_purchase_reimbursed(uuid,date,text) to authenticated;

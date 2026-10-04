-- Simple purchasing that matches the client's Purchasing sheet:
--   Supplier: name, address, contact number (everything else optional; the
--   code is generated when left blank).
--   Purchase: supplier, warehouse, date, and lines of item, quantity and the
--   price typed on the order. Purpose and expected date are optional.
--   The typed price becomes the supplier's latest price automatically, so a
--   separate price-list step is no longer needed (manual quotes still work).
--
-- Price history stays immutable. When a purchase carries a new price dated
-- after the current one, the current price is closed the day before and the
-- new price starts on the purchase date. A back-dated purchase, or a second
-- price on the same day, leaves price history unchanged; the purchase line
-- keeps its own price, which is what stock costing uses.
--
-- Safe to rerun: column changes are idempotent; functions use OR REPLACE.

-- Suppliers: only name, address and contact number are required.
alter table public.suppliers
  alter column business_name drop not null,
  alter column category_id drop not null,
  alter column contact_person drop not null,
  alter column email_address drop not null,
  alter column city drop not null,
  alter column province drop not null,
  alter column payment_terms drop not null;
create sequence if not exists private.supplier_code_seq as bigint start with 1;
revoke all on sequence private.supplier_code_seq from public, anon, authenticated;

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
  if p_category_id is not null and not exists (select 1 from public.supplier_categories where id = p_category_id and archived_at is null) then
    raise exception 'supplier category is missing or archived' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.suppliers (
      code, supplier_name, business_name, category_id, contact_person, contact_number, email_address,
      business_address, city, province, tax_identification_number, payment_terms, status, remarks, created_by, updated_by
    ) values (
      v_code, trim(p_supplier_name), v_business, p_category_id, v_person, trim(p_contact_number), v_email,
      trim(p_business_address), v_city, v_province, nullif(trim(coalesce(p_tax_identification_number, '')), ''),
      v_terms, coalesce(p_status, 'active'), nullif(trim(coalesce(p_remarks, '')), ''), v_actor, v_actor
    ) returning id into v_id;
    perform private.record_supplier_event(v_id, 'registered', 'Supplier registered', jsonb_build_object('code', v_code), v_actor);
  else
    update public.suppliers set
      code = v_code, supplier_name = trim(p_supplier_name), business_name = v_business, category_id = p_category_id,
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

-- Purchase orders: purpose and expected date are optional; a line may carry a
-- price that is not (yet) in the supplier's price history.
alter table public.purchase_orders alter column purpose drop not null, alter column expected_on drop not null;
alter table public.purchase_order_lines alter column supplier_price_id drop not null;

-- Lines: [{ "materialId": uuid, "quantity": number, "unitPrice": number }]
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
  v_catalog public.supplier_materials;
  v_price public.supplier_prices;
  v_price_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_code text;
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

    -- The supplier's entry for this material, created on first purchase.
    select * into v_catalog from public.supplier_materials
      where supplier_id = v_supplier.id and material_id = v_material.id
        and unit_of_measure_id = v_unit.id and archived_at is null;
    if v_catalog.id is null then
      v_code := v_material.code;
      if exists (select 1 from public.supplier_materials where supplier_id = v_supplier.id
        and supplier_material_code = v_code and archived_at is null) then
        v_code := left(v_material.code, 60) || '-' || upper(left(replace(v_material.id::text, '-', ''), 8));
      end if;
      insert into public.supplier_materials (supplier_id, material_id, supplier_material_code, unit_of_measure_id,
        minimum_order_quantity, availability_status, created_by, updated_by)
      values (v_supplier.id, v_material.id, v_code, v_unit.id, power(10::numeric, -v_unit.decimal_scale), 'available', v_actor, v_actor)
      returning * into v_catalog;
      perform private.record_supplier_event(v_supplier.id, 'material_added', 'Supplier material added from a purchase order',
        jsonb_build_object('supplier_material_id', v_catalog.id, 'material_id', v_material.id), v_actor);
    end if;

    -- Keep the supplier's latest price in step with what was just ordered.
    perform pg_advisory_xact_lock(hashtextextended(v_catalog.id::text, 0));
    select * into v_price from public.supplier_prices
      where supplier_material_id = v_catalog.id and effective_end_date is null and currency = 'PHP' limit 1;
    v_price_id := null;
    if v_price.id is not null and v_price.unit_price = v_unit_price then
      v_price_id := v_price.id;
    elsif (v_price.id is null or v_price.effective_start_date < p_ordered_on)
      and not exists (select 1 from public.supplier_prices where supplier_material_id = v_catalog.id
        and id is distinct from v_price.id and coalesce(effective_end_date, 'infinity'::date) >= p_ordered_on) then
      if v_price.id is not null then
        update public.supplier_prices set effective_end_date = p_ordered_on - 1 where id = v_price.id;
      end if;
      insert into public.supplier_prices (supplier_material_id, unit_price, effective_start_date, currency, recorded_by)
      values (v_catalog.id, v_unit_price, p_ordered_on, 'PHP', v_actor) returning id into v_price_id;
      perform private.record_supplier_event(v_supplier.id, 'price_added', 'Supplier price updated from a purchase order',
        jsonb_build_object('supplier_material_id', v_catalog.id, 'price_id', v_price_id), v_actor);
    end if;

    insert into public.purchase_order_lines (purchase_order_id, supplier_material_id, material_id,
      material_code, material_name, unit_of_measure_id, unit_symbol, ordered_quantity, unit_price, supplier_price_id)
    values (v_order_id, v_catalog.id, v_material.id, v_material.code, v_material.name,
      v_unit.id, v_unit.symbol, v_quantity, v_unit_price, v_price_id);
  end loop;
  return v_order_id;
end; $$;

revoke execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb),
  public.save_supplier(uuid,text,text,text,uuid,text,text,text,text,text,text,text,text,public.supplier_status,text) from public, anon;
grant execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb),
  public.save_supplier(uuid,text,text,text,uuid,text,text,text,text,text,text,text,text,public.supplier_status,text) to authenticated;

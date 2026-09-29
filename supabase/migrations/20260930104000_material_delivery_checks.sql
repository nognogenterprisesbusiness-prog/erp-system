-- Delivery transport and site acceptance are posted in the same transaction
-- as the existing idempotent stock commands.
begin;

create table if not exists public.material_delivery_manifests (
  transfer_id uuid primary key references public.inventory_transfers(id) on delete restrict,
  vehicle_asset_id uuid references public.assets(id) on delete restrict,
  vehicle_label text not null check (char_length(trim(vehicle_label)) between 2 and 120),
  driver_name text not null check (char_length(trim(driver_name)) between 2 and 120),
  delivery_reference text not null check (char_length(trim(delivery_reference)) between 2 and 120),
  payload_hash text not null,
  dispatched_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists material_delivery_manifests_vehicle_idx on public.material_delivery_manifests(vehicle_asset_id, created_at desc);

create table if not exists public.material_delivery_acceptances (
  inventory_transaction_id uuid primary key references public.inventory_transactions(id) on delete restrict,
  transfer_item_id uuid not null references public.inventory_transfer_items(id) on delete restrict,
  received_quantity numeric(20,4) not null check (received_quantity > 0),
  condition text not null default 'accepted' check (condition in ('accepted','accepted_with_note')),
  quality_note text,
  inspection_payload_hash text,
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint acceptance_note_required check (
    (condition = 'accepted' and quality_note is null)
    or (condition = 'accepted_with_note' and char_length(trim(quality_note)) between 3 and 500)
  )
);
create index if not exists material_delivery_acceptances_item_idx on public.material_delivery_acceptances(transfer_item_id, created_at desc);

alter table public.material_delivery_manifests enable row level security;
alter table public.material_delivery_acceptances enable row level security;
revoke all on public.material_delivery_manifests, public.material_delivery_acceptances from public, anon, authenticated;
grant select on public.material_delivery_manifests, public.material_delivery_acceptances to authenticated;
drop policy if exists material_delivery_manifests_scoped_read on public.material_delivery_manifests;
create policy material_delivery_manifests_scoped_read on public.material_delivery_manifests
for select to authenticated using (exists (
  select 1 from public.inventory_transfer_items item
  join public.material_request_dispatches dispatch on dispatch.transfer_item_id = item.id
  join public.material_request_lines line on line.id = dispatch.request_line_id
  where item.transfer_id = material_delivery_manifests.transfer_id
    and private.can_view_material_request(line.request_id)
));
drop policy if exists material_delivery_acceptances_scoped_read on public.material_delivery_acceptances;
create policy material_delivery_acceptances_scoped_read on public.material_delivery_acceptances
for select to authenticated using (exists (
  select 1 from public.material_request_dispatches dispatch
  join public.material_request_lines line on line.id = dispatch.request_line_id
  where dispatch.transfer_item_id = material_delivery_acceptances.transfer_item_id
    and private.can_view_material_request(line.request_id)
));

create or replace function private.record_request_site_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.transfer_phase = 'receipt' and new.transfer_item_id is not null
    and exists (select 1 from public.material_request_dispatches where transfer_item_id = new.transfer_item_id) then
    insert into public.material_delivery_acceptances (
      inventory_transaction_id, transfer_item_id, received_quantity, received_by
    ) values (new.id, new.transfer_item_id, new.quantity, new.responsible_user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists material_delivery_acceptance_after_receipt on public.inventory_transactions;
create trigger material_delivery_acceptance_after_receipt
after insert on public.inventory_transactions for each row
execute function private.record_request_site_acceptance();
revoke all on function private.record_request_site_acceptance() from public, anon, authenticated;

create or replace function public.get_delivery_vehicle_choices()
returns table(id uuid, label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
    raise exception 'Not authorized for delivery vehicles' using errcode = '42501';
  end if;
  return query select asset.id, concat(asset.code, ' · ', asset.name)
    from public.assets asset where asset.asset_kind = 'vehicle'
      and asset.archived_at is null and asset.status in ('available','assigned','in_use')
    order by asset.code limit 500;
end;
$$;

create or replace function public.dispatch_approved_request_line_with_manifest(
  p_idempotency_key uuid, p_request_line_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text,
  p_vehicle_asset_id uuid, p_vehicle_label text, p_driver_name text,
  p_delivery_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_transfer_id uuid;
  v_vehicle public.assets%rowtype;
  v_label text;
  v_hash text;
  v_existing public.material_delivery_manifests%rowtype;
begin
  if char_length(trim(coalesce(p_driver_name,''))) not between 2 and 120
    or char_length(trim(coalesce(p_delivery_reference,''))) not between 2 and 120 then
    raise exception 'Driver and delivery reference are required' using errcode = '22023';
  end if;
  if p_vehicle_asset_id is not null then
    select * into v_vehicle from public.assets where id = p_vehicle_asset_id
      and asset_kind = 'vehicle' and archived_at is null and status in ('available','assigned','in_use');
    if v_vehicle.id is null then raise exception 'Delivery vehicle is unavailable' using errcode = '22023'; end if;
    v_label := concat(v_vehicle.code,' · ',v_vehicle.name);
  else
    v_label := trim(coalesce(p_vehicle_label,''));
    if char_length(v_label) not between 2 and 120 then
      raise exception 'Enter the delivery vehicle or transport description' using errcode = '22023';
    end if;
  end if;
  v_hash := md5(jsonb_build_object('vehicle',p_vehicle_asset_id,'label',v_label,
    'driver',trim(p_driver_name),'reference',trim(p_delivery_reference))::text);
  v_transfer_id := public.dispatch_approved_request_line(
    p_idempotency_key,p_request_line_id,p_quantity,p_transaction_date,p_remarks
  );
  select * into v_existing from public.material_delivery_manifests where transfer_id = v_transfer_id;
  if found then
    if v_existing.payload_hash <> v_hash or v_existing.dispatched_by <> auth.uid() then
      raise exception 'Retry has different delivery details' using errcode = '23505';
    end if;
    return v_transfer_id;
  end if;
  insert into public.material_delivery_manifests (
    transfer_id,vehicle_asset_id,vehicle_label,driver_name,delivery_reference,payload_hash,dispatched_by
  ) values (
    v_transfer_id,p_vehicle_asset_id,v_label,trim(p_driver_name),trim(p_delivery_reference),v_hash,auth.uid()
  );
  return v_transfer_id;
end;
$$;

create or replace function public.receive_request_transfer_with_inspection(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text, p_condition text, p_quality_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_transaction_id uuid; v_hash text; v_existing public.material_delivery_acceptances%rowtype;
begin
  if p_condition not in ('accepted','accepted_with_note')
    or (p_condition = 'accepted' and nullif(trim(coalesce(p_quality_note,'')),'') is not null)
    or (p_condition = 'accepted_with_note' and char_length(trim(coalesce(p_quality_note,''))) not between 3 and 500) then
    raise exception 'Review the material acceptance note' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('condition',p_condition,'note',nullif(trim(coalesce(p_quality_note,'')),''))::text);
  v_transaction_id := public.receive_request_transfer(
    p_idempotency_key,p_transfer_item_id,p_quantity,p_transaction_date,p_remarks
  );
  select * into v_existing from public.material_delivery_acceptances
    where inventory_transaction_id = v_transaction_id for update;
  if v_existing.inventory_transaction_id is null then
    raise exception 'Receipt inspection record was not created' using errcode = 'P0002';
  end if;
  if v_existing.inspection_payload_hash is not null then
    if v_existing.inspection_payload_hash <> v_hash or v_existing.received_by <> auth.uid() then
      raise exception 'Retry has different inspection details' using errcode = '23505';
    end if;
    return v_transaction_id;
  end if;
  update public.material_delivery_acceptances
    set condition = p_condition, quality_note = nullif(trim(coalesce(p_quality_note,'')),''),
      inspection_payload_hash = v_hash
    where inventory_transaction_id = v_transaction_id;
  return v_transaction_id;
end;
$$;

revoke all on function public.get_delivery_vehicle_choices(),
  public.dispatch_approved_request_line_with_manifest(uuid,uuid,numeric,date,text,uuid,text,text,text),
  public.receive_request_transfer_with_inspection(uuid,uuid,numeric,date,text,text,text)
  from public, anon;
grant execute on function public.get_delivery_vehicle_choices(),
  public.dispatch_approved_request_line_with_manifest(uuid,uuid,numeric,date,text,uuid,text,text,text),
  public.receive_request_transfer_with_inspection(uuid,uuid,numeric,date,text,text,text)
  to authenticated;
revoke execute on function public.dispatch_approved_request_line(uuid,uuid,numeric,date,text) from authenticated;

commit;

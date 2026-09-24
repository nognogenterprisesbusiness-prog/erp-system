alter table public.inventory_transfer_items
  add column variance_quantity numeric(20,4) not null default 0 check (variance_quantity >= 0),
  add column variance_total_cost numeric(24,2) not null default 0 check (variance_total_cost >= 0),
  add constraint inventory_transfer_item_reconciled_quantity
    check (received_quantity + variance_quantity <= dispatched_quantity);
grant select (variance_quantity) on public.inventory_transfer_items to authenticated;

create table public.inventory_transfer_variances (
  id uuid primary key default gen_random_uuid(),
  transfer_item_id uuid not null references public.inventory_transfer_items(id) on delete restrict,
  quantity numeric(20,4) not null check (quantity > 0),
  cost_total numeric(24,2) not null check (cost_total >= 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  approved_by uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default now()
);
create index inventory_transfer_variances_item_idx on public.inventory_transfer_variances (transfer_item_id, approved_at desc);
create trigger inventory_transfer_variances_audit after insert on public.inventory_transfer_variances
  for each row execute function private.audit_row_change();

create function public.approve_transfer_variance(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_item public.inventory_transfer_items%rowtype;
  v_transfer public.inventory_transfers%rowtype;
  v_remaining numeric;
  v_cost numeric(24,2);
  v_id uuid := gen_random_uuid();
  v_total_dispatched numeric;
  v_total_reconciled numeric;
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'administrator variance approval required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_transfer_item_id is null or
    char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'transfer, quantity and approval reason are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('item', p_transfer_item_id, 'quantity', p_quantity,
    'reason', trim(p_reason))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'approve_transfer_variance', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null then raise exception 'transfer item not found' using errcode = 'P0002'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  if v_transfer.status in ('received', 'cancelled') then
    raise exception 'transfer cannot accept a variance' using errcode = '22023';
  end if;
  if v_item.dispatched_total_cost is null then
    raise exception 'unvalued transfer requires an audited correction plan' using errcode = '22023';
  end if;
  v_remaining := v_item.dispatched_quantity - v_item.received_quantity - v_item.variance_quantity;
  if p_quantity > v_remaining then
    raise exception 'variance exceeds remaining in-transit stock' using errcode = '22023';
  end if;
  v_cost := case when p_quantity = v_remaining
    then v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost
    else round(v_item.dispatched_total_cost * p_quantity / v_item.dispatched_quantity, 2) end;
  if v_cost < 0 or v_cost > v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost then
    raise exception 'variance cost does not reconcile' using errcode = '22023';
  end if;
  update public.inventory_transfer_items
    set variance_quantity = variance_quantity + p_quantity,
      variance_total_cost = variance_total_cost + v_cost, updated_at = now()
    where id = v_item.id;
  insert into public.inventory_transfer_variances
    (id, transfer_item_id, quantity, cost_total, reason, approved_by)
    values (v_id, v_item.id, p_quantity, v_cost, trim(p_reason), v_actor);
  select sum(dispatched_quantity), sum(received_quantity + variance_quantity)
    into v_total_dispatched, v_total_reconciled
    from public.inventory_transfer_items where transfer_id = v_transfer.id;
  update public.inventory_transfers
    set status = case when v_total_dispatched = v_total_reconciled then 'received' else 'partially_received' end,
      received_by = case when v_total_dispatched = v_total_reconciled then v_actor else received_by end,
      received_at = case when v_total_dispatched = v_total_reconciled then now() else received_at end,
      updated_at = now()
    where id = v_transfer.id;
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'approve_transfer_variance', v_hash, v_id);
  return v_id;
end; $$;

-- Existing receipt commands remain the single balance/ledger writers. Lock the
-- item first so an admin variance and a receiver cannot claim the same transit.
alter function public.receive_request_transfer(uuid,uuid,numeric,date,text) set schema private;
alter function private.receive_request_transfer(uuid,uuid,numeric,date,text) rename to receive_request_transfer_unrestricted;
revoke execute on function private.receive_request_transfer_unrestricted(uuid,uuid,numeric,date,text) from public, anon, authenticated;
create function public.receive_request_transfer(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.inventory_transfer_items%rowtype;
  v_hash text;
  v_existing uuid;
  v_result uuid;
  v_dispatched numeric;
  v_reconciled numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_hash := md5(jsonb_build_object('item', p_transfer_item_id, 'quantity', p_quantity,
    'date', p_transaction_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'receive_request_transfer', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null or v_item.received_quantity + v_item.variance_quantity + p_quantity > v_item.dispatched_quantity then
    raise exception 'receipt exceeds remaining in-transit stock' using errcode = '22023';
  end if;
  v_result := private.receive_request_transfer_unrestricted(p_idempotency_key, p_transfer_item_id,
    p_quantity, p_transaction_date, p_remarks);
  perform private.finalize_transfer_receipt_cost(p_transfer_item_id, v_result);
  select sum(dispatched_quantity), sum(received_quantity + variance_quantity) into v_dispatched, v_reconciled
    from public.inventory_transfer_items where transfer_id = v_item.transfer_id;
  if v_dispatched = v_reconciled then
    update public.inventory_transfers set status = 'received', received_by = v_actor,
      received_at = p_transaction_date::timestamptz, updated_at = now() where id = v_item.transfer_id;
  end if;
  return v_result;
end; $$;

alter function public.receive_inventory_transfer(uuid,uuid,numeric,date,text) set schema private;
alter function private.receive_inventory_transfer(uuid,uuid,numeric,date,text) rename to receive_inventory_transfer_valued;
revoke execute on function private.receive_inventory_transfer_valued(uuid,uuid,numeric,date,text) from public, anon, authenticated;
create function public.receive_inventory_transfer(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.inventory_transfer_items%rowtype;
  v_existing uuid;
  v_result uuid;
  v_dispatched numeric;
  v_reconciled numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'receive_inventory_transfer', v_actor);
  if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null or v_item.received_quantity + v_item.variance_quantity + p_quantity > v_item.dispatched_quantity then
    raise exception 'receipt exceeds remaining in-transit stock' using errcode = '22023';
  end if;
  v_result := private.receive_inventory_transfer_valued(p_idempotency_key, p_transfer_item_id,
    p_quantity, p_transaction_date, p_remarks);
  perform private.finalize_transfer_receipt_cost(p_transfer_item_id, v_result);
  select sum(dispatched_quantity), sum(received_quantity + variance_quantity) into v_dispatched, v_reconciled
    from public.inventory_transfer_items where transfer_id = v_item.transfer_id;
  if v_dispatched = v_reconciled then
    update public.inventory_transfers set status = 'received', received_by = v_actor,
      received_at = p_transaction_date::timestamptz, updated_at = now() where id = v_item.transfer_id;
  end if;
  return v_result;
end; $$;

alter table public.inventory_transfer_variances enable row level security;
revoke all on public.inventory_transfer_variances from anon, authenticated;
grant select (id, transfer_item_id, quantity, reason, approved_by, approved_at)
  on public.inventory_transfer_variances to authenticated;
create policy transfer_variances_select on public.inventory_transfer_variances for select to authenticated using (
  exists (select 1 from public.inventory_transfer_items i
    join public.inventory_transfers t on t.id = i.transfer_id
    where i.id = transfer_item_id and
      (private.can_view_inventory_location(t.source_location_id) or private.can_view_inventory_location(t.destination_location_id)))
);
create function private.finalize_transfer_receipt_cost(p_transfer_item_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_transfer_items%rowtype;
  v_transaction public.inventory_transactions%rowtype;
  v_remainder numeric(24,2);
begin
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.received_quantity + v_item.variance_quantity <> v_item.dispatched_quantity then return; end if;
  v_remainder := v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost;
  if v_remainder = 0 then return; end if;
  select * into v_transaction from public.inventory_transactions where id = p_transaction_id for update;
  if v_transaction.id is null or v_transaction.transfer_item_id <> p_transfer_item_id or v_transaction.transfer_phase <> 'receipt' then
    raise exception 'receipt cost cannot be reconciled' using errcode = '22023';
  end if;
  update public.inventory_valuations set total_value = total_value + v_remainder, updated_at = now()
    where material_id = v_transaction.material_id and inventory_location_id = v_transaction.destination_location_id
      and total_value + v_remainder >= 0;
  if not found then raise exception 'destination cost cannot be reconciled' using errcode = '22023'; end if;
  update public.inventory_transfer_items set received_total_cost = received_total_cost + v_remainder where id = p_transfer_item_id;
  update public.inventory_transactions set cost_total = cost_total + v_remainder,
    cost_unit = round((cost_total + v_remainder) / quantity, 6) where id = p_transaction_id;
end; $$;
create trigger inventory_transaction_cost_reconciliation_audit
after update of cost_total on public.inventory_transactions
for each row when (old.cost_total is distinct from new.cost_total)
execute function private.audit_row_change();

-- A general transfer can be cancelled only while its entire dispatch is still
-- in transit. An approved loss is irreversible without a separate correction.
alter function public.reverse_inventory_transaction(uuid,uuid,text) set schema private;
alter function private.reverse_inventory_transaction(uuid,uuid,text) rename to reverse_inventory_transaction_valued;
revoke execute on function private.reverse_inventory_transaction_valued(uuid,uuid,text) from public, anon, authenticated;
create function public.reverse_inventory_transaction(
  p_idempotency_key uuid, p_transaction_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item_id uuid;
  v_variance numeric;
begin
  select transfer_item_id into v_item_id from public.inventory_transactions
    where id = p_transaction_id and transfer_phase = 'dispatch';
  if v_item_id is not null then
    select variance_quantity into v_variance from public.inventory_transfer_items
      where id = v_item_id for update;
    if v_variance > 0 then
      raise exception 'approved transfer variance requires a dedicated correction workflow' using errcode = '0A000';
    end if;
  end if;
  return private.reverse_inventory_transaction_valued(p_idempotency_key, p_transaction_id, p_reason);
end; $$;
revoke execute on function private.finalize_transfer_receipt_cost(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.approve_transfer_variance(uuid,uuid,numeric,text),
  public.receive_request_transfer(uuid,uuid,numeric,date,text),
  public.receive_inventory_transfer(uuid,uuid,numeric,date,text),
  public.reverse_inventory_transaction(uuid,uuid,text) from public, anon;
grant execute on function public.approve_transfer_variance(uuid,uuid,numeric,text),
  public.receive_request_transfer(uuid,uuid,numeric,date,text),
  public.receive_inventory_transfer(uuid,uuid,numeric,date,text),
  public.reverse_inventory_transaction(uuid,uuid,text) to authenticated;

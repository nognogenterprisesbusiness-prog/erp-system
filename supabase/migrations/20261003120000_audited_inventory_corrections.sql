begin;

-- Originals and their cost snapshots remain immutable. Corrections compensate
-- the original posting; a replacement uses the normal inspected/PO workflow.
create table public.inventory_corrections (
  original_transaction_id uuid primary key references public.inventory_transactions(id),
  reversal_transaction_id uuid not null unique references public.inventory_transactions(id) deferrable initially deferred,
  idempotency_key uuid not null unique,
  actor_id uuid not null references public.profiles(id),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  command_payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.inventory_corrections enable row level security;
revoke all on public.inventory_corrections from public,anon,authenticated;
grant select on public.inventory_corrections to authenticated;
create policy inventory_corrections_select on public.inventory_corrections for select to authenticated
using (exists(select 1 from public.inventory_transactions t where t.id=original_transaction_id));

create function private.value_receipt_correction(p_new public.inventory_transactions)
returns public.inventory_transactions language plpgsql security definer set search_path='' as $$
declare
  v_original public.inventory_transactions;
  v_value public.inventory_valuations;
  v_layer public.inventory_cost_layers;
  v_part record;
  v_quantity numeric := 0;
  v_cost numeric := 0;
  v_balance numeric;
begin
  select * into v_original from public.inventory_transactions where id=p_new.reversal_of;
  if not private.can_manage_inventory() or not exists(select 1 from public.inventory_corrections c
    where c.original_transaction_id=v_original.id and c.reversal_transaction_id=p_new.id and c.actor_id=auth.uid())
    or p_new.source_location_id is distinct from v_original.destination_location_id
    or p_new.destination_location_id is not null or p_new.quantity is distinct from v_original.quantity then
    raise exception 'audited receipt correction required' using errcode='42501';
  end if;
  select * into v_value from public.inventory_valuations
    where material_id=v_original.material_id and inventory_location_id=v_original.destination_location_id for update;
  if v_value.total_value is null then raise exception 'receipt has no verified value' using errcode='22023'; end if;
  for v_part in
    select a.batch_number,a.batch_date,a.unit_cost,a.quantity,a.total_value
    from public.inventory_cost_allocations a where a.transaction_id=v_original.id
    union all
    select l.batch_number,l.batch_date,l.unit_cost,v_original.quantity,v_original.cost_total
    from public.inventory_cost_layers l where v_original.transaction_type='STOCK_IN'
      and l.source_transaction_id=v_original.id and l.inventory_location_id=v_original.destination_location_id
    order by batch_number
  loop
    select * into v_layer from public.inventory_cost_layers
      where material_id=v_original.material_id and inventory_location_id=v_original.destination_location_id
        and batch_number=v_part.batch_number for update;
    if v_layer.id is null or v_layer.remaining_quantity<v_part.quantity or v_layer.remaining_value<v_part.total_value
      or (v_layer.remaining_quantity=v_part.quantity and v_layer.remaining_value<>v_part.total_value) then
      raise exception 'original receipt batch has been used; reverse downstream postings first' using errcode='22023';
    end if;
    update public.inventory_cost_layers set remaining_quantity=remaining_quantity-v_part.quantity,
      remaining_value=remaining_value-v_part.total_value,updated_at=now() where id=v_layer.id;
    insert into public.inventory_cost_allocations(transaction_id,material_id,batch_number,batch_date,unit_cost,quantity,total_value)
      values(p_new.id,v_original.material_id,v_part.batch_number,v_part.batch_date,v_part.unit_cost,v_part.quantity,v_part.total_value);
    if v_original.transfer_phase='receipt' then
      perform private.put_inventory_cost_layer(v_original.material_id,null,v_original.transfer_item_id,
        v_part.batch_number,v_part.batch_date,v_part.unit_cost,v_part.quantity,v_part.total_value,null);
    end if;
    v_quantity:=v_quantity+v_part.quantity; v_cost:=v_cost+v_part.total_value;
  end loop;
  if v_quantity<>v_original.quantity or v_cost is distinct from v_original.cost_total then
    raise exception 'original receipt batch snapshots are unavailable or do not reconcile' using errcode='22023';
  end if;
  select quantity_on_hand into v_balance from public.inventory_balances
    where material_id=v_original.material_id and inventory_location_id=v_original.destination_location_id;
  if v_balance is distinct from v_value.quantity_on_hand-v_quantity then
    raise exception 'receipt correction balance does not reconcile' using errcode='22023';
  end if;
  update public.inventory_valuations set quantity_on_hand=quantity_on_hand-v_quantity,
    total_value=total_value-v_cost,updated_at=now() where id=v_value.id;
  perform private.assert_location_cost_layers(v_original.material_id,v_original.destination_location_id);
  if v_original.transfer_phase='receipt' then perform private.assert_transit_cost_layers(v_original.transfer_item_id); end if;
  p_new.cost_total:=v_cost; p_new.cost_unit:=round(v_cost/v_quantity,6);
  return p_new;
end; $$;
revoke all on function private.value_receipt_correction(public.inventory_transactions) from public,anon,authenticated;

create or replace function public.reverse_inventory_transaction(p_idempotency_key uuid,p_transaction_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_id uuid:=gen_random_uuid(); v_payload jsonb;
  v_previous public.inventory_corrections; v_original public.inventory_transactions;
  v_receipt public.purchase_order_receipts; v_item public.inventory_transfer_items;
  v_available numeric; v_total numeric; v_received numeric;
begin
  if not private.can_manage_inventory() or not exists(select 1 from public.profiles
    where id=v_actor and is_active and not onboarding_required) then
    raise exception 'only an active administrator can correct inventory' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_transaction_id is null or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'transaction, retry key and correction reason are required' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('transaction',p_transaction_id,'reason',trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.inventory_corrections where idempotency_key=p_idempotency_key;
  if found then
    if v_previous.actor_id<>v_actor or v_previous.command_payload<>v_payload then
      raise exception 'idempotency key was used for another correction' using errcode='23505';
    end if;
    return v_previous.reversal_transaction_id;
  end if;
  if exists(select 1 from public.inventory_command_receipts where idempotency_key=p_idempotency_key) then
    raise exception 'idempotency key was used for another inventory command' using errcode='23505';
  end if;
  select * into v_original from public.inventory_transactions where id=p_transaction_id;
  -- Parent locks match normal receipt ordering before balance/value/layer locks.
  if v_original.transfer_item_id is not null then
    select * into v_item from public.inventory_transfer_items where id=v_original.transfer_item_id for update;
    perform 1 from public.inventory_transfers where id=v_item.transfer_id for update;
  end if;
  select * into v_receipt from public.purchase_order_receipts where inventory_transaction_id=p_transaction_id;
  if found then
    perform 1 from public.purchase_orders where id=v_receipt.purchase_order_id for update;
    perform 1 from public.purchase_order_lines where id=v_receipt.purchase_order_line_id for update;
  end if;
  select * into v_original from public.inventory_transactions where id=p_transaction_id for update;
  if v_original.id is null or v_original.cost_total is null or exists(select 1 from public.inventory_transactions where reversal_of=p_transaction_id)
    or not (v_original.transaction_type in ('STOCK_IN','STOCK_OUT','MATERIAL_CONSUMPTION') or v_original.transfer_phase in ('receipt','dispatch')) then
    raise exception 'transaction is not reversible' using errcode='22023';
  end if;
  if v_original.transfer_phase='dispatch' and (v_item.received_quantity>0 or v_item.variance_quantity>0
    or exists(select 1 from public.material_request_dispatches where transfer_item_id=v_item.id)) then
    raise exception 'request dispatch or reconciled transfer requires its request correction workflow' using errcode='22023';
  end if;
  insert into public.inventory_corrections(original_transaction_id,reversal_transaction_id,idempotency_key,actor_id,reason,command_payload)
    values(p_transaction_id,v_id,p_idempotency_key,v_actor,trim(p_reason),v_payload);
  if v_original.transaction_type='STOCK_IN' or v_original.transfer_phase='receipt' then
    select available_quantity into v_available from public.inventory_balances
      where material_id=v_original.material_id and inventory_location_id=v_original.destination_location_id for update;
    if coalesce(v_available,0)<v_original.quantity then
      raise exception 'correction would remove used or reserved stock; reverse downstream postings first' using errcode='22023';
    end if;
    update public.inventory_balances set quantity_on_hand=quantity_on_hand-v_original.quantity,updated_at=now()
      where material_id=v_original.material_id and inventory_location_id=v_original.destination_location_id;
    if v_original.transfer_phase='receipt' then
      update public.inventory_transfer_items set received_quantity=received_quantity-v_original.quantity,
        received_total_cost=received_total_cost-v_original.cost_total,updated_at=now() where id=v_item.id;
      select sum(dispatched_quantity),sum(received_quantity+variance_quantity) into v_total,v_received
        from public.inventory_transfer_items where transfer_id=v_item.transfer_id;
      update public.inventory_transfers set status=case when v_received=0 then 'dispatched'::public.transfer_status
        when v_received<v_total then 'partially_received'::public.transfer_status else 'received'::public.transfer_status end,
        received_by=null,received_at=null,updated_at=now() where id=v_item.transfer_id;
    end if;
    if v_receipt.id is not null then
      update public.purchase_order_lines set received_quantity=received_quantity-v_original.quantity
        where id=v_receipt.purchase_order_line_id;
      select sum(ordered_quantity),sum(received_quantity) into v_total,v_received
        from public.purchase_order_lines where purchase_order_id=v_receipt.purchase_order_id;
      update public.purchase_orders set status=case when v_received=0 then 'issued'
        when v_received<v_total then 'partially_received' else 'received' end,
        updated_at=now() where id=v_receipt.purchase_order_id;
    end if;
  else
    insert into public.inventory_balances(material_id,inventory_location_id,quantity_on_hand)
      values(v_original.material_id,v_original.source_location_id,v_original.quantity)
      on conflict(material_id,inventory_location_id) do update
      set quantity_on_hand=public.inventory_balances.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
    if v_original.transfer_phase='dispatch' then
      update public.inventory_transfers set status='cancelled',updated_at=now() where id=v_item.transfer_id;
    end if;
  end if;
  insert into public.inventory_transactions(id,material_id,quantity,unit_of_measure_id,source_location_id,destination_location_id,
    transaction_type,reference_document,project_id,responsible_user_id,transaction_date,remarks,reversal_of)
  values(v_id,v_original.material_id,v_original.quantity,v_original.unit_of_measure_id,
    case when v_original.transaction_type='STOCK_IN' or v_original.transfer_phase='receipt' then v_original.destination_location_id end,
    case when v_original.transaction_type in ('STOCK_OUT','MATERIAL_CONSUMPTION') or v_original.transfer_phase='dispatch' then v_original.source_location_id end,
    'REVERSAL',left('REV-'||v_original.reference_document,120),v_original.project_id,v_actor,current_date,trim(p_reason),p_transaction_id);
  insert into public.inventory_command_receipts(idempotency_key,actor_id,command_name,result_id)
    values(p_idempotency_key,v_actor,'reverse_inventory_transaction',v_id);
  return v_id;
end; $$;
revoke all on function public.reverse_inventory_transaction(uuid,uuid,text) from public,anon;
grant execute on function public.reverse_inventory_transaction(uuid,uuid,text) to authenticated;

create or replace function private.post_inventory_valuation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_source public.inventory_valuations%rowtype;
  v_destination public.inventory_valuations%rowtype;
  v_item public.inventory_transfer_items%rowtype;
  v_original public.inventory_transactions%rowtype;
  v_balance_quantity numeric;
  v_cost numeric(24,2);
begin
  if new.transaction_type = 'STOCK_IN' then
    if new.cost_total is null or new.source_location_id is not null or new.destination_location_id is null then
      raise exception 'stock-in requires an explicit verified total cost' using errcode = '22023';
    end if;
    v_cost := new.cost_total;
  elsif new.transaction_type = 'REVERSAL' then
    select * into v_original from public.inventory_transactions where id = new.reversal_of;
    if v_original.id is null or v_original.cost_total is null then
      raise exception 'unvalued movement requires an audited correction plan' using errcode = '22023';
    end if;
    if v_original.transaction_type = 'STOCK_IN' or v_original.transfer_phase = 'receipt' then
      return private.value_receipt_correction(new);
    end if;
    v_cost := v_original.cost_total;
  elsif new.transfer_phase = 'receipt' then
    select * into v_item from public.inventory_transfer_items where id = new.transfer_item_id for update;
    if v_item.dispatched_total_cost is null then
      raise exception 'transfer has no verified dispatched cost' using errcode = '22023';
    end if;
    v_cost := private.take_inventory_cost_layers(new.material_id, null, v_item.id, new.quantity, new.id, null);
    update public.inventory_transfer_items set received_total_cost = received_total_cost + v_cost where id = v_item.id;
  elsif new.transaction_type not in ('STOCK_OUT','WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN','MATERIAL_CONSUMPTION')
    or (new.transaction_type in ('WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN') and new.transfer_phase <> 'dispatch') then
    raise exception 'this stock movement needs an approved valuation workflow' using errcode = '0A000';
  end if;

  if new.source_location_id is not null and (new.transfer_phase is distinct from 'receipt') then
    if new.transaction_type = 'REVERSAL' then
      raise exception 'this correction needs a dedicated stock batch workflow' using errcode = '0A000';
    end if;
    select * into v_source from public.inventory_valuations
      where material_id = new.material_id and inventory_location_id = new.source_location_id for update;
    if v_source.id is null or v_source.total_value is null or v_source.quantity_on_hand < new.quantity then
      raise exception 'source stock has no verified value or insufficient valued quantity' using errcode = '22023';
    end if;
    v_cost := private.take_inventory_cost_layers(new.material_id, new.source_location_id, null, new.quantity, new.id, null);
    update public.inventory_valuations set quantity_on_hand = quantity_on_hand - new.quantity,
      total_value = total_value - v_cost, updated_at = now() where id = v_source.id;
    select quantity_on_hand into v_balance_quantity from public.inventory_balances
      where material_id = new.material_id and inventory_location_id = new.source_location_id;
    if v_balance_quantity is distinct from v_source.quantity_on_hand - new.quantity then
      raise exception 'source quantity and valuation do not reconcile' using errcode = '22023';
    end if;
    if new.transfer_phase = 'dispatch' then
      perform private.put_inventory_cost_layers_from_allocations(new.id, null, new.transfer_item_id);
      update public.inventory_transfer_items set dispatched_total_cost = v_cost where id = new.transfer_item_id;
    end if;
    perform private.assert_location_cost_layers(new.material_id, new.source_location_id);
  end if;

  if new.destination_location_id is not null and
    (new.transaction_type in ('STOCK_IN','REVERSAL') or new.transfer_phase = 'receipt') and
    not (new.transaction_type = 'REVERSAL' and new.source_location_id is not null) then
    select quantity_on_hand into v_balance_quantity from public.inventory_balances
      where material_id = new.material_id and inventory_location_id = new.destination_location_id;
    insert into public.inventory_valuations (material_id, inventory_location_id, quantity_on_hand, total_value)
      select new.material_id, new.destination_location_id, 0, 0
      where v_balance_quantity = new.quantity
      on conflict (material_id, inventory_location_id) do nothing;
    select * into v_destination from public.inventory_valuations
      where material_id = new.material_id and inventory_location_id = new.destination_location_id for update;
    if v_destination.id is null or v_destination.total_value is null then
      raise exception 'destination stock has no verified opening value' using errcode = '22023';
    end if;
    if v_balance_quantity is distinct from v_destination.quantity_on_hand + new.quantity then
      raise exception 'destination quantity and valuation do not reconcile' using errcode = '22023';
    end if;
    update public.inventory_valuations set quantity_on_hand = quantity_on_hand + new.quantity,
      total_value = total_value + v_cost, updated_at = now() where id = v_destination.id;
    if new.transaction_type = 'STOCK_IN' then
      perform private.put_inventory_cost_layer(new.material_id, new.destination_location_id, null,
        nextval('private.inventory_cost_batch_seq'), new.transaction_date,
        round(v_cost / new.quantity, 6), new.quantity, v_cost, new.id);
    elsif new.transfer_phase = 'receipt' then
      perform private.put_inventory_cost_layers_from_allocations(new.id, new.destination_location_id, null);
    elsif exists (select 1 from public.inventory_cost_allocations where transaction_id = v_original.id) then
      perform private.put_inventory_cost_layers_from_allocations(v_original.id, new.destination_location_id, null);
    else
      -- The original movement was costed by average before batch costing began.
      perform private.put_inventory_cost_layer(new.material_id, new.destination_location_id, null,
        0, current_date, round(v_cost / new.quantity, 6), new.quantity, v_cost, null);
    end if;
    if new.transaction_type = 'REVERSAL' and v_original.transfer_phase = 'dispatch' then
      delete from public.inventory_cost_layers where transfer_item_id = v_original.transfer_item_id;
    end if;
    perform private.assert_location_cost_layers(new.material_id, new.destination_location_id);
  end if;

  if new.transfer_phase in ('dispatch', 'receipt') then
    perform private.assert_transit_cost_layers(new.transfer_item_id);
  end if;
  new.cost_total := v_cost;
  new.cost_unit := round(v_cost / new.quantity, 6);
  return new;
end; $$;

-- A corrected delivery may reuse its physical delivery reference. Lock the
-- line so concurrent receivers cannot introduce duplicate live receipts.
drop index public.purchase_order_receipts_delivery_line_unique;
create index purchase_order_receipts_delivery_line_idx on public.purchase_order_receipts(purchase_order_line_id,lower(delivery_reference));
create function private.guard_live_purchase_receipt_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.purchase_order_lines where id=new.purchase_order_line_id for update;
 if exists(select 1 from public.purchase_order_receipts r
   where r.purchase_order_line_id=new.purchase_order_line_id and lower(r.delivery_reference)=lower(new.delivery_reference)
   and not exists(select 1 from public.inventory_transactions t where t.reversal_of=r.inventory_transaction_id)) then
   raise exception 'delivery reference already received for this purchase order line' using errcode='23505';
 end if;
 return new;
end; $$;
revoke all on function private.guard_live_purchase_receipt_reference() from public,anon,authenticated;
create trigger purchase_receipts_live_reference before insert on public.purchase_order_receipts
for each row execute function private.guard_live_purchase_receipt_reference();
-- Retire the superseded private reversal chain.
drop function private.reverse_inventory_transaction_valued(uuid,uuid,text);
drop function private.reverse_inventory_transaction_unrestricted(uuid,uuid,text);
notify pgrst,'reload schema';
commit;

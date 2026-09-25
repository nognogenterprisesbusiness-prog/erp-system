-- Physical counts never edit balances. An independent admin decision posts a
-- valued loss through the existing inventory ledger/valuation trigger.
create table public.inventory_stock_counts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  expected_quantity numeric(20,4) not null check (expected_quantity >= 0),
  expected_reserved numeric(20,4) not null check (expected_reserved >= 0),
  expected_value numeric(24,2) not null check (expected_value >= 0),
  counted_quantity numeric(20,4) not null check (counted_quantity >= 0),
  reason_type text not null check (reason_type in ('physical_count','damaged','missing')),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  counted_by uuid not null references public.profiles(id) on delete restrict,
  counted_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  transaction_id uuid unique references public.inventory_transactions(id) on delete restrict,
  check ((status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)),
  check (decision_note is null or char_length(decision_note) <= 500)
);
create index inventory_stock_counts_location_recent_idx
  on public.inventory_stock_counts (inventory_location_id, counted_at desc);
create unique index inventory_stock_counts_one_pending_idx
  on public.inventory_stock_counts (material_id, inventory_location_id) where status = 'pending';
create trigger inventory_stock_counts_audit after insert or update on public.inventory_stock_counts
  for each row execute function private.audit_row_change();
alter table public.inventory_stock_counts enable row level security;
revoke all on public.inventory_stock_counts from public, anon, authenticated;
grant select on public.inventory_stock_counts to authenticated;
create policy inventory_stock_counts_read on public.inventory_stock_counts for select to authenticated
  using (private.can_view_inventory_location(inventory_location_id));

create function public.record_inventory_stock_count(
  p_key uuid, p_material_id uuid, p_location_id uuid, p_counted numeric, p_reason_type text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_location public.inventory_locations;
  v_balance public.inventory_balances; v_valuation public.inventory_valuations;
  v_existing public.inventory_stock_counts; v_unit public.units_of_measure; v_id uuid;
begin
  if v_actor is null or p_key is null or p_material_id is null or p_location_id is null
    or p_counted is null or p_counted < 0
    or p_counted > 1000000000 or p_reason_type not in ('physical_count','damaged','missing')
    or p_reason_type is null or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Invalid count or reason' using errcode = '22023'; end if;
  select * into v_location from public.inventory_locations where id = p_location_id;
  if v_location.id is null or not (
    private.can_manage_inventory()
    or (v_location.warehouse_id is not null and private.has_any_role(array['warehouse_staff']::public.app_role[])
      and private.can_access_warehouse(v_location.warehouse_id))
    or (v_location.project_site_id is not null
      and exists (select 1 from public.project_sites s where s.id = v_location.project_site_id
        and private.can_view_daily_project_report(s.project_id)))
  ) then raise exception 'Not authorized to count this location' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into v_existing from public.inventory_stock_counts where idempotency_key = p_key;
  if v_existing.id is not null then
    if v_existing.counted_by = v_actor and v_existing.material_id = p_material_id
      and v_existing.inventory_location_id = p_location_id and v_existing.counted_quantity = p_counted
      and v_existing.reason_type = p_reason_type and v_existing.reason = trim(p_reason) then return v_existing.id; end if;
    raise exception 'Count key already used for different data' using errcode = '23505';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_material_id::text || ':' || p_location_id::text, 0));
  if exists (select 1 from public.inventory_stock_counts c where c.material_id = p_material_id
      and c.inventory_location_id = p_location_id and c.status = 'pending') then
    raise exception 'Resolve the pending count before recording another' using errcode = '55000';
  end if;
  select u.* into v_unit from public.materials m join public.units_of_measure u on u.id = m.base_unit_id
    where m.id = p_material_id and m.archived_at is null;
  if v_unit.id is null or round(p_counted, v_unit.decimal_scale) <> p_counted then
    raise exception 'Count does not match material unit precision' using errcode = '22023'; end if;
  select * into v_balance from public.inventory_balances
    where material_id = p_material_id and inventory_location_id = p_location_id for update;
  select * into v_valuation from public.inventory_valuations
    where material_id = p_material_id and inventory_location_id = p_location_id for update;
  if v_balance.id is null or v_valuation.id is null or v_valuation.total_value is null
    or v_balance.quantity_on_hand <> v_valuation.quantity_on_hand then
    raise exception 'Stock requires reconciled quantity and value before counting' using errcode = '22023'; end if;
  insert into public.inventory_stock_counts
    (idempotency_key, material_id, inventory_location_id, expected_quantity, expected_reserved,
      expected_value, counted_quantity, reason_type, reason, counted_by)
  values (p_key, p_material_id, p_location_id, v_balance.quantity_on_hand, v_balance.reserved_quantity,
    v_valuation.total_value, p_counted, p_reason_type, trim(p_reason), v_actor) returning id into v_id;
  return v_id;
end; $$;

create function public.decide_inventory_stock_count(p_count_id uuid, p_approve boolean, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_count public.inventory_stock_counts;
  v_balance public.inventory_balances; v_valuation public.inventory_valuations;
  v_unit uuid; v_delta numeric; v_tx uuid;
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'Only an administrator can decide a stock count' using errcode = '42501'; end if;
  if p_approve is null or char_length(coalesce(p_note,'')) > 500 then
    raise exception 'Invalid decision' using errcode = '22023'; end if;
  select * into v_count from public.inventory_stock_counts where id = p_count_id for update;
  if v_count.id is null then
    raise exception 'Stock count was not found' using errcode = 'P0002'; end if;
  if v_count.status <> 'pending' then
    if v_count.decided_by = v_actor and v_count.status = case when p_approve then 'approved' else 'rejected' end
      and coalesce(v_count.decision_note,'') = trim(coalesce(p_note,'')) then return p_count_id; end if;
    raise exception 'Stock count is no longer pending' using errcode = '55000'; end if;
  if not p_approve then
    if char_length(trim(coalesce(p_note,''))) < 3 then
      raise exception 'Rejection reason is required' using errcode = '22023'; end if;
    update public.inventory_stock_counts set status = 'rejected', decided_by = v_actor,
      decided_at = now(), decision_note = trim(p_note) where id = p_count_id;
    return p_count_id;
  end if;
  if v_count.counted_quantity > v_count.expected_quantity then
    raise exception 'Unexpected surplus needs a verified costed receipt, not an inferred adjustment' using errcode = '22023'; end if;
  select * into v_balance from public.inventory_balances
    where material_id = v_count.material_id and inventory_location_id = v_count.inventory_location_id for update;
  select * into v_valuation from public.inventory_valuations
    where material_id = v_count.material_id and inventory_location_id = v_count.inventory_location_id for update;
  if v_balance.id is null or v_valuation.id is null or v_valuation.total_value is null
    or v_balance.quantity_on_hand <> v_count.expected_quantity
    or v_balance.reserved_quantity <> v_count.expected_reserved
    or v_valuation.quantity_on_hand <> v_count.expected_quantity
    or v_valuation.total_value <> v_count.expected_value then
    raise exception 'Stock changed after counting; record a fresh count' using errcode = '55000'; end if;
  v_delta := v_count.expected_quantity - v_count.counted_quantity;
  if v_delta > v_balance.available_quantity then
    raise exception 'Cannot write off reserved stock' using errcode = '22023'; end if;
  if v_delta > 0 then
    select m.base_unit_id into v_unit from public.materials m where m.id = v_count.material_id;
    v_tx := gen_random_uuid();
    update public.inventory_balances set quantity_on_hand = quantity_on_hand - v_delta, updated_at = now()
      where id = v_balance.id;
    insert into public.inventory_transactions
      (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type,
        reference_document, responsible_user_id, transaction_date, remarks)
    values (v_tx, v_count.material_id, v_delta, v_unit, v_count.inventory_location_id, 'STOCK_OUT',
      'COUNT-' || left(v_count.id::text, 8), v_actor, current_date,
      left('Approved ' || v_count.reason_type || ' loss: ' || v_count.reason || coalesce(' · ' || nullif(trim(p_note),''),''), 2000));
  end if;
  update public.inventory_stock_counts set status = 'approved', decided_by = v_actor,
    decided_at = now(), decision_note = nullif(trim(coalesce(p_note,'')),''), transaction_id = v_tx
    where id = p_count_id;
  return p_count_id;
end; $$;

revoke execute on function public.record_inventory_stock_count(uuid,uuid,uuid,numeric,text,text),
  public.decide_inventory_stock_count(uuid,boolean,text) from public, anon;
grant execute on function public.record_inventory_stock_count(uuid,uuid,uuid,numeric,text,text),
  public.decide_inventory_stock_count(uuid,boolean,text) to authenticated;

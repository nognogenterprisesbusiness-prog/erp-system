begin;

-- A partly dispatched request could never free the stock still reserved for it:
-- cancellation is refused after the first dispatch and no other path released the
-- reservation. This command closes only the undispatched remainder, with a reason,
-- keeping everything already dispatched or received untouched.
alter table public.material_request_reservation_events add column if not exists reason text
  check (reason is null or char_length(reason) between 3 and 500);

create or replace function public.close_request_remainder(
  p_idempotency_key uuid, p_request_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.material_requests%rowtype;
  v_reservation public.material_request_reservations%rowtype;
  v_hash text;
  v_existing uuid;
  v_released integer := 0;
begin
  if v_actor is null or p_idempotency_key is null or p_request_id is null then
    raise exception 'authentication, request and idempotency key are required' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  v_hash := md5(jsonb_build_object('request', p_request_id, 'reason', trim(p_reason))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'close_request_remainder', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_request from public.material_requests where id = p_request_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  -- Same authority as dispatching: Admin, or Warehouse Staff assigned to the source warehouse.
  if not private.can_manage_inventory() and not (
    private.has_any_role(array['warehouse_staff']::public.app_role[])
    and exists (select 1 from public.warehouse_assignments a where a.warehouse_id = v_request.source_warehouse_id
      and a.user_id = v_actor and a.status = 'active')
  ) then raise exception 'not authorized for source warehouse' using errcode = '42501'; end if;
  -- A retry that waited on the request lock must not close twice.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'close_request_remainder', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  if v_request.status not in ('approved', 'partially_approved') then
    raise exception 'request is not approved' using errcode = '22023';
  end if;
  if not exists (select 1 from public.material_request_dispatches d
    join public.material_request_lines l on l.id = d.request_line_id where l.request_id = p_request_id) then
    raise exception 'nothing dispatched yet; cancel the request instead' using errcode = '22023';
  end if;
  for v_reservation in
    select res.* from public.material_request_lines l
    join public.material_request_reservations res on res.request_line_id = l.id
    where l.request_id = p_request_id and res.status = 'active' and res.remaining_quantity > 0
    order by res.material_id for update of res
  loop
    update public.inventory_balances
      set reserved_quantity = reserved_quantity - v_reservation.remaining_quantity, updated_at = now()
      where material_id = v_reservation.material_id and inventory_location_id = v_reservation.inventory_location_id
        and reserved_quantity >= v_reservation.remaining_quantity;
    if not found then raise exception 'reservation balance is inconsistent' using errcode = '23514'; end if;
    update public.material_request_reservations
      set remaining_quantity = 0, status = 'released', released_at = now()
      where id = v_reservation.id;
    insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id, reason)
      values (v_reservation.id, 'released', v_reservation.remaining_quantity, v_actor, trim(p_reason));
    v_released := v_released + 1;
  end loop;
  if v_released = 0 then raise exception 'no reserved stock remains to release' using errcode = '22023'; end if;
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'close_request_remainder', v_hash, p_request_id);
  return p_request_id;
end; $$;

revoke all on function public.close_request_remainder(uuid, uuid, text) from public, anon;
grant execute on function public.close_request_remainder(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;

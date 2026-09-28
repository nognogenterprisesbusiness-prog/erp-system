-- Site-assigned foremen and engineers may post consumption only to sites they
-- are authorized to operate. Keep the stock decrement and ledger insert atomic.
create or replace function public.consume_site_material(
  p_idempotency_key uuid, p_material_id uuid, p_site_location_id uuid,
  p_project_id uuid, p_quantity numeric, p_unit_id uuid,
  p_reference_document text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_id uuid := gen_random_uuid();
  v_available numeric;
begin
  if v_actor is null or p_idempotency_key is null or p_transaction_date is null
    or char_length(trim(coalesce(p_reference_document, ''))) not between 2 and 120 then
    raise exception 'consumption date and reference are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('material', p_material_id, 'site', p_site_location_id,
    'project', p_project_id, 'quantity', p_quantity, 'unit', p_unit_id,
    'reference', trim(p_reference_document), 'date', p_transaction_date,
    'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'consume_site_material', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not exists (select 1 from public.inventory_locations il
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where il.id = p_site_location_id and ps.project_id = p_project_id
      and ps.status = 'active' and p.status = 'active' and p.archived_at is null) then
    raise exception 'active site does not belong to project' using errcode = '22023';
  end if;
  if not private.can_manage_inventory() and not private.can_access_project_site(
    p_project_id,
    (select il.project_site_id from public.inventory_locations il where il.id = p_site_location_id)
  ) then
    raise exception 'not authorized for project site consumption' using errcode = '42501';
  end if;
  select available_quantity into v_available from public.inventory_balances
    where material_id = p_material_id and inventory_location_id = p_site_location_id for update;
  if coalesce(v_available, 0) < p_quantity then
    raise exception 'insufficient site stock' using errcode = 'P0001';
  end if;
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
    where material_id = p_material_id and inventory_location_id = p_site_location_id;
  insert into public.inventory_transactions
    (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type,
      reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_id, p_material_id, p_quantity, p_unit_id, p_site_location_id, 'MATERIAL_CONSUMPTION',
    trim(p_reference_document), p_project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
  values (p_idempotency_key, v_actor, 'consume_site_material', v_hash, v_id);
  return v_id;
end; $$;

revoke execute on function public.consume_site_material(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text)
  from public, anon;
grant execute on function public.consume_site_material(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text)
  to authenticated;

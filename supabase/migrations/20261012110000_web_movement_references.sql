begin;
create sequence private.web_inventory_reference_seq;
create table private.web_inventory_commands (
  idempotency_key uuid primary key,
  actor_id uuid not null references public.profiles(id),
  mode text not null check(mode in ('stock-in','stock-out','transfer','return')),
  reference_document text not null unique,
  transaction_date date not null,
  payload jsonb,
  result_id uuid,
  created_at timestamptz not null default now()
);
revoke all on private.web_inventory_commands,private.web_inventory_reference_seq from public,anon,authenticated;

-- Allocate before posting so failed saves and midnight retries keep the original metadata.
create function public.prepare_web_inventory_movement(p_key uuid,p_mode text)
returns table(reference_document text,transaction_date date)
language plpgsql security definer set search_path='' as $$
declare v_row private.web_inventory_commands; v_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[])
    or (p_mode<>'transfer' and not private.can_manage_inventory()) then
    raise exception 'Not authorized for this inventory command' using errcode='42501';
  end if;
  if p_key is null or p_mode is null or p_mode not in ('stock-in','stock-out','transfer','return') then
    raise exception 'Invalid movement command' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into v_row from private.web_inventory_commands where idempotency_key=p_key;
  if found then
    if v_row.actor_id<>auth.uid() or v_row.mode<>p_mode then raise exception 'Idempotency key already used' using errcode='23505'; end if;
  else
    insert into private.web_inventory_commands(idempotency_key,actor_id,mode,reference_document,transaction_date)
    values(p_key,auth.uid(),p_mode,'MOV-'||to_char(v_date,'YYYY')||'-'||lpad(nextval('private.web_inventory_reference_seq')::text,8,'0'),v_date)
    returning * into v_row;
  end if;
  return query select v_row.reference_document,v_row.transaction_date;
end; $$;

create function public.post_web_inventory_movement(p_key uuid,p_mode text,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_row private.web_inventory_commands; v_result uuid; v_source uuid := (p_input->>'sourceLocationId')::uuid;
  v_destination uuid := (p_input->>'destinationLocationId')::uuid;
begin
  perform public.prepare_web_inventory_movement(p_key,p_mode);
  select * into v_row from private.web_inventory_commands where idempotency_key=p_key for update;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid movement details' using errcode='22023'; end if;
  if v_row.result_id is not null then
    if v_row.payload<>p_input then raise exception 'Idempotency key already used for different details' using errcode='23505'; end if;
    return v_row.result_id;
  end if;
  if p_mode='stock-in' then
    v_result:=public.post_valued_stock_in(p_key,(p_input->>'materialId')::uuid,v_destination,
      (p_input->>'quantity')::numeric,(p_input->>'unitId')::uuid,(p_input->>'totalCost')::numeric,
      v_row.reference_document,v_row.transaction_date,p_input->>'remarks');
  elsif p_mode='stock-out' then
    v_result:=public.post_stock_out(p_key,(p_input->>'materialId')::uuid,v_source,
      (p_input->>'quantity')::numeric,(p_input->>'unitId')::uuid,v_row.reference_document,
      v_row.transaction_date,null,p_input->>'remarks');
  else
    if p_mode='return' and (not exists(select 1 from public.inventory_locations where id=v_source and location_type='project_site')
      or not exists(select 1 from public.inventory_locations where id=v_destination and location_type='warehouse')
      or length(trim(coalesce(p_input->>'remarks','')))<3) then
      raise exception 'Choose a project site, warehouse and return reason' using errcode='22023';
    end if;
    v_result:=public.dispatch_inventory_transfer(p_key,(p_input->>'materialId')::uuid,v_source,v_destination,
      (p_input->>'quantity')::numeric,(p_input->>'unitId')::uuid,v_row.reference_document,
      v_row.transaction_date,p_input->>'remarks');
  end if;
  update private.web_inventory_commands set payload=p_input,result_id=v_result where idempotency_key=p_key;
  return v_result;
end; $$;
revoke all on function public.prepare_web_inventory_movement(uuid,text),public.post_web_inventory_movement(uuid,text,jsonb) from public,anon;
grant execute on function public.prepare_web_inventory_movement(uuid,text),public.post_web_inventory_movement(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- Issue one active label whenever an eligible record is created. Existing records are backfilled once.
create or replace function private.create_initial_qr_label(p_type public.qr_entity_type, p_entity_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code_id uuid;
begin
  if p_entity_id is null or p_actor_id is null then raise exception 'QR target and actor are required' using errcode = '22023'; end if;
  if exists (select 1 from public.qr_codes where entity_type = p_type and entity_id = p_entity_id and status = 'active') then return; end if;
  insert into public.qr_codes (entity_type, material_id, asset_id, warehouse_id, project_site_id, generated_by)
  values (p_type,
    case when p_type = 'material' then p_entity_id end,
    case when p_type in ('equipment', 'vehicle') then p_entity_id end,
    case when p_type = 'warehouse' then p_entity_id end,
    case when p_type = 'project_site' then p_entity_id end,
    p_actor_id)
  on conflict do nothing returning id into v_code_id;
  if v_code_id is not null then
    insert into public.qr_events (qr_code_id, event_type, actor_id) values (v_code_id, 'generated', p_actor_id);
  end if;
end;
$$;

create or replace function private.create_initial_qr_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'materials' then
    if new.archived_at is null then
      perform private.create_initial_qr_label('material', new.id, new.created_by);
    end if;
  elsif tg_table_name = 'assets' then
    if new.archived_at is null then
      perform private.create_initial_qr_label(new.asset_kind::text::public.qr_entity_type, new.id, new.created_by);
    end if;
  elsif tg_table_name = 'warehouses' then
    if new.status = 'active' then
      perform private.create_initial_qr_label('warehouse', new.id, new.created_by);
    end if;
  elsif tg_table_name = 'project_sites' then
    if new.status = 'active' then
      perform private.create_initial_qr_label('project_site', new.id, new.created_by);
    end if;
  end if;
  return new;
end;
$$;

create trigger materials_initial_qr after insert on public.materials for each row execute function private.create_initial_qr_trigger();
create trigger assets_initial_qr after insert on public.assets for each row execute function private.create_initial_qr_trigger();
create trigger warehouses_initial_qr after insert on public.warehouses for each row execute function private.create_initial_qr_trigger();
create trigger project_sites_initial_qr after insert on public.project_sites for each row execute function private.create_initial_qr_trigger();

do $$ declare v record; begin
  for v in select id, created_by from public.materials where archived_at is null loop perform private.create_initial_qr_label('material', v.id, v.created_by); end loop;
  for v in select id, created_by, asset_kind from public.assets where archived_at is null loop perform private.create_initial_qr_label(v.asset_kind::text::public.qr_entity_type, v.id, v.created_by); end loop;
  for v in select id, created_by from public.warehouses where status = 'active' loop perform private.create_initial_qr_label('warehouse', v.id, v.created_by); end loop;
  for v in select id, created_by from public.project_sites where status = 'active' loop perform private.create_initial_qr_label('project_site', v.id, v.created_by); end loop;
end $$;

revoke all on function private.create_initial_qr_label(public.qr_entity_type, uuid, uuid), private.create_initial_qr_trigger() from public, anon, authenticated;

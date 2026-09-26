-- Repair already-applied QR triggers without recreating tables or labels.
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

revoke all on function private.create_initial_qr_trigger() from public, anon, authenticated;

-- Two immutable photos document the start and end of an equipment or vehicle
-- use entry. Cost posting still uses the existing rate snapshot command.
alter table public.project_equipment_usage
  add column start_photo_path text,
  add column end_photo_path text,
  add constraint equipment_usage_photo_pair check (
    (start_photo_path is null and end_photo_path is null)
    or (start_photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/start[.]webp$'
      and end_photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/end[.]webp$')
  );

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('erp-equipment-evidence','erp-equipment-evidence',false,2000000,array['image/webp'])
on conflict (id) do nothing;

create policy equipment_evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-equipment-evidence'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(start|end)[.]webp$'
  and split_part(name,'/',1) = auth.uid()::text
  and private.has_any_role(array['admin','foreman']::public.app_role[])
);
create policy equipment_evidence_select on storage.objects for select to authenticated
using (
  bucket_id = 'erp-equipment-evidence'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(start|end)[.]webp$'
  and (
    split_part(name,'/',1) = auth.uid()::text
    or exists (
      select 1 from public.project_equipment_usage usage
      where (usage.start_photo_path = name or usage.end_photo_path = name)
        and private.has_any_role(array['admin','finance']::public.app_role[])
    )
  )
);

create function public.post_project_equipment_usage_with_photos(
  p_idempotency_key uuid, p_project_id uuid, p_asset_id uuid, p_use_date date,
  p_hours numeric, p_work_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_start text;
  v_end text;
  v_id uuid;
  v_usage public.project_equipment_usage%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'Authentication and idempotency key are required' using errcode = '42501';
  end if;
  v_start := v_actor::text || '/' || p_idempotency_key::text || '/start.webp';
  v_end := v_actor::text || '/' || p_idempotency_key::text || '/end.webp';
  if not exists (select 1 from storage.objects where bucket_id = 'erp-equipment-evidence' and name = v_start)
    or not exists (select 1 from storage.objects where bucket_id = 'erp-equipment-evidence' and name = v_end) then
    raise exception 'Start and end photos are required' using errcode = '22023';
  end if;
  v_id := public.post_project_equipment_usage(
    p_idempotency_key,p_project_id,p_asset_id,p_use_date,p_hours,p_work_note
  );
  select * into v_usage from public.project_equipment_usage where id = v_id for update;
  if v_usage.recorded_by <> v_actor then
    raise exception 'Usage belongs to another recorder' using errcode = '42501';
  end if;
  if v_usage.start_photo_path is not null then
    if v_usage.start_photo_path <> v_start or v_usage.end_photo_path <> v_end then
      raise exception 'Usage evidence does not match the original entry' using errcode = '23505';
    end if;
    return v_id;
  end if;
  update public.project_equipment_usage
    set start_photo_path = v_start, end_photo_path = v_end
    where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.post_project_equipment_usage_with_photos(uuid,uuid,uuid,date,numeric,text) from public, anon;
grant execute on function public.post_project_equipment_usage_with_photos(uuid,uuid,uuid,date,numeric,text) to authenticated;
revoke execute on function public.post_project_equipment_usage(uuid,uuid,uuid,date,numeric,text) from authenticated;

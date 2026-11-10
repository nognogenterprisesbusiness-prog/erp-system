begin;

-- QR verification is a pending attempt, not a time-in/out or a labour posting.
create table public.attendance_scan_attempts (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  card_id uuid not null references public.employee_id_cards(id),
  employee_id uuid not null references public.employees(id),
  project_id uuid not null references public.projects(id),
  project_site_id uuid not null references public.project_sites(id),
  expected_scan_type text not null check(expected_scan_type in ('in','out')),
  verified_at timestamptz not null default now(),
  scan_id uuid references public.attendance_scans(id)
);
create table public.attendance_scan_photos (
  scan_id uuid primary key references public.attendance_scans(id),
  photo_path text not null unique,
  photo_sha256 text not null check (photo_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.attendance_scan_attempts enable row level security;
alter table public.attendance_scan_photos enable row level security;
revoke all on public.attendance_scan_attempts,public.attendance_scan_photos from public,anon,authenticated;
grant select on public.attendance_scan_photos to authenticated;

create function private.can_read_attendance_photo(p_project uuid,p_site uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (private.has_any_role(array['admin']::public.app_role[])
    or private.mobile_site_role(p_project,p_site,'foreman'));
$$;
revoke all on function private.can_read_attendance_photo(uuid,uuid) from public,anon;
grant execute on function private.can_read_attendance_photo(uuid,uuid) to authenticated;
create policy attendance_scan_photo_read on public.attendance_scan_photos for select to authenticated
using (exists(select 1 from public.attendance_scans s where s.id=scan_id
  and private.can_read_attendance_photo(s.project_id,s.project_site_id)));
create trigger attendance_scan_photos_append_only before update or delete on public.attendance_scan_photos
for each row execute function private.attendance_scans_append_only();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('erp-attendance-evidence','erp-attendance-evidence',false,2000000,array['image/webp']);
-- An RPC checks the attempt without exposing other employees' identifiers.
create function public.can_upload_attendance_photo(p_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.attendance_scan_attempts a where a.id::text=p_key and a.actor_id=auth.uid()
    and a.scan_id is null and a.verified_at>now()-interval '10 minutes'
    and private.mobile_site_role(a.project_id,a.project_site_id,'foreman'));
$$;
revoke all on function public.can_upload_attendance_photo(text) from public,anon;
grant execute on function public.can_upload_attendance_photo(text) to authenticated;
-- RLS callers cannot select pending attempts directly.
create policy attendance_evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id='erp-attendance-evidence' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/face[.]webp$'
  and split_part(name,'/',1)=auth.uid()::text
  and public.can_upload_attendance_photo(split_part(name,'/',2))
);
create policy attendance_evidence_read on storage.objects for select to authenticated using (
  bucket_id='erp-attendance-evidence' and (
    (split_part(name,'/',1)=auth.uid()::text and public.can_upload_attendance_photo(split_part(name,'/',2)))
    or exists(select 1 from public.attendance_scan_photos p join public.attendance_scans s on s.id=p.scan_id
      where p.photo_path=name and private.can_read_attendance_photo(s.project_id,s.project_site_id))
  )
);

create function public.prepare_attendance_scan(p_idempotency_key uuid,p_project_id uuid,p_site_id uuid,p_card text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_card public.employee_id_cards; v_employee public.employees; v_attempt public.attendance_scan_attempts; v_last public.attendance_scans;
begin
  if auth.uid() is null or not private.can_record_project_attendance(p_project_id)
    or not private.mobile_site_role(p_project_id,p_site_id,'foreman') then
    raise exception 'Only the assigned Foreman can scan attendance for this site' using errcode='42501'; end if;
  if p_idempotency_key is null or p_card is null or upper(trim(p_card)) !~ '^NW-[A-F0-9]{32}$' then
    raise exception 'This is not a worker ID card' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_card from public.employee_id_cards where public_identifier=upper(trim(p_card));
  if v_card.id is null then raise exception 'ID card not recognised' using errcode='22023'; end if;
  if v_card.status<>'active' then raise exception 'This ID card was replaced. Use the worker''s new card.' using errcode='22023'; end if;
  select * into v_employee from public.employees where id=v_card.employee_id;
  if v_employee.archived_at is not null or v_employee.status<>'active' then
    raise exception '% is not an active employee',concat(v_employee.first_name,' ',v_employee.last_name) using errcode='22023'; end if;
  if not exists(select 1 from public.employee_project_assignments a where a.employee_id=v_employee.id
    and a.project_id=p_project_id and a.project_site_id=p_site_id
    and a.start_date<=(now() at time zone 'Asia/Manila')::date
    and (a.end_date is null or a.end_date>=(now() at time zone 'Asia/Manila')::date)) then
    raise exception '% is not assigned to this site today',concat(v_employee.first_name,' ',v_employee.last_name) using errcode='22023'; end if;
  if exists(select 1 from public.project_attendance a where a.employee_id=v_employee.id and a.project_id=p_project_id
    and a.work_date=(now() at time zone 'Asia/Manila')::date
    and not exists(select 1 from public.project_attendance_reversals r where r.attendance_id=a.id)) then
    raise exception 'Attendance for % is already recorded today',concat(v_employee.first_name,' ',v_employee.last_name) using errcode='23505'; end if;
  select * into v_last from public.attendance_scans where employee_id=v_employee.id and project_id=p_project_id
    and work_date=(now() at time zone 'Asia/Manila')::date order by scanned_at desc,id desc limit 1;
  select * into v_attempt from public.attendance_scan_attempts where id=p_idempotency_key;
  if found then
    if v_attempt.actor_id<>auth.uid() or v_attempt.card_id<>v_card.id or v_attempt.project_id<>p_project_id or v_attempt.project_site_id<>p_site_id then
      raise exception 'Idempotency key already used for another scan' using errcode='23505'; end if;
    if v_attempt.verified_at<=now()-interval '10 minutes' then raise exception 'QR verification expired. Scan the ID again.' using errcode='22023'; end if;
  else
    insert into public.attendance_scan_attempts(id,actor_id,card_id,employee_id,project_id,project_site_id,expected_scan_type)
    values(p_idempotency_key,auth.uid(),v_card.id,v_employee.id,p_project_id,p_site_id,case when v_last.scan_type='in' then 'out' else 'in' end);
  end if;
  select * into v_last from public.attendance_scans where employee_id=v_employee.id and project_id=p_project_id
    and work_date=(now() at time zone 'Asia/Manila')::date order by scanned_at desc,id desc limit 1;
  return jsonb_build_object('employee_id',v_employee.id,'name',concat(v_employee.first_name,' ',v_employee.last_name),'code',v_employee.code,
    'scan_type',case when v_last.scan_type='in' then 'out' else 'in' end,
    'recently_scanned',coalesce(v_last.scanned_at>now()-interval '5 minutes',false));
end; $$;

create function public.record_attendance_scan_with_photo(p_idempotency_key uuid,p_project_id uuid,p_site_id uuid,p_card text,p_photo_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt public.attendance_scan_attempts; v_path text; v_result jsonb; v_scan uuid; v_photo public.attendance_scan_photos;
begin
  if auth.uid() is null or p_idempotency_key is null
    or not private.mobile_site_role(p_project_id,p_site_id,'foreman') then
    raise exception 'Only the assigned Foreman can scan attendance for this site' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_attempt from public.attendance_scan_attempts where id=p_idempotency_key for update;
  if v_attempt.id is null or v_attempt.actor_id<>auth.uid() or v_attempt.project_id<>p_project_id or v_attempt.project_site_id<>p_site_id
    or not exists(select 1 from public.employee_id_cards c where c.id=v_attempt.card_id and c.public_identifier=upper(trim(p_card))) then
    raise exception 'Verify the worker ID before taking a face photo.' using errcode='22023'; end if;
  if v_attempt.scan_id is null and (v_attempt.verified_at<=now()-interval '10 minutes'
    or (v_attempt.verified_at at time zone 'Asia/Manila')::date<>(now() at time zone 'Asia/Manila')::date) then
    raise exception 'QR verification expired. Scan the ID again.' using errcode='22023'; end if;
  v_path:=auth.uid()::text||'/'||p_idempotency_key::text||'/face.webp';
  if p_photo_sha256 is null or p_photo_sha256 !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from storage.objects where bucket_id='erp-attendance-evidence' and name=v_path and created_at>=v_attempt.verified_at) then
    raise exception 'Take a new face photo after verifying the worker ID.' using errcode='22023'; end if;
  select * into v_photo from public.attendance_scan_photos where scan_id=v_attempt.scan_id;
  if found and (v_photo.photo_path<>v_path or v_photo.photo_sha256<>p_photo_sha256) then
    raise exception 'The photo does not match the original scan. Retry with the same photo.' using errcode='23505'; end if;
  v_result:=public.record_attendance_scan(p_idempotency_key,p_project_id,p_site_id,p_card);
  if not (v_result->>'repeated')::boolean and v_result->>'scan_type'<>v_attempt.expected_scan_type then
    raise exception 'Attendance changed. Scan the worker ID again.' using errcode='22023'; end if;
  if not (v_result->>'repeated')::boolean then
    select id into strict v_scan from public.attendance_scans where idempotency_key=p_idempotency_key;
    insert into public.attendance_scan_photos(scan_id,photo_path,photo_sha256) values(v_scan,v_path,p_photo_sha256)
    on conflict(scan_id) do nothing;
    update public.attendance_scan_attempts set scan_id=v_scan where id=p_idempotency_key;
  end if;
  return v_result;
end; $$;
revoke all on function public.prepare_attendance_scan(uuid,uuid,uuid,text),public.record_attendance_scan_with_photo(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.prepare_attendance_scan(uuid,uuid,uuid,text),public.record_attendance_scan_with_photo(uuid,uuid,uuid,text,text) to authenticated;
-- The photo-free scan implementation remains internal for compatibility with its original ledger.
revoke execute on function public.record_attendance_scan(uuid,uuid,uuid,text) from authenticated;
notify pgrst,'reload schema';
commit;

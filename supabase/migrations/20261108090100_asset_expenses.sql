-- Driver access is scoped to the assigned truck and the driver's own expenses.
create table public.driver_truck_assignments (
  driver_id uuid primary key references public.profiles(id),
  id uuid not null unique default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now()
);
create index driver_truck_assignments_asset_idx on public.driver_truck_assignments(asset_id);

create table public.asset_expenses (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  submitted_by uuid not null references public.profiles(id),
  request_id uuid not null,
  assignment_id uuid,
  category text not null check (category in ('fuel','oil_change','maintenance','repair','other')),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  notes text not null default '' check (length(notes) <= 500),
  receipt_path text unique,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  unique (submitted_by, request_id)
);
create index asset_expenses_asset_idx on public.asset_expenses(asset_id, expense_date desc, id desc);
create index asset_expenses_actor_idx on public.asset_expenses(submitted_by, expense_date desc, id desc);

alter table public.driver_truck_assignments enable row level security;
alter table public.asset_expenses enable row level security;
revoke all on public.driver_truck_assignments, public.asset_expenses from public, anon, authenticated;
grant select on public.driver_truck_assignments, public.asset_expenses to authenticated;
create policy driver_assignments_admin_read on public.driver_truck_assignments for select to authenticated
  using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy asset_expenses_read on public.asset_expenses for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[]))
    or (submitted_by = (select auth.uid()) and (select private.has_any_role(array['driver']::public.app_role[]))));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('erp-asset-expense-receipts','erp-asset-expense-receipts',false,3000000,array['image/webp']);
create policy asset_expense_receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'erp-asset-expense-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/receipt[.]webp$'
    and (select private.has_any_role(array['admin','driver']::public.app_role[])));
create policy asset_expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'erp-asset-expense-receipts' and (
    ((storage.foldername(name))[1] = (select auth.uid())::text
      and (select private.has_any_role(array['admin','driver']::public.app_role[])))
    or ((select private.has_any_role(array['admin','finance']::public.app_role[]))
      and exists (select 1 from public.asset_expenses e where e.receipt_path = name))
  ));

create function public.set_driver_truck(p_driver_id uuid, p_asset_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  perform 1 from public.profiles where id=p_driver_id for update;
  if not exists (select 1 from public.user_roles where user_id=p_driver_id and role='driver') then
    raise exception 'Choose a driver account' using errcode='22023';
  end if;
  if p_asset_id is null then
    delete from public.driver_truck_assignments where driver_id=p_driver_id;
    return;
  end if;
  perform 1 from public.assets where id=p_asset_id and asset_kind='vehicle'
    and archived_at is null and status <> 'retired' for share;
  if not found then raise exception 'Choose an active vehicle' using errcode='22023'; end if;
  insert into public.driver_truck_assignments(driver_id,asset_id,assigned_by)
  values(p_driver_id,p_asset_id,auth.uid())
  on conflict(driver_id) do update set asset_id=excluded.asset_id, assigned_by=excluded.assigned_by,
    id=gen_random_uuid(), assigned_at=now()
  where driver_truck_assignments.asset_id <> excluded.asset_id;
end;
$$;

create function public.get_my_truck()
returns table (assignment_id uuid, asset_id uuid, code text, name text, plate_number text)
language sql stable security definer set search_path='' as $$
  select d.id,a.id,a.code,a.name,v.plate_number
  from public.driver_truck_assignments d
  join public.assets a on a.id=d.asset_id and a.asset_kind='vehicle'
  left join public.vehicle_details v on v.asset_id=a.id
  where d.driver_id=auth.uid() and a.archived_at is null and a.status <> 'retired'
    and private.has_any_role(array['driver']::public.app_role[])
$$;

create function public.post_asset_expense(
  p_asset_id uuid, p_request_id uuid, p_category text, p_amount numeric,
  p_expense_date date, p_notes text, p_assignment_id uuid, p_has_receipt boolean
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  receipt text;
  prior public.asset_expenses%rowtype;
  expense_id uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=actor for update;
  if not private.has_any_role(array['admin','driver']::public.app_role[]) then
    raise exception 'Expense access required' using errcode='42501';
  end if;
  if p_asset_id is null or p_request_id is null or p_category is null
    or p_category not in ('fuel','oil_change','maintenance','repair','other')
    or p_amount is null or p_amount <= 0 or p_amount >= 10000000000
    or p_amount <> round(p_amount,2)
    or p_expense_date is null or p_expense_date > (now() at time zone 'Asia/Manila')::date
    or p_notes is null or length(p_notes)>500 or p_has_receipt is null then
    raise exception 'Invalid asset expense details' using errcode='22023';
  end if;
  if p_has_receipt then receipt := actor::text || '/' || p_request_id::text || '/receipt.webp'; end if;
  select * into prior from public.asset_expenses where submitted_by=actor and request_id=p_request_id;
  if found then
    if row(prior.asset_id,prior.category,prior.amount,prior.expense_date,prior.notes,prior.assignment_id,prior.receipt_path)
      is distinct from row(p_asset_id,p_category,p_amount,p_expense_date,p_notes,p_assignment_id,receipt) then
      raise exception 'Expense request already used' using errcode='23505';
    end if;
    return prior.id;
  end if;
  if p_assignment_id is not null or not private.has_any_role(array['admin']::public.app_role[]) then
    if not exists (select 1 from public.get_my_truck() t
        where t.assignment_id=p_assignment_id and t.asset_id=p_asset_id) then
      raise exception 'Truck assignment changed' using errcode='55000';
    end if;
  end if;
  perform 1 from public.assets where id=p_asset_id and archived_at is null and status <> 'retired' for share;
  if not found then raise exception 'Asset is unavailable' using errcode='55000'; end if;
  if receipt is not null and not exists (select 1 from storage.objects o
    where o.bucket_id='erp-asset-expense-receipts' and o.name=receipt) then
    raise exception 'Receipt photo is missing' using errcode='22023';
  end if;
  insert into public.asset_expenses(asset_id,submitted_by,request_id,assignment_id,category,amount,expense_date,notes,receipt_path)
  values(p_asset_id,actor,p_request_id,p_assignment_id,p_category,p_amount,p_expense_date,p_notes,receipt)
  returning id into expense_id;
  return expense_id;
end;
$$;

create function public.reverse_asset_expense(p_expense_id uuid, p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Enter a correction reason' using errcode='22023';
  end if;
  update public.asset_expenses set reversed_at=now(), reversed_by=auth.uid(), reversal_reason=trim(p_reason)
  where id=p_expense_id and reversed_at is null;
  if not found then raise exception 'Expense already reversed or unavailable' using errcode='55000'; end if;
end;
$$;

revoke execute on function public.set_driver_truck(uuid,uuid), public.get_my_truck(),
  public.post_asset_expense(uuid,uuid,text,numeric,date,text,uuid,boolean),
  public.reverse_asset_expense(uuid,text) from public, anon;
grant execute on function public.set_driver_truck(uuid,uuid), public.get_my_truck(),
  public.post_asset_expense(uuid,uuid,text,numeric,date,text,uuid,boolean),
  public.reverse_asset_expense(uuid,text) to authenticated;

create or replace function public.guard_mobile_api(p_write boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_minute bigint:=floor(extract(epoch from now())/60); v_hits integer;
begin
  if auth.uid() is null or not private.has_any_role(array['foreman','engineer','driver']::public.app_role[]) then
    raise exception 'Not authorized for mobile' using errcode='42501';
  end if;
  insert into private.mobile_api_limits(actor,is_write,minute,hits) values(auth.uid(),p_write,v_minute,1)
  on conflict(actor,is_write) do update set minute=excluded.minute,
    hits=case when mobile_api_limits.minute=excluded.minute then mobile_api_limits.hits+1 else 1 end
  returning hits into v_hits;
  return v_hits<=case when p_write then 30 else 180 end;
end;
$$;

-- An Auth identity alone is not an ERP membership. Invited users gain read
-- access only after an active profile has an assigned application role.
alter policy units_select_authenticated on public.units_of_measure
  using (private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]));
alter policy categories_select_authenticated on public.material_categories
  using (private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]));
alter policy materials_select_authenticated on public.materials
  using (private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]));
alter policy asset_categories_select_authenticated on public.asset_categories
  using (private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]));
alter policy employee_categories_select_authenticated on public.employee_categories
  using (private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]));


create or replace function private.can_view_assigned_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or (
      private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[])
      and (
        private.can_manage_projects()
        or exists (
          select 1 from public.project_assignments mine
          join public.project_assignments theirs on theirs.project_id = mine.project_id and theirs.status = 'active'
          where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
        )
        or exists (
          select 1 from public.warehouse_assignments mine
          join public.warehouse_assignments theirs on theirs.warehouse_id = mine.warehouse_id and theirs.status = 'active'
          where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
        )
      )
    )
$$;


create or replace function private.notification_scope_allowed(p_type_code text, p_project_id uuid, p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[])
    and (p_project_id is null or private.can_access_project(p_project_id))
    and (p_warehouse_id is null or private.can_access_warehouse(p_warehouse_id))
    and (p_type_code not in ('FINANCIAL','LABOR','ATTENDANCE')
      or private.has_any_role(array['admin']::public.app_role[]))
$$;

create or replace function public.resolve_qr_code(p_identifier text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_code public.qr_codes%rowtype; v_name text; v_code_label text; v_project_id uuid;
begin
  if not private.has_any_role(array['admin','engineer','foreman','warehouse_staff','finance']::public.app_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_identifier is null or p_identifier !~ '^NQ-[A-F0-9]{32}$' then raise exception 'invalid QR identifier' using errcode = '22023'; end if;
  select * into v_code from public.qr_codes where public_identifier = p_identifier and status = 'active';
  if not found then raise exception 'QR code is invalid or inactive' using errcode = '22023'; end if;
  if v_code.entity_type = 'material' then
    select name, code into v_name, v_code_label from public.materials where id = v_code.material_id and archived_at is null;
  elsif v_code.entity_type in ('equipment','vehicle') then
    if not private.can_view_asset(v_code.asset_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.assets where id = v_code.asset_id and archived_at is null;
  elsif v_code.entity_type = 'warehouse' then
    if not private.can_access_warehouse(v_code.warehouse_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.warehouses where id = v_code.warehouse_id and status = 'active';
  else
    select project_id into v_project_id from public.project_sites where id = v_code.project_site_id and status = 'active';
    if v_project_id is null or not private.can_access_project(v_project_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name into v_name from public.project_sites where id = v_code.project_site_id;
    select code into v_code_label from public.projects where id = v_project_id;
  end if;
  if v_name is null then raise exception 'QR entity is unavailable' using errcode = '22023'; end if;
  return jsonb_build_object('qr_id', v_code.id, 'identifier', v_code.public_identifier,
    'entity_type', v_code.entity_type, 'entity_id', v_code.entity_id, 'name', v_name,
    'code', v_code_label, 'project_id', v_project_id);
end;
$$;


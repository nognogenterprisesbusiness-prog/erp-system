-- Follow-up to 20261108090100 (already applied to the hosted database).
-- 1. Lock the driver's assignment while posting, so a concurrent Admin
--    reassignment either waits for the expense or makes it fail.
-- 2. Reject implausibly old expense dates.
-- 3. Keep audit evidence of assignment changes and expense reversals.
begin;

create or replace function public.post_asset_expense(
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
    or p_expense_date is null or p_expense_date < date '2000-01-01'
    or p_expense_date > (now() at time zone 'Asia/Manila')::date
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
    perform 1 from public.driver_truck_assignments d
    join public.assets a on a.id=d.asset_id and a.asset_kind='vehicle' and a.archived_at is null and a.status <> 'retired'
    where d.driver_id=actor and d.id=p_assignment_id and d.asset_id=p_asset_id
      and private.has_any_role(array['driver']::public.app_role[])
    for share of d;
    if not found then raise exception 'Truck assignment changed' using errcode='55000'; end if;
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
revoke execute on function public.post_asset_expense(uuid,uuid,text,numeric,date,text,uuid,boolean) from public, anon;
grant execute on function public.post_asset_expense(uuid,uuid,text,numeric,date,text,uuid,boolean) to authenticated;

drop trigger if exists driver_truck_assignments_audit on public.driver_truck_assignments;
create trigger driver_truck_assignments_audit after insert or update or delete on public.driver_truck_assignments
  for each row execute function private.audit_row_change();
drop trigger if exists asset_expenses_audit on public.asset_expenses;
create trigger asset_expenses_audit after insert or update or delete on public.asset_expenses
  for each row execute function private.audit_row_change();

notify pgrst, 'reload schema';
commit;

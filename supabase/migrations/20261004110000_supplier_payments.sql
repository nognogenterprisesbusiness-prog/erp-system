-- Client requirement (Purchasing sheet): record how each purchase order is
-- paid — cash or check (often postdated), with bank, check number, amount and
-- date — and keep a payment history per supplier.
--
-- Kept simple on purpose: no supplier bills, aging or accounting entries.
-- A payment belongs to one purchase order and cannot exceed its unpaid
-- balance (ordered quantity × PO price). Admin and Finance record payments;
-- only Admin can void one, with a reason. Recorded payments are never
-- edited; a void is a separate record. A check dated after today is shown
-- as postdated.
--
-- Safe to rerun: tables, indexes and policies use IF NOT EXISTS or are dropped
-- before being created; functions use OR REPLACE.

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  method text not null check (method in ('cash','check')),
  bank_name text check (bank_name is null or char_length(trim(bank_name)) between 2 and 80),
  check_number text check (check_number is null or char_length(trim(check_number)) between 1 and 40),
  amount numeric(18,2) not null check (amount > 0),
  payment_date date not null,
  remarks text check (remarks is null or char_length(remarks) <= 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint supplier_payment_method_details check (
    (method = 'cash' and bank_name is null and check_number is null)
    or (method = 'check' and bank_name is not null and check_number is not null)
  )
);
create index if not exists supplier_payments_order_idx on public.supplier_payments (purchase_order_id, created_at desc);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id, payment_date desc, id);

create table if not exists public.supplier_payment_voids (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.supplier_payments(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  voided_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_voids enable row level security;
revoke all on public.supplier_payments, public.supplier_payment_voids from anon, authenticated;
grant select on public.supplier_payments, public.supplier_payment_voids to authenticated;
drop policy if exists supplier_payments_finance_read on public.supplier_payments;
create policy supplier_payments_finance_read on public.supplier_payments for select to authenticated
using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
drop policy if exists supplier_payment_voids_finance_read on public.supplier_payment_voids;
create policy supplier_payment_voids_finance_read on public.supplier_payment_voids for select to authenticated
using ((select private.has_any_role(array['admin','finance']::public.app_role[])));

drop trigger if exists supplier_payments_audit on public.supplier_payments;
create trigger supplier_payments_audit after insert on public.supplier_payments
for each row execute function private.audit_row_change();
drop trigger if exists supplier_payment_voids_audit on public.supplier_payment_voids;
create trigger supplier_payment_voids_audit after insert on public.supplier_payment_voids
for each row execute function private.audit_row_change();

-- Order total, active payments and balance. Used by the commands and pages.
create or replace function private.purchase_order_payment_totals(p_order_id uuid)
returns table (order_total numeric, paid numeric)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(round(l.ordered_quantity * l.unit_price, 2)) from public.purchase_order_lines l where l.purchase_order_id = p_order_id), 0),
    coalesce((select sum(p.amount) from public.supplier_payments p
      where p.purchase_order_id = p_order_id
        and not exists (select 1 from public.supplier_payment_voids v where v.payment_id = p.id)), 0);
$$;

create or replace function public.record_supplier_payment(
  p_idempotency_key uuid, p_order_id uuid, p_method text, p_bank_name text, p_check_number text,
  p_amount numeric, p_payment_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.supplier_payments;
  v_order public.purchase_orders;
  v_total numeric;
  v_paid numeric;
  v_id uuid := gen_random_uuid();
  v_bank text := nullif(trim(coalesce(p_bank_name, '')), '');
  v_check text := nullif(trim(coalesce(p_check_number, '')), '');
begin
  if v_actor is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Only Admin or Finance can record supplier payments' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_order_id is null or p_payment_date is null
    or p_method is null or p_method not in ('cash','check')
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or char_length(coalesce(p_remarks, '')) > 500 then
    raise exception 'Invalid supplier payment' using errcode = '22023';
  end if;
  if p_method = 'check' and (v_bank is null or v_check is null) then
    raise exception 'Enter the bank and check number for a check payment' using errcode = '22023';
  end if;
  if p_method = 'cash' then v_bank := null; v_check := null; end if;
  v_payload := jsonb_build_object('order', p_order_id, 'method', p_method, 'bank', v_bank, 'check', v_check,
    'amount', p_amount, 'date', p_payment_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.supplier_payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another payment' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_order.status = 'cancelled' then
    raise exception 'A cancelled purchase order cannot be paid' using errcode = '22023';
  end if;
  select order_total, paid into v_total, v_paid from private.purchase_order_payment_totals(p_order_id);
  if v_paid + p_amount > v_total then
    raise exception 'Payment exceeds the purchase order balance' using errcode = '22023';
  end if;
  insert into public.supplier_payments (id, purchase_order_id, supplier_id, method, bank_name, check_number,
    amount, payment_date, remarks, recorded_by, idempotency_key, command_payload)
  values (v_id, v_order.id, v_order.supplier_id, p_method, v_bank, v_check, p_amount, p_payment_date,
    nullif(trim(coalesce(p_remarks, '')), ''), v_actor, p_idempotency_key, v_payload);
  return v_id;
end; $$;

create or replace function public.void_supplier_payment(p_payment_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payment public.supplier_payments;
  v_void public.supplier_payment_voids;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can void a supplier payment' using errcode = '42501';
  end if;
  if p_payment_id is null or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Enter a reason of at least three characters' using errcode = '22023';
  end if;
  select * into v_payment from public.supplier_payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'Supplier payment not found' using errcode = 'P0002'; end if;
  select * into v_void from public.supplier_payment_voids where payment_id = p_payment_id;
  if v_void.id is not null then
    if v_void.voided_by = v_actor and v_void.reason = trim(p_reason) then return v_void.id; end if;
    raise exception 'This payment is already void' using errcode = '22023';
  end if;
  insert into public.supplier_payment_voids (payment_id, reason, voided_by)
  values (p_payment_id, trim(p_reason), v_actor) returning id into v_void.id;
  return v_void.id;
end; $$;

-- Totals for several orders at once (purchase order list).
create or replace function public.get_purchase_order_payment_summaries(p_order_ids uuid[])
returns table (order_id uuid, order_total numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for supplier payments' using errcode = '42501';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 200 then
    raise exception 'too many purchase orders requested' using errcode = '22023';
  end if;
  return query select o.id, t.order_total, t.paid, t.order_total - t.paid
    from public.purchase_orders o
    cross join lateral private.purchase_order_payment_totals(o.id) t
    where o.id = any(p_order_ids);
end; $$;

revoke execute on function private.purchase_order_payment_totals(uuid) from public, anon, authenticated;
revoke execute on function public.record_supplier_payment(uuid,uuid,text,text,text,numeric,date,text),
  public.void_supplier_payment(uuid,text), public.get_purchase_order_payment_summaries(uuid[]) from public, anon;
grant execute on function public.record_supplier_payment(uuid,uuid,text,text,text,numeric,date,text),
  public.void_supplier_payment(uuid,text), public.get_purchase_order_payment_summaries(uuid[]) to authenticated;

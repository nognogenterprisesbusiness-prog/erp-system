-- Web billing ledger. Invoices are management records, not tax invoices.
-- No direct client writes: each financial change is authorized and serialized in a command.
create table public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_code text not null,
  project_name text not null,
  client_name text not null,
  description text not null check (char_length(trim(description)) between 3 and 300),
  issued_on date not null,
  due_on date not null check (due_on >= issued_on),
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'issued' check (status in ('issued','void')),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  voided_by uuid references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint client_invoice_void_fields check (
    (status = 'issued' and voided_by is null and voided_at is null and void_reason is null)
    or (status = 'void' and voided_by is not null and voided_at is not null and char_length(trim(void_reason)) between 3 and 500)
  )
);
create index client_invoices_project_idx on public.client_invoices (project_id, created_at desc);
create index client_invoices_status_due_idx on public.client_invoices (status, due_on);

create table public.client_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.client_invoices(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  paid_on date not null,
  reference text not null check (char_length(trim(reference)) between 3 and 100),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now()
);
create index client_payments_invoice_idx on public.client_payments (invoice_id, created_at desc);
create unique index client_payments_reference_invoice_unique on public.client_payments (invoice_id, lower(reference));

create table public.client_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.client_payments(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);

create sequence public.client_invoice_number_seq;
revoke all on sequence public.client_invoice_number_seq from public, anon, authenticated;

alter table public.client_invoices enable row level security;
alter table public.client_payments enable row level security;
alter table public.client_payment_reversals enable row level security;
revoke all on public.client_invoices, public.client_payments, public.client_payment_reversals from public, anon, authenticated;
grant select on public.client_invoices, public.client_payments, public.client_payment_reversals to authenticated;

create policy client_invoices_finance_read on public.client_invoices for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy client_payments_finance_read on public.client_payments for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy client_payment_reversals_finance_read on public.client_payment_reversals for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));

create trigger client_invoices_audit after insert or update on public.client_invoices
for each row execute function private.audit_row_change();
create trigger client_payments_audit after insert on public.client_payments
for each row execute function private.audit_row_change();
create trigger client_payment_reversals_audit after insert on public.client_payment_reversals
for each row execute function private.audit_row_change();

create function private.protect_issued_invoice_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_issued numeric(18,2);
begin
  if new.contract_amount is distinct from old.contract_amount then
    select coalesce(sum(amount), 0) into v_issued from public.client_invoices
    where project_id = new.id and status = 'issued';
    if new.contract_amount < v_issued then
      raise exception 'Project contract amount cannot be less than issued invoices' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_protect_issued_invoice_contract before update of contract_amount on public.projects
for each row execute function private.protect_issued_invoice_contract();
revoke execute on function private.protect_issued_invoice_contract() from public, anon, authenticated;

create function public.issue_client_invoice(
  p_idempotency_key uuid, p_project_id uuid, p_description text,
  p_issued_on date, p_due_on date, p_amount numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.client_invoices;
  v_project public.projects;
  v_billed numeric(18,2);
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized to issue invoices' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_project_id is null or p_issued_on is null or p_due_on is null or p_due_on < p_issued_on
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or char_length(trim(coalesce(p_description, ''))) not between 3 and 300 then
    raise exception 'Invalid invoice details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'description', trim(p_description),
    'issued_on', p_issued_on, 'due_on', p_due_on, 'amount', p_amount);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.client_invoices where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.issued_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another invoice' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_project from public.projects where id = p_project_id and archived_at is null for update;
  if not found or v_project.status not in ('active','on_hold','completed') then
    raise exception 'The project is not eligible for billing' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_billed from public.client_invoices
  where project_id = p_project_id and status = 'issued';
  if v_billed + p_amount > v_project.contract_amount then
    raise exception 'Invoice exceeds remaining project contract value' using errcode = '22023';
  end if;
  insert into public.client_invoices (
    id, invoice_number, project_id, project_code, project_name, client_name, description, issued_on, due_on,
    amount, issued_by, idempotency_key, command_payload
  ) values (
    v_id, 'INV-' || to_char(p_issued_on, 'YYYY') || '-' || lpad(nextval('public.client_invoice_number_seq')::text, 6, '0'),
    p_project_id, v_project.code, v_project.name, v_project.client_name, trim(p_description), p_issued_on, p_due_on,
    p_amount, v_actor, p_idempotency_key, v_payload
  );
  return v_id;
end;
$$;

create function public.record_client_payment(
  p_idempotency_key uuid, p_invoice_id uuid, p_amount numeric,
  p_paid_on date, p_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.client_payments;
  v_invoice public.client_invoices;
  v_paid numeric(18,2);
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized to record payments' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_invoice_id is null or p_paid_on is null or p_amount is null or p_amount <= 0
    or p_amount <> round(p_amount, 2)
    or char_length(trim(coalesce(p_reference, ''))) not between 3 and 100 then
    raise exception 'Invalid payment details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('invoice', p_invoice_id, 'amount', p_amount,
    'paid_on', p_paid_on, 'reference', trim(p_reference));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.client_payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another payment' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_invoice from public.client_invoices where id = p_invoice_id for update;
  if not found or v_invoice.status <> 'issued' then
    raise exception 'Invoice is not payable' using errcode = '22023';
  end if;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.client_payments p left join public.client_payment_reversals r on r.payment_id = p.id
  where p.invoice_id = p_invoice_id and r.id is null;
  if v_paid + p_amount > v_invoice.amount then
    raise exception 'Payment exceeds invoice outstanding balance' using errcode = '22023';
  end if;
  insert into public.client_payments (id, invoice_id, amount, paid_on, reference, recorded_by, idempotency_key, command_payload)
  values (v_id, p_invoice_id, p_amount, p_paid_on, trim(p_reference), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.reverse_client_payment(p_idempotency_key uuid, p_payment_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payment public.client_payments;
  v_existing public.client_payment_reversals;
  v_payload jsonb;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can reverse a payment' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_payment_id is null or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A reversal reason is required' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('payment', p_payment_id, 'reason', trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.client_payment_reversals where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.reversed_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another reversal' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_payment from public.client_payments where id = p_payment_id;
  if not found then raise exception 'Payment not found' using errcode = '22023'; end if;
  perform 1 from public.client_invoices where id = v_payment.invoice_id for update;
  if exists(select 1 from public.client_payment_reversals where payment_id = p_payment_id) then
    raise exception 'Payment has already been reversed' using errcode = '23505';
  end if;
  insert into public.client_payment_reversals (id, payment_id, reason, reversed_by, idempotency_key, command_payload)
  values (v_id, p_payment_id, trim(p_reason), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

create function public.void_client_invoice(p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.client_invoices;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can void an invoice' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A void reason is required' using errcode = '22023';
  end if;
  select * into v_invoice from public.client_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = '22023'; end if;
  if v_invoice.status = 'void' then return; end if;
  if exists (
    select 1 from public.client_payments p left join public.client_payment_reversals r on r.payment_id = p.id
    where p.invoice_id = p_invoice_id and r.id is null
  ) then raise exception 'Reverse all payments before voiding the invoice' using errcode = '22023'; end if;
  update public.client_invoices set status = 'void', voided_by = v_actor, voided_at = now(), void_reason = trim(p_reason)
  where id = p_invoice_id;
end;
$$;

create function public.get_client_invoice_balances(p_invoice_ids uuid[])
returns table(invoice_id uuid, paid_amount numeric, outstanding_amount numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized to view billing' using errcode = '42501';
  end if;
  if coalesce(array_length(p_invoice_ids, 1), 0) > 100 then
    raise exception 'Too many invoices requested' using errcode = '22023';
  end if;
  return query select i.id,
    coalesce(sum(p.amount) filter (where r.id is null), 0)::numeric,
    case when i.status = 'void' then 0::numeric
      else i.amount - coalesce(sum(p.amount) filter (where r.id is null), 0) end::numeric
  from public.client_invoices i
  left join public.client_payments p on p.invoice_id = i.id
  left join public.client_payment_reversals r on r.payment_id = p.id
  where i.id = any(p_invoice_ids)
  group by i.id;
end;
$$;

create function public.get_billable_projects()
returns table(id uuid, code text, name text, client_name text, contract_amount numeric, status public.project_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized to view billing projects' using errcode = '42501';
  end if;
  return query select p.id, p.code, p.name, p.client_name, p.contract_amount, p.status
  from public.projects p
  where p.archived_at is null and p.status in ('active','on_hold','completed') and p.contract_amount > 0
  order by p.code limit 500;
end;
$$;

revoke execute on function public.issue_client_invoice(uuid,uuid,text,date,date,numeric) from public, anon;
revoke execute on function public.record_client_payment(uuid,uuid,numeric,date,text) from public, anon;
revoke execute on function public.reverse_client_payment(uuid,uuid,text) from public, anon;
revoke execute on function public.void_client_invoice(uuid,text) from public, anon;
revoke execute on function public.get_client_invoice_balances(uuid[]) from public, anon;
revoke execute on function public.get_billable_projects() from public, anon;
grant execute on function public.issue_client_invoice(uuid,uuid,text,date,date,numeric) to authenticated;
grant execute on function public.record_client_payment(uuid,uuid,numeric,date,text) to authenticated;
grant execute on function public.reverse_client_payment(uuid,uuid,text) to authenticated;
grant execute on function public.void_client_invoice(uuid,text) to authenticated;
grant execute on function public.get_client_invoice_balances(uuid[]) to authenticated;
grant execute on function public.get_billable_projects() to authenticated;

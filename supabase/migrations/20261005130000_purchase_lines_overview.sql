-- Purchasing by supplier (client's main purchasing screen): every purchased
-- item in one list — purchase orders and approved/pending site purchases —
-- with its supplier, price, total, location, delivery stage and payment stage,
-- plus the summary totals. Admin and Finance only (prices).
--
-- Stages, from the existing records (nothing new is stored):
--   delivery: waiting_approval | ordered | partly_received | received | rejected | cancelled
--   payment:  unpaid | partly_paid | paid | to_reimburse | none
--
-- Safe to rerun: functions use OR REPLACE.

create or replace function private.purchase_line_rows()
returns table (source text, line_id uuid, purchase_id uuid, purchase_number text, purchase_date date,
  material_name text, material_code text, quantity numeric, received_quantity numeric, unit_symbol text,
  unit_price numeric, line_total numeric, supplier_id uuid, supplier_name text, supplier_contact text,
  payment_term text, location_name text, delivery_stage text, payment_stage text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'purchase_order', l.id, o.id, o.po_number, o.ordered_on, l.material_name, l.material_code,
    l.ordered_quantity, l.received_quantity, l.unit_symbol, l.unit_price, round(l.ordered_quantity * l.unit_price, 2),
    o.supplier_id, o.supplier_name, s.contact_number, s.payment_terms, o.warehouse_name,
    case when o.status = 'cancelled' then 'cancelled' when l.received_quantity = 0 then 'ordered'
      when l.received_quantity < l.ordered_quantity then 'partly_received' else 'received' end,
    case when o.status = 'cancelled' then 'none' when t.paid <= 0 then 'unpaid'
      when t.paid < t.order_total then 'partly_paid' else 'paid' end,
    o.created_at
  from public.purchase_order_lines l
  join public.purchase_orders o on o.id = l.purchase_order_id
  join public.suppliers s on s.id = o.supplier_id
  cross join lateral private.purchase_order_payment_totals(o.id) t
  union all
  select 'site_purchase', l.id, p.id, p.purchase_number, p.receipt_date, l.material_name, l.material_code,
    l.quantity, case when p.status = 'approved' then l.quantity else 0 end, l.unit_symbol, l.unit_price,
    round(l.quantity * l.unit_price, 2), p.supplier_id, p.supplier_name, s.contact_number,
    case when p.paid_with = 'own_money' then 'Own money' else 'Company cash' end,
    pr.name || ' · ' || ps.name,
    case p.status when 'submitted' then 'waiting_approval' when 'rejected' then 'rejected' else 'received' end,
    case when p.status <> 'approved' then 'none' when p.paid_with = 'company_cash' or p.reimbursed_on is not null then 'paid'
      else 'to_reimburse' end,
    p.created_at
  from public.site_purchase_lines l
  join public.site_purchases p on p.id = l.site_purchase_id
  join public.suppliers s on s.id = p.supplier_id
  join public.project_sites ps on ps.id = p.project_site_id
  join public.projects pr on pr.id = p.project_id;
$$;
revoke execute on function private.purchase_line_rows() from public, anon, authenticated;

create or replace function public.get_purchase_lines(p_search text default '', p_offset integer default 0, p_limit integer default 20)
returns table (source text, line_id uuid, purchase_id uuid, purchase_number text, purchase_date date,
  material_name text, material_code text, quantity numeric, received_quantity numeric, unit_symbol text,
  unit_price numeric, line_total numeric, supplier_id uuid, supplier_name text, supplier_contact text,
  payment_term text, location_name text, delivery_stage text, payment_stage text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for purchases' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 or char_length(coalesce(v_search, '')) > 100 then
    raise exception 'invalid page or search' using errcode = '22023';
  end if;
  return query
  select r.source, r.line_id, r.purchase_id, r.purchase_number, r.purchase_date, r.material_name, r.material_code,
    r.quantity, r.received_quantity, r.unit_symbol, r.unit_price, r.line_total, r.supplier_id, r.supplier_name,
    r.supplier_contact, r.payment_term, r.location_name, r.delivery_stage, r.payment_stage, count(*) over ()
  from private.purchase_line_rows() r
  where v_search is null or position(v_search in lower(r.material_name || ' ' || r.material_code || ' ' || r.supplier_name
    || ' ' || r.purchase_number || ' ' || coalesce(r.location_name, ''))) > 0
  order by r.created_at desc, r.purchase_number desc, r.material_name, r.line_id
  offset p_offset limit p_limit;
end; $$;

create or replace function public.get_purchase_summary()
returns table (item_count bigint, total_value numeric, supplier_count bigint, received_count bigint, unpaid_value numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for purchases' using errcode = '42501';
  end if;
  return query
  select count(*), coalesce(sum(r.line_total), 0), count(distinct r.supplier_id),
    count(*) filter (where r.delivery_stage = 'received'),
    coalesce((select sum(t.order_total - t.paid) from public.purchase_orders o
      cross join lateral private.purchase_order_payment_totals(o.id) t where o.status <> 'cancelled'), 0)
      + coalesce(sum(r.line_total) filter (where r.payment_stage = 'to_reimburse'), 0)
  from private.purchase_line_rows() r
  where r.delivery_stage not in ('cancelled', 'rejected');
end; $$;

revoke execute on function public.get_purchase_lines(text,integer,integer), public.get_purchase_summary() from public, anon;
grant execute on function public.get_purchase_lines(text,integer,integer), public.get_purchase_summary() to authenticated;

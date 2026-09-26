-- Admin-only, all-time management totals. Sales are invoices, not collected cash.
create function public.get_dashboard_totals()
returns table(total_sales numeric, total_expenses numeric, total_material_value numeric,
  unvalued_stock bigint, unvalued_expenses bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Not authorized to view financial totals' using errcode = '42501';
  end if;
  return query
  with costs as (
    select t.cost_total as amount from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select a.cost_total from public.project_attendance a
    where not exists (select 1 from public.project_attendance_reversals r where r.attendance_id = a.id)
    union all
    select u.cost_total from public.project_equipment_usage u
    where not exists (select 1 from public.project_equipment_usage_reversals r where r.usage_id = u.id)
    union all
    select e.amount from public.project_additional_expenses e
    where not exists (select 1 from public.project_expense_reversals r where r.expense_id = e.id)
    union all
    select t.cost_total from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved'
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select v.cost_total from public.inventory_transfer_variances v
    join public.inventory_transfer_items i on i.id = v.transfer_item_id
    join public.inventory_transfers tr on tr.id = i.transfer_id
    join public.inventory_locations src on src.id = tr.source_location_id
    join public.inventory_locations dst on dst.id = tr.destination_location_id
    where src.project_site_id is not null or dst.project_site_id is not null
  ), expenses as (
    select sum(c.amount) as total, count(*) filter (where c.amount is null) as unknown from costs c
  ), stock as (
    select sum(v.total_value) as total,
      count(*) filter (where v.quantity_on_hand > 0 and v.total_value is null) as unknown
    from public.inventory_valuations v
  )
  select (select coalesce(sum(i.amount), 0) from public.client_invoices i where i.status = 'issued'),
    case when e.unknown > 0 then null::numeric else coalesce(e.total, 0) end,
    case when s.unknown > 0 then null::numeric else coalesce(s.total, 0) end,
    s.unknown, e.unknown
  from expenses e cross join stock s;
end; $$;
revoke execute on function public.get_dashboard_totals() from public, anon;
grant execute on function public.get_dashboard_totals() to authenticated;

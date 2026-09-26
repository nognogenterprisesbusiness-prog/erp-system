-- Finance-only monthly posted project costs. This is management reporting,
-- not cash paid or supplier purchase spend. Reversals remove original costs.
create function public.get_dashboard_monthly_project_costs(p_months integer default 6)
returns table(month_start date, material_cost numeric, labor_cost numeric,
  equipment_cost numeric, other_cost numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_first_month date; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if (select auth.uid()) is null or not private.has_any_role(
    array['admin']::public.app_role[]
  ) then
    raise exception 'Not authorized to view project costs' using errcode = '42501';
  end if;
  if p_months is null or p_months not between 1 and 12 then
    raise exception 'Month count must be between 1 and 12' using errcode = '22023';
  end if;
  v_first_month := (date_trunc('month', v_today) - (p_months - 1) * interval '1 month')::date;
  if exists (
    select 1 from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and t.transaction_date >= v_first_month and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
  ) then
    raise exception 'Unvalued material consumption prevents monthly cost reporting' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved' and t.transaction_date >= v_first_month
      and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
  ) then
    raise exception 'Unvalued site stock loss prevents monthly cost reporting' using errcode = '22023';
  end if;

  return query
  with months as (
    select (date_trunc('month', v_today) - n * interval '1 month')::date as month
    from pg_catalog.generate_series(0, p_months - 1) as n
  ), costs as (
    select date_trunc('month', t.transaction_date)::date as month,
      t.cost_total as material, 0::numeric as labor, 0::numeric as equipment, 0::numeric as other
    from public.inventory_transactions t
    where t.transaction_type = 'MATERIAL_CONSUMPTION' and t.project_id is not null
      and t.transaction_date >= v_first_month
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select date_trunc('month', a.work_date)::date, 0, a.cost_total, 0, 0
    from public.project_attendance a
    where a.work_date >= v_first_month
      and not exists (select 1 from public.project_attendance_reversals r where r.attendance_id = a.id)
    union all
    select date_trunc('month', u.use_date)::date, 0, 0, u.cost_total, 0
    from public.project_equipment_usage u
    where u.use_date >= v_first_month
      and not exists (select 1 from public.project_equipment_usage_reversals r where r.usage_id = u.id)
    union all
    select date_trunc('month', e.expense_date)::date, 0, 0, 0, e.amount
    from public.project_additional_expenses e
    where e.expense_date >= v_first_month
      and not exists (select 1 from public.project_expense_reversals r where r.expense_id = e.id)
    union all
    select date_trunc('month', t.transaction_date)::date, 0, 0, 0, t.cost_total
    from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where c.status = 'approved' and t.transaction_date >= v_first_month
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    union all
    select date_trunc('month', v.approved_at at time zone 'Asia/Manila')::date, 0, 0, 0, v.cost_total
    from public.inventory_transfer_variances v
    join public.inventory_transfer_items i on i.id = v.transfer_item_id
    join public.inventory_transfers tr on tr.id = i.transfer_id
    join public.inventory_locations src on src.id = tr.source_location_id
    join public.inventory_locations dst on dst.id = tr.destination_location_id
    where (v.approved_at at time zone 'Asia/Manila')::date >= v_first_month
      and (src.project_site_id is not null or dst.project_site_id is not null)
  )
  select m.month, coalesce(sum(c.material), 0), coalesce(sum(c.labor), 0),
    coalesce(sum(c.equipment), 0), coalesce(sum(c.other), 0)
  from months m left join costs c on c.month = m.month
  group by m.month order by m.month;
end; $$;

revoke execute on function public.get_dashboard_monthly_project_costs(integer) from public, anon;
grant execute on function public.get_dashboard_monthly_project_costs(integer) to authenticated;

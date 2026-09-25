-- Provisional contract-value management profit, distinct from issued invoices and cash.
create function public.get_project_profitability(p_project_id uuid)
returns table(project_code text, project_name text, contract_value numeric, approved_budget numeric,
  material_cost numeric, labor_cost numeric, equipment_cost numeric, other_cost numeric,
  site_stock_loss_cost numeric, transfer_loss_cost numeric, total_posted_cost numeric, estimated_gross_profit numeric,
  estimated_gross_margin_percent numeric, invoiced_amount numeric, cash_received numeric,
  receivables numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_summary record; v_site_loss numeric; v_transfer_loss numeric; v_total numeric;
begin
  -- The existing summary enforces finance/project-manager access and refuses
  -- unvalued consumption. Neither invoice nor cash totals are treated as profit.
  select * into v_summary from public.get_project_management_summary(p_project_id);
  if exists (
    select 1 from public.inventory_stock_counts c
    join public.inventory_locations l on l.id = c.inventory_location_id
    join public.project_sites s on s.id = l.project_site_id
    join public.inventory_transactions t on t.id = c.transaction_id
    where s.project_id = p_project_id and c.status = 'approved' and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
  ) then
    raise exception 'Project has an unvalued site stock loss' using errcode = '22023';
  end if;
  select coalesce(sum(t.cost_total),0) into v_site_loss
  from public.inventory_stock_counts c
  join public.inventory_locations l on l.id = c.inventory_location_id
  join public.project_sites s on s.id = l.project_site_id
  join public.inventory_transactions t on t.id = c.transaction_id
  where s.project_id = p_project_id and c.status = 'approved'
    and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id);
  select coalesce(sum(v.cost_total),0) into v_transfer_loss
  from public.inventory_transfer_variances v
  join public.inventory_transfer_items i on i.id = v.transfer_item_id
  join public.inventory_transfers tr on tr.id = i.transfer_id
  join public.inventory_locations src on src.id = tr.source_location_id
  join public.inventory_locations dst on dst.id = tr.destination_location_id
  left join public.project_sites source_site on source_site.id = src.project_site_id
  left join public.project_sites destination_site on destination_site.id = dst.project_site_id
  where coalesce(source_site.project_id, destination_site.project_id) = p_project_id;
  v_total := v_summary.total_cost + v_site_loss + v_transfer_loss;
  return query select v_summary.project_code, v_summary.project_name, v_summary.contract_amount, v_summary.approved_budget,
    v_summary.material_cost, v_summary.labor_cost, v_summary.equipment_cost, v_summary.additional_cost,
    v_site_loss, v_transfer_loss, v_total,
    v_summary.contract_amount - v_total,
    case when v_summary.contract_amount > 0 then
      round((v_summary.contract_amount - v_total) * 100 / v_summary.contract_amount, 2)
      else null::numeric end,
    v_summary.invoiced_amount, v_summary.cash_received,
    v_summary.invoiced_amount - v_summary.cash_received;
end; $$;
revoke execute on function public.get_project_profitability(uuid) from public, anon;
grant execute on function public.get_project_profitability(uuid) to authenticated;

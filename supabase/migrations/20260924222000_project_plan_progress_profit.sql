-- Project planning and dated progress are evidence, not stock or cost postings.
create table public.project_material_plan_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  planned_quantity numeric(20,4) not null check (planned_quantity > 0 and planned_quantity <= 1000000000),
  required_on date not null,
  note text not null default '' check (char_length(note) <= 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, project_site_id, warehouse_id, material_id),
  foreign key (project_id, project_site_id) references public.project_sites(project_id, id) on delete restrict,
  foreign key (project_id, warehouse_id) references public.project_warehouses(project_id, warehouse_id) on delete restrict
);
create index project_material_plan_project_idx on public.project_material_plan_lines (project_id, required_on, id);
create trigger project_material_plan_audit after insert or update on public.project_material_plan_lines
  for each row execute function private.audit_row_change();
alter table public.project_material_plan_lines enable row level security;
revoke all on public.project_material_plan_lines from public, anon, authenticated;
grant select on public.project_material_plan_lines to authenticated;
create policy project_material_plan_read on public.project_material_plan_lines for select to authenticated
  using (private.can_view_daily_project_report(project_id));

create function public.save_project_material_plan_line(
  p_project_id uuid, p_site_id uuid, p_warehouse_id uuid, p_material_id uuid,
  p_quantity numeric, p_required_on date, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not (private.can_manage_projects() or (
    private.has_any_role(array['project_manager']::public.app_role[])
    and exists(select 1 from public.project_assignments a where a.project_id = p_project_id
      and a.user_id = v_actor and a.assignment_role = 'project_manager' and a.status = 'active')))
  then raise exception 'Not authorized to plan project materials' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000 or p_required_on is null
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Invalid material plan quantity, date or note' using errcode = '22023'; end if;
  if not exists(select 1 from public.projects p join public.project_sites s on s.project_id = p.id
      where p.id = p_project_id and s.id = p_site_id and p.archived_at is null
        and p.status in ('draft','active','on_hold') and s.status = 'active')
    or not exists(select 1 from public.project_warehouses pw join public.warehouses w on w.id = pw.warehouse_id
      where pw.project_id = p_project_id and pw.warehouse_id = p_warehouse_id and w.status = 'active')
    or not exists(select 1 from public.materials m where m.id = p_material_id and m.is_active
      and m.archived_at is null and m.material_kind = 'consumable') then
    raise exception 'Project, site, warehouse or material is unavailable' using errcode = '22023'; end if;
  insert into public.project_material_plan_lines
    (project_id, project_site_id, warehouse_id, material_id, planned_quantity, required_on, note, updated_by)
  values (p_project_id, p_site_id, p_warehouse_id, p_material_id, p_quantity, p_required_on, trim(coalesce(p_note,'')), v_actor)
  on conflict (project_id, project_site_id, warehouse_id, material_id) do update
    set planned_quantity = excluded.planned_quantity, required_on = excluded.required_on,
      note = excluded.note, updated_by = v_actor, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create function public.get_project_material_plan(p_project_id uuid)
returns table(id uuid, project_site_id uuid, site_name text, warehouse_id uuid, warehouse_name text,
  material_id uuid, material_code text, material_name text, unit_symbol text,
  planned_quantity numeric, required_on date, note text, consumed_quantity numeric,
  site_on_hand numeric, warehouse_available numeric, outstanding_request_quantity numeric,
  quantity_to_request numeric, procurement_shortage numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_view_daily_project_report(p_project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  return query
  with facts as (
    select l.*, s.name as site_label, w.name as warehouse_label, m.code as sku,
      m.name as material_label, u.symbol as unit_label,
      coalesce((select sum(t.quantity) from public.inventory_transactions t
        join public.inventory_locations loc on loc.id = t.source_location_id
        where t.project_id = l.project_id and loc.project_site_id = l.project_site_id
          and t.material_id = l.material_id and t.transaction_type = 'MATERIAL_CONSUMPTION'
          and not exists(select 1 from public.inventory_transactions r where r.reversal_of = t.id)),0) as used_qty,
      coalesce((select b.quantity_on_hand from public.inventory_balances b
        join public.inventory_locations loc on loc.id = b.inventory_location_id
        where loc.project_site_id = l.project_site_id and b.material_id = l.material_id),0) as at_site,
      coalesce((select b.available_quantity from public.inventory_balances b
        join public.inventory_locations loc on loc.id = b.inventory_location_id
        where loc.warehouse_id = l.warehouse_id and b.material_id = l.material_id),0) as at_warehouse,
      coalesce((select sum(greatest(
        case when r.status = 'submitted' then rl.requested_quantity else rl.approved_quantity end
        - coalesce((select sum(ti.received_quantity + ti.variance_quantity) from public.material_request_dispatches d
          join public.inventory_transfer_items ti on ti.id = d.transfer_item_id
          where d.request_line_id = rl.id),0),0))
        from public.material_requests r join public.material_request_lines rl on rl.request_id = r.id
        where r.project_id = l.project_id and r.project_site_id = l.project_site_id
          and r.source_warehouse_id = l.warehouse_id and rl.material_id = l.material_id
          and r.status in ('submitted','approved','partially_approved')),0) as in_request
    from public.project_material_plan_lines l
    join public.project_sites s on s.id = l.project_site_id
    join public.warehouses w on w.id = l.warehouse_id
    join public.materials m on m.id = l.material_id
    join public.units_of_measure u on u.id = m.base_unit_id
    where l.project_id = p_project_id
  )
  , needs as (
    select f.*, greatest(f.planned_quantity - f.used_qty - f.at_site - f.in_request, 0) as need_qty
    from facts f
  ), allocated as (
    select n.*, coalesce(sum(n.need_qty) over (
      partition by n.warehouse_id, n.material_id
      order by n.required_on, n.id rows between unbounded preceding and 1 preceding
    ), 0) as earlier_need
    from needs n
  )
  select a.id, a.project_site_id, a.site_label, a.warehouse_id, a.warehouse_label,
    a.material_id, a.sku, a.material_label, a.unit_label, a.planned_quantity, a.required_on,
    a.note, a.used_qty, a.at_site, a.at_warehouse, a.in_request, a.need_qty,
    greatest(a.need_qty - greatest(a.at_warehouse - a.earlier_need, 0), 0)
  from allocated a order by a.required_on, a.sku;
end; $$;

create table public.project_progress_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null,
  daily_report_id uuid not null unique references public.daily_reports(id) on delete restrict,
  progress_date date not null,
  completion_percent numeric(5,2) not null check (completion_percent between 0 and 100),
  summary text not null check (char_length(trim(summary)) between 3 and 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  foreign key (project_id, project_site_id) references public.project_sites(project_id, id) on delete restrict
);
create index project_progress_recent_idx on public.project_progress_entries (project_id, progress_date desc, recorded_at desc);
create trigger project_progress_audit after insert on public.project_progress_entries
  for each row execute function private.audit_row_change();
alter table public.project_progress_entries enable row level security;
revoke all on public.project_progress_entries from public, anon, authenticated;
grant select on public.project_progress_entries to authenticated;
create policy project_progress_read on public.project_progress_entries for select to authenticated
  using (private.can_view_daily_project_report(project_id));

create function public.record_project_progress(p_report_id uuid, p_percent numeric, p_summary text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_report public.daily_reports; v_existing public.project_progress_entries; v_id uuid;
begin
  select * into v_report from public.daily_reports where id = p_report_id;
  if v_actor is null or v_report.id is null or not (private.can_manage_projects() or (
    private.has_any_role(array['project_manager']::public.app_role[])
    and exists(select 1 from public.project_assignments a where a.project_id = v_report.project_id
      and a.user_id = v_actor and a.assignment_role = 'project_manager' and a.status = 'active')))
  then raise exception 'Not authorized to record progress' using errcode = '42501'; end if;
  if v_report.status <> 'approved' or p_percent is null or p_percent < 0 or p_percent > 100
    or char_length(trim(coalesce(p_summary,''))) not between 3 and 500 then
    raise exception 'Use an approved daily report, percent and summary' using errcode = '22023'; end if;
  select * into v_existing from public.project_progress_entries where daily_report_id = p_report_id;
  if v_existing.id is not null then
    if v_existing.completion_percent = p_percent and v_existing.summary = trim(p_summary) then return v_existing.id; end if;
    raise exception 'Progress already recorded for this daily report' using errcode = '23505';
  end if;
  insert into public.project_progress_entries
    (project_id, project_site_id, daily_report_id, progress_date, completion_percent, summary, recorded_by)
  values (v_report.project_id, v_report.project_site_id, p_report_id, v_report.report_date,
    p_percent, trim(p_summary), v_actor)
  on conflict (daily_report_id) do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.project_progress_entries where daily_report_id = p_report_id;
    if v_existing.completion_percent = p_percent and v_existing.summary = trim(p_summary) then return v_existing.id; end if;
    raise exception 'Progress already recorded for this daily report' using errcode = '23505';
  end if;
  return v_id;
end; $$;

revoke execute on function public.save_project_material_plan_line(uuid,uuid,uuid,uuid,numeric,date,text),
  public.get_project_material_plan(uuid), public.record_project_progress(uuid,numeric,text) from public, anon;
grant execute on function public.save_project_material_plan_line(uuid,uuid,uuid,uuid,numeric,date,text),
  public.get_project_material_plan(uuid), public.record_project_progress(uuid,numeric,text) to authenticated;

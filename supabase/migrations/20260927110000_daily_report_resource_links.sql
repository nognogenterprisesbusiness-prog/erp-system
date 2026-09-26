alter table public.project_equipment_usage add column project_site_id uuid references public.project_sites(id) on delete restrict;
create function private.snapshot_equipment_usage_site() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select il.project_site_id into new.project_site_id from public.assets a
    join public.asset_locations al on al.id=a.current_location_id
    join public.inventory_locations il on il.id=al.inventory_location_id
    join public.project_sites ps on ps.id=il.project_site_id and ps.project_id=new.project_id
    where a.id=new.asset_id for update of a;
  if new.project_site_id is null then raise exception 'Equipment must be at a site belonging to the project'; end if;
  return new;
end;
$$;
create trigger equipment_usage_site_snapshot before insert on public.project_equipment_usage
for each row execute function private.snapshot_equipment_usage_site();
revoke all on function private.snapshot_equipment_usage_site() from public,anon,authenticated;

create table public.daily_report_resource_links (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete restrict,
  transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  attendance_id uuid references public.project_attendance(id) on delete restrict,
  equipment_usage_id uuid references public.project_equipment_usage(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(num_nonnulls(transaction_id,attendance_id,equipment_usage_id)=1),
  unique(report_id,transaction_id),unique(report_id,attendance_id),unique(report_id,equipment_usage_id)
);
create index report_resource_links_report_idx on public.daily_report_resource_links(report_id);
alter table public.daily_report_resource_links enable row level security;
revoke all on public.daily_report_resource_links from public,anon,authenticated;
grant select on public.daily_report_resource_links to authenticated;
create policy report_resource_read on public.daily_report_resource_links for select to authenticated
using(exists(select 1 from public.daily_reports r where r.id=report_id and private.can_view_daily_project_report(r.project_id)));
create trigger report_resource_audit after insert or delete on public.daily_report_resource_links
for each row execute function private.audit_row_change();

create function private.guard_linked_report_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.project_id,new.project_site_id,new.report_date) is distinct from (old.project_id,old.project_site_id,old.report_date)
    and exists(select 1 from public.daily_report_resource_links where report_id=old.id) then
    raise exception 'Remove attached resource records before changing report project, site or date' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger report_resource_identity before update on public.daily_reports
for each row execute function private.guard_linked_report_identity();
revoke all on function private.guard_linked_report_identity() from public,anon,authenticated;

create function public.detach_daily_report_resource(p_report_id uuid,p_kind text,p_resource_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_report public.daily_reports;
begin
  select * into v_report from public.daily_reports where id=p_report_id for update;
  if v_report.id is null or auth.uid() is null or not private.can_prepare_daily_project_report(v_report.project_id) then
    raise exception 'Not authorized for this report' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('material','attendance','equipment') then raise exception 'Invalid resource kind'; end if;
  delete from public.daily_report_resource_links where report_id=p_report_id
    and (case p_kind when 'material' then transaction_id when 'attendance' then attendance_id else equipment_usage_id end)=p_resource_id;
end;
$$;
revoke all on function public.detach_daily_report_resource(uuid,text,uuid) from public,anon;
grant execute on function public.detach_daily_report_resource(uuid,text,uuid) to authenticated;

create function public.attach_daily_report_resource(p_report_id uuid,p_kind text,p_resource_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_report public.daily_reports; v_project uuid; v_site uuid; v_date date;
begin
  select * into v_report from public.daily_reports where id=p_report_id for update;
  if v_report.id is null or auth.uid() is null or not private.can_prepare_daily_project_report(v_report.project_id) then
    raise exception 'Not authorized for this report' using errcode='42501';
  end if;
  if p_kind='material' then
    select t.project_id,il.project_site_id,t.transaction_date into v_project,v_site,v_date
    from public.inventory_transactions t join public.inventory_locations il on il.id=t.source_location_id
    where t.id=p_resource_id and t.transaction_type='MATERIAL_CONSUMPTION' and t.reversal_of is null;
  elsif p_kind='attendance' then
    select project_id,project_site_id,work_date into v_project,v_site,v_date from public.project_attendance where id=p_resource_id;
  elsif p_kind='equipment' then
    select project_id,project_site_id,use_date into v_project,v_site,v_date from public.project_equipment_usage where id=p_resource_id;
  else raise exception 'Invalid resource kind' using errcode='22023'; end if;
  if v_project is distinct from v_report.project_id or v_date is distinct from v_report.report_date
    or (v_site is not null and v_site<>v_report.project_site_id) then
    raise exception 'Resource must match report project, date and recorded site' using errcode='22023';
  end if;
  insert into public.daily_report_resource_links(report_id,transaction_id,attendance_id,equipment_usage_id,created_by)
  values(p_report_id,case when p_kind='material' then p_resource_id end,
    case when p_kind='attendance' then p_resource_id end,case when p_kind='equipment' then p_resource_id end,auth.uid())
  on conflict do nothing;
end;
$$;

create function public.list_daily_report_resources(p_report_id uuid,p_linked boolean default true,p_offset integer default 0,p_limit integer default 20)
returns table(resource_id uuid,kind text,label text,quantity numeric,unit text,reversed boolean,
  site_known boolean,cost numeric,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_report public.daily_reports; v_finance boolean;
begin
  select * into v_report from public.daily_reports where id=p_report_id;
  if v_report.id is null or auth.uid() is null or not private.can_view_daily_project_report(v_report.project_id) then
    raise exception 'Not authorized for report resources' using errcode='42501';
  end if;
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid pagination'; end if;
  v_finance:=private.has_any_role(array['admin']::public.app_role[]);
  return query with resources as (
    select t.id resource_id,'material'::text kind,m.name::text label,t.quantity,u.symbol::text unit,
      exists(select 1 from public.inventory_transactions x where x.reversal_of=t.id) reversed,
      true site_known,t.cost_total cost
    from public.inventory_transactions t join public.materials m on m.id=t.material_id
      join public.units_of_measure u on u.id=t.unit_of_measure_id
      join public.inventory_locations il on il.id=t.source_location_id
    where t.project_id=v_report.project_id and t.transaction_date=v_report.report_date
      and il.project_site_id=v_report.project_site_id and t.transaction_type='MATERIAL_CONSUMPTION' and t.reversal_of is null
    union all
    select a.id,'attendance',concat(e.first_name,' ',e.last_name),a.hours_worked,'hours',
      exists(select 1 from public.project_attendance_reversals x where x.attendance_id=a.id),true,a.cost_total
    from public.project_attendance a join public.employees e on e.id=a.employee_id
    where a.project_id=v_report.project_id and a.project_site_id=v_report.project_site_id and a.work_date=v_report.report_date
    union all
    select a.id,'equipment',a.asset_name,a.hours_used,'hours',
      exists(select 1 from public.project_equipment_usage_reversals x where x.usage_id=a.id),a.project_site_id is not null,a.cost_total
    from public.project_equipment_usage a where a.project_id=v_report.project_id and a.use_date=v_report.report_date
      and (a.project_site_id is null or a.project_site_id=v_report.project_site_id)
  ) select r.resource_id,r.kind,r.label,r.quantity,r.unit,r.reversed,r.site_known,
    case when v_finance then r.cost else null end,count(*) over()
    from resources r where exists(select 1 from public.daily_report_resource_links l where l.report_id=p_report_id
      and (l.transaction_id=r.resource_id or l.attendance_id=r.resource_id or l.equipment_usage_id=r.resource_id))=p_linked
    order by r.kind,r.resource_id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.attach_daily_report_resource(uuid,text,uuid),public.list_daily_report_resources(uuid,boolean,integer,integer) from public,anon;
grant execute on function public.attach_daily_report_resource(uuid,text,uuid),public.list_daily_report_resources(uuid,boolean,integer,integer) to authenticated;

begin;
create function public.get_payroll_totals(p_run_ids uuid[])
returns table(run_id uuid, employee_count bigint, gross numeric, deductions numeric, net numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_any_role(array['admin','finance']::public.app_role[]) then raise exception 'Payroll access required' using errcode='42501'; end if;
 return query select l.run_id,count(*),coalesce(sum(l.attendance_pay+l.other_earnings),0),coalesce(sum(l.deductions),0),coalesce(sum(l.net_pay),0) from public.payroll_lines l where l.run_id=any(p_run_ids) group by l.run_id;
end $$;
create function public.search_attendance_overview(p_date date,p_project_id uuid default null,p_query text default '',p_status text default 'all',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not private.has_any_role(array['admin','finance']::public.app_role[]) then raise exception 'Attendance access required' using errcode='42501'; end if;
 if p_date is null or p_page<1 or p_page>1000000 or p_status not in ('all','present','absent','unmarked') or length(coalesce(p_query,''))>100 then raise exception 'Invalid attendance filters' using errcode='22023'; end if;
 with scoped as (
 select a.id,a.position_title,a.project_id,
 jsonb_build_object('code',e.code,'first_name',e.first_name,'last_name',e.last_name) as employee,
 jsonb_build_object('code',p.code,'name',p.name) as project,
 jsonb_build_object('name',s.name) as site,
 case when t.id is null then null else jsonb_build_object('attendance_status',t.attendance_status,'hours_worked',t.hours_worked,'rate_snapshot',t.rate_snapshot,'cost_total',t.cost_total) end as attendance,
 coalesce(t.attendance_status::text,'unmarked') as status,e.last_name,e.first_name
 from public.employee_project_assignments a join public.employees e on e.id=a.employee_id join public.projects p on p.id=a.project_id join public.project_sites s on s.id=a.project_site_id
 left join lateral (select x.* from public.project_attendance x where x.assignment_id=a.id and x.work_date=p_date and not exists(select 1 from public.project_attendance_reversals r where r.attendance_id=x.id) order by x.created_at desc,x.id limit 1) t on true
 where a.start_date<=p_date and (a.end_date is null or a.end_date>=p_date) and (p_project_id is null or a.project_id=p_project_id)
 and (coalesce(trim(p_query),'')='' or strpos(lower(concat_ws(' ',e.code,e.first_name,e.last_name,a.position_title,p.name,s.name)),lower(trim(p_query)))>0)
 ), matched as (select * from scoped where p_status='all' or status=p_status), page as (select * from matched order by last_name,first_name,id limit 25 offset ((p_page-1)*25))
 select jsonb_build_object('count',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'status'-'last_name'-'first_name') from page),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke all on function public.get_payroll_totals(uuid[]),public.search_attendance_overview(date,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.get_payroll_totals(uuid[]),public.search_attendance_overview(date,uuid,text,text,integer) to authenticated;
commit;

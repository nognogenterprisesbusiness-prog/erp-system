begin;

create index inventory_transactions_consumption_date_idx on public.inventory_transactions(transaction_date,material_id,unit_of_measure_id) where transaction_type='MATERIAL_CONSUMPTION';

-- Invoker rights retain the existing table grants and row policies.
create function public.search_registry_choices(p_kind text, p_search text default '', p_offset integer default 0, p_limit integer default 20, p_selected uuid default null)
returns table(id uuid, name text, code text, total_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_kind is distinct from 'asset_location' or length(coalesce(p_search,''))>100 or p_offset is null or p_limit is null or p_offset<0 or p_limit<1 or p_limit>50 then raise exception 'Invalid search' using errcode='22023'; end if;
 if p_kind='asset_location' then
  return query with choices as (
   select a.id,coalesce(a.name,w.name,s.name,'Unavailable location') as name,coalesce(w.code,p.code,a.location_kind::text) as code
   from public.asset_locations a left join public.inventory_locations i on i.id=a.inventory_location_id left join public.warehouses w on w.id=i.warehouse_id left join public.project_sites s on s.id=i.project_site_id left join public.projects p on p.id=s.project_id where a.archived_at is null
  ), matched as (select * from choices x where (p_selected is null or x.id=p_selected) and (coalesce(trim(p_search),'')='' or strpos(lower(x.name||' '||x.code),lower(trim(p_search)))>0))
  select x.id,x.name,x.code,count(*) over() from matched x order by x.name,x.id limit p_limit offset p_offset;
 end if;
end $$;

create function public.get_monthly_material_consumption(p_from date,p_to date)
returns table(month text,material_id uuid,unit_id uuid,quantity numeric)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to>p_from+interval '13 months' then raise exception 'Invalid chart period' using errcode='22023'; end if;
 return query select to_char(t.transaction_date,'YYYY-MM'),t.material_id,t.unit_of_measure_id,sum(abs(t.quantity))
 from public.inventory_transactions t where t.transaction_type='MATERIAL_CONSUMPTION' and t.transaction_date>=p_from and t.transaction_date<p_to
 and not exists(select 1 from public.inventory_transactions r where r.reversal_of=t.id)
 group by to_char(t.transaction_date,'YYYY-MM'),t.material_id,t.unit_of_measure_id;
end $$;
revoke all on function public.search_registry_choices(text,text,integer,integer,uuid),public.get_monthly_material_consumption(date,date) from public,anon,authenticated;
grant execute on function public.search_registry_choices(text,text,integer,integer,uuid),public.get_monthly_material_consumption(date,date) to authenticated;
commit;

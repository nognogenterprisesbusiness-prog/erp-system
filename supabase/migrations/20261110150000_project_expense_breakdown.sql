begin;

create function private.project_expense_bucket(p_category text, p_purchase_kind text)
returns text language sql immutable set search_path='' as $$
  select case when p_category <> 'other' then p_category
    when p_purchase_kind = 'fuel' then 'fuel'
    when p_purchase_kind = 'expense' then 'site_receipt'
    else 'other' end;
$$;
revoke all on function private.project_expense_bucket(text,text) from public,anon,authenticated;

create function public.get_project_expense_breakdown(p_project_id uuid)
returns table(bucket text,amount numeric,entry_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view project expenses' using errcode='42501';
  end if;
  return query select private.project_expense_bucket(e.category,s.purchase_kind),sum(e.amount),count(*)
  from public.project_additional_expenses e
  left join public.site_purchases s on s.project_expense_id=e.id and s.project_id=e.project_id
  where e.project_id=p_project_id and not exists(select 1 from public.project_expense_reversals r where r.expense_id=e.id)
  group by 1 order by 1;
end; $$;

create function public.get_project_expense_entries(p_project_id uuid,p_bucket text default 'all',p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,expense_date date,category text,bucket text,description text,external_reference text,amount numeric,
  receipt_id uuid,reversal_reason text,reversed_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view project expenses' using errcode='42501';
  end if;
  if p_bucket is null or p_bucket not in ('all','permit','subcontract','utilities','other','labor','equipment','fuel','site_receipt')
    or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid expense filter or page' using errcode='22023';
  end if;
  return query select e.id,e.expense_date,e.category,private.project_expense_bucket(e.category,s.purchase_kind),e.description,e.external_reference,e.amount,
    s.id,r.reason,r.reversed_at,count(*) over()
  from public.project_additional_expenses e
  left join public.site_purchases s on s.project_expense_id=e.id and s.project_id=e.project_id
  left join public.project_expense_reversals r on r.expense_id=e.id
  where e.project_id=p_project_id and (p_bucket='all' or private.project_expense_bucket(e.category,s.purchase_kind)=p_bucket)
  order by e.expense_date desc,e.id offset p_offset limit p_limit;
end; $$;

revoke all on function public.get_project_expense_breakdown(uuid),public.get_project_expense_entries(uuid,text,integer,integer) from public,anon;
grant execute on function public.get_project_expense_breakdown(uuid),public.get_project_expense_entries(uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;

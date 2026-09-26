create function public.list_supplier_price_history(p_supplier_id uuid,p_offset integer default 0,p_limit integer default 20)
returns table(record jsonb,total_count bigint) language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid pagination'; end if;
  return query select to_jsonb(p),count(*) over() from public.supplier_prices p
    join public.supplier_materials m on m.id=p.supplier_material_id
    where m.supplier_id=p_supplier_id
    order by p.effective_start_date desc,p.id offset p_offset limit p_limit;
end;
$$;
create function public.list_supplier_summary_prices(p_supplier_id uuid,p_as_of date)
returns setof public.supplier_prices language sql stable security invoker set search_path='' as $$
  select p.* from public.supplier_materials m
  cross join lateral (
    select current_price.* from public.supplier_prices current_price
    where current_price.supplier_material_id=m.id and current_price.effective_start_date<=p_as_of
      and (current_price.effective_end_date is null or current_price.effective_end_date>=p_as_of)
    order by current_price.effective_start_date desc,current_price.id limit 1
  ) p where m.supplier_id=p_supplier_id
  union
  select p.* from public.supplier_materials m
  cross join lateral (
    select previous_price.* from public.supplier_prices previous_price
    where previous_price.supplier_material_id=m.id and previous_price.effective_start_date<coalesce(
      (select max(c.effective_start_date) from public.supplier_prices c where c.supplier_material_id=m.id
        and c.effective_start_date<=p_as_of and (c.effective_end_date is null or c.effective_end_date>=p_as_of)),p_as_of)
    order by previous_price.effective_start_date desc,previous_price.id limit 1
  ) p where m.supplier_id=p_supplier_id;
$$;
revoke all on function public.list_supplier_price_history(uuid,integer,integer),public.list_supplier_summary_prices(uuid,date) from public,anon;
grant execute on function public.list_supplier_price_history(uuid,integer,integer),public.list_supplier_summary_prices(uuid,date) to authenticated;

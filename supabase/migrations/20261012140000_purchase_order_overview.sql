-- One complete order per row; searching an item never truncates its order total.
begin;
create function public.get_purchases(p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(source text,purchase_id uuid,purchase_number text,purchase_date date,item_count bigint,item_names text,
 order_total numeric,supplier_id uuid,supplier_name text,supplier_contact text,payment_term text,location_name text,
 delivery_stage text,payment_stage text,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_search text:=lower(trim(p_search));
begin
 if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
   raise exception 'Not authorized for purchases' using errcode='42501'; end if;
 if p_search is null or length(p_search)>100 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
   raise exception 'Invalid purchase page' using errcode='22023'; end if;
 return query with orders as (
   select r.source,r.purchase_id,max(r.purchase_number) purchase_number,max(r.purchase_date) purchase_date,
     count(*) item_count,string_agg(r.material_name,', ' order by r.material_name,r.line_id) item_names,
     sum(r.line_total) order_total,r.supplier_id,max(r.supplier_name) supplier_name,max(r.supplier_contact) supplier_contact,
     max(r.payment_term) payment_term,max(r.location_name) location_name,
     case when bool_or(r.delivery_stage='cancelled') then 'cancelled'
       when bool_or(r.delivery_stage='rejected') then 'rejected'
       when bool_or(r.delivery_stage='waiting_approval') then 'waiting_approval'
       when bool_and(r.delivery_stage='received') then 'received'
       when bool_or(r.received_quantity>0) then 'partly_received' else 'ordered' end delivery_stage,
     max(r.payment_stage) payment_stage,max(r.created_at) created_at
   from private.purchase_line_rows() r group by r.source,r.purchase_id,r.supplier_id
   having v_search='' or bool_or(position(v_search in lower(r.material_name||' '||r.material_code||' '||r.supplier_name||' '||r.purchase_number||' '||coalesce(r.location_name,'')))>0)
 ) select o.source,o.purchase_id,o.purchase_number,o.purchase_date,o.item_count,o.item_names,o.order_total,
   o.supplier_id,o.supplier_name,o.supplier_contact,o.payment_term,o.location_name,o.delivery_stage,o.payment_stage,count(*) over()
 from orders o order by o.created_at desc,o.purchase_id desc offset p_offset limit p_limit;
end; $$;
revoke all on function public.get_purchases(text,integer,integer) from public,anon;
grant execute on function public.get_purchases(text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;

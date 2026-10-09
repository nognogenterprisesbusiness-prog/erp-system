-- Retire material category management while preserving historical references.
-- The new catalog command creates materials without a category. Old save_material
-- remains available for earlier clients during a rolling application upgrade.
begin;
alter table public.materials alter column category_id drop not null;

create or replace function public.save_material_catalog(
  p_id uuid, p_code text, p_name text, p_description text, p_base_unit_id uuid,
  p_material_kind public.material_kind, p_minimum_stock_level numeric, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_code is null or trim(p_code) !~ '^[A-Z0-9-]{2,32}$'
    or p_name is null or char_length(trim(p_name)) not between 2 and 160
    or p_description is null or char_length(p_description) > 2000
    or p_minimum_stock_level is null or p_minimum_stock_level < 0
    or round(p_minimum_stock_level,4) <> p_minimum_stock_level or p_is_active is null then
    raise exception 'invalid material values' using errcode = '22023';
  end if;
  if p_material_kind is distinct from 'consumable'::public.material_kind then
    raise exception 'Register reusable tools in Equipment' using errcode = '22023';
  end if;
  if not exists(select 1 from public.units_of_measure where id=p_base_unit_id and is_active) then
    raise exception 'unit not found or inactive' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.materials(code,name,description,base_unit_id,material_kind,minimum_stock_level,is_active,created_by,updated_by)
      values(trim(p_code),trim(p_name),nullif(trim(p_description),''),p_base_unit_id,p_material_kind,
        p_minimum_stock_level,p_is_active,v_actor,v_actor) returning id into v_id;
  else
    if exists(select 1 from public.materials m where m.id=p_id
      and m.base_unit_id<>p_base_unit_id and (
        exists(select 1 from public.inventory_transactions t where t.material_id=m.id)
        or exists(select 1 from public.inventory_balances b where b.material_id=m.id))) then
      raise exception 'unit and material type cannot change after inventory history exists' using errcode = '22023';
    end if;
    update public.materials set code=trim(p_code),name=trim(p_name),description=nullif(trim(p_description),''),
      base_unit_id=p_base_unit_id,minimum_stock_level=p_minimum_stock_level,is_active=p_is_active,updated_by=v_actor
      where id=p_id and material_kind='consumable' and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'material not found or read-only' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end; $$;
revoke all on function public.save_material_catalog(uuid,text,text,text,uuid,public.material_kind,numeric,boolean) from public,anon;
grant execute on function public.save_material_catalog(uuid,text,text,text,uuid,public.material_kind,numeric,boolean) to authenticated;

create or replace function public.list_inventory_materials(
  p_query text default '', p_location_id uuid default null, p_category_id uuid default null,
  p_status text default 'active', p_low boolean default false,
  p_offset integer default 0, p_limit integer default 24,
  p_location_kind text default 'all'
) returns table(
  material_id uuid, code text, name text, photo_path text,
  category_id uuid, category_name text, unit_name text, unit_symbol text,
  material_kind public.material_kind, minimum_stock_level numeric, is_active boolean,
  balance_id uuid, quantity_on_hand numeric, reserved_quantity numeric,
  available_quantity numeric, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_query is null or char_length(p_query) > 100
    or p_status is null or p_status not in ('active', 'inactive', 'all')
    or p_low is null or p_offset is null or p_offset < 0
    or p_limit is null or p_limit not between 1 and 500
    or p_location_kind is null or p_location_kind not in ('all', 'warehouse', 'project_site') then
    raise exception 'Invalid inventory catalog filters' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.inventory_locations where id = p_location_id
  ) then
    raise exception 'Inventory location is not available' using errcode = '42501';
  end if;

  return query
    with stock as (
      select b.material_id,
        case when p_location_id is not null then min(b.id::text)::uuid end as id,
        sum(b.quantity_on_hand) as quantity_on_hand, sum(b.reserved_quantity) as reserved_quantity,
        sum(b.available_quantity) as available_quantity
      from public.inventory_balances b
      join public.inventory_locations l on l.id = b.inventory_location_id
      where (p_location_id is null or b.inventory_location_id = p_location_id)
        and (p_location_kind = 'all' or l.location_type::text = p_location_kind)
      group by b.material_id
    )
    select m.id, m.code, m.name, m.photo_path, m.category_id,
      c.name, u.name, u.symbol, m.material_kind, m.minimum_stock_level,
      m.is_active, b.id, coalesce(b.quantity_on_hand, 0),
      coalesce(b.reserved_quantity, 0), coalesce(b.available_quantity, 0),
      count(*) over()
    from public.materials m
    left join public.material_categories c on c.id = m.category_id
    join public.units_of_measure u on u.id = m.base_unit_id
    left join stock b on b.material_id = m.id
    where m.archived_at is null and m.material_kind = 'consumable'
      and (p_category_id is null or m.category_id = p_category_id)
      and (p_status = 'all' or m.is_active = (p_status = 'active'))
      and (not p_low or coalesce(b.available_quantity, 0) <= m.minimum_stock_level)
      and (trim(p_query) = '' or position(lower(trim(p_query)) in lower(m.name)) > 0
        or position(lower(trim(p_query)) in lower(m.code)) > 0)
    order by case when coalesce(b.quantity_on_hand, 0) > 0 then 0 else 1 end,
      m.name, m.id
    offset p_offset limit p_limit;
end; $$;

revoke all on function public.list_inventory_materials(text,uuid,uuid,text,boolean,integer,integer,text) from public, anon;
grant execute on function public.list_inventory_materials(text,uuid,uuid,text,boolean,integer,integer,text) to authenticated;

create or replace function public.list_inventory_balances(
  p_query text default '', p_location_id uuid default null, p_kind text default 'all',
  p_low boolean default false, p_offset integer default 0, p_limit integer default 24
) returns table(id uuid,material_id uuid,inventory_location_id uuid,quantity_on_hand numeric,
  reserved_quantity numeric,available_quantity numeric,updated_at timestamptz,material jsonb,total_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_offset<0 or p_limit not between 1 and 500 or p_kind not in ('all','warehouse','project_site') then
    raise exception 'Invalid inventory pagination' using errcode='22023';
  end if;
  return query select b.id,b.material_id,b.inventory_location_id,b.quantity_on_hand,b.reserved_quantity,
    b.available_quantity,b.updated_at,
    jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'description',m.description,'photo_path',m.photo_path,
      'category_id',m.category_id,'base_unit_id',m.base_unit_id,'material_kind',m.material_kind,
      'minimum_stock_level',m.minimum_stock_level,'is_active',m.is_active,'archived_at',m.archived_at,
      'categoryName',c.name,'unitName',u.name,'unitSymbol',u.symbol),count(*) over()
  from public.inventory_balances b join public.materials m on m.id=b.material_id
    join public.inventory_locations l on l.id=b.inventory_location_id
    join public.units_of_measure u on u.id=m.base_unit_id
    left join public.material_categories c on c.id=m.category_id
  where m.is_active and m.archived_at is null
    and (p_location_id is null or b.inventory_location_id=p_location_id)
    and (p_kind='all' or l.location_type::text=p_kind)
    and (not p_low or b.available_quantity<=m.minimum_stock_level)
    and (coalesce(p_query,'')='' or position(lower(p_query) in lower(m.name))>0 or position(lower(p_query) in lower(m.code))>0)
  order by m.name,b.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.list_inventory_balances(text,uuid,text,boolean,integer,integer) from public,anon;
grant execute on function public.list_inventory_balances(text,uuid,text,boolean,integer,integer) to authenticated;

drop function if exists public.save_material_category(uuid,text,text);
drop function if exists public.archive_material_category(uuid);
notify pgrst, 'reload schema';
commit;

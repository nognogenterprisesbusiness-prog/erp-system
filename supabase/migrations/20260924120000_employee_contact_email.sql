alter table public.employee_private_contacts
  add column email_address text
  constraint employee_private_contacts_email_format check (
    email_address is null or (
      char_length(email_address) <= 320
      and email_address ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  );

create function public.save_employee_with_email(
  p_id uuid, p_code text, p_first_name text, p_middle_name text, p_last_name text,
  p_contact_number text, p_email_address text, p_category_id uuid, p_employment_type text,
  p_status public.employee_status, p_hire_date date, p_profile_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_email text := nullif(lower(trim(p_email_address)), '');
begin
  if (select auth.uid()) is null or not private.can_manage_workforce() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_email is not null and (
    char_length(v_email) > 320 or
    v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) then
    raise exception 'invalid employee email address' using errcode = '22023';
  end if;

  v_id := public.save_employee(
    p_id, p_code, p_first_name, p_middle_name, p_last_name, p_contact_number,
    p_category_id, p_employment_type, p_status, p_hire_date, p_profile_id
  );
  update public.employee_private_contacts
    set email_address = v_email, updated_by = (select auth.uid()), updated_at = now()
    where employee_id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_employee_with_email(uuid, text, text, text, text, text, text, uuid, text, public.employee_status, date, uuid) from public, anon;
grant execute on function public.save_employee_with_email(uuid, text, text, text, text, text, text, uuid, text, public.employee_status, date, uuid) to authenticated;

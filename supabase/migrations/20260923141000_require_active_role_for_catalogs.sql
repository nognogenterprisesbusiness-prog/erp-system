-- An Auth identity alone is not an ERP membership. Invited users gain read
-- access only after an active profile has an assigned application role.
alter policy units_select_authenticated on public.units_of_measure
  using (private.has_any_role(enum_range(null::public.app_role)));
alter policy categories_select_authenticated on public.material_categories
  using (private.has_any_role(enum_range(null::public.app_role)));
alter policy materials_select_authenticated on public.materials
  using (private.has_any_role(enum_range(null::public.app_role)));
alter policy asset_categories_select_authenticated on public.asset_categories
  using (private.has_any_role(enum_range(null::public.app_role)));
alter policy employee_categories_select_authenticated on public.employee_categories
  using (private.has_any_role(enum_range(null::public.app_role)));

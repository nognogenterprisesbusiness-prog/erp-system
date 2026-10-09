-- Date-only site work follows the same Philippine calendar as hardware receipts.
-- This avoids rejecting today's equipment use while the UTC server is still yesterday.
begin;
alter function public.post_project_equipment_usage(uuid,uuid,uuid,date,numeric,text)
  set timezone = 'Asia/Manila';
notify pgrst, 'reload schema';
commit;

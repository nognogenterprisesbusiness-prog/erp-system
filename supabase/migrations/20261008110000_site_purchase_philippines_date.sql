-- Receipt dates are entered on Philippine devices. Keep this RPC's
-- CURRENT_DATE comparison in the ERP business timezone even if Supabase's
-- database/session timezone is UTC or the function is called from another
-- region. This setting is scoped to this function only.
alter function public.submit_site_purchase(
  uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, jsonb
) set timezone = 'Asia/Manila';

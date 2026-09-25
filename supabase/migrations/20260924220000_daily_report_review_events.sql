alter type public.daily_report_event_type add value if not exists 'approved';
alter type public.daily_report_event_type add value if not exists 'returned_for_correction';
alter type public.daily_report_event_type add value if not exists 'revision_started';

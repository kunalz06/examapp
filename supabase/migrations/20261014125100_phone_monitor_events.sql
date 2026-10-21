-- Prepare phone monitoring for branch rollout. Do not apply to production
-- before the application change is reviewed and deployed.
-- Informational observations are NOT a disqualification trigger.
alter type public.proctor_event_type add value if not exists 'phone_detected';
alter type public.proctor_event_type add value if not exists 'phone_monitor_error';

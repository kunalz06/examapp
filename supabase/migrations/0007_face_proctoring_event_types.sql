-- Add dedicated face-monitoring events before they are referenced by later migrations.
alter type public.proctor_event_type add value if not exists 'face_missing_warning';
alter type public.proctor_event_type add value if not exists 'multiple_faces_warning';
alter type public.proctor_event_type add value if not exists 'face_monitor_error';

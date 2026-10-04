-- Server-authoritative face-warning counter and four-warning disqualification rule.

alter table public.exam_attempts
  add column if not exists face_violation_count integer not null default 0;

alter table public.exam_attempts
  drop constraint if exists exam_attempts_face_violation_count_check;

alter table public.exam_attempts
  add constraint exam_attempts_face_violation_count_check
  check (face_violation_count between 0 and 4);

create or replace function private.process_proctor_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.event_type = 'tab_hidden'::public.proctor_event_type then
    update public.exam_attempts
    set violation_count = violation_count + 1
    where id = new.attempt_id
      and user_id = new.user_id
      and status = 'in_progress'::public.attempt_status
    returning violation_count into v_count;

    if v_count >= 3 then
      update public.exam_attempts
      set status = 'disqualified'::public.attempt_status,
          disqualified_at = coalesce(disqualified_at, now())
      where id = new.attempt_id
        and status = 'in_progress'::public.attempt_status;
    end if;
  elsif new.event_type in (
    'face_missing_warning'::public.proctor_event_type,
    'multiple_faces_warning'::public.proctor_event_type
  ) then
    update public.exam_attempts
    set face_violation_count = least(face_violation_count + 1, 4)
    where id = new.attempt_id
      and user_id = new.user_id
      and status = 'in_progress'::public.attempt_status
    returning face_violation_count into v_count;

    if v_count >= 4 then
      update public.exam_attempts
      set status = 'disqualified'::public.attempt_status,
          disqualified_at = coalesce(disqualified_at, now())
      where id = new.attempt_id
        and status = 'in_progress'::public.attempt_status;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.process_proctor_event() from public;

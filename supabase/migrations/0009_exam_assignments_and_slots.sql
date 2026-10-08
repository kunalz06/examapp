-- Exam-specific student allotment and capacity-safe slot selection.

create table public.exam_assignments (
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);

create index idx_exam_assignments_student on public.exam_assignments(student_id, exam_id);

create table public.exam_slots (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 10000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint exam_slots_time_valid check (ends_at > starts_at),
  unique (id, exam_id)
);

create index idx_exam_slots_exam_starts on public.exam_slots(exam_id, starts_at);

create table public.exam_slot_bookings (
  exam_id uuid not null,
  student_id uuid not null,
  slot_id uuid not null,
  booked_at timestamptz not null default now(),
  primary key (exam_id, student_id),
  constraint exam_booking_assigned_student
    foreign key (exam_id, student_id) references public.exam_assignments(exam_id, student_id) on delete cascade,
  constraint exam_booking_slot_exam
    foreign key (slot_id, exam_id) references public.exam_slots(id, exam_id) on delete restrict
);

create index idx_exam_slot_bookings_slot on public.exam_slot_bookings(slot_id);

-- Existing attempt holders retain their allotment, without needing a retrospective booking.
insert into public.exam_assignments(exam_id, student_id)
select distinct a.exam_id, a.user_id from public.exam_attempts a
join public.profiles p on p.id=a.user_id and p.role='student'::public.app_role
on conflict do nothing;

alter table public.exam_assignments enable row level security;
alter table public.exam_slots enable row level security;
alter table public.exam_slot_bookings enable row level security;

create policy exam_assignments_read on public.exam_assignments
  for select to authenticated
  using (student_id=(select auth.uid()) or private.is_admin());

create policy exam_slots_read on public.exam_slots
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_assignments a
        join public.exams e on e.id=a.exam_id
        where a.exam_id=exam_slots.exam_id
          and a.student_id=(select auth.uid())
          and e.status='published'::public.exam_status
      )
    )
  );

create policy exam_slot_bookings_read on public.exam_slot_bookings
  for select to authenticated
  using (student_id=(select auth.uid()) or private.is_admin());

grant select on public.exam_assignments,public.exam_slots,public.exam_slot_bookings to authenticated;
-- All writes are restricted to audited RPCs below; no direct DML grants for authenticated users.

create or replace function private.admin_set_exam_students_internal(p_exam_id uuid,p_student_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'admin access required' using errcode='42501';
  end if;
  if p_student_ids is null or coalesce(cardinality(p_student_ids),0)>10000 then
    raise exception 'invalid student selection' using errcode='22023';
  end if;

  perform 1 from public.exams where id=p_exam_id for update;
  if not found then raise exception 'exam not found' using errcode='P0002'; end if;

  if exists (
    select 1 from unnest(p_student_ids) as ids(student_id)
    left join public.profiles p on p.id=ids.student_id
    where ids.student_id is null
      or p.id is null
      or p.role<>'student'::public.app_role
      or p.provisioned is distinct from true
  ) then
    raise exception 'selection contains an unavailable student' using errcode='22023';
  end if;

  insert into public.exam_assignments(exam_id,student_id,assigned_by)
  select p_exam_id, ids.student_id, (select auth.uid())
  from (select distinct student_id from unnest(p_student_ids) as x(student_id)) ids
  on conflict do nothing;

  -- Attempts are never orphaned. A prior attempt permanently retains its allotment.
  delete from public.exam_assignments a
  where a.exam_id=p_exam_id
    and not (a.student_id=any(p_student_ids))
    and not exists (
      select 1 from public.exam_attempts t
      where t.exam_id=a.exam_id and t.user_id=a.student_id
    );

  select count(*) into v_count from public.exam_assignments where exam_id=p_exam_id;
  return jsonb_build_object('assignedCount',v_count);
end;
$$;
revoke all on function private.admin_set_exam_students_internal(uuid,uuid[]) from public;
grant execute on function private.admin_set_exam_students_internal(uuid,uuid[]) to authenticated;

create or replace function public.admin_set_exam_students(p_exam_id uuid,p_student_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_set_exam_students_internal(p_exam_id,p_student_ids); $$;
revoke all on function public.admin_set_exam_students(uuid,uuid[]) from public;
grant execute on function public.admin_set_exam_students(uuid,uuid[]) to authenticated;

create or replace function private.admin_create_exam_slot_internal(
  p_exam_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_capacity integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_exam public.exams%rowtype;
  v_slot_id uuid;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'admin access required' using errcode='42501';
  end if;

  select * into v_exam from public.exams where id=p_exam_id for update;
  if not found then raise exception 'exam not found' using errcode='P0002'; end if;

  if p_starts_at is null or p_ends_at is null
     or p_starts_at<=now()
     or p_ends_at<p_starts_at+make_interval(mins=>v_exam.duration_minutes)
     or p_capacity is null or p_capacity<1 or p_capacity>10000
     or (v_exam.starts_at is not null and p_starts_at<v_exam.starts_at)
     or (v_exam.ends_at is not null and p_ends_at>v_exam.ends_at) then
    raise exception 'slot must be in the future, cover exam duration, fit exam window, and have 1-10000 seats' using errcode='22023';
  end if;

  insert into public.exam_slots(exam_id,starts_at,ends_at,capacity,created_by)
  values (p_exam_id,p_starts_at,p_ends_at,p_capacity,(select auth.uid()))
  returning id into v_slot_id;

  return v_slot_id;
end;
$$;
revoke all on function private.admin_create_exam_slot_internal(uuid,timestamptz,timestamptz,integer) from public;
grant execute on function private.admin_create_exam_slot_internal(uuid,timestamptz,timestamptz,integer) to authenticated;

create or replace function public.admin_create_exam_slot(
  p_exam_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_capacity integer
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.admin_create_exam_slot_internal(p_exam_id,p_starts_at,p_ends_at,p_capacity); $$;
revoke all on function public.admin_create_exam_slot(uuid,timestamptz,timestamptz,integer) from public;
grant execute on function public.admin_create_exam_slot(uuid,timestamptz,timestamptz,integer) to authenticated;

create or replace function private.choose_exam_slot_internal(p_exam_id uuid,p_slot_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_slot public.exam_slots%rowtype;
  v_prior public.exam_slot_bookings%rowtype;
  v_booked integer;
begin
  if v_uid is null or not private.is_provisioned_student() then
    raise exception 'verified student access required' using errcode='42501';
  end if;

  -- Serializes one student's concurrent requests, including exam start or removal.
  perform 1 from public.exam_assignments
  where exam_id=p_exam_id and student_id=v_uid
  for update;
  if not found then raise exception 'exam is not allotted to this student' using errcode='42501'; end if;

  if not exists (
    select 1 from public.exams
    where id=p_exam_id and status='published'::public.exam_status
  ) then raise exception 'exam is unavailable' using errcode='55000'; end if;

  if exists (
    select 1 from public.exam_attempts
    where exam_id=p_exam_id and user_id=v_uid
  ) then raise exception 'slot cannot change after exam attempt begins' using errcode='55000'; end if;

  select * into v_prior
  from public.exam_slot_bookings
  where exam_id=p_exam_id and student_id=v_uid for update;

  if found and v_prior.slot_id=p_slot_id then
    return jsonb_build_object('slotId',p_slot_id,'selected',true);
  end if;

  if v_prior.slot_id is not null and exists (
    select 1 from public.exam_slots s
    where s.id=v_prior.slot_id and s.starts_at<=now()
  ) then
    raise exception 'previous slot has started; contact the administrator' using errcode='55000';
  end if;

  select * into v_slot from public.exam_slots
  where id=p_slot_id and exam_id=p_exam_id for update;
  if not found then raise exception 'slot not found' using errcode='P0002'; end if;

  if now()>=v_slot.starts_at then
    raise exception 'slot booking closes when the slot begins' using errcode='55000';
  end if;

  select count(*) into v_booked from public.exam_slot_bookings where slot_id=p_slot_id;
  if v_booked>=v_slot.capacity then raise exception 'slot is full' using errcode='55000'; end if;

  insert into public.exam_slot_bookings(exam_id,student_id,slot_id)
  values(p_exam_id,v_uid,p_slot_id)
  on conflict (exam_id,student_id)
    do update set slot_id=excluded.slot_id,booked_at=now();

  return jsonb_build_object('slotId',p_slot_id,'selected',true);
end;
$$;
revoke all on function private.choose_exam_slot_internal(uuid,uuid) from public;
grant execute on function private.choose_exam_slot_internal(uuid,uuid) to authenticated;

create or replace function public.choose_exam_slot(p_exam_id uuid,p_slot_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.choose_exam_slot_internal(p_exam_id,p_slot_id); $$;
revoke all on function public.choose_exam_slot(uuid,uuid) from public;
grant execute on function public.choose_exam_slot(uuid,uuid) to authenticated;

create or replace function private.get_exam_slots_internal(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not private.is_admin() and (
    not private.is_provisioned_student() or
    not exists (
      select 1 from public.exam_assignments a
      join public.exams e on e.id=a.exam_id
      where a.exam_id=p_exam_id and a.student_id=v_uid
        and e.status='published'::public.exam_status
    )
  ) then raise exception 'exam is not allotted to this student' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'startsAt',s.starts_at,
    'endsAt',s.ends_at,
    'capacity',s.capacity,
    'bookedCount', (select count(*) from public.exam_slot_bookings b where b.slot_id=s.id),
    'selected',exists (
      select 1 from public.exam_slot_bookings b
      where b.slot_id=s.id and b.student_id=v_uid
    )
  ) order by s.starts_at),'[]'::jsonb)
  into v_result
  from public.exam_slots s
  where s.exam_id=p_exam_id;

  return v_result;
end;
$$;
revoke all on function private.get_exam_slots_internal(uuid) from public;
grant execute on function private.get_exam_slots_internal(uuid) to authenticated;

create or replace function public.get_exam_slots(p_exam_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.get_exam_slots_internal(p_exam_id); $$;
revoke all on function public.get_exam_slots(uuid) from public;
grant execute on function public.get_exam_slots(uuid) to authenticated;

-- This trigger runs after prepare_exam_attempt so the exam's existing duration,
-- grading, and validity safeguards remain intact.
create or replace function private.verify_booked_exam_slot()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_slot public.exam_slots%rowtype;
begin
  if private.is_admin() then return new; end if;

  -- Lock prevents booking changes during attempt creation.
  perform 1 from public.exam_assignments
  where exam_id=new.exam_id and student_id=new.user_id for update;
  if not found then
    raise exception 'student is not allotted this exam' using errcode='42501';
  end if;

  select s.* into v_slot
  from public.exam_slot_bookings b
  join public.exam_slots s on s.id=b.slot_id
  where b.exam_id=new.exam_id and b.student_id=new.user_id;

  if not found then
    raise exception 'select a slot before starting this exam' using errcode='55000';
  end if;
  if now()<v_slot.starts_at then
    raise exception 'selected exam slot has not started' using errcode='55000';
  end if;
  if now()>=v_slot.ends_at then
    raise exception 'selected exam slot has ended' using errcode='55000';
  end if;
  new.expires_at:=least(new.expires_at,v_slot.ends_at);
  return new;
end;
$$;
revoke all on function private.verify_booked_exam_slot() from public;

create trigger verify_booked_exam_slot_on_start
  before insert on public.exam_attempts
  for each row execute function private.verify_booked_exam_slot();

drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams for select to authenticated using (
  private.is_admin()
  or (
    private.is_provisioned_student() and (
      (status='published'::public.exam_status and exists (
        select 1 from public.exam_assignments a
        where a.exam_id=exams.id and a.student_id=(select auth.uid())
      ))
      or exists (
        select 1 from public.exam_attempts t
        where t.exam_id=exams.id and t.user_id=(select auth.uid())
      )
    )
  )
);
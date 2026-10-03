-- Restrict student access to administrator-provisioned accounts.

alter table public.profiles
  add column if not exists email text,
  add column if not exists provisioned boolean not null default false;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

update public.profiles
set provisioned = true
where role = 'admin'::public.app_role;

create unique index if not exists idx_profiles_email_lower
  on public.profiles (lower(email))
  where email is not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, provisioned)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'student'), '@', 1)),
    'student'::public.app_role,
    false
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create or replace function private.is_provisioned_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'student'::public.app_role
      and p.provisioned = true
  );
$$;
revoke all on function private.is_provisioned_student() from public;
grant execute on function private.is_provisioned_student() to authenticated;

create or replace function private.prepare_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams%rowtype;
begin
  if new.user_id is distinct from (select auth.uid()) and not private.is_admin() then
    raise exception 'attempt owner mismatch';
  end if;

  select * into v_exam from public.exams where id = new.exam_id;
  if not found then
    raise exception 'exam not found';
  end if;

  if not private.is_admin() then
    if not private.is_provisioned_student() then
      raise exception 'student account is not provisioned';
    end if;
    if v_exam.status <> 'published'::public.exam_status then
      raise exception 'exam is not published';
    end if;
    if v_exam.starts_at is not null and now() < v_exam.starts_at then
      raise exception 'exam has not started';
    end if;
    if v_exam.ends_at is not null and now() >= v_exam.ends_at then
      raise exception 'exam has ended';
    end if;
  end if;

  new.started_at := now();
  new.expires_at := least(
    new.started_at + make_interval(mins => v_exam.duration_minutes),
    coalesce(v_exam.ends_at, 'infinity'::timestamptz)
  );
  new.status := 'in_progress'::public.attempt_status;
  new.violation_count := 0;
  new.auto_score := 0;
  new.manual_score := 0;

  select coalesce(sum(q.points), 0), bool_or(q.type = 'short_text'::public.question_type)
    into new.max_score, new.requires_manual_grading
  from public.questions q
  where q.exam_id = new.exam_id;

  new.requires_manual_grading := coalesce(new.requires_manual_grading, false);
  return new;
end;
$$;
revoke all on function private.prepare_attempt() from public;

create or replace function private.submit_attempt_internal(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.is_provisioned_student() then
    raise exception 'student account is not provisioned' using errcode = '42501';
  end if;

  update public.exam_attempts
  set status = 'submitted'::public.attempt_status
  where id = p_attempt_id
    and user_id = (select auth.uid())
    and status = 'in_progress'::public.attempt_status
  returning * into v_attempt;

  if not found then
    raise exception 'active attempt not found' using errcode = 'P0002';
  end if;

  return v_attempt;
end;
$$;
revoke all on function private.submit_attempt_internal(uuid) from public;
grant execute on function private.submit_attempt_internal(uuid) to authenticated;

drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and (
        status = 'published'::public.exam_status
        or exists (
          select 1 from public.exam_attempts a
          where a.exam_id = exams.id
            and a.user_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_attempts a
        where a.exam_id = questions.exam_id
          and a.user_id = (select auth.uid())
          and a.status = 'in_progress'::public.attempt_status
          and now() <= a.expires_at + interval '30 seconds'
      )
    )
  );

drop policy if exists options_select on public.question_options;
create policy options_select on public.question_options
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1
        from public.questions q
        join public.exam_attempts a on a.exam_id = q.exam_id
        where q.id = question_options.question_id
          and a.user_id = (select auth.uid())
          and a.status = 'in_progress'::public.attempt_status
          and now() <= a.expires_at + interval '30 seconds'
      )
    )
  );

drop policy if exists attempts_select_own_or_admin on public.exam_attempts;
create policy attempts_select_own_or_admin on public.exam_attempts
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and user_id = (select auth.uid())
    )
  );

drop policy if exists attempts_insert_own on public.exam_attempts;
create policy attempts_insert_own on public.exam_attempts
  for insert to authenticated
  with check (
    private.is_provisioned_student()
    and user_id = (select auth.uid())
  );

drop policy if exists answers_select_own_or_admin on public.answers;
create policy answers_select_own_or_admin on public.answers
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_attempts a
        where a.id = answers.attempt_id
          and a.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists answers_insert_own_active_or_admin on public.answers;
create policy answers_insert_own_active_or_admin on public.answers
  for insert to authenticated
  with check (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_attempts a
        where a.id = answers.attempt_id
          and a.user_id = (select auth.uid())
          and a.status = 'in_progress'::public.attempt_status
          and now() <= a.expires_at + interval '30 seconds'
      )
    )
  );

drop policy if exists answers_update_own_active_or_admin on public.answers;
create policy answers_update_own_active_or_admin on public.answers
  for update to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_attempts a
        where a.id = answers.attempt_id
          and a.user_id = (select auth.uid())
          and a.status = 'in_progress'::public.attempt_status
          and now() <= a.expires_at + interval '30 seconds'
      )
    )
  )
  with check (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and exists (
        select 1 from public.exam_attempts a
        where a.id = answers.attempt_id
          and a.user_id = (select auth.uid())
          and a.status = 'in_progress'::public.attempt_status
          and now() <= a.expires_at + interval '30 seconds'
      )
    )
  );

drop policy if exists proctor_select_own_or_admin on public.proctor_events;
create policy proctor_select_own_or_admin on public.proctor_events
  for select to authenticated
  using (
    private.is_admin()
    or (
      private.is_provisioned_student()
      and user_id = (select auth.uid())
    )
  );

drop policy if exists proctor_insert_own_active on public.proctor_events;
create policy proctor_insert_own_active on public.proctor_events
  for insert to authenticated
  with check (
    private.is_provisioned_student()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.exam_attempts a
      where a.id = proctor_events.attempt_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );

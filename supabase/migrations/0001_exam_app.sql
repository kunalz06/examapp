-- Exam App initial schema
-- Designed for Supabase Postgres 17 with explicit Data API grants and RLS.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('student', 'admin');
create type public.exam_status as enum ('draft', 'published', 'archived');
create type public.question_type as enum ('single_choice', 'short_text');
create type public.attempt_status as enum ('in_progress', 'submitted', 'disqualified', 'graded');
create type public.proctor_event_type as enum (
  'tab_hidden',
  'fullscreen_exit',
  'media_ended',
  'media_permission_denied',
  'window_blur'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  status public.exam_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_window_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 5000),
  type public.question_type not null,
  points numeric(8,2) not null default 1 check (points > 0 and points <= 1000),
  position integer not null check (position >= 0),
  unique (exam_id, position)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 2000),
  position integer not null check (position >= 0),
  unique (question_id, position)
);

-- Correct answers are intentionally isolated from student-readable option rows.
create table public.question_answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_id uuid not null references public.question_options(id) on delete cascade
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  disqualified_at timestamptz,
  violation_count integer not null default 0 check (violation_count >= 0),
  auto_score numeric(10,2) not null default 0,
  manual_score numeric(10,2) not null default 0,
  max_score numeric(10,2) not null default 0,
  requires_manual_grading boolean not null default false,
  created_at timestamptz not null default now(),
  unique (exam_id, user_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id) on delete set null,
  text_answer text check (text_answer is null or char_length(text_answer) <= 20000),
  manual_score numeric(8,2),
  grader_feedback text check (grader_feedback is null or char_length(grader_feedback) <= 5000),
  graded_by uuid references public.profiles(id),
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.proctor_events (
  id bigint generated always as identity primary key,
  client_event_id uuid not null unique,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type public.proctor_event_type not null,
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 8192),
  occurred_at timestamptz not null default now()
);

create index idx_exams_status on public.exams(status);
create index idx_questions_exam on public.questions(exam_id, position);
create index idx_options_question on public.question_options(question_id, position);
create index idx_attempts_user on public.exam_attempts(user_id, started_at desc);
create index idx_attempts_exam on public.exam_attempts(exam_id, status);
create index idx_answers_attempt on public.answers(attempt_id);
create index idx_proctor_attempt on public.proctor_events(attempt_id, occurred_at);

-- Helper deliberately lives outside the exposed public schema. It returns only a boolean.
create or replace function private.is_admin()
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
      and p.role = 'admin'::public.app_role
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'student'), '@', 1)),
    'student'::public.app_role
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

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

create trigger prepare_exam_attempt
  before insert on public.exam_attempts
  for each row execute function private.prepare_attempt();

create or replace function private.guard_answer_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exam_id uuid;
  v_question_type public.question_type;
  v_points numeric(8,2);
begin
  select a.exam_id into v_exam_id
  from public.exam_attempts a
  where a.id = new.attempt_id;

  if v_exam_id is null then
    raise exception 'attempt not found';
  end if;

  select q.type, q.points into v_question_type, v_points
  from public.questions q
  where q.id = new.question_id and q.exam_id = v_exam_id;

  if not found then
    raise exception 'question does not belong to this exam';
  end if;

  if new.selected_option_id is not null and not exists (
    select 1 from public.question_options o
    where o.id = new.selected_option_id and o.question_id = new.question_id
  ) then
    raise exception 'option does not belong to question';
  end if;

  if not private.is_admin() then
    if tg_op = 'INSERT' then
      new.manual_score := null;
      new.grader_feedback := null;
      new.graded_by := null;
      new.graded_at := null;
    else
      if new.manual_score is distinct from old.manual_score
        or new.grader_feedback is distinct from old.grader_feedback
        or new.graded_by is distinct from old.graded_by
        or new.graded_at is distinct from old.graded_at then
        raise exception 'students cannot modify grading fields';
      end if;
    end if;
  else
    if new.manual_score is not null then
      if v_question_type <> 'short_text'::public.question_type then
        raise exception 'manual score is only valid for short-text questions';
      end if;
      if new.manual_score < 0 or new.manual_score > v_points then
        raise exception 'manual score is outside question point range';
      end if;
      new.graded_by := (select auth.uid());
      new.graded_at := now();
    end if;
  end if;

  if v_question_type = 'single_choice'::public.question_type then
    new.text_answer := null;
  else
    new.selected_option_id := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_answer_write() from public;

create trigger guard_answer_write_trigger
  before insert or update on public.answers
  for each row execute function private.guard_answer_write();

create or replace function private.validate_answer_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.question_options o
    where o.id = new.correct_option_id and o.question_id = new.question_id
  ) then
    raise exception 'correct option must belong to the same question';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_answer_key() from public;

create trigger validate_answer_key_trigger
  before insert or update on public.question_answer_keys
  for each row execute function private.validate_answer_key();

create or replace function private.score_attempt_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> new.status and new.status = 'submitted'::public.attempt_status then
    if old.status <> 'in_progress'::public.attempt_status then
      raise exception 'only active attempts can be submitted';
    end if;
    select coalesce(sum(q.points), 0)
      into new.auto_score
    from public.answers a
    join public.questions q on q.id = a.question_id
    join public.question_answer_keys k on k.question_id = q.id
    where a.attempt_id = old.id
      and q.type = 'single_choice'::public.question_type
      and a.selected_option_id = k.correct_option_id;

    new.submitted_at := now();
    if not exists (
      select 1 from public.questions q
      where q.exam_id = old.exam_id and q.type = 'short_text'::public.question_type
    ) then
      new.status := 'graded'::public.attempt_status;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.score_attempt_on_submit() from public;

create trigger score_attempt_submission
  before update of status on public.exam_attempts
  for each row execute function private.score_attempt_on_submit();


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

create or replace function public.submit_attempt(p_attempt_id uuid)
returns public.exam_attempts
language sql
security invoker
set search_path = ''
as $$
  select (private.submit_attempt_internal(p_attempt_id)).*;
$$;
revoke all on function public.submit_attempt(uuid) from public;
grant execute on function public.submit_attempt(uuid) to authenticated;

create or replace function private.recalculate_manual_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid := coalesce(new.attempt_id, old.attempt_id);
  v_ungraded_count integer;
begin
  update public.exam_attempts a
  set manual_score = (
    select coalesce(sum(ans.manual_score), 0)
    from public.answers ans
    where ans.attempt_id = v_attempt_id
  )
  where a.id = v_attempt_id;

  select count(*) into v_ungraded_count
  from public.questions q
  join public.exam_attempts a on a.exam_id = q.exam_id and a.id = v_attempt_id
  left join public.answers ans on ans.attempt_id = a.id and ans.question_id = q.id
  where q.type = 'short_text'::public.question_type
    and ans.manual_score is null;

  if v_ungraded_count = 0 then
    update public.exam_attempts
    set status = case
      when status = 'submitted'::public.attempt_status then 'graded'::public.attempt_status
      else status
    end
    where id = v_attempt_id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.recalculate_manual_score() from public;

create trigger recalc_score_after_answer_change
  after insert or delete on public.answers
  for each row execute function private.recalculate_manual_score();

create trigger recalc_score_after_grade_update
  after update of manual_score on public.answers
  for each row execute function private.recalculate_manual_score();

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
  end if;
  return new;
end;
$$;
revoke all on function private.process_proctor_event() from public;

create trigger proctor_event_counter
  after insert on public.proctor_events
  for each row execute function private.process_proctor_event();

-- Atomic admin exam creation. It is exposed as an RPC but performs its own admin authorization check.
create or replace function public.admin_create_exam(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exam_id uuid;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_option_id uuid;
  v_position integer := 0;
  v_option_position integer;
  v_correct_count integer;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload -> 'questions') <> 'array' then
    raise exception 'questions must be an array';
  end if;

  insert into public.exams (title, description, duration_minutes, starts_at, ends_at, created_by)
  values (
    trim(p_payload ->> 'title'),
    coalesce(p_payload ->> 'description', ''),
    (p_payload ->> 'duration_minutes')::integer,
    nullif(p_payload ->> 'starts_at', '')::timestamptz,
    nullif(p_payload ->> 'ends_at', '')::timestamptz,
    (select auth.uid())
  )
  returning id into v_exam_id;

  for v_question in select value from jsonb_array_elements(p_payload -> 'questions')
  loop
    insert into public.questions (exam_id, prompt, type, points, position)
    values (
      v_exam_id,
      trim(v_question ->> 'prompt'),
      (v_question ->> 'type')::public.question_type,
      coalesce((v_question ->> 'points')::numeric, 1),
      v_position
    ) returning id into v_question_id;

    if (v_question ->> 'type') = 'single_choice' then
      if jsonb_typeof(v_question -> 'options') <> 'array' then
        raise exception 'single-choice questions require options';
      end if;
      v_correct_count := 0;
      v_correct_option_id := null;
      v_option_position := 0;

      for v_option in select value from jsonb_array_elements(v_question -> 'options')
      loop
        insert into public.question_options (question_id, label, position)
        values (v_question_id, trim(v_option ->> 'label'), v_option_position)
        returning id into v_option_id;

        if coalesce((v_option ->> 'is_correct')::boolean, false) then
          v_correct_count := v_correct_count + 1;
          v_correct_option_id := v_option_id;
        end if;
        v_option_position := v_option_position + 1;
      end loop;

      if v_correct_count <> 1 then
        raise exception 'each single-choice question must have exactly one correct option';
      end if;

      insert into public.question_answer_keys (question_id, correct_option_id)
      values (v_question_id, v_correct_option_id);
    end if;

    v_position := v_position + 1;
  end loop;

  return v_exam_id;
end;
$$;
revoke all on function public.admin_create_exam(jsonb) from public;
grant execute on function public.admin_create_exam(jsonb) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.answers enable row level security;
alter table public.proctor_events enable row level security;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy exams_select on public.exams
  for select to authenticated
  using (
    status = 'published'::public.exam_status
    or private.is_admin()
    or exists (
      select 1 from public.exam_attempts a
      where a.exam_id = exams.id and a.user_id = (select auth.uid())
    )
  );
create policy exams_admin_insert on public.exams
  for insert to authenticated
  with check (private.is_admin() and created_by = (select auth.uid()));
create policy exams_admin_update on public.exams
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy exams_admin_delete on public.exams
  for delete to authenticated
  using (private.is_admin());

create policy questions_select on public.questions
  for select to authenticated
  using (
    private.is_admin() or exists (
      select 1 from public.exam_attempts a
      where a.exam_id = questions.exam_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );
create policy questions_admin_all on public.questions
  for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy options_select on public.question_options
  for select to authenticated
  using (
    private.is_admin() or exists (
      select 1
      from public.questions q
      join public.exam_attempts a on a.exam_id = q.exam_id
      where q.id = question_options.question_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );
create policy options_admin_all on public.question_options
  for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy answer_keys_admin_only on public.question_answer_keys
  for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy attempts_select_own_or_admin on public.exam_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
create policy attempts_insert_own on public.exam_attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy attempts_admin_update on public.exam_attempts
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy answers_select_own_or_admin on public.answers
  for select to authenticated
  using (
    private.is_admin() or exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id and a.user_id = (select auth.uid())
    )
  );
create policy answers_insert_own_active_or_admin on public.answers
  for insert to authenticated
  with check (
    private.is_admin() or exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );
create policy answers_update_own_active_or_admin on public.answers
  for update to authenticated
  using (
    private.is_admin() or exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  )
  with check (
    private.is_admin() or exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );

create policy proctor_select_own_or_admin on public.proctor_events
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
create policy proctor_insert_own_active on public.proctor_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.exam_attempts a
      where a.id = proctor_events.attempt_id
        and a.user_id = (select auth.uid())
        and a.status = 'in_progress'::public.attempt_status
        and now() <= a.expires_at + interval '30 seconds'
    )
  );

-- Explicit grants are required on new Supabase projects when Data API auto-exposure is disabled.
grant select on public.profiles, public.exams, public.questions, public.question_options,
  public.question_answer_keys, public.exam_attempts, public.answers, public.proctor_events to authenticated;
grant insert on public.exams, public.questions, public.question_options, public.question_answer_keys,
  public.exam_attempts, public.answers, public.proctor_events to authenticated;
grant update on public.profiles, public.exams, public.questions, public.question_options,
  public.question_answer_keys, public.exam_attempts, public.answers to authenticated;
grant delete on public.exams, public.questions, public.question_options, public.question_answer_keys to authenticated;
grant usage, select on sequence public.proctor_events_id_seq to authenticated;

-- No table grants are given to anon.

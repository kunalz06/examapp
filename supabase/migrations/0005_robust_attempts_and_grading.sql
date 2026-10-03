-- Robust autosave, atomic final submission, grading RPC, and grade visibility.

create or replace function private.save_attempt_answer_internal(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid default null,
  p_text_answer text default null
)
returns public.answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_question public.questions%rowtype;
  v_answer public.answers%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.is_provisioned_student() then
    raise exception 'student account is not provisioned' using errcode = '42501';
  end if;

  select * into v_attempt
  from public.exam_attempts
  where id = p_attempt_id and user_id = (select auth.uid());

  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;
  if v_attempt.status <> 'in_progress'::public.attempt_status then
    raise exception 'attempt is not active' using errcode = '55000';
  end if;
  if now() > v_attempt.expires_at + interval '2 minutes' then
    raise exception 'answer window is closed' using errcode = '55000';
  end if;

  select * into v_question
  from public.questions
  where id = p_question_id and exam_id = v_attempt.exam_id;
  if not found then raise exception 'question does not belong to this exam' using errcode = '22023'; end if;

  if v_question.type = 'single_choice'::public.question_type then
    if p_selected_option_id is not null and not exists (
      select 1 from public.question_options o
      where o.id = p_selected_option_id and o.question_id = p_question_id
    ) then
      raise exception 'option does not belong to question' using errcode = '22023';
    end if;

    insert into public.answers (attempt_id, question_id, selected_option_id, text_answer)
    values (p_attempt_id, p_question_id, p_selected_option_id, null)
    on conflict (attempt_id, question_id)
    do update set selected_option_id = excluded.selected_option_id, text_answer = null, updated_at = now()
    returning * into v_answer;
  else
    insert into public.answers (attempt_id, question_id, selected_option_id, text_answer)
    values (p_attempt_id, p_question_id, null, left(coalesce(p_text_answer, ''), 20000))
    on conflict (attempt_id, question_id)
    do update set selected_option_id = null, text_answer = excluded.text_answer, updated_at = now()
    returning * into v_answer;
  end if;

  return v_answer;
end;
$$;
revoke all on function private.save_attempt_answer_internal(uuid, uuid, uuid, text) from public;
grant execute on function private.save_attempt_answer_internal(uuid, uuid, uuid, text) to authenticated;

create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid default null,
  p_text_answer text default null
)
returns public.answers
language sql
security invoker
set search_path = ''
as $$
  select (private.save_attempt_answer_internal(p_attempt_id, p_question_id, p_selected_option_id, p_text_answer)).*;
$$;
revoke all on function public.save_attempt_answer(uuid, uuid, uuid, text) from public;
grant execute on function public.save_attempt_answer(uuid, uuid, uuid, text) to authenticated;

create or replace function private.submit_attempt_internal(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not private.is_provisioned_student() then raise exception 'student account is not provisioned' using errcode = '42501'; end if;

  select * into v_attempt
  from public.exam_attempts
  where id = p_attempt_id and user_id = (select auth.uid())
  for update;

  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;
  if v_attempt.status <> 'in_progress'::public.attempt_status then return v_attempt; end if;

  update public.exam_attempts
  set status = 'submitted'::public.attempt_status
  where id = p_attempt_id
  returning * into v_attempt;

  return v_attempt;
end;
$$;
revoke all on function private.submit_attempt_internal(uuid) from public;
grant execute on function private.submit_attempt_internal(uuid) to authenticated;

create or replace function private.finalize_attempt_internal(p_attempt_id uuid, p_answers jsonb default '[]'::jsonb)
returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_item jsonb;
  v_question_id uuid;
  v_selected_option_id uuid;
  v_text_answer text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not private.is_provisioned_student() then raise exception 'student account is not provisioned' using errcode = '42501'; end if;

  select * into v_attempt
  from public.exam_attempts
  where id = p_attempt_id and user_id = (select auth.uid())
  for update;

  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;
  if v_attempt.status <> 'in_progress'::public.attempt_status then return v_attempt; end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'answers must be an array' using errcode = '22023';
  end if;

  if now() <= v_attempt.expires_at + interval '2 minutes' then
    for v_item in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_question_id := nullif(v_item ->> 'questionId', '')::uuid;
      v_selected_option_id := nullif(v_item ->> 'selectedOptionId', '')::uuid;
      v_text_answer := v_item ->> 'text';
      if v_question_id is not null then
        perform private.save_attempt_answer_internal(p_attempt_id, v_question_id, v_selected_option_id, v_text_answer);
      end if;
    end loop;
  end if;

  update public.exam_attempts
  set status = 'submitted'::public.attempt_status
  where id = p_attempt_id
  returning * into v_attempt;

  return v_attempt;
end;
$$;
revoke all on function private.finalize_attempt_internal(uuid, jsonb) from public;
grant execute on function private.finalize_attempt_internal(uuid, jsonb) to authenticated;

create or replace function public.finalize_attempt(p_attempt_id uuid, p_answers jsonb default '[]'::jsonb)
returns public.exam_attempts
language sql
security invoker
set search_path = ''
as $$
  select (private.finalize_attempt_internal(p_attempt_id, p_answers)).*;
$$;
revoke all on function public.finalize_attempt(uuid, jsonb) from public;
grant execute on function public.finalize_attempt(uuid, jsonb) to authenticated;

create or replace function public.admin_grade_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_score numeric,
  p_feedback text default ''
)
returns public.answers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_question public.questions%rowtype;
  v_answer public.answers%rowtype;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;
  if v_attempt.status not in ('submitted'::public.attempt_status, 'graded'::public.attempt_status) then
    raise exception 'only submitted attempts can be graded' using errcode = '55000';
  end if;

  select * into v_question
  from public.questions
  where id = p_question_id and exam_id = v_attempt.exam_id;
  if not found or v_question.type <> 'short_text'::public.question_type then
    raise exception 'question is not manually gradable' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > v_question.points then
    raise exception 'score is outside question point range' using errcode = '22023';
  end if;

  insert into public.answers (
    attempt_id, question_id, selected_option_id, text_answer,
    manual_score, grader_feedback, graded_by, graded_at
  )
  values (
    p_attempt_id, p_question_id, null, null,
    p_score, left(coalesce(p_feedback, ''), 5000), (select auth.uid()), now()
  )
  on conflict (attempt_id, question_id)
  do update set
    manual_score = excluded.manual_score,
    grader_feedback = excluded.grader_feedback,
    graded_by = excluded.graded_by,
    graded_at = excluded.graded_at,
    updated_at = now()
  returning * into v_answer;

  return v_answer;
end;
$$;
revoke all on function public.admin_grade_answer(uuid, uuid, numeric, text) from public;
grant execute on function public.admin_grade_answer(uuid, uuid, numeric, text) to authenticated;

create or replace function private.get_attempt_grade_internal(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_attempt
  from public.exam_attempts
  where id = p_attempt_id and user_id = (select auth.uid());
  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'attemptId', v_attempt.id,
    'status', v_attempt.status,
    'autoScore', v_attempt.auto_score,
    'manualScore', v_attempt.manual_score,
    'maxScore', v_attempt.max_score,
    'submittedAt', v_attempt.submitted_at,
    'requiresManualGrading', v_attempt.requires_manual_grading,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'questionId', q.id,
          'prompt', q.prompt,
          'type', q.type,
          'points', q.points,
          'selectedLabel', selected.label,
          'textAnswer', ans.text_answer,
          'score', case
            when q.type = 'single_choice'::public.question_type then
              case when ans.selected_option_id is not null and ans.selected_option_id = k.correct_option_id
                   then q.points else 0 end
            else ans.manual_score
          end,
          'feedback', ans.grader_feedback,
          'gradedAt', ans.graded_at
        )
        order by q.position
      )
      from public.questions q
      left join public.answers ans on ans.attempt_id = v_attempt.id and ans.question_id = q.id
      left join public.question_options selected on selected.id = ans.selected_option_id
      left join public.question_answer_keys k on k.question_id = q.id
      where q.exam_id = v_attempt.exam_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function private.get_attempt_grade_internal(uuid) from public;
grant execute on function private.get_attempt_grade_internal(uuid) to authenticated;

create or replace function public.get_attempt_grade(p_attempt_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_attempt_grade_internal(p_attempt_id);
$$;
revoke all on function public.get_attempt_grade(uuid) from public;
grant execute on function public.get_attempt_grade(uuid) to authenticated;

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
          and now() <= a.expires_at + interval '2 minutes'
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
          and now() <= a.expires_at + interval '2 minutes'
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
          and now() <= a.expires_at + interval '2 minutes'
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
          and now() <= a.expires_at + interval '2 minutes'
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
          and now() <= a.expires_at + interval '2 minutes'
      )
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
        and now() <= a.expires_at + interval '2 minutes'
    )
  );

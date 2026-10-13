-- Secure, atomic exam/question editor. Editing is frozen after any student
-- attempt to preserve published answer keys, grading, and evidence.
-- The trigger coordinates concurrent attempt starts with editor saves.

create or replace function private.lock_exam_on_attempt_start()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.exams where id = new.exam_id for share;
  if not found then raise exception 'exam not found' using errcode = 'P0002'; end if;
  return new;
end;
$$;
revoke all on function private.lock_exam_on_attempt_start() from public;

drop trigger if exists a_lock_exam_on_attempt_start on public.exam_attempts;
create trigger a_lock_exam_on_attempt_start
  before insert on public.exam_attempts
  for each row execute function private.lock_exam_on_attempt_start();

create or replace function private.admin_update_exam_internal(p_exam_id uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_exam public.exams%rowtype;
  v_title text;
  v_description text;
  v_duration integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_expected timestamptz;
  v_questions jsonb;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_id uuid;
  v_position integer := 0;
  v_option_position integer;
  v_correct_count integer;
  v_answer boolean;
  v_prompt text;
  v_type text;
  v_guidance text;
  v_points numeric;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'administrator access required' using errcode='42501';
  end if;

  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then raise exception 'exam not found' using errcode='P0002'; end if;

  -- A currently-running attempt also acquires a share lock on this row first,
  -- so the check below is safe from a concurrent start.
  if exists(select 1 from public.exam_attempts where exam_id=p_exam_id) then
    raise exception 'This exam already has student attempts and cannot be edited. Create a new exam version to preserve scores.' using errcode='55000';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'questions') is distinct from 'array'
    or jsonb_array_length(p_payload->'questions') not between 1 and 200 then
    raise exception 'An exam requires 1 to 200 questions' using errcode='22023';
  end if;

  if jsonb_typeof(p_payload->'title') is distinct from 'string'
    or jsonb_typeof(p_payload->'description') is distinct from 'string'
    or jsonb_typeof(p_payload->'duration_minutes') is distinct from 'number'
    or jsonb_typeof(p_payload->'expected_updated_at') is distinct from 'string' then
    raise exception 'Missing or invalid exam fields' using errcode='22023';
  end if;

  v_expected := (p_payload->>'expected_updated_at')::timestamptz;
  if v_expected is distinct from v_exam.updated_at then
    raise exception 'The exam was changed in another session. Reload it before saving.' using errcode='40001';
  end if;

  v_title := trim(p_payload->>'title');
  v_description := p_payload->>'description';
  if char_length(v_title) not between 3 and 160 or char_length(v_description)>10000 then
    raise exception 'Invalid exam title or description length' using errcode='22023';
  end if;

  v_duration := (p_payload->>'duration_minutes')::integer;
  if v_duration not between 1 and 600 then
    raise exception 'Duration must be between 1 and 600 minutes' using errcode='22023';
  end if;

  v_starts_at := nullif(p_payload->>'starts_at','')::timestamptz;
  v_ends_at := nullif(p_payload->>'ends_at','')::timestamptz;
  if v_ends_at is not null and v_starts_at is not null and v_ends_at <= v_starts_at then
    raise exception 'Exam end must follow its start' using errcode='22023';
  end if;

  -- Existing slot bookings/slots must remain valid. No silent schedule breakage.
  if exists (
    select 1 from public.exam_slots s
    where s.exam_id = p_exam_id
      and (
        (s.ends_at - s.starts_at) < make_interval(mins => v_duration)
        or (v_starts_at is not null and s.starts_at < v_starts_at)
        or (v_ends_at is not null and s.ends_at > v_ends_at)
      )
  ) then
    raise exception 'Existing exam slots conflict with the new duration or window. Keep the slots valid before saving.' using errcode='55000';
  end if;

  v_questions := p_payload->'questions';
  for v_question in select value from jsonb_array_elements(v_questions)
  loop
    if jsonb_typeof(v_question) is distinct from 'object'
      or jsonb_typeof(v_question->'prompt') is distinct from 'string'
      or jsonb_typeof(v_question->'points') is distinct from 'number'
      or jsonb_typeof(v_question->'type') is distinct from 'string' then
      raise exception 'Every question requires a prompt, type, and numeric points' using errcode='22023';
    end if;

    v_prompt := trim(v_question->>'prompt');
    v_type := v_question->>'type';
    v_points := (v_question->>'points')::numeric;
    if char_length(v_prompt) not between 1 and 5000
      or v_points <= 0 or v_points > 1000
      or v_type not in ('single_choice','short_text') then
      raise exception 'Invalid question prompt, marks, or type' using errcode='22023';
    end if;

    if v_question ? 'guidance' and jsonb_typeof(v_question->'guidance') not in ('string','null') then
      raise exception 'Evaluator guidance must be text' using errcode='22023';
    end if;
    v_guidance := nullif(trim(coalesce(v_question->>'guidance','')),'');
    if char_length(coalesce(v_guidance,'')) > 30000 then
      raise exception 'Evaluator guidance exceeds 30,000 characters' using errcode='22023';
    end if;

    if v_type = 'single_choice' then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
        or jsonb_array_length(v_question->'options') not between 2 and 20 then
        raise exception 'Each multiple-choice question requires 2 to 20 options' using errcode='22023';
      end if;

      v_correct_count := 0;
      for v_option in select value from jsonb_array_elements(v_question->'options')
      loop
        if jsonb_typeof(v_option->'label') is distinct from 'string'
          or jsonb_typeof(v_option->'is_correct') is distinct from 'boolean'
          or char_length(trim(v_option->>'label')) not between 1 and 2000 then
          raise exception 'Every option requires a label and a true/false correct flag' using errcode='22023';
        end if;

        if (v_option->>'is_correct')::boolean then
          v_correct_count := v_correct_count + 1;
        end if;
      end loop;

      if v_correct_count <> 1 then
        raise exception 'Each multiple-choice question must have exactly one correct option' using errcode='22023';
      end if;
    end if;
  end loop;

  -- Everything below runs in the same transaction. Failed inserts roll back the
  -- metadata update and the entire original question bank automatically.
  update public.exams
  set title=v_title,
      description=v_description,
      duration_minutes=v_duration,
      starts_at=v_starts_at,
      ends_at=v_ends_at,
      updated_at=clock_timestamp()
  where id=p_exam_id;

  delete from public.questions where exam_id=p_exam_id;

  for v_question in select value from jsonb_array_elements(v_questions)
  loop
    insert into public.questions (exam_id,prompt,type,points,position)
    values (p_exam_id,trim(v_question->>'prompt'),(v_question->>'type')::public.question_type,
      (v_question->>'points')::numeric,v_position)
    returning id into v_question_id;

    if v_question->>'type' = 'single_choice' then
      v_correct_id := null;
      v_option_position := 0;
      for v_option in select value from jsonb_array_elements(v_question->'options')
      loop
        insert into public.question_options(question_id,label,position)
        values (v_question_id,trim(v_option->>'label'),v_option_position)
        returning id into v_option_id;
        if (v_option->>'is_correct')::boolean then v_correct_id := v_option_id; end if;
        v_option_position := v_option_position+1;
      end loop;
      insert into public.question_answer_keys(question_id,correct_option_id)
      values (v_question_id,v_correct_id);
    end if;

    v_guidance := nullif(trim(coalesce(v_question->>'guidance','')),'');
    if v_guidance is not null then
      insert into private.question_evaluator_guidance(question_id,guidance)
      values (v_question_id,v_guidance);
    end if;
    v_position := v_position+1;
  end loop;

  return jsonb_build_object('examId',p_exam_id,'questionCount',v_position,
    'updatedAt',(select updated_at from public.exams where id=p_exam_id));
end;
$$;

revoke all on function private.admin_update_exam_internal(uuid,jsonb) from public,anon;
grant execute on function private.admin_update_exam_internal(uuid,jsonb) to authenticated;

create or replace function public.admin_update_exam(p_exam_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.admin_update_exam_internal(p_exam_id,p_payload);
$$;
revoke all on function public.admin_update_exam(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_exam(uuid,jsonb) to authenticated;
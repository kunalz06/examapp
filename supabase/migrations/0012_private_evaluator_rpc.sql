-- Keep the API-facing function invoker scoped; delegate the privileged read
-- to a private function with an explicit authenticated-admin check.
create or replace function private.admin_get_question_guidance_internal(p_exam_id uuid)
returns table(question_id uuid, guidance text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  return query
    select g.question_id, g.guidance
    from private.question_evaluator_guidance g
    join public.questions q on q.id = g.question_id
    where q.exam_id = p_exam_id
    order by q.position;
end;
$$;

revoke all on function private.admin_get_question_guidance_internal(uuid) from public, anon;
grant execute on function private.admin_get_question_guidance_internal(uuid) to authenticated;

create or replace function public.admin_get_question_guidance(p_exam_id uuid)
returns table(question_id uuid, guidance text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_get_question_guidance_internal(p_exam_id);
$$;

revoke all on function public.admin_get_question_guidance(uuid) from public, anon;
grant execute on function public.admin_get_question_guidance(uuid) to authenticated;
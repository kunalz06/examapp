-- Keep source-provided explanations and suggested written answers restricted to administrators.
create table if not exists private.question_evaluator_guidance (
  question_id uuid primary key references public.questions(id) on delete cascade,
  guidance text not null check (char_length(guidance) between 1 and 30000)
);
revoke all on table private.question_evaluator_guidance from public, anon, authenticated;

create or replace function public.admin_get_question_guidance(p_exam_id uuid)
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
revoke all on function public.admin_get_question_guidance(uuid) from public, anon;
grant execute on function public.admin_get_question_guidance(uuid) to authenticated;
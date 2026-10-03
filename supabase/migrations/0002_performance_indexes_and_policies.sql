-- Supabase advisor follow-up: covering indexes and non-overlapping RLS policies.

create index if not exists idx_answers_question on public.answers(question_id);
create index if not exists idx_answers_selected_option on public.answers(selected_option_id);
create index if not exists idx_answers_graded_by on public.answers(graded_by);
create index if not exists idx_exams_created_by on public.exams(created_by);
create index if not exists idx_proctor_user on public.proctor_events(user_id);
create index if not exists idx_answer_keys_correct_option on public.question_answer_keys(correct_option_id);

drop policy if exists questions_admin_all on public.questions;
create policy questions_admin_insert on public.questions
  for insert to authenticated
  with check (private.is_admin());
create policy questions_admin_update on public.questions
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy questions_admin_delete on public.questions
  for delete to authenticated
  using (private.is_admin());

drop policy if exists options_admin_all on public.question_options;
create policy options_admin_insert on public.question_options
  for insert to authenticated
  with check (private.is_admin());
create policy options_admin_update on public.question_options
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy options_admin_delete on public.question_options
  for delete to authenticated
  using (private.is_admin());

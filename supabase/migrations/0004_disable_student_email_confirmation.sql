-- Existing student accounts are marked confirmed.
-- New students are created through the admin-only Edge Function with email_confirm = true.

update auth.users u
set email_confirmed_at = coalesce(u.email_confirmed_at, now())
where exists (
  select 1
  from public.profiles p
  where p.id = u.id
    and p.role = 'student'::public.app_role
);

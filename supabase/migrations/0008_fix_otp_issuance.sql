-- Fix OTP issuance under an empty search_path and refresh the Data API schema cache.

create or replace function public.issue_student_email_otp(
  p_user_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_latest timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
  v_id uuid;
begin
  if p_code !~ '^[0-9]{5}$' then
    raise exception 'OTP must be exactly 5 digits' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into v_profile
  from public.profiles
  where id = p_user_id;

  if not found
     or v_profile.role <> 'student'::public.app_role
     or not v_profile.provisioned then
    raise exception 'student account not found' using errcode = 'P0002';
  end if;

  if v_profile.email_verified then
    return jsonb_build_object('ok', true, 'alreadyVerified', true);
  end if;

  select max(sent_at), count(*), min(sent_at)
    into v_latest, v_count, v_oldest
  from private.email_verification_challenges
  where user_id = p_user_id
    and sent_at > now() - interval '5 minutes';

  if v_latest is not null
     and v_latest > now() - interval '150 seconds' then
    v_retry := greatest(
      1,
      ceil(extract(epoch from ((v_latest + interval '150 seconds') - now())))::integer
    );
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'retryAfter', v_retry);
  end if;

  if v_count >= 2 then
    v_retry := greatest(
      1,
      ceil(extract(epoch from ((v_oldest + interval '5 minutes') - now())))::integer
    );
    return jsonb_build_object('ok', false, 'reason', 'rate_limit', 'retryAfter', v_retry);
  end if;

  update private.email_verification_challenges
  set used_at = coalesce(used_at, now())
  where user_id = p_user_id
    and used_at is null;

  insert into private.email_verification_challenges (
    user_id, code_hash, sent_at, expires_at
  )
  values (
    p_user_id,
    extensions.crypt(p_code, extensions.gen_salt('bf', 8)),
    now(),
    now() + interval '5 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'challengeId', v_id,
    'expiresIn', 300,
    'retryAfter', 150
  );
end;
$$;

revoke all on function public.issue_student_email_otp(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_student_email_otp(uuid, text) to service_role;

create or replace function private.verify_student_email_otp_internal(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_challenge private.email_verification_challenges%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_code !~ '^[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select * into v_profile
  from public.profiles
  where id = v_uid;

  if not found
     or v_profile.role <> 'student'::public.app_role
     or not v_profile.provisioned then
    raise exception 'student access required' using errcode = '42501';
  end if;

  if v_profile.email_verified then
    return jsonb_build_object('ok', true, 'alreadyVerified', true);
  end if;

  select * into v_challenge
  from private.email_verification_challenges
  where user_id = v_uid
    and used_at is null
  order by sent_at desc
  limit 1
  for update;

  if not found or v_challenge.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_challenge.attempts_used >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  update private.email_verification_challenges
  set attempts_used = attempts_used + 1
  where id = v_challenge.id;

  if extensions.crypt(p_code, v_challenge.code_hash) <> v_challenge.code_hash then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid',
      'attemptsRemaining', greatest(0, 4 - v_challenge.attempts_used)
    );
  end if;

  update private.email_verification_challenges
  set used_at = now()
  where user_id = v_uid
    and used_at is null;

  update public.profiles
  set email_verified = true,
      email_verified_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.verify_student_email_otp_internal(text) from public;
grant execute on function private.verify_student_email_otp_internal(text) to authenticated;

notify pgrst, 'reload schema';

-- Custom 5-digit student verification and password-change rate controls.
-- Gmail SMTP credentials are stored separately in Supabase Vault; no credential is committed here.

alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz;

update public.profiles
set email_verified = true,
    email_verified_at = coalesce(email_verified_at, now())
where role = 'admin'::public.app_role
   or (role = 'student'::public.app_role and provisioned = true and email_verified = false);

create table if not exists private.email_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts_used integer not null default 0 check (attempts_used between 0 and 10),
  used_at timestamptz
);
create index if not exists idx_email_verification_challenges_user_sent on private.email_verification_challenges(user_id, sent_at desc);

create table if not exists private.password_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_password_change_events_user_time on private.password_change_events(user_id, reserved_at desc);

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id,email,display_name,role,provisioned,email_verified,email_verified_at)
  values (new.id,new.email,coalesce(new.raw_user_meta_data ->> 'display_name',split_part(coalesce(new.email,'student'),'@',1)),
    'student'::public.app_role,false,false,null);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create or replace function private.is_provisioned_student()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role='student'::public.app_role
      and p.provisioned=true
      and p.email_verified=true
  );
$$;
revoke all on function private.is_provisioned_student() from public;
grant execute on function private.is_provisioned_student() to authenticated;

create or replace function public.issue_student_email_otp(p_user_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_latest timestamptz; v_count integer; v_oldest timestamptz; v_retry integer; v_id uuid;
begin
  if p_code !~ '^[0-9]{5}$' then raise exception 'OTP must be exactly 5 digits' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into v_profile from public.profiles where id=p_user_id;
  if not found or v_profile.role<>'student'::public.app_role or not v_profile.provisioned then raise exception 'student account not found' using errcode='P0002'; end if;
  if v_profile.email_verified then return jsonb_build_object('ok',true,'alreadyVerified',true); end if;

  select max(sent_at),count(*),min(sent_at) into v_latest,v_count,v_oldest
  from private.email_verification_challenges
  where user_id=p_user_id and sent_at>now()-interval '5 minutes';

  if v_latest is not null and v_latest>now()-interval '150 seconds' then
    v_retry:=greatest(1,ceil(extract(epoch from ((v_latest+interval '150 seconds')-now())))::integer);
    return jsonb_build_object('ok',false,'reason','cooldown','retryAfter',v_retry);
  end if;
  if v_count>=2 then
    v_retry:=greatest(1,ceil(extract(epoch from ((v_oldest+interval '5 minutes')-now())))::integer);
    return jsonb_build_object('ok',false,'reason','rate_limit','retryAfter',v_retry);
  end if;

  update private.email_verification_challenges set used_at=coalesce(used_at,now()) where user_id=p_user_id and used_at is null;
  insert into private.email_verification_challenges(user_id,code_hash,sent_at,expires_at)
  values(p_user_id,crypt(p_code,gen_salt('bf',8)),now(),now()+interval '5 minutes') returning id into v_id;

  return jsonb_build_object('ok',true,'challengeId',v_id,'expiresIn',300,'retryAfter',150);
end;
$$;
revoke all on function public.issue_student_email_otp(uuid,text) from public,anon,authenticated;
grant execute on function public.issue_student_email_otp(uuid,text) to service_role;

create or replace function public.cancel_student_email_otp(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$ begin delete from private.email_verification_challenges where id=p_challenge_id and used_at is null; end; $$;
revoke all on function public.cancel_student_email_otp(uuid) from public,anon,authenticated;
grant execute on function public.cancel_student_email_otp(uuid) to service_role;

create or replace function public.verify_student_email_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=(select auth.uid()); v_profile public.profiles%rowtype; v_challenge private.email_verification_challenges%rowtype;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_code !~ '^[0-9]{5}$' then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  select * into v_profile from public.profiles where id=v_uid;
  if not found or v_profile.role<>'student'::public.app_role or not v_profile.provisioned then raise exception 'student access required' using errcode='42501'; end if;
  if v_profile.email_verified then return jsonb_build_object('ok',true,'alreadyVerified',true); end if;

  select * into v_challenge from private.email_verification_challenges
  where user_id=v_uid and used_at is null order by sent_at desc limit 1 for update;

  if not found or v_challenge.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired'); end if;
  if v_challenge.attempts_used>=5 then return jsonb_build_object('ok',false,'reason','locked'); end if;
  update private.email_verification_challenges set attempts_used=attempts_used+1 where id=v_challenge.id;

  if crypt(p_code,v_challenge.code_hash)<>v_challenge.code_hash then
    return jsonb_build_object('ok',false,'reason','invalid','attemptsRemaining',greatest(0,4-v_challenge.attempts_used));
  end if;

  update private.email_verification_challenges set used_at=now() where user_id=v_uid and used_at is null;
  update public.profiles set email_verified=true,email_verified_at=now() where id=v_uid;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.verify_student_email_otp(text) from public,anon;
grant execute on function public.verify_student_email_otp(text) to authenticated;

create or replace function public.get_student_email_verification_status()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=(select auth.uid()); v_profile public.profiles%rowtype; v_latest timestamptz; v_count integer; v_oldest timestamptz; v_retry integer:=0;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid;
  if not found or v_profile.role<>'student'::public.app_role or not v_profile.provisioned then raise exception 'student access required' using errcode='42501'; end if;
  if v_profile.email_verified then return jsonb_build_object('verified',true,'retryAfter',0,'sendsInWindow',0); end if;

  select max(sent_at),count(*),min(sent_at) into v_latest,v_count,v_oldest
  from private.email_verification_challenges where user_id=v_uid and sent_at>now()-interval '5 minutes';

  if v_latest is not null and v_latest>now()-interval '150 seconds' then
    v_retry:=greatest(1,ceil(extract(epoch from ((v_latest+interval '150 seconds')-now())))::integer);
  elsif v_count>=2 and v_oldest is not null then
    v_retry:=greatest(1,ceil(extract(epoch from ((v_oldest+interval '5 minutes')-now())))::integer);
  end if;
  return jsonb_build_object('verified',false,'retryAfter',v_retry,'sendsInWindow',v_count);
end;
$$;
revoke all on function public.get_student_email_verification_status() from public,anon;
grant execute on function public.get_student_email_verification_status() to authenticated;

create or replace function public.get_smtp_runtime_config()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user text; v_pass text;
begin
  select decrypted_secret into v_user from vault.decrypted_secrets where name='examapp_smtp_username';
  select decrypted_secret into v_pass from vault.decrypted_secrets where name='examapp_smtp_password';
  if v_user is null or v_pass is null then raise exception 'SMTP credentials are not configured'; end if;
  return jsonb_build_object('host','smtp.gmail.com','port',465,'secure',true,'username',v_user,'password',v_pass,'from',v_user);
end;
$$;
revoke all on function public.get_smtp_runtime_config() from public,anon,authenticated;
grant execute on function public.get_smtp_runtime_config() to service_role;

create or replace function private.reserve_student_password_change_internal()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=(select auth.uid()); v_count integer; v_oldest_completed timestamptz; v_id uuid; v_retry integer:=0;
begin
  if v_uid is null or not private.is_provisioned_student() then raise exception 'verified student access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  delete from private.password_change_events where user_id=v_uid and completed_at is null and reserved_at<=now()-interval '10 minutes';

  select count(*),min(completed_at) into v_count,v_oldest_completed
  from private.password_change_events
  where user_id=v_uid and (
    (completed_at is not null and completed_at>now()-interval '12 hours')
    or (completed_at is null and reserved_at>now()-interval '10 minutes')
  );

  if v_count>=2 then
    if v_oldest_completed is not null then
      v_retry:=greatest(1,ceil(extract(epoch from ((v_oldest_completed+interval '12 hours')-now())))::integer);
    else v_retry:=600;
    end if;
    return jsonb_build_object('ok',false,'retryAfter',v_retry);
  end if;

  insert into private.password_change_events(user_id) values(v_uid) returning id into v_id;
  return jsonb_build_object('ok',true,'reservationId',v_id);
end;
$$;
revoke all on function private.reserve_student_password_change_internal() from public;
grant execute on function private.reserve_student_password_change_internal() to authenticated;

create or replace function public.reserve_student_password_change()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.reserve_student_password_change_internal(); $$;
revoke all on function public.reserve_student_password_change() from public,anon;
grant execute on function public.reserve_student_password_change() to authenticated;

create or replace function private.finish_student_password_change_internal(p_reservation_id uuid,p_success boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_success then
    update private.password_change_events set completed_at=now()
    where id=p_reservation_id and user_id=v_uid and completed_at is null;
  else
    delete from private.password_change_events
    where id=p_reservation_id and user_id=v_uid and completed_at is null;
  end if;
end;
$$;
revoke all on function private.finish_student_password_change_internal(uuid,boolean) from public;
grant execute on function private.finish_student_password_change_internal(uuid,boolean) to authenticated;

create or replace function public.finish_student_password_change(p_reservation_id uuid,p_success boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.finish_student_password_change_internal(p_reservation_id,p_success); $$;
revoke all on function public.finish_student_password_change(uuid,boolean) from public,anon;
grant execute on function public.finish_student_password_change(uuid,boolean) to authenticated;

-- PROPOSAL. NOT APPLIED. Needs backend-team approval before anyone runs it on a real project.
--
-- Push notifications for the pickup workflow. This file only prepares the database side:
--   1. push_tokens   where each phone's Expo push token is kept (nobody can read it from the app)
--   2. push_outbox   a queue of "tell this person X" rows, written by triggers
--   3. triggers      queue a message when a request is made, accepted, or the pickup moves on
--
-- Sending is done by the Edge Function in send-pickup-push.index.ts.txt, which reads the queue.
-- Without it, rows just wait in the queue and nothing reaches any phone.
--
-- Apply AFTER: schema.sql, pickup_workflow.sql, pickup_journeys.sql, pickup_broadcast.sql
-- (it uses backup_requests.recipient_user_id from pickup_broadcast.sql). Safe to run twice.
--
-- Privacy: the text is deliberately generic. No child name, no school, no place, no collector name
-- on a lock screen. The app shows the details after the person opens it and signs in.

-- ---------------------------------------------------------------------------------------------
-- 1. Tokens
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
-- No policy and no grant: the app can never read or write this table directly, only through the two functions below.
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.register_push_token(new_token text, new_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if new_platform is null or new_platform not in ('ios', 'android') then
    raise exception 'Unknown platform';
  end if;
  if new_token is null or new_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid push token';
  end if;

  -- A phone that is handed to someone else logs in as them: the token moves to the newest account.
  insert into public.push_tokens (user_id, token, platform)
  values (uid, new_token, new_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();

  -- Keep at most 5 phones per person (the most recently used).
  delete from public.push_tokens
  where user_id = uid
    and id not in (select id from public.push_tokens where user_id = uid order by updated_at desc, id limit 5);
end;
$$;

create or replace function public.unregister_push_token(old_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.push_tokens where token = old_token and user_id = uid;
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Queue (read and written only by the server)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('backup_requested', 'backup_accepted', 'journey_started', 'journey_at_school', 'journey_collected')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists push_outbox_unsent_idx on public.push_outbox (created_at) where sent_at is null;

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

create or replace function public.queue_push(target uuid, push_kind text, push_title text, push_body text, push_data jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.push_outbox (user_id, kind, title, body, data)
  select target, push_kind, push_title, push_body, push_data
  where target is not null;
$$;
-- Only the triggers below (and the database owner) may queue a message. Nobody can call this from the app.
revoke all on function public.queue_push(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------------------------

-- A request was made: tell the person who is being asked (never the parent who asked).
create or replace function public.push_on_backup_requested()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid;
begin
  if new.state <> 'requested' then
    return new;
  end if;
  who := coalesce(
    new.recipient_user_id,
    (select h.user_id from public.trusted_helpers h where h.id = new.helper_id)
  );
  if who is null or who = new.requested_by then
    return new;
  end if;
  perform public.queue_push(who, 'backup_requested', 'Backup pickup request',
    'Someone in your family asked for help with a pickup. Open SafeNest to answer.',
    jsonb_build_object('type', 'backup_requested', 'request_id', new.id));
  return new;
end;
$$;

drop trigger if exists push_after_backup_request_insert on public.backup_requests;
create trigger push_after_backup_request_insert
  after insert on public.backup_requests
  for each row execute function public.push_on_backup_requested();

-- Somebody accepted: tell the parent who asked. Declines are not pushed (with a group request they would be noisy).
create or replace function public.push_on_backup_accepted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state = 'accepted' and old.state is distinct from 'accepted' then
    perform public.queue_push(new.requested_by, 'backup_accepted', 'Backup found',
      'Someone accepted. You do not need to collect today. Open SafeNest for details.',
      jsonb_build_object('type', 'backup_accepted', 'request_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists push_after_backup_request_update on public.backup_requests;
create trigger push_after_backup_request_update
  after update of state on public.backup_requests
  for each row execute function public.push_on_backup_accepted();

-- The pickup moved on: tell the family (everyone in it except the collector themselves).
create or replace function public.push_on_journey_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  push_kind text;
  push_title text;
  push_body text;
begin
  if tg_op = 'INSERT' then
    push_kind := 'journey_started'; push_title := 'On the way';
    push_body := 'Your collector has set off. Open SafeNest for details.';
  elsif new.state is distinct from old.state and new.state = 'at_school' then
    push_kind := 'journey_at_school'; push_title := 'At school';
    push_body := 'Your collector has arrived at school. Open SafeNest for details.';
  elsif new.state is distinct from old.state and new.state = 'collected' then
    push_kind := 'journey_collected'; push_title := 'Picked up';
    push_body := 'The pickup is complete. Open SafeNest for details.';
  else
    return new;
  end if;

  perform public.queue_push(m.user_id, push_kind, push_title, push_body,
    jsonb_build_object('type', push_kind, 'journey_id', new.id))
  from public.family_members m
  where m.family_id = new.family_id and m.user_id <> new.collector_user_id;
  return new;
end;
$$;

drop trigger if exists push_after_journey_insert on public.pickup_journeys;
create trigger push_after_journey_insert
  after insert on public.pickup_journeys
  for each row execute function public.push_on_journey_change();

drop trigger if exists push_after_journey_update on public.pickup_journeys;
create trigger push_after_journey_update
  after update of state on public.pickup_journeys
  for each row execute function public.push_on_journey_change();

-- Housekeeping the team may want later (needs pg_cron, so it is not part of this file):
--   delete from public.push_outbox where created_at < now() - interval '7 days';

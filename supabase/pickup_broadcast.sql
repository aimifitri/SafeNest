-- =====================================================
-- SafeNest pickup broadcast  (PROPOSAL - needs backend team approval before it is run anywhere real)
-- Run AFTER schema.sql, pickup_workflow.sql and pickup_journeys.sql. Safe to run more than once.
--
-- Why
--   The original SafeNest flow asks the whole family and Trusted Circle TOGETHER when the parent is
--   predicted to be late and has not answered by 5 minutes before dismissal. The first person to accept
--   covers the pickup and everybody else is closed. pickup_workflow.sql only supports one helper at a time,
--   so this adds "rounds" (a broadcast) on top of it. It is additive: the single-helper functions still work.
--
-- What it changes (everything here needs your approval)
--   * backup_requests: new columns broadcast_id, recipient_user_id, recipient_name, recipient_role,
--     recipient_kind; two new states ('expired', 'closed'); the "one active request per child" index now
--     applies to single-helper requests only (broadcast rows are limited by the broadcast instead).
--   * New tables: backup_broadcasts, pickup_escalation_settings, pickup_status_reports, pickup_escalation_audit.
--   * New / replaced functions (security definer, search_path empty, execute only for authenticated unless noted):
--       start_backup_broadcast, my_broadcast, cancel_backup_broadcast, expire_backup_broadcast,
--       get_auto_escalation, set_auto_escalation, report_pickup_status,
--       respond_backup_request (REPLACED, same name and arguments), my_backup_assignments (REPLACED, same columns),
--       complete_backup_request (REPLACED, same behaviour plus closes the round).
--   * Server side functions for a scheduled check: run_auto_escalation(), expire_due_broadcasts().
--     They are NOT granted to app users. NOTHING in this file schedules them. See the end of the file.
--
-- Rules the database enforces
--   * One open or covered round per child at a time (unique index + child row lock). A second start returns the
--     existing round with created = false, so reopening the app or tapping twice never sends twice.
--   * Everyone asked is a joined, approved person: family members, and Trusted Circle members who are active and
--     have joined. The person asking is excluded. Pending or unjoined members are never asked.
--   * First accept wins. The accept locks the round, closes every other open request in the same statement
--     block, and a later accept fails with "already covered".
--   * Automatic rounds need the parent's explicit opt-in (pickup_escalation_settings.enabled with consented_at),
--     at most one automatic round per child per 12 hours, and never when the parent already said they will collect,
--     a journey is in progress, or the phone's last report is stale or says the parent is on time.
--   * Every important step writes a row to pickup_escalation_audit.
-- =====================================================

-- 1. backup_requests: recipient columns + states ------------------------
alter table public.backup_requests
  add column if not exists broadcast_id uuid,
  add column if not exists recipient_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists recipient_name text,
  add column if not exists recipient_role text,
  add column if not exists recipient_kind text check (recipient_kind in ('family', 'circle'));

alter table public.backup_requests drop constraint if exists backup_requests_state_check;
alter table public.backup_requests
  add constraint backup_requests_state_check
  check (state in ('requested', 'accepted', 'declined', 'cancelled', 'completed', 'expired', 'closed'));

-- Single-helper requests keep "one active per child". Broadcast rows are guarded by the broadcast instead.
drop index if exists public.backup_requests_one_active_per_child;
create unique index if not exists backup_requests_one_active_single_per_child
  on public.backup_requests (child_id)
  where state in ('requested', 'accepted') and broadcast_id is null;
create index if not exists backup_requests_broadcast_idx on public.backup_requests (broadcast_id);
create index if not exists backup_requests_recipient_idx on public.backup_requests (recipient_user_id, state);

-- 2. The round -----------------------------------------------------------
create table if not exists public.backup_broadcasts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  started_by uuid not null references public.profiles (id),
  reason text not null check (reason in ('auto', 'manual', 'again')),
  state text not null default 'open' check (state in ('open', 'covered', 'exhausted', 'cancelled', 'completed')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_request_id uuid,
  closed_at timestamptz,
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade
);
create unique index if not exists backup_broadcasts_one_live_per_child
  on public.backup_broadcasts (child_id) where state in ('open', 'covered');
create index if not exists backup_broadcasts_child_idx on public.backup_broadcasts (child_id, started_at desc);

alter table public.backup_requests drop constraint if exists backup_requests_broadcast_fk;
alter table public.backup_requests
  add constraint backup_requests_broadcast_fk foreign key (broadcast_id) references public.backup_broadcasts (id) on delete cascade;

-- 3. Opt-in, phone report, audit ------------------------------------------
create table if not exists public.pickup_escalation_settings (
  child_id uuid primary key references public.children (id) on delete cascade,
  family_id uuid not null,
  enabled boolean not null default false,
  minutes_before int not null default 5 check (minutes_before between 0 and 60),
  response_window_minutes int not null default 10 check (response_window_minutes between 1 and 60),
  consented_by uuid references public.profiles (id),
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_status_reports (
  child_id uuid primary key references public.children (id) on delete cascade,
  family_id uuid not null,
  reported_by uuid not null references public.profiles (id),
  dismissal_at timestamptz not null,
  predicted_arrival timestamptz,
  parent_response text not null default 'none' check (parent_response in ('none', 'will_collect')),
  reported_at timestamptz not null default now()
);

create table if not exists public.pickup_escalation_audit (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  family_id uuid not null,
  broadcast_id uuid,
  event text not null,
  actor uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists pickup_escalation_audit_child_idx on public.pickup_escalation_audit (child_id, at desc);

alter table public.backup_broadcasts enable row level security;
alter table public.pickup_escalation_settings enable row level security;
alter table public.pickup_status_reports enable row level security;
alter table public.pickup_escalation_audit enable row level security;

revoke insert, update, delete on public.backup_broadcasts from authenticated;
revoke insert, update, delete on public.pickup_escalation_settings from authenticated;
revoke insert, update, delete on public.pickup_status_reports from authenticated;
revoke insert, update, delete on public.pickup_escalation_audit from authenticated;
grant select on public.backup_broadcasts, public.pickup_escalation_settings, public.pickup_status_reports, public.pickup_escalation_audit to authenticated;

drop policy if exists "Members read broadcasts" on public.backup_broadcasts;
create policy "Members read broadcasts" on public.backup_broadcasts for select to authenticated
  using (public.is_family_member(family_id));
drop policy if exists "Members read escalation settings" on public.pickup_escalation_settings;
create policy "Members read escalation settings" on public.pickup_escalation_settings for select to authenticated
  using (public.is_family_member(family_id));
drop policy if exists "Members read status reports" on public.pickup_status_reports;
create policy "Members read status reports" on public.pickup_status_reports for select to authenticated
  using (public.is_family_member(family_id));
drop policy if exists "Members read escalation audit" on public.pickup_escalation_audit;
create policy "Members read escalation audit" on public.pickup_escalation_audit for select to authenticated
  using (public.is_family_member(family_id));

-- A family member may read every row of a round. A recipient who is a family member already can through
-- "Members read requests" (schema.sql); a Trusted Circle member keeps the helper policy from pickup_workflow.sql.

-- Internal: audit line --------------------------------------------------------
create or replace function public.log_escalation(cid uuid, fid uuid, bid uuid, ev text, who uuid, info jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = ''
as $$ insert into public.pickup_escalation_audit (child_id, family_id, broadcast_id, event, actor, detail) values (cid, fid, bid, ev, who, coalesce(info, '{}'::jsonb)); $$;
revoke execute on function public.log_escalation(uuid, uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

-- A legacy single-helper request may not be created while a round is live (no conflicting assignments).
create or replace function public.guard_single_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.broadcast_id is null and exists (
    select 1 from public.backup_broadcasts b where b.child_id = new.child_id and b.state in ('open', 'covered')
  ) then
    raise exception 'A backup request is already active for this child';
  end if;
  return new;
end;
$$;
drop trigger if exists backup_requests_guard_single on public.backup_requests;
create trigger backup_requests_guard_single before insert on public.backup_requests
  for each row execute function public.guard_single_request();

-- 4. Opt-in settings ------------------------------------------------------------
create or replace function public.get_auto_escalation(target_child uuid)
returns table (enabled boolean, minutes_before int, response_window_minutes int, consented_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare fid uuid;
begin
  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then raise exception 'Not allowed'; end if;
  return query
    select s.enabled, s.minutes_before, s.response_window_minutes, s.consented_at
      from public.pickup_escalation_settings s where s.child_id = target_child
    union all select false, 5, 10, null::timestamptz
     where not exists (select 1 from public.pickup_escalation_settings s2 where s2.child_id = target_child)
    limit 1;
end;
$$;

create or replace function public.set_auto_escalation(target_child uuid, is_enabled boolean, before_minutes int, window_minutes int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
  prior public.pickup_escalation_settings;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then raise exception 'Not allowed'; end if;
  if before_minutes not between 0 and 60 or window_minutes not between 1 and 60 then
    raise exception 'Those minutes are not allowed';
  end if;

  select * into prior from public.pickup_escalation_settings where child_id = target_child;
  insert into public.pickup_escalation_settings (child_id, family_id, enabled, minutes_before, response_window_minutes, consented_by, consented_at, updated_at)
  values (target_child, fid, is_enabled, before_minutes, window_minutes,
          case when is_enabled then uid end, case when is_enabled then now() end, now())
  on conflict (child_id) do update
    set enabled = excluded.enabled,
        minutes_before = excluded.minutes_before,
        response_window_minutes = excluded.response_window_minutes,
        -- consent is (re)recorded whenever it is turned on, and cleared when it is turned off
        consented_by = case when excluded.enabled then coalesce(case when prior.enabled then prior.consented_by end, uid) else null end,
        consented_at = case when excluded.enabled then coalesce(case when prior.enabled then prior.consented_at end, now()) else null end,
        updated_at = now();

  perform public.log_escalation(target_child, fid, null,
    case when is_enabled and coalesce(prior.enabled, false) = false then 'opted_in'
         when not is_enabled and coalesce(prior.enabled, false) then 'opted_out'
         else 'settings_changed' end,
    uid, jsonb_build_object('minutes_before', before_minutes, 'response_window_minutes', window_minutes));
end;
$$;

-- 5. What the parent's phone last told us ------------------------------------
create or replace function public.report_pickup_status(target_child uuid, dismissal_at timestamptz, predicted_arrival timestamptz, parent_response text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then raise exception 'Not allowed'; end if;
  if parent_response not in ('none', 'will_collect') then raise exception 'Unknown response'; end if;
  insert into public.pickup_status_reports as r (child_id, family_id, reported_by, dismissal_at, predicted_arrival, parent_response, reported_at)
  values (target_child, fid, uid, dismissal_at, predicted_arrival, parent_response, now())
  on conflict (child_id) do update
    set reported_by = excluded.reported_by, dismissal_at = excluded.dismissal_at,
        predicted_arrival = excluded.predicted_arrival, parent_response = excluded.parent_response, reported_at = now();
end;
$$;

-- 6. Open a round (shared by the app button, the open app and the scheduled check) -----------
-- Internal. Returns the live round if there is one (created = false), otherwise creates it.
create or replace function public.open_backup_broadcast(target_child uuid, requester uuid, trigger_reason text)
returns table (broadcast_id uuid, created boolean, asked int)
language plpgsql security definer set search_path = ''
as $$
declare
  fid uuid;
  win int;
  live public.backup_broadcasts;
  prev public.backup_broadcasts;
  new_id uuid;
  n int;
begin
  -- Serialise everything that touches this child (two phones, a double tap, the scheduled check).
  select family_id into fid from public.children where id = target_child for update;
  if fid is null then raise exception 'Not allowed'; end if;

  select * into live from public.backup_broadcasts where child_id = target_child and state in ('open', 'covered');
  if found then
    return query select live.id, false, (select count(*)::int from public.backup_requests where backup_requests.broadcast_id = live.id);
    return;
  end if;

  if trigger_reason = 'auto' then
    select * into prev from public.backup_broadcasts
     where child_id = target_child and reason = 'auto' and started_at > now() - interval '12 hours'
     order by started_at desc limit 1;
    if found then
      return query select prev.id, false, (select count(*)::int from public.backup_requests where backup_requests.broadcast_id = prev.id);
      return;
    end if;
  end if;

  if exists (select 1 from public.backup_requests r where r.child_id = target_child and r.broadcast_id is null and r.state in ('requested', 'accepted')) then
    raise exception 'A backup request is already active for this child';
  end if;

  select coalesce((select s.response_window_minutes from public.pickup_escalation_settings s where s.child_id = target_child), 10) into win;

  insert into public.backup_broadcasts (family_id, child_id, started_by, reason, expires_at)
  values (fid, target_child, requester, trigger_reason, now() + make_interval(mins => win))
  returning id into new_id;

  -- Everyone eligible, once each: joined family members and active, joined Trusted Circle members.
  insert into public.backup_requests (family_id, child_id, requested_by, helper_id, state, broadcast_id, recipient_user_id, recipient_name, recipient_role, recipient_kind)
  select fid, target_child, requester, e.helper_id, 'requested', new_id, e.user_id, e.name, e.role, e.kind
    from (
      select distinct on (x.user_id) x.user_id, x.name, x.role, x.kind, x.helper_id
        from (
          select fm.user_id, coalesce(nullif(p.full_name, ''), 'Family member') as name, 'Family member'::text as role, 'family'::text as kind, null::uuid as helper_id, 1 as pri
            from public.family_members fm join public.profiles p on p.id = fm.user_id
           where fm.family_id = fid
          union all
          select h.user_id, h.name, nullif(h.role, ''), 'circle', h.id, 2
            from public.trusted_helpers h
           where h.family_id = fid and h.state = 'active' and h.user_id is not null
        ) x
       where x.user_id <> requester
       order by x.user_id, x.pri
    ) e;
  get diagnostics n = row_count;

  if n = 0 then
    delete from public.backup_broadcasts where id = new_id;
    raise exception 'Nobody to ask yet';
  end if;

  perform public.log_escalation(target_child, fid, new_id, 'broadcast_started', requester,
    jsonb_build_object('reason', trigger_reason, 'asked', n));
  return query select new_id, true, n;
end;
$$;
revoke execute on function public.open_backup_broadcast(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.start_backup_broadcast(target_child uuid, trigger_reason text)
returns table (broadcast_id uuid, created boolean, asked int)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then raise exception 'Not allowed'; end if;
  if trigger_reason not in ('auto', 'manual', 'again') then raise exception 'Unknown reason'; end if;
  if trigger_reason = 'auto' and not exists (
    select 1 from public.pickup_escalation_settings s
     where s.child_id = target_child and s.enabled and s.consented_at is not null
  ) then
    raise exception 'Automatic backup is not opted in for this child';
  end if;
  return query select * from public.open_backup_broadcast(target_child, uid, trigger_reason);
end;
$$;

-- 7. Read the newest round (family only) -------------------------------------
create or replace function public.my_broadcast(target_child uuid)
returns table (
  broadcast_id uuid, broadcast_state text, reason text, started_at timestamptz,
  request_id uuid, recipient_name text, recipient_role text, recipient_kind text,
  request_state text, responded_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare fid uuid; bid uuid;
begin
  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then raise exception 'Not allowed'; end if;
  select b.id into bid from public.backup_broadcasts b
   where b.child_id = target_child and b.started_at > now() - interval '12 hours'
   order by b.started_at desc limit 1;
  if bid is null then return; end if;
  return query
    select b.id, b.state, b.reason, b.started_at, r.id, coalesce(r.recipient_name, 'A helper'), r.recipient_role,
           coalesce(r.recipient_kind, 'circle'), r.state, r.responded_at
      from public.backup_broadcasts b join public.backup_requests r on r.broadcast_id = b.id
     where b.id = bid
     order by r.requested_at, r.recipient_name;
end;
$$;

-- 8. Cancel / expire -----------------------------------------------------------------
create or replace function public.cancel_backup_broadcast(target_broadcast uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); b public.backup_broadcasts;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into b from public.backup_broadcasts where id = target_broadcast for update;
  if not found or not public.is_family_member(b.family_id) then raise exception 'Not allowed'; end if;
  if b.state not in ('open', 'covered') then raise exception 'This request is already %', b.state; end if;
  update public.backup_requests set state = 'cancelled', responded_at = coalesce(responded_at, now())
   where broadcast_id = b.id and state in ('requested', 'accepted');
  update public.backup_broadcasts set state = 'cancelled', closed_at = now() where id = b.id;
  perform public.log_escalation(b.child_id, b.family_id, b.id, 'cancelled', uid);
end;
$$;

create or replace function public.expire_one_broadcast(bid uuid, who uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare b public.backup_broadcasts;
begin
  select * into b from public.backup_broadcasts where id = bid for update;
  if not found or b.state <> 'open' then return; end if;
  update public.backup_requests set state = 'expired' where broadcast_id = b.id and state = 'requested';
  update public.backup_broadcasts set state = 'exhausted', closed_at = now() where id = b.id;
  perform public.log_escalation(b.child_id, b.family_id, b.id, 'expired', who);
end;
$$;
revoke execute on function public.expire_one_broadcast(uuid, uuid) from public, anon, authenticated;

create or replace function public.expire_backup_broadcast(target_broadcast uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); b public.backup_broadcasts;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into b from public.backup_broadcasts where id = target_broadcast;
  if not found or not public.is_family_member(b.family_id) then raise exception 'Not allowed'; end if;
  if b.state <> 'open' then return; end if;
  if now() < b.expires_at then raise exception 'Too early to expire this request'; end if;
  perform public.expire_one_broadcast(b.id, uid);
end;
$$;

-- 9. Answers (REPLACES the single-helper version; same name, same arguments) ----------------------
create or replace function public.respond_backup_request(target_request uuid, accept boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.backup_requests;
  b public.backup_broadcasts;
  next_state text;
  allowed boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select * into r from public.backup_requests where id = target_request;
  if not found then raise exception 'Request not found'; end if;

  -- Lock the round first, so two people accepting at the same moment are decided one after the other.
  if r.broadcast_id is not null then
    select * into b from public.backup_broadcasts where id = r.broadcast_id for update;
  end if;
  select * into r from public.backup_requests where id = target_request for update;

  allowed := exists (
      select 1 from public.trusted_helpers h where h.id = r.helper_id and h.user_id = uid and h.state = 'active'
    ) or (r.recipient_user_id = uid and public.is_family_member(r.family_id));
  if not allowed then raise exception 'Not allowed'; end if;

  if r.state <> 'requested' then
    if r.broadcast_id is not null and r.state = 'closed' then
      raise exception 'This request is already covered by someone else';
    end if;
    raise exception 'This request is already %', r.state;
  end if;

  if r.broadcast_id is not null and b.state <> 'open' then
    raise exception 'This request is already %', case when b.state = 'covered' then 'covered by someone else' else b.state end;
  end if;
  if r.broadcast_id is not null and now() >= b.expires_at then
    -- No side effect here: an exception rolls it back. expire_backup_broadcast / expire_due_broadcasts close it.
    raise exception 'This request is already expired';
  end if;

  next_state := case when accept then 'accepted' else 'declined' end;
  update public.backup_requests set state = next_state, responded_at = now() where id = r.id;

  if r.broadcast_id is not null then
    if accept then
      update public.backup_requests set state = 'closed', responded_at = now()
       where broadcast_id = b.id and id <> r.id and state = 'requested';
      update public.backup_broadcasts set state = 'covered', accepted_request_id = r.id where id = b.id;
      perform public.log_escalation(b.child_id, b.family_id, b.id, 'accepted', uid, jsonb_build_object('request_id', r.id));
    else
      perform public.log_escalation(b.child_id, b.family_id, b.id, 'declined', uid, jsonb_build_object('request_id', r.id));
      if not exists (select 1 from public.backup_requests where broadcast_id = b.id and state = 'requested') then
        update public.backup_broadcasts set state = 'exhausted', closed_at = now() where id = b.id;
        perform public.log_escalation(b.child_id, b.family_id, b.id, 'everyone_answered_no', uid);
      end if;
    end if;
  end if;
  return next_state;
end;
$$;

-- 10. What a recipient may see about their assignments (REPLACES; same columns) --------------------
drop function if exists public.my_backup_assignments();
create function public.my_backup_assignments()
returns table (
  request_id uuid, child_id uuid, state text, requested_at timestamptz,
  child_name text, school_name text, school_address text, requested_by_name text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.child_id, b.state, b.requested_at, c.name, c.school_name, c.school_address,
         coalesce(nullif(p.full_name, ''), 'A family member')
  from public.backup_requests b
  join public.children c on c.id = b.child_id
  left join public.profiles p on p.id = b.requested_by
  where b.state in ('requested', 'accepted')
    and (
      exists (select 1 from public.trusted_helpers h where h.id = b.helper_id and h.user_id = (select auth.uid()) and h.state = 'active')
      or (b.recipient_user_id = (select auth.uid()) and public.is_family_member(b.family_id))
    )
    and (b.broadcast_id is null or exists (
      select 1 from public.backup_broadcasts bb where bb.id = b.broadcast_id and bb.state in ('open', 'covered') and (bb.state = 'covered' or bb.expires_at > now())
    ))
  order by b.requested_at desc;
$$;

-- 11. Completing a pickup also closes the round (REPLACES; same behaviour otherwise) -------------
create or replace function public.complete_backup_request(target_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.backup_requests;
  is_helper boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into r from public.backup_requests where id = target_request for update;
  if not found then raise exception 'Request not found'; end if;
  select exists (select 1 from public.trusted_helpers h where h.id = r.helper_id and h.user_id = uid and h.state = 'active')
         or r.recipient_user_id = uid into is_helper;
  if not (public.is_family_member(r.family_id) or is_helper) then raise exception 'Not allowed'; end if;
  if r.state <> 'accepted' then raise exception 'Only an accepted request can be completed (it is %)', r.state; end if;
  update public.backup_requests set state = 'completed' where id = r.id;
  if r.broadcast_id is not null then
    update public.backup_broadcasts set state = 'completed', closed_at = now() where id = r.broadcast_id and state = 'covered';
    perform public.log_escalation(r.child_id, r.family_id, r.broadcast_id, 'completed', uid);
  end if;
end;
$$;

-- 12. Server side checks. NOT granted to app users. Nothing here is scheduled. ----------------------
-- run_auto_escalation(): what a scheduled job calls (for example every minute) so the automatic request still
-- happens when the parent's phone is closed or asleep. It acts only when ALL of these hold:
--   * the parent opted in (enabled and consented_at)
--   * the phone reported within the last 20 minutes (otherwise the server does not guess)
--   * the parent has not said they will collect, and a predicted arrival exists and is after dismissal
--   * now is inside [dismissal - minutes_before, dismissal + 30 minutes]
--   * no live round, no automatic round in the last 12 hours, no pickup journey in progress
-- Returns one row per round it opened. The request goes in the database; delivering a PUSH notification to the
-- phones needs separate infrastructure (see PICKUP_BROADCAST.md). Until then people see it when they open SafeNest.
create or replace function public.run_auto_escalation()
returns table (child_id uuid, broadcast_id uuid, asked int)
language plpgsql security definer set search_path = ''
as $$
declare
  rec record;
  res record;
begin
  for rec in
    select s.child_id as cid, rpt.reported_by as parent
      from public.pickup_escalation_settings s
      join public.pickup_status_reports rpt on rpt.child_id = s.child_id
     where s.enabled and s.consented_at is not null
       and rpt.reported_at > now() - interval '20 minutes'
       and rpt.parent_response = 'none'
       and rpt.predicted_arrival is not null
       and rpt.predicted_arrival > rpt.dismissal_at
       and now() >= rpt.dismissal_at - make_interval(mins => s.minutes_before)
       and now() <= rpt.dismissal_at + interval '30 minutes'
       and not exists (select 1 from public.pickup_journeys j where j.child_id = s.child_id and j.state in ('started', 'at_school'))
       and not exists (select 1 from public.backup_broadcasts b where b.child_id = s.child_id and (b.state in ('open', 'covered') or (b.reason = 'auto' and b.started_at > now() - interval '12 hours')))
  loop
    begin
      select * into res from public.open_backup_broadcast(rec.cid, rec.parent, 'auto');
      if res.created then
        child_id := rec.cid; broadcast_id := res.broadcast_id; asked := res.asked;
        return next;
      end if;
    exception when others then
      -- One child failing (for example nobody to ask) must not stop the rest. It is audited.
      perform public.log_escalation(rec.cid, (select family_id from public.children where id = rec.cid), null, 'auto_failed', null, jsonb_build_object('error', sqlerrm));
    end;
  end loop;
end;
$$;

-- expire_due_broadcasts(): marks open rounds whose waiting time is over as "no response".
create or replace function public.expire_due_broadcasts()
returns int
language plpgsql security definer set search_path = ''
as $$
declare b record; n int := 0;
begin
  for b in select id from public.backup_broadcasts where state = 'open' and expires_at <= now() loop
    perform public.expire_one_broadcast(b.id, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.run_auto_escalation() from public, anon, authenticated;
revoke execute on function public.expire_due_broadcasts() from public, anon, authenticated;
-- Supabase's service role / postgres (what pg_cron or an Edge Function uses) can still call them.

-- 13. Grants for the app-facing functions ------------------------------------------------------------
revoke execute on function public.get_auto_escalation(uuid) from public, anon;
revoke execute on function public.set_auto_escalation(uuid, boolean, int, int) from public, anon;
revoke execute on function public.report_pickup_status(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.start_backup_broadcast(uuid, text) from public, anon;
revoke execute on function public.my_broadcast(uuid) from public, anon;
revoke execute on function public.cancel_backup_broadcast(uuid) from public, anon;
revoke execute on function public.expire_backup_broadcast(uuid) from public, anon;
revoke execute on function public.respond_backup_request(uuid, boolean) from public, anon;
revoke execute on function public.my_backup_assignments() from public, anon;
revoke execute on function public.complete_backup_request(uuid) from public, anon;
grant execute on function public.get_auto_escalation(uuid) to authenticated;
grant execute on function public.set_auto_escalation(uuid, boolean, int, int) to authenticated;
grant execute on function public.report_pickup_status(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.start_backup_broadcast(uuid, text) to authenticated;
grant execute on function public.my_broadcast(uuid) to authenticated;
grant execute on function public.cancel_backup_broadcast(uuid) to authenticated;
grant execute on function public.expire_backup_broadcast(uuid) to authenticated;
grant execute on function public.respond_backup_request(uuid, boolean) to authenticated;
grant execute on function public.my_backup_assignments() to authenticated;
grant execute on function public.complete_backup_request(uuid) to authenticated;
revoke execute on function public.expire_one_broadcast(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.guard_single_request() from public, anon, authenticated;

-- 14. Realtime: the new round table too (backup_requests is already published) ---------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'backup_broadcasts') then
    execute 'alter publication supabase_realtime add table public.backup_broadcasts';
  end if;
end;
$$;

-- =====================================================
-- NOT INCLUDED, on purpose (a backend owner decides):
--   -- select cron.schedule('safenest-auto-escalation', '* * * * *', $$select public.run_auto_escalation()$$);
--   -- select cron.schedule('safenest-expire-rounds',   '* * * * *', $$select public.expire_due_broadcasts()$$);
-- Push notifications to the people who were asked need an Edge Function or a webhook on backup_requests inserts
-- plus Expo push tokens stored per user. That does not exist yet.
-- =====================================================

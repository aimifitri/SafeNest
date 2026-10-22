-- =====================================================
-- SafeNest pickup workflow migration
-- Run AFTER schema.sql (and location_sharing.sql if you use it).
-- Safe to run more than once.
--
-- What it does
--   1. Adds the 'completed' state.
--   2. Allows only ONE active request (requested or accepted) per child.
--   3. Removes direct INSERT/UPDATE on backup_requests. Every change now goes
--      through a function that checks who is allowed to do it.
--   4. Lets the chosen helper (and only that helper) accept or decline.
--   5. Lets a linked helper read their own requests, and see the minimum
--      child/school details needed to do the pickup.
--   6. Publishes backup_requests to Realtime so Today updates live.
--
-- State flow:
--   (no row = idle) -> requested -> accepted -> completed
--                                -> declined
--                      requested/accepted -> cancelled
-- =====================================================

-- 1. States --------------------------------------------------------
alter table public.backup_requests
  drop constraint if exists backup_requests_state_check;
alter table public.backup_requests
  add constraint backup_requests_state_check
  check (state in ('requested', 'accepted', 'declined', 'cancelled', 'completed'));

-- 2. One active request per child -----------------------------------
create unique index if not exists backup_requests_one_active_per_child
  on public.backup_requests (child_id)
  where state in ('requested', 'accepted');

create index if not exists backup_requests_helper_idx
  on public.backup_requests (helper_id, state);

-- 3. No direct writes ------------------------------------------------
revoke insert, update on public.backup_requests from authenticated;
drop policy if exists "Members create requests" on public.backup_requests;
drop policy if exists "Members update requests" on public.backup_requests;

-- 5a. A linked, approved helper can read the requests addressed to them
drop policy if exists "Assigned helper reads own requests" on public.backup_requests;
create policy "Assigned helper reads own requests"
on public.backup_requests for select to authenticated
using (exists (
  select 1 from public.trusted_helpers h
  where h.id = backup_requests.helper_id
    and h.user_id = (select auth.uid())
    and h.state = 'active'
));

-- Request backup (family members only) --------------------------------
create or replace function public.request_backup(target_child uuid, target_helper uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select family_id into fid from public.children where id = target_child;
  if fid is null or not public.is_family_member(fid) then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1 from public.trusted_helpers h
    where h.id = target_helper and h.family_id = fid and h.state = 'active'
  ) then
    raise exception 'This helper is not approved';
  end if;

  if not exists (
    select 1 from public.trusted_helpers h
    where h.id = target_helper and h.user_id is not null and h.user_id <> uid
  ) then
    raise exception 'This helper has not joined SafeNest yet';
  end if;

  begin
    insert into public.backup_requests (family_id, child_id, requested_by, helper_id, state)
    values (fid, target_child, uid, target_helper, 'requested')
    returning id into new_id;
  exception when unique_violation then
    raise exception 'A backup request is already active for this child';
  end;

  return new_id;
end;
$$;

-- Helper accepts or declines -----------------------------------------
create or replace function public.respond_backup_request(target_request uuid, accept boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.backup_requests;
  next_state text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into r from public.backup_requests where id = target_request for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if not exists (
    select 1 from public.trusted_helpers h
    where h.id = r.helper_id and h.user_id = uid and h.state = 'active'
  ) then
    raise exception 'Not allowed';
  end if;

  if r.state <> 'requested' then
    raise exception 'This request is already %', r.state;
  end if;

  next_state := case when accept then 'accepted' else 'declined' end;
  update public.backup_requests
     set state = next_state, responded_at = now()
   where id = r.id;
  return next_state;
end;
$$;

-- Family cancels ---------------------------------------------------------
create or replace function public.cancel_backup_request(target_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.backup_requests;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into r from public.backup_requests where id = target_request for update;
  if not found or not public.is_family_member(r.family_id) then
    raise exception 'Not allowed';
  end if;
  if r.state not in ('requested', 'accepted') then
    raise exception 'This request is already %', r.state;
  end if;

  update public.backup_requests set state = 'cancelled' where id = r.id;
end;
$$;

-- Family or the accepted helper marks pickup done -----------------------
create or replace function public.complete_backup_request(target_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.backup_requests;
  is_helper boolean;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into r from public.backup_requests where id = target_request for update;
  if not found then
    raise exception 'Request not found';
  end if;

  select exists (
    select 1 from public.trusted_helpers h
    where h.id = r.helper_id and h.user_id = uid and h.state = 'active'
  ) into is_helper;

  if not (public.is_family_member(r.family_id) or is_helper) then
    raise exception 'Not allowed';
  end if;
  if r.state <> 'accepted' then
    raise exception 'Only an accepted request can be completed (it is %)', r.state;
  end if;

  update public.backup_requests set state = 'completed' where id = r.id;
end;
$$;

-- 5b. What a helper may see about their assignments -----------------------
-- Deliberately minimal: no teacher phone, no other family data.
drop function if exists public.my_backup_assignments();
create function public.my_backup_assignments()
returns table (
  request_id uuid,
  child_id uuid,
  state text,
  requested_at timestamptz,
  child_name text,
  school_name text,
  school_address text,
  requested_by_name text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.child_id, b.state, b.requested_at, c.name, c.school_name, c.school_address,
         coalesce(nullif(p.full_name, ''), 'A family member')
  from public.backup_requests b
  join public.trusted_helpers h on h.id = b.helper_id
  join public.children c on c.id = b.child_id
  left join public.profiles p on p.id = b.requested_by
  where h.user_id = (select auth.uid())
    and h.state = 'active'
    and b.state in ('requested', 'accepted')
  order by b.requested_at desc;
$$;

revoke execute on function public.request_backup(uuid, uuid) from public, anon;
revoke execute on function public.respond_backup_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_backup_request(uuid) from public, anon;
revoke execute on function public.complete_backup_request(uuid) from public, anon;
revoke execute on function public.my_backup_assignments() from public, anon;
grant execute on function public.request_backup(uuid, uuid) to authenticated;
grant execute on function public.respond_backup_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_backup_request(uuid) to authenticated;
grant execute on function public.complete_backup_request(uuid) to authenticated;
grant execute on function public.my_backup_assignments() to authenticated;

-- 6. Realtime ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'backup_requests'
     ) then
    execute 'alter publication supabase_realtime add table public.backup_requests';
  end if;
end;
$$;

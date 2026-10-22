-- =====================================================
-- SafeNest pickup confirmation (journeys)
-- Run AFTER schema.sql and pickup_workflow.sql. Safe to re-run.
-- location_sharing.sql is optional: if it is applied, closing a journey also
-- stops that collector's live location sharing.
--
-- A journey is one trip to collect one child:
--   started -> at_school -> collected        (handover confirmed by the collector)
--   started / at_school -> cancelled
--
-- Who may start one: a family member, or a linked helper who has an ACCEPTED
-- backup request for that child. Only the person who started it can move it forward.
-- The handover is recorded by the collector. The school does not verify it.
-- =====================================================

create table if not exists public.pickup_journeys (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  collector_user_id uuid not null references public.profiles (id) on delete cascade,
  collector_name text not null,
  backup_request_id uuid references public.backup_requests (id) on delete set null,
  state text not null default 'started'
    check (state in ('started', 'at_school', 'collected', 'cancelled')),
  started_at timestamptz not null default now(),
  arrived_at timestamptz,
  ended_at timestamptz,
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade
);

create unique index if not exists pickup_journeys_one_active_per_child
  on public.pickup_journeys (child_id)
  where state in ('started', 'at_school');
create index if not exists pickup_journeys_child_idx
  on public.pickup_journeys (child_id, started_at desc);
create index if not exists pickup_journeys_collector_idx
  on public.pickup_journeys (collector_user_id, state);

alter table public.pickup_journeys enable row level security;
-- Read only. Every change goes through the functions below.
grant select on public.pickup_journeys to authenticated;

drop policy if exists "Members read journeys" on public.pickup_journeys;
create policy "Members read journeys"
on public.pickup_journeys for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists "Collector reads own journeys" on public.pickup_journeys;
create policy "Collector reads own journeys"
on public.pickup_journeys for select to authenticated
using (collector_user_id = (select auth.uid()));

-- Internal: end this person's live location sharing for the family, if that feature is installed.
create or replace function public.stop_location_sharing(owner uuid, fid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if to_regclass('public.location_shares') is null then
    return;
  end if;
  execute 'delete from public.live_locations where share_id in (
             select id from public.location_shares
             where owner_user_id = $1 and family_id = $2)' using owner, fid;
  execute 'update public.location_shares set ended_at = coalesce(ended_at, now())
           where owner_user_id = $1 and family_id = $2 and ended_at is null' using owner, fid;
end;
$$;
revoke execute on function public.stop_location_sharing(uuid, uuid) from public, anon, authenticated;

-- Internal: is this person still allowed to act as the collector right now?
-- (A helper who was removed mid-journey loses the right immediately.)
create or replace function public.is_current_collector(fid uuid, collector uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select collector = (select auth.uid())
     and (
       public.is_family_member(fid)
       or exists (
         select 1 from public.trusted_helpers h
         where h.family_id = fid and h.user_id = collector and h.state = 'active'
       )
     );
$$;
revoke execute on function public.is_current_collector(uuid, uuid) from public, anon, authenticated;

create or replace function public.start_pickup_journey(target_child uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
  req_id uuid;
  who text;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select family_id into fid from public.children where id = target_child;
  if fid is null then
    raise exception 'Not allowed';
  end if;

  if not public.is_family_member(fid) then
    -- A helper may only start a journey for a request they accepted.
    select b.id into req_id
      from public.backup_requests b
      join public.trusted_helpers h on h.id = b.helper_id
     where b.child_id = target_child
       and b.state = 'accepted'
       and h.user_id = uid
       and h.state = 'active'
     limit 1;
    if req_id is null then
      raise exception 'Not allowed';
    end if;
  end if;

  select coalesce(nullif(full_name, ''), 'A family member') into who
    from public.profiles where id = uid;

  begin
    insert into public.pickup_journeys (family_id, child_id, collector_user_id, collector_name, backup_request_id)
    values (fid, target_child, uid, who, req_id)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'A pickup journey is already in progress for this child';
  end;

  return new_id;
end;
$$;

create or replace function public.mark_arrived_at_school(target_journey uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  j public.pickup_journeys;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into j from public.pickup_journeys where id = target_journey for update;
  if not found or not public.is_current_collector(j.family_id, j.collector_user_id) then
    raise exception 'Not allowed';
  end if;
  if j.state <> 'started' then
    raise exception 'This journey is already %', j.state;
  end if;
  update public.pickup_journeys set state = 'at_school', arrived_at = now() where id = j.id;
end;
$$;

-- Records the handover, closes the journey, closes the backup request, stops location sharing.
create or replace function public.confirm_handover(target_journey uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  j public.pickup_journeys;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into j from public.pickup_journeys where id = target_journey for update;
  if not found or not public.is_current_collector(j.family_id, j.collector_user_id) then
    raise exception 'Not allowed';
  end if;
  if j.state = 'started' then
    raise exception 'Mark that you arrived at school first';
  end if;
  if j.state <> 'at_school' then
    raise exception 'This journey is already %', j.state;
  end if;

  update public.pickup_journeys set state = 'collected', ended_at = now() where id = j.id;

  if j.backup_request_id is not null then
    update public.backup_requests set state = 'completed'
     where id = j.backup_request_id and state = 'accepted';
  end if;

  perform public.stop_location_sharing(j.collector_user_id, j.family_id);
end;
$$;

-- The collector, or any family member, can call a journey off.
create or replace function public.cancel_pickup_journey(target_journey uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  j public.pickup_journeys;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into j from public.pickup_journeys where id = target_journey for update;
  if not found or not (
       public.is_family_member(j.family_id)
       or public.is_current_collector(j.family_id, j.collector_user_id)
     ) then
    raise exception 'Not allowed';
  end if;
  if j.state not in ('started', 'at_school') then
    raise exception 'This journey is already %', j.state;
  end if;

  update public.pickup_journeys set state = 'cancelled', ended_at = now() where id = j.id;
  perform public.stop_location_sharing(j.collector_user_id, j.family_id);
end;
$$;

-- What the collector (parent or helper) sees about their own open journey.
create or replace function public.my_active_journeys()
returns table (
  journey_id uuid,
  child_id uuid,
  child_name text,
  state text,
  started_at timestamptz,
  backup_request_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select j.id, j.child_id, c.name, j.state, j.started_at, j.backup_request_id
  from public.pickup_journeys j
  join public.children c on c.id = j.child_id
  where j.collector_user_id = (select auth.uid())
    and j.state in ('started', 'at_school')
  order by j.started_at desc;
$$;

revoke execute on function public.start_pickup_journey(uuid) from public, anon;
revoke execute on function public.mark_arrived_at_school(uuid) from public, anon;
revoke execute on function public.confirm_handover(uuid) from public, anon;
revoke execute on function public.cancel_pickup_journey(uuid) from public, anon;
revoke execute on function public.my_active_journeys() from public, anon;
grant execute on function public.start_pickup_journey(uuid) to authenticated;
grant execute on function public.mark_arrived_at_school(uuid) to authenticated;
grant execute on function public.confirm_handover(uuid) to authenticated;
grant execute on function public.cancel_pickup_journey(uuid) to authenticated;
grant execute on function public.my_active_journeys() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_journeys'
     ) then
    execute 'alter publication supabase_realtime add table public.pickup_journeys';
  end if;
end;
$$;

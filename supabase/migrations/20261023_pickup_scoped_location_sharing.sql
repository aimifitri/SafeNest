-- Pickup-scoped foreground location sharing.
-- Apply after schema.sql, pickup_workflow.sql, and pickup_journeys.sql.
-- This migration is prepared locally only; do not apply to the shared project without review.

create table public.pickup_location_shares (
  journey_id uuid primary key references public.pickup_journeys(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  collector_user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours'),
  ended_at timestamptz,
  check (expires_at > started_at)
);

create table public.pickup_live_locations (
  journey_id uuid primary key references public.pickup_location_shares(journey_id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now()
);

create index pickup_location_shares_family_idx on public.pickup_location_shares(family_id, expires_at desc);
alter table public.pickup_location_shares enable row level security;
alter table public.pickup_live_locations enable row level security;
grant select on public.pickup_location_shares, public.pickup_live_locations to authenticated;
grant insert, update on public.pickup_live_locations to authenticated;

create function public.can_access_pickup_location(target_journey uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pickup_location_shares s
    join public.pickup_journeys j on j.id = s.journey_id
    where s.journey_id = target_journey
      and s.ended_at is null and s.expires_at > now()
      and j.state in ('started', 'at_school')
      and (
        public.is_family_member(s.family_id)
        or (j.collector_user_id = (select auth.uid()) and public.is_current_collector(j.family_id, j.collector_user_id))
      )
  );
$$;
revoke execute on function public.can_access_pickup_location(uuid) from public, anon;
grant execute on function public.can_access_pickup_location(uuid) to authenticated;

create policy "Collector and family read active pickup location shares"
on public.pickup_location_shares for select to authenticated
using (public.can_access_pickup_location(journey_id));

create policy "Family reads active pickup location"
on public.pickup_live_locations for select to authenticated
using (public.can_access_pickup_location(journey_id));

create policy "Current collector uploads pickup location"
on public.pickup_live_locations for insert to authenticated
with check (public.can_access_pickup_location(journey_id) and exists (
  select 1 from public.pickup_location_shares s
  join public.pickup_journeys j on j.id = s.journey_id
  where s.journey_id = pickup_live_locations.journey_id
    and s.collector_user_id = (select auth.uid())
    and j.state in ('started', 'at_school')
));

create policy "Current collector updates pickup location"
on public.pickup_live_locations for update to authenticated
using (public.can_access_pickup_location(journey_id) and exists (
  select 1 from public.pickup_location_shares s
  join public.pickup_journeys j on j.id = s.journey_id
  where s.journey_id = pickup_live_locations.journey_id
    and s.collector_user_id = (select auth.uid())
    and j.state in ('started', 'at_school')
))
with check (public.can_access_pickup_location(journey_id) and exists (
  select 1 from public.pickup_location_shares s
  join public.pickup_journeys j on j.id = s.journey_id
  where s.journey_id = pickup_live_locations.journey_id
    and s.collector_user_id = (select auth.uid())
    and j.state in ('started', 'at_school')
));

create function public.start_pickup_location_share(target_journey uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j public.pickup_journeys;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into j from public.pickup_journeys where id = target_journey for update;
  if not found or j.collector_user_id <> (select auth.uid())
     or j.state not in ('started', 'at_school')
     or not public.is_current_collector(j.family_id, j.collector_user_id) then
    raise exception 'Only the assigned collector can share location during an active pickup';
  end if;

  insert into public.pickup_location_shares (journey_id, family_id, collector_user_id, started_at, expires_at, ended_at)
  values (j.id, j.family_id, j.collector_user_id, now(), now() + interval '4 hours', null)
  on conflict (journey_id) do update
    set started_at = now(), expires_at = now() + interval '4 hours', ended_at = null;
  delete from public.pickup_live_locations where journey_id = j.id;
end;
$$;
revoke execute on function public.start_pickup_location_share(uuid) from public, anon;
grant execute on function public.start_pickup_location_share(uuid) to authenticated;

create function public.stop_pickup_location_share(target_journey uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.pickup_location_shares
  set ended_at = coalesce(ended_at, now())
  where journey_id = target_journey and collector_user_id = (select auth.uid());
  if not found then raise exception 'Pickup location share not found'; end if;
  delete from public.pickup_live_locations where journey_id = target_journey;
end;
$$;
revoke execute on function public.stop_pickup_location_share(uuid) from public, anon;
grant execute on function public.stop_pickup_location_share(uuid) to authenticated;

create function public.close_pickup_location_on_journey_end()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state in ('collected', 'cancelled') and old.state is distinct from new.state then
    update public.pickup_location_shares set ended_at = coalesce(ended_at, now()) where journey_id = new.id;
    delete from public.pickup_live_locations where journey_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.close_pickup_location_on_journey_end() from public, anon, authenticated;
create trigger close_pickup_location_after_journey_end
after update of state on public.pickup_journeys
for each row execute function public.close_pickup_location_on_journey_end();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_location_shares') then
      alter publication supabase_realtime add table public.pickup_location_shares;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_live_locations') then
      alter publication supabase_realtime add table public.pickup_live_locations;
    end if;
  end if;
end $$;

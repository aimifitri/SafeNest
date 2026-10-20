-- Live trip sharing: keep only the latest point, never a location history.
create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  owner_display_name text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours'),
  ended_at timestamptz,
  check (expires_at > started_at)
);

create index location_shares_owner_idx
  on public.location_shares (owner_user_id, expires_at desc);

create table public.location_share_recipients (
  share_id uuid not null references public.location_shares (id) on delete cascade,
  viewer_user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (share_id, viewer_user_id)
);
create index location_share_recipients_viewer_idx
  on public.location_share_recipients (viewer_user_id, share_id);

create table public.live_locations (
  share_id uuid primary key references public.location_shares (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now()
);

alter table public.location_shares enable row level security;
alter table public.location_share_recipients enable row level security;
alter table public.live_locations enable row level security;

grant select on public.location_shares to authenticated;
grant select on public.location_share_recipients to authenticated;
grant select, insert, update, delete on public.live_locations to authenticated;

create function public.can_view_location_share(target_share uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.location_share_recipients r
    join public.location_shares s on s.id = r.share_id
    where r.share_id = target_share
      and r.viewer_user_id = (select auth.uid())
      and s.ended_at is null
      and s.expires_at > now()
      and exists (
        select 1 from public.trusted_helpers h
        where h.family_id = s.family_id
          and h.user_id = r.viewer_user_id
          and h.state = 'active'
      )
  );
$$;
revoke execute on function public.can_view_location_share(uuid) from public, anon;
grant execute on function public.can_view_location_share(uuid) to authenticated;

create policy "Owners and selected guardians read shares"
on public.location_shares for select to authenticated
using (owner_user_id = (select auth.uid()) or public.can_view_location_share(id));

create policy "Owners read share recipients"
on public.location_share_recipients for select to authenticated
using (exists (
  select 1 from public.location_shares s
  where s.id = share_id and s.owner_user_id = (select auth.uid())
));

create policy "Selected guardians read their active share link"
on public.location_share_recipients for select to authenticated
using (viewer_user_id = (select auth.uid()) and public.can_view_location_share(share_id));

create policy "Share owner reads current location"
on public.live_locations for select to authenticated
using (exists (
  select 1 from public.location_shares s
  where s.id = share_id and s.owner_user_id = (select auth.uid())
));

create policy "Selected guardians read current location"
on public.live_locations for select to authenticated
using (public.can_view_location_share(share_id));

create policy "Share owner inserts current location"
on public.live_locations for insert to authenticated
with check (exists (
  select 1 from public.location_shares s
  where s.id = share_id
    and s.owner_user_id = (select auth.uid())
    and s.ended_at is null
    and s.expires_at > now()
));

create policy "Share owner updates current location"
on public.live_locations for update to authenticated
using (exists (
  select 1 from public.location_shares s
  where s.id = share_id
    and s.owner_user_id = (select auth.uid())
    and s.ended_at is null
    and s.expires_at > now()
))
with check (exists (
  select 1 from public.location_shares s
  where s.id = share_id
    and s.owner_user_id = (select auth.uid())
    and s.ended_at is null
    and s.expires_at > now()
));

create policy "Share owner deletes current location"
on public.live_locations for delete to authenticated
using (exists (
  select 1 from public.location_shares s
  where s.id = share_id and s.owner_user_id = (select auth.uid())
));

create function public.start_location_share(
  target_family uuid,
  recipient_user_ids uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  share_id uuid;
  display_name text;
  requested_count integer;
  valid_count integer;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(cardinality(recipient_user_ids), 0) = 0 then
    raise exception 'Select at least one approved guardian';
  end if;
  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = target_family and fm.user_id = uid
  ) then
    raise exception 'Not allowed';
  end if;

  select count(distinct requested.user_id)::integer into requested_count
  from unnest(recipient_user_ids) as requested(user_id);
  select count(distinct h.user_id)::integer into valid_count
  from public.trusted_helpers h
  where h.family_id = target_family
    and h.state = 'active'
    and h.user_id <> uid
    and h.user_id = any(recipient_user_ids);
  if requested_count <> valid_count then
    raise exception 'Every recipient must be an active, linked guardian in this family';
  end if;

  select coalesce(nullif(p.full_name, ''), 'A family member') into display_name
  from public.profiles p where p.id = uid;

  insert into public.location_shares (family_id, owner_user_id, owner_display_name)
  values (target_family, uid, display_name)
  returning id into share_id;

  insert into public.location_share_recipients (share_id, viewer_user_id)
  select distinct share_id, h.user_id
  from public.trusted_helpers h
  where h.family_id = target_family
    and h.state = 'active'
    and h.user_id <> uid
    and h.user_id = any(recipient_user_ids);

  return share_id;
end;
$$;
revoke execute on function public.start_location_share(uuid, uuid[]) from public, anon;
grant execute on function public.start_location_share(uuid, uuid[]) to authenticated;

create function public.end_location_share(target_share uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  update public.location_shares
  set ended_at = coalesce(ended_at, now())
  where id = target_share and owner_user_id = uid;
  if not found then
    raise exception 'Share not found or not owned by this user';
  end if;

  delete from public.live_locations where share_id = target_share;
end;
$$;
revoke execute on function public.end_location_share(uuid) from public, anon;
grant execute on function public.end_location_share(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_locations'
  ) then
    execute 'alter publication supabase_realtime add table public.live_locations';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'location_shares'
  ) then
    execute 'alter publication supabase_realtime add table public.location_shares';
  end if;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
from cron.job
where jobname = 'safenest-expire-location-shares';
select cron.schedule(
  'safenest-expire-location-shares',
  '*/15 * * * *',
  $job$
    delete from public.location_shares
    where expires_at <= now()
       or ended_at < now() - interval '15 minutes';
  $job$
);

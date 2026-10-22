-- =====================================================
-- SafeNest: accounts, household and availability   (PROPOSAL - not applied by the app or by this ZIP)
--
-- For the backend team to review. Safe to re-run. Run after schema.sql. It does not touch existing data and it does
-- not need the service-role key in the mobile app. Everything below is checked by the database, not by the UI.
--
-- What it adds
--   1. Profile fields collected at sign-up (account type, date of birth, gender, language, relationship) and an
--      adult-only rule: the database refuses an account for someone under 18.
--   2. A guard so a client cannot change its own account type or email directly.
--   3. Household: family_members.relationship and can_collect (family is NOT automatically allowed to collect),
--      a roster function so members can see each other's names, and one-time family invite codes.
--   4. Role checks in the data layer: only a guardian (a parent account in the household) can add children,
--      add Trusted Circle helpers or change the plan. Helper accounts cannot, whatever the UI shows.
--   5. pickup_availability: each person's own hours, readable by the people who may ask them, plus person_available(),
--      the same rule as src/components/shared/availability.ts.
--   6. A guard so a household can never be left without an admin.
--
-- Pair file: account_household_broadcast_patch.sql (optional, needs pickup_broadcast.sql) makes the group request
-- respect authorization and availability.
-- =====================================================

-- ---------------------------------------------------------------- 1. profile fields
alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists language text not null default 'en';
alter table public.profiles add column if not exists relationship_to_child text;

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check check (account_type is null or account_type in ('parent', 'helper'));
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say'));
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language in ('en', 'ms', 'zh', 'ta'));
-- NOT VALID: existing rows are not re-checked, every new or changed row is.
alter table public.profiles drop constraint if exists profiles_adult_check;
alter table public.profiles add constraint profiles_adult_check
  check (date_of_birth is null or date_of_birth <= (current_date - interval '18 years')::date) not valid;

-- Sign-up copies the details the app sent. Anything unexpected is ignored, and a minor is refused.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  atype text := nullif(m ->> 'account_type', '');
  dob date;
  g text := nullif(m ->> 'gender', '');
  lang text := coalesce(nullif(m ->> 'language', ''), 'en');
begin
  if atype is not null and atype not in ('parent', 'helper') then atype := null; end if;
  if g is not null and g not in ('female', 'male', 'non_binary', 'prefer_not_to_say') then g := null; end if;
  if lang not in ('en', 'ms', 'zh', 'ta') then lang := 'en'; end if;
  begin
    dob := nullif(m ->> 'date_of_birth', '')::date;
  exception when others then
    dob := null;
  end;
  if dob is not null and dob > (current_date - interval '18 years')::date then
    raise exception 'SafeNest accounts are for adults (18 or older)';
  end if;
  insert into public.profiles (id, full_name, email, phone, account_type, date_of_birth, gender, language)
  values (new.id, coalesce(m ->> 'full_name', ''), new.email, nullif(m ->> 'phone', ''), atype, dob, g, lang);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Keep profiles.email in step when someone confirms an email change.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function public.sync_profile_email();

-- ---------------------------------------------------------------- 2. a client may edit its own details, not its identity
revoke update on public.profiles from authenticated;
grant update (full_name, phone, gender, language, relationship_to_child, date_of_birth) on public.profiles to authenticated;

-- ---------------------------------------------------------------- 3. household
alter table public.family_members add column if not exists relationship text;
alter table public.family_members add column if not exists can_collect boolean not null default false;

-- Is this person a guardian (a parent account) in the household? Accounts from before this upgrade count as parents.
create or replace function public.is_family_guardian(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.family_members fm
      join public.profiles p on p.id = fm.user_id
     where fm.family_id = fid and fm.user_id = (select auth.uid())
       and coalesce(p.account_type, 'parent') = 'parent'
  );
$$;
revoke execute on function public.is_family_guardian(uuid) from public, anon;
grant execute on function public.is_family_guardian(uuid) to authenticated;

-- Names and contact details of the people in one household, for its members only.
create or replace function public.family_roster(target_family uuid)
returns table (user_id uuid, full_name text, email text, phone text, family_role text, account_type text, relationship text, can_collect boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_family_member(target_family) then
    raise exception 'Not allowed';
  end if;
  return query
    select fm.user_id, p.full_name, p.email, p.phone, fm.role, p.account_type,
           coalesce(fm.relationship, p.relationship_to_child), fm.can_collect
      from public.family_members fm
      join public.profiles p on p.id = fm.user_id
     where fm.family_id = target_family
     order by fm.created_at;
end;
$$;
revoke execute on function public.family_roster(uuid) from public, anon;
grant execute on function public.family_roster(uuid) to authenticated;

-- One-time family invite codes (like helper invites). The code is shown once and only its hash is stored.
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  token_hash text not null unique,
  relationship text,
  can_collect boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references public.profiles (id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.family_invites enable row level security;  -- no grants, no policies: functions only

create or replace function public.create_family_invite(target_family uuid, rel text, may_collect boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  raw_token text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not public.is_family_admin(target_family) or not public.is_family_guardian(target_family) then
    raise exception 'Not allowed';
  end if;
  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.family_invites (family_id, token_hash, relationship, can_collect, created_by)
  values (target_family, encode(sha256(convert_to(raw_token, 'utf8')), 'hex'), nullif(left(rel, 40), ''), coalesce(may_collect, false), uid);
  return raw_token;
end;
$$;

create or replace function public.accept_family_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.family_invites;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into inv from public.family_invites
   where token_hash = encode(sha256(convert_to(invite_token, 'utf8')), 'hex')
     and used_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then raise exception 'This invite link is invalid or has expired'; end if;
  if exists (select 1 from public.family_members where family_id = inv.family_id and user_id = uid) then
    raise exception 'You are already a member of this household';
  end if;
  insert into public.family_members (family_id, user_id, role, relationship, can_collect)
  values (inv.family_id, uid, 'member', inv.relationship, inv.can_collect);
  update public.family_invites set used_at = now(), used_by = uid where id = inv.id;
  return inv.family_id;
end;
$$;

create or replace function public.pending_family_invites(target_family uuid)
returns table (id uuid, relationship text, can_collect boolean, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_family_admin(target_family) then raise exception 'Not allowed'; end if;
  return query
    select i.id, i.relationship, i.can_collect, i.expires_at from public.family_invites i
     where i.family_id = target_family and i.used_at is null and i.revoked_at is null and i.expires_at > now()
     order by i.created_at desc;
end;
$$;

create or replace function public.revoke_family_invite(target_invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare fid uuid;
begin
  select family_id into fid from public.family_invites where id = target_invite;
  if fid is null or not public.is_family_admin(fid) then raise exception 'Not allowed'; end if;
  update public.family_invites set revoked_at = now() where id = target_invite and used_at is null;
end;
$$;

revoke execute on function public.create_family_invite(uuid, text, boolean) from public, anon;
revoke execute on function public.accept_family_invite(text) from public, anon;
revoke execute on function public.pending_family_invites(uuid) from public, anon;
revoke execute on function public.revoke_family_invite(uuid) from public, anon;
grant execute on function public.create_family_invite(uuid, text, boolean) to authenticated;
grant execute on function public.accept_family_invite(text) to authenticated;
grant execute on function public.pending_family_invites(uuid) to authenticated;
grant execute on function public.revoke_family_invite(uuid) to authenticated;

-- A household always keeps at least one admin.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.families f where f.id = old.family_id)
     and not exists (select 1 from public.family_members fm where fm.family_id = old.family_id and fm.role = 'admin' and fm.user_id <> old.user_id)
  then
    raise exception 'A household needs at least one admin';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists family_members_guard_last_admin on public.family_members;
create trigger family_members_guard_last_admin
before update or delete on public.family_members
for each row execute function public.guard_last_admin();

-- ---------------------------------------------------------------- 4. role checks in the data layer
-- Children, Trusted Circle entries and the weekly plan can only be created or changed by a guardian.
drop policy if exists "Members add children" on public.children;
drop policy if exists "Guardians add children" on public.children;
create policy "Guardians add children" on public.children
  for insert to authenticated with check (public.is_family_guardian(family_id));
drop policy if exists "Members update children" on public.children;
drop policy if exists "Guardians update children" on public.children;
create policy "Guardians update children" on public.children
  for update to authenticated
  using (public.is_family_guardian(family_id)) with check (public.is_family_guardian(family_id));

drop policy if exists "Members invite helpers" on public.trusted_helpers;
drop policy if exists "Guardians invite helpers" on public.trusted_helpers;
create policy "Guardians invite helpers" on public.trusted_helpers
  for insert to authenticated
  with check (public.is_family_guardian(family_id)
              and (state = 'pending' or public.is_family_admin(family_id)));

drop policy if exists "Members add plans" on public.pickup_plans;
drop policy if exists "Guardians add plans" on public.pickup_plans;
create policy "Guardians add plans" on public.pickup_plans
  for insert to authenticated with check (public.is_family_guardian(family_id));
drop policy if exists "Members update plans" on public.pickup_plans;
drop policy if exists "Guardians update plans" on public.pickup_plans;
create policy "Guardians update plans" on public.pickup_plans
  for update to authenticated
  using (public.is_family_guardian(family_id)) with check (public.is_family_guardian(family_id));

-- ---------------------------------------------------------------- 5. availability
create table if not exists public.pickup_availability (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  constraint pickup_availability_size check (pg_column_size(settings) < 8192)
);
alter table public.pickup_availability enable row level security;
grant select, insert, update, delete on public.pickup_availability to authenticated;

-- Can this person see someone else's availability? Only if they share a household, or are in the Trusted Circle of a
-- household the viewer belongs to. Nobody outside can read it.
create or replace function public.can_see_availability(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select owner = (select auth.uid())
      or exists (
           select 1 from public.family_members a join public.family_members b on a.family_id = b.family_id
            where a.user_id = (select auth.uid()) and b.user_id = owner)
      or exists (
           select 1 from public.trusted_helpers h
            where h.user_id = owner and public.is_family_member(h.family_id));
$$;
revoke execute on function public.can_see_availability(uuid) from public, anon;
grant execute on function public.can_see_availability(uuid) to authenticated;

drop policy if exists "See availability" on public.pickup_availability;
create policy "See availability" on public.pickup_availability
  for select to authenticated using (public.can_see_availability(user_id));
drop policy if exists "Write own availability" on public.pickup_availability;
create policy "Write own availability" on public.pickup_availability
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Update own availability" on public.pickup_availability;
create policy "Update own availability" on public.pickup_availability
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Delete own availability" on public.pickup_availability;
create policy "Delete own availability" on public.pickup_availability
  for delete to authenticated using (user_id = (select auth.uid()));

-- The same rule as availability.ts: accepting, then break, then a one-time change for that date, then the weekly hours.
-- A person who never saved any availability is NOT available (the app does not guess).
create or replace function public.person_available(uid uuid, at_time timestamptz default now())
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  s jsonb;
  tz text;
  local_ts timestamp;
  local_date text;
  dow int;
  minute int;
  day_slots jsonb;
  ov jsonb;
  slot jsonb;
begin
  select settings into s from public.pickup_availability where user_id = uid;
  if s is null then return false; end if;
  if coalesce((s ->> 'accepting')::boolean, true) = false then return false; end if;

  tz := coalesce(nullif(s ->> 'timeZone', ''), 'UTC');
  begin
    local_ts := at_time at time zone tz;
  exception when others then
    local_ts := at_time at time zone 'UTC';
  end;
  local_date := to_char(local_ts, 'YYYY-MM-DD');
  dow := extract(dow from local_ts)::int;
  minute := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;

  if coalesce((s #>> '{vacation,on}')::boolean, false)
     and (nullif(s #>> '{vacation,until}', '') is null or local_date <= (s #>> '{vacation,until}')) then
    return false;
  end if;

  select o into ov from jsonb_array_elements(coalesce(s -> 'overrides', '[]'::jsonb)) o where o ->> 'date' = local_date limit 1;
  if ov is not null then
    if ov ->> 'kind' = 'unavailable' then return false; end if;
    day_slots := coalesce(ov -> 'slots', '[]'::jsonb);
  else
    day_slots := coalesce(s -> 'weekly' -> dow::text, '[]'::jsonb);
  end if;

  for slot in select * from jsonb_array_elements(day_slots) loop
    if minute >= (slot ->> 'start')::int and minute < (slot ->> 'end')::int then return true; end if;
  end loop;
  return false;
end;
$$;
revoke execute on function public.person_available(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- 7. household members join by invite code only
-- Before: any admin could insert any user id into family_members, with no consent from that person.
-- After: a person joins by entering a code (accept_family_invite) or by creating the household (create_family).
drop policy if exists "Admins add members" on public.family_members;

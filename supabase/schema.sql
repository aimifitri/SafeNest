-- =====================================================
-- SafeNest schema, part 1: profiles + sign-up trigger
-- =====================================================

-- One row per signed-up user (linked to Supabase Auth)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'Parent',
  email text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- "Automatically expose new tables" is off, so grant access explicitly.
-- No insert grant: the trigger below creates the row.
grant select, update on public.profiles to authenticated;

create policy "Users read own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users update own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Automatically create a profile when someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );
  return new;
end;
$$;

-- Only the trigger should run this function, not the public API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =====================================================
-- SafeNest schema, part 2: families, children, helpers,
-- pickup plans, backup requests (+ RLS and grants)
-- =====================================================

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_id_idx on public.family_members (user_id);

-- Helper functions used by the policies (security definer avoids RLS recursion)
create function public.is_family_member(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = (select auth.uid())
  );
$$;

create function public.is_family_admin(fid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Safe way to create a family: creates it and makes the caller its admin
create function public.create_family(family_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  insert into public.families (name, created_by)
  values (family_name, uid) returning id into new_id;
  insert into public.family_members (family_id, user_id, role)
  values (new_id, uid, 'admin');
  return new_id;
end;
$$;

revoke execute on function public.is_family_member(uuid) from public, anon;
revoke execute on function public.is_family_admin(uuid) from public, anon;
revoke execute on function public.create_family(text) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.create_family(text) to authenticated;

-- children (matches the app's Child + School)
create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  age int check (age between 0 and 25),
  class_name text,
  school_name text,
  school_address text,
  teacher_name text,
  teacher_phone text,
  created_at timestamptz not null default now(),
  unique (id, family_id)
);

-- trusted helpers (state matches the app: active / pending / rejected)
create table public.trusted_helpers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  role text not null default '',
  phone text,
  user_id uuid references public.profiles (id) on delete set null,
  state text not null default 'pending' check (state in ('active', 'pending', 'rejected')),
  invited_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, family_id)
);

-- weekly schedule: one row per child per weekday (1 = Mon ... 5 = Fri)
create table public.pickup_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  weekday smallint not null check (weekday between 1 and 5),
  dismissal_time text not null check (dismissal_time ~ '^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$'),
  unique (child_id, weekday),
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade
);

-- one-day dismissal change
create table public.dismissal_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  override_date date not null,
  dismissal_time text not null check (dismissal_time ~ '^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$'),
  reason text,
  changed_by uuid not null default auth.uid() references public.profiles (id),
  unique (child_id, override_date),
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade
);

-- backup requests ("idle" = no active row)
create table public.backup_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  requested_by uuid not null default auth.uid() references public.profiles (id),
  helper_id uuid,
  state text not null default 'requested' check (state in ('requested', 'accepted', 'declined', 'cancelled')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade,
  foreign key (helper_id, family_id) references public.trusted_helpers (id, family_id)
);

-- Row Level Security on every table
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.children enable row level security;
alter table public.trusted_helpers enable row level security;
alter table public.pickup_plans enable row level security;
alter table public.dismissal_overrides enable row level security;
alter table public.backup_requests enable row level security;

-- Grants (new tables are not auto-exposed)
grant select, update on public.families to authenticated;
grant select, insert, update, delete on public.family_members to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update, delete on public.trusted_helpers to authenticated;
grant select, insert, update, delete on public.pickup_plans to authenticated;
grant select, insert, update, delete on public.dismissal_overrides to authenticated;
grant select, insert, update on public.backup_requests to authenticated;

-- Policies
create policy "Members read family" on public.families
  for select to authenticated using (public.is_family_member(id));
create policy "Admins update family" on public.families
  for update to authenticated
  using (public.is_family_admin(id)) with check (public.is_family_admin(id));

create policy "Members read members" on public.family_members
  for select to authenticated using (public.is_family_member(family_id));
create policy "Admins add members" on public.family_members
  for insert to authenticated with check (public.is_family_admin(family_id));
create policy "Admins update members" on public.family_members
  for update to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy "Admins remove members" on public.family_members
  for delete to authenticated using (public.is_family_admin(family_id));

create policy "Members read children" on public.children
  for select to authenticated using (public.is_family_member(family_id));
create policy "Members add children" on public.children
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "Members update children" on public.children
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "Admins delete children" on public.children
  for delete to authenticated using (public.is_family_admin(family_id));

create policy "Members read helpers" on public.trusted_helpers
  for select to authenticated using (public.is_family_member(family_id));
create policy "Members invite helpers" on public.trusted_helpers
  for insert to authenticated
  with check (public.is_family_member(family_id)
              and (state = 'pending' or public.is_family_admin(family_id)));
create policy "Admins approve helpers" on public.trusted_helpers
  for update to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy "Admins remove helpers" on public.trusted_helpers
  for delete to authenticated using (public.is_family_admin(family_id));

create policy "Members read plans" on public.pickup_plans
  for select to authenticated using (public.is_family_member(family_id));
create policy "Members add plans" on public.pickup_plans
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "Members update plans" on public.pickup_plans
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "Admins delete plans" on public.pickup_plans
  for delete to authenticated using (public.is_family_admin(family_id));

create policy "Members read overrides" on public.dismissal_overrides
  for select to authenticated using (public.is_family_member(family_id));
create policy "Members add overrides" on public.dismissal_overrides
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "Members update overrides" on public.dismissal_overrides
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "Members delete overrides" on public.dismissal_overrides
  for delete to authenticated using (public.is_family_member(family_id));

create policy "Members read requests" on public.backup_requests
  for select to authenticated using (public.is_family_member(family_id));
create policy "Members create requests" on public.backup_requests
  for insert to authenticated
  with check (public.is_family_member(family_id) and requested_by = (select auth.uid()));
create policy "Members update requests" on public.backup_requests
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

  -- =====================================================
-- SafeNest schema, part 3: helper invite links
-- =====================================================

create table public.helper_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  helper_id uuid not null,
  token_hash text not null unique,
  created_by uuid not null default auth.uid() references public.profiles (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references public.profiles (id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (helper_id, family_id)
    references public.trusted_helpers (id, family_id) on delete cascade
);
create index helper_invites_helper_idx on public.helper_invites (helper_id);

-- No grants and no policies: only the functions below can touch this table
alter table public.helper_invites enable row level security;

-- A linked helper can read their own helper row
create policy "Helpers read own row" on public.trusted_helpers
  for select to authenticated using (user_id = (select auth.uid()));

-- Create a link token (family members only)
create function public.create_helper_invite(target_helper uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fid uuid;
  raw_token text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select family_id into fid from public.trusted_helpers where id = target_helper;
  if fid is null or not public.is_family_member(fid) then
    raise exception 'Not allowed';
  end if;

  update public.helper_invites set revoked_at = now()
   where helper_id = target_helper and used_at is null and revoked_at is null;

  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.helper_invites (family_id, helper_id, token_hash, created_by)
  values (fid, target_helper,
          encode(sha256(convert_to(raw_token, 'utf8')), 'hex'), uid);
  return raw_token;
end;
$$;

-- Claim a link: links the signed-in user to the helper row
create function public.accept_helper_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.helper_invites;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into inv from public.helper_invites
   where token_hash = encode(sha256(convert_to(invite_token, 'utf8')), 'hex')
     and used_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'This invite link is invalid or has expired';
  end if;

  update public.trusted_helpers set user_id = uid
   where id = inv.helper_id and family_id = inv.family_id and user_id is null;
  if not found then
    raise exception 'This helper is already linked to an account';
  end if;

  update public.helper_invites set used_at = now(), used_by = uid where id = inv.id;
  return inv.family_id;
end;
$$;

revoke execute on function public.create_helper_invite(uuid) from public, anon;
revoke execute on function public.accept_helper_invite(text) from public, anon;
grant execute on function public.create_helper_invite(uuid) to authenticated;
grant execute on function public.accept_helper_invite(text) to authenticated;
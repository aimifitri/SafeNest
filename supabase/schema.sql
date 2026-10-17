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
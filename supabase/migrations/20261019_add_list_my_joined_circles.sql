-- Additive migration for the existing SafeNest schema.
-- This is not a baseline: the source tables must already exist.
-- Deploy as a reviewed trusted owner able to read both source tables across RLS.
-- Check for ALL existing overloads of this name before deployment.

begin;

-- Intentionally CREATE, not CREATE OR REPLACE: an existing zero-argument
-- function must cause an error rather than be overwritten.
create function public.list_my_joined_circles()
returns table (
  membership_id uuid,
  family_id uuid,
  family_name text,
  relationship text,
  state text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
begin
  -- Also reject a privileged invocation without an authenticated subject.
  if caller_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  -- Caller identity is always server-derived, never supplied as an argument.
  -- Include linked pending/active/rejected rows without inventing lifecycle data.
  return query
    select
      helper.id,
      helper.family_id,
      family.name,
      helper.role,
      helper.state,
      helper.created_at
    from public.trusted_helpers as helper
    join public.families as family
      on family.id = helper.family_id
    where helper.user_id = caller_id
    order by helper.created_at desc, helper.id desc;
end;
$function$;

-- Remove default client-role execution before granting the intended role.
-- The function owner and database administrators retain administrative access.
revoke all privileges
  on function public.list_my_joined_circles()
  from public, anon, authenticated, service_role;

grant execute
  on function public.list_my_joined_circles()
  to authenticated;

comment on function public.list_my_joined_circles() is
  'Read-only summary of the caller''s linked trusted-helper memberships. '
  'Returns no child, contact, location or invitation data; grants no pickup permissions.';

commit;

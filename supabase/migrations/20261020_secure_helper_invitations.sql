-- Step 58A: reviewed invitation -> acceptance -> administrator approval boundary.
-- LOCAL FILE ONLY: review and test before deployment. Run as the trusted postgres
-- owner after 20261019. No frontend, auth, family_members or pickup grants change.
--
-- Compatibility:
-- * Revoke all outstanding unused legacy tokens; administrators must reissue.
-- * Preserve all helper rows and existing states. Do NOT backfill acceptance or
--   approval evidence. Legacy linked pending rows need trusted-owner review.
-- * Remove direct helper/invite writes, including service_role access. Future
--   edits, rejection, removal and leave require separate reviewed operations.
-- * Tokens are bearer secrets, not recipient-bound. An administrator must inspect
--   the accepting account before approval. No tokens in queue/read projections.

begin;

-- A busy database must fail and roll back rather than wait indefinitely for DDL.
set local lock_timeout = '10s';

-- Fail closed if deployment ownership differs from the inspected Supabase setup.
do $migration$
begin
  if current_user <> 'postgres' then
    raise exception 'This migration requires the trusted postgres owner';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('trusted_helpers', 'helper_invites')
      and c.relowner <> 'postgres'::regrole
  ) then
    raise exception 'Review helper table ownership before applying this migration';
  end if;
  -- An unexpected overload could remain a second, insecure API entry point.
  if exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_helper_invite', 'accept_helper_invite')
      and p.oid not in (
        'public.create_helper_invite(uuid)'::regprocedure,
        'public.accept_helper_invite(text)'::regprocedure
      )
  ) then
    raise exception 'Review unexpected invitation function overloads';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      '_require_helper_invitation_admin', 'create_helper_with_invite',
      'approve_helper', 'list_helper_approval_queue', 'cancel_helper_invite',
      'list_helper_invitations'
    )
  ) then
    raise exception 'Review pre-existing names reserved for the new invitation API';
  end if;
end;
$migration$;

-- Block table access during the boundary change. Apply with invitation traffic
-- paused: a function invocation already in flight can retain its old body.
lock table public.trusted_helpers, public.helper_invites in access exclusive mode;

alter table public.trusted_helpers
  add column accepted_invite_id uuid references public.helper_invites(id),
  add column approved_by uuid references public.profiles(id),
  add column approved_at timestamptz,
  add constraint trusted_helpers_approval_audit_pair
    check ((approved_by is null) = (approved_at is null));

comment on column public.trusted_helpers.accepted_invite_id is
  'Acceptance evidence written only by the hardened claim RPC; legacy rows are not certified.';
comment on column public.trusted_helpers.approved_at is
  'Administrator activation timestamp; NULL for legacy records, with no inferred approval.';

update public.helper_invites
set revoked_at = clock_timestamp()
where used_at is null and revoked_at is null;

-- Expired outstanding tokens also occupy this slot until revoked/reissued.
create unique index helper_invites_one_outstanding_per_helper_idx
  on public.helper_invites(helper_id)
  where used_at is null and revoked_at is null;

-- Remove table AND any explicit column ACLs. RLS alone cannot enforce the
-- acceptance/approval transition, especially for bypass-RLS service roles.
revoke all privileges on table public.trusted_helpers, public.helper_invites
  from public, anon, authenticated, service_role;

do $migration$
declare
  col record;
begin
  for col in
    select c.relname, a.attname
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_class as c on c.oid = a.attrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('trusted_helpers', 'helper_invites')
      and a.attnum > 0 and not a.attisdropped
  loop
    execute format(
      'revoke all privileges (%I) on table public.%I from public, anon, authenticated, service_role',
      col.attname, col.relname
    );
  end loop;
end;
$migration$;

grant select on table public.trusted_helpers to authenticated;

-- Preserve the existing SELECT policies, including Helpers read own row.
drop policy "Members invite helpers" on public.trusted_helpers;
drop policy "Admins approve helpers" on public.trusted_helpers;
drop policy "Admins remove helpers" on public.trusted_helpers;

-- Internal guard, never callable by API roles. Parent locks precede membership,
-- helper and invitation locks, including the implicit FK locks on audit writes.
-- This protects the caller/family from concurrent deletion and the authoritative
-- admin row from concurrent demotion/deletion for the duration of an operation.
create function public._require_helper_invitation_admin(target_family uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  perform 1 from public.profiles as p where p.id = caller for key share;
  if not found then
    raise exception using errcode = '42501', message = 'Account profile required';
  end if;
  perform 1 from public.families as f where f.id = target_family for key share;
  if not found then
    raise exception using errcode = '42501', message = 'Family administrator required';
  end if;
  perform 1 from public.family_members as m
    where m.family_id = target_family and m.user_id = caller and m.role = 'admin'
    for share;
  if not found then
    raise exception using errcode = '42501', message = 'Family administrator required';
  end if;
  return caller;
end;
$function$;

-- Same signature/return type as before, now administrator-only and serialized.
create or replace function public.create_helper_invite(target_helper uuid)
returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  caller uuid;
  helper_family uuid;
  helper public.trusted_helpers%rowtype;
  raw_token text;
  issued_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  select h.family_id into helper_family from public.trusted_helpers as h
    where h.id = target_helper;
  caller := public._require_helper_invitation_admin(helper_family);
  select h.* into helper from public.trusted_helpers as h
    where h.id = target_helper and h.family_id = helper_family for update;
  if not found then
    raise exception using errcode = '42501', message = 'Helper unavailable';
  end if;
  if helper.state <> 'pending' or helper.user_id is not null
     or helper.accepted_invite_id is not null
     or helper.approved_at is not null or helper.approved_by is not null then
    raise exception using errcode = '55000', message = 'Helper must be pending and unlinked';
  end if;

  issued_at := clock_timestamp();
  update public.helper_invites as i set revoked_at = issued_at
    where i.helper_id = target_helper and i.used_at is null and i.revoked_at is null;
  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.helper_invites
    (family_id, helper_id, token_hash, created_by, created_at, expires_at)
  values (helper_family, target_helper,
    encode(sha256(convert_to(raw_token, 'utf8')), 'hex'), caller,
    issued_at, issued_at + interval '7 days');
  return raw_token;
end;
$function$;

-- Only this operation creates real invitation helper rows. A failure in either
-- the insert or issuance rolls back both; no caller-supplied user/state metadata.
create function public.create_helper_with_invite(
  target_family uuid, helper_name text, relationship text default ''
)
returns table (helper_id uuid, invite_token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare
  caller uuid;
  new_helper uuid;
  raw_token text;
begin
  caller := public._require_helper_invitation_admin(target_family);
  if helper_name is null or btrim(helper_name) = '' or length(helper_name) > 200
     or relationship is null or length(relationship) > 200 then
    raise exception using errcode = '22023', message = 'Provide a valid helper name and relationship';
  end if;
  insert into public.trusted_helpers
    (family_id, name, role, state, user_id, invited_by)
  values (target_family, btrim(helper_name), btrim(relationship), 'pending', null, caller)
  returning id into new_helper;
  raw_token := public.create_helper_invite(new_helper);
  return query select new_helper, raw_token, i.expires_at
    from public.helper_invites as i
    where i.helper_id = new_helper
      and i.token_hash = encode(sha256(convert_to(raw_token, 'utf8')), 'hex');
end;
$function$;

create or replace function public.accept_helper_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
  candidate public.helper_invites%rowtype;
  invitation public.helper_invites%rowtype;
  helper public.trusted_helpers%rowtype;
  claimed_at timestamptz;
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invitation unavailable or expired';
  end if;
  -- Lock the Auth-linked profile BEFORE the helper. Its FK checks otherwise
  -- acquire an implicit profile lock after the helper, opposing account deletion.
  -- The alias p is declared here and consistently used in the predicate.
  perform 1 from public.profiles as p where p.id = caller for key share;
  if not found then
    raise exception using errcode = '42501', message = 'Account profile required';
  end if;
  select i.* into candidate from public.helper_invites as i
    where i.token_hash = encode(sha256(convert_to(invite_token, 'utf8')), 'hex');
  if not found then
    raise exception using errcode = '22023', message = 'Invitation unavailable or expired';
  end if;

  -- All mutations lock helper BEFORE invitation. The initial token lookup is
  -- deliberately unlocked; recheck every condition after acquiring both locks.
  select h.* into helper from public.trusted_helpers as h
    where h.id = candidate.helper_id and h.family_id = candidate.family_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Invitation unavailable or expired';
  end if;
  select i.* into invitation from public.helper_invites as i
    where i.id = candidate.id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Invitation unavailable or expired';
  end if;
  claimed_at := clock_timestamp();
  if invitation.used_at is not null or invitation.used_by is not null
     or invitation.revoked_at is not null or invitation.expires_at <= claimed_at
     or helper.state <> 'pending' or helper.user_id is not null
     or helper.accepted_invite_id is not null
     or helper.approved_at is not null or helper.approved_by is not null then
    raise exception using errcode = '22023', message = 'Invitation unavailable or expired';
  end if;
  update public.helper_invites set used_at = claimed_at, used_by = caller
    where id = invitation.id;
  update public.trusted_helpers
    set user_id = caller, accepted_invite_id = invitation.id
    where id = helper.id;
  -- State stays pending; no internal family membership or pickup grants.
  return helper.family_id;
end;
$function$;

create function public.approve_helper(target_helper uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  caller uuid;
  helper_family uuid;
  helper public.trusted_helpers%rowtype;
begin
  select h.family_id into helper_family from public.trusted_helpers as h
    where h.id = target_helper;
  caller := public._require_helper_invitation_admin(helper_family);
  select h.* into helper from public.trusted_helpers as h
    where h.id = target_helper and h.family_id = helper_family for update;
  if not found then
    raise exception using errcode = '42501', message = 'Helper unavailable';
  end if;
  if helper.user_id is null or helper.accepted_invite_id is null then
    raise exception using errcode = '55000', message = 'Verified helper acceptance required';
  end if;
  perform 1 from public.helper_invites as i
    where i.id = helper.accepted_invite_id and i.helper_id = helper.id
      and i.family_id = helper.family_id and i.used_by = helper.user_id
      and i.used_at is not null and i.revoked_at is null
      and i.used_at < i.expires_at
    for update;
  if not found then
    raise exception using errcode = '55000', message = 'Verified helper acceptance required';
  end if;
  -- Safe retry after a lost response: preserve the original approval audit.
  if helper.state = 'active' and helper.approved_at is not null
     and helper.approved_by is not null then
    return helper.id;
  end if;
  if helper.state <> 'pending' then
    raise exception using errcode = '55000', message = 'Helper must be pending';
  end if;
  update public.trusted_helpers
    set state = 'active', approved_by = caller, approved_at = clock_timestamp()
    where id = helper.id;
  return helper.id;
end;
$function$;

-- Only accepted, pending records verified by the hardened flow enter this queue.
-- Names allow an administrator to compare the accepting account with the invite.
create function public.list_helper_approval_queue(target_family uuid)
returns table (
  membership_id uuid, family_id uuid, helper_name text, relationship text,
  accepting_account_id uuid, accepting_account_name text, accepted_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform public._require_helper_invitation_admin(target_family);
  return query
    select h.id, h.family_id, h.name, h.role, p.id, p.full_name, i.used_at
    from public.trusted_helpers as h
    join public.helper_invites as i on i.id = h.accepted_invite_id
      and i.helper_id = h.id and i.family_id = h.family_id
      and i.used_by = h.user_id
    join public.profiles as p on p.id = h.user_id
    where h.family_id = target_family and h.state = 'pending'
      and i.used_at is not null and i.revoked_at is null
      and i.used_at < i.expires_at
    order by i.used_at, h.id;
end;
$function$;

-- Cancellation affects only unconsumed invitations, not accepted memberships.
-- Takes an invitation ID, never the token. Repeated cancellation returns false.
create function public.cancel_helper_invite(target_invite uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  candidate public.helper_invites%rowtype;
  invitation public.helper_invites%rowtype;
begin
  select i.* into candidate from public.helper_invites as i where i.id = target_invite;
  perform public._require_helper_invitation_admin(candidate.family_id);
  perform 1 from public.trusted_helpers as h
    where h.id = candidate.helper_id and h.family_id = candidate.family_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Invitation unavailable';
  end if;
  select i.* into invitation from public.helper_invites as i
    where i.id = target_invite for update;
  if not found then
    raise exception using errcode = '42501', message = 'Invitation unavailable';
  end if;
  if invitation.used_at is not null or invitation.used_by is not null then
    raise exception using errcode = '55000', message = 'Accepted invitations cannot be cancelled';
  end if;
  if invitation.revoked_at is not null then return false; end if;
  update public.helper_invites set revoked_at = clock_timestamp() where id = target_invite;
  return true;
end;
$function$;

-- Issuance returns a token once; this admin-only listing supplies IDs needed for
-- cancellation/review without exposing token_hash, raw tokens or contact data.
create function public.list_helper_invitations(target_family uuid)
returns table (
  invitation_id uuid, helper_id uuid, helper_name text,
  created_at timestamptz, expires_at timestamptz,
  used_at timestamptz, revoked_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform public._require_helper_invitation_admin(target_family);
  return query
    select i.id, h.id, h.name, i.created_at, i.expires_at, i.used_at, i.revoked_at
    from public.helper_invites as i
    join public.trusted_helpers as h on h.id = i.helper_id and h.family_id = i.family_id
    where i.family_id = target_family
    order by i.created_at desc, i.id desc;
end;
$function$;

-- Explicit trusted ownership and ACLs also remove Supabase default EXECUTE
-- grants. The internal guard has no API grants at all.
alter function public._require_helper_invitation_admin(uuid) owner to postgres;
alter function public.create_helper_invite(uuid) owner to postgres;
alter function public.create_helper_with_invite(uuid, text, text) owner to postgres;
alter function public.accept_helper_invite(text) owner to postgres;
alter function public.approve_helper(uuid) owner to postgres;
alter function public.list_helper_approval_queue(uuid) owner to postgres;
alter function public.cancel_helper_invite(uuid) owner to postgres;
alter function public.list_helper_invitations(uuid) owner to postgres;

revoke all privileges on function
  public._require_helper_invitation_admin(uuid),
  public.create_helper_invite(uuid),
  public.create_helper_with_invite(uuid, text, text),
  public.accept_helper_invite(text),
  public.approve_helper(uuid),
  public.list_helper_approval_queue(uuid),
  public.cancel_helper_invite(uuid),
  public.list_helper_invitations(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.create_helper_invite(uuid),
  public.create_helper_with_invite(uuid, text, text),
  public.accept_helper_invite(text),
  public.approve_helper(uuid),
  public.list_helper_approval_queue(uuid),
  public.cancel_helper_invite(uuid),
  public.list_helper_invitations(uuid)
to authenticated;

-- Fail closed on inherited/default grants that survived the explicit revokes.
-- Check every role an API role can SET ROLE to, even with NOINHERIT. BYPASSRLS
-- (normal for service_role) bypasses policies, NOT table/function ACLs; it is not
-- a reason to omit service_role from these assertions. Never assume a role's
-- name proves it is non-superuser or cannot assume the trusted owner role.
do $migration$
declare
  source_api_role text;
  api_role text;
  target_table text;
  permission text;
  target_function text;
begin
  foreach source_api_role in array array['anon', 'authenticated', 'service_role'] loop
    for api_role in
      select r.rolname::text from pg_catalog.pg_roles as r
      where pg_has_role(source_api_role::name, r.oid, 'SET')
    loop
    if exists (
      select 1 from pg_catalog.pg_roles as r where r.rolname = api_role::name
        and (r.rolsuper or r.rolcreaterole)
    ) or pg_has_role(api_role::name, 'postgres'::name, 'SET') then
      raise exception 'Unexpected privileged role reachable from an API role';
    end if;
    if has_schema_privilege(api_role::name, 'public', 'CREATE') then
      raise exception 'Unexpected API schema creation privilege';
    end if;
    foreach target_table in array array['public.trusted_helpers', 'public.helper_invites'] loop
      foreach permission in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] loop
        if has_table_privilege(api_role::name, target_table, permission) then
          raise exception 'Unexpected effective helper table write privilege; review role inheritance';
        end if;
      end loop;
      if has_any_column_privilege(api_role::name, target_table, 'INSERT')
         or has_any_column_privilege(api_role::name, target_table, 'UPDATE')
         or has_any_column_privilege(api_role::name, target_table, 'REFERENCES') then
        raise exception 'Unexpected effective helper column write privilege';
      end if;
    end loop;
    if has_table_privilege(api_role::name, 'public.helper_invites', 'SELECT')
       or has_any_column_privilege(api_role::name, 'public.helper_invites', 'SELECT') then
      raise exception 'Unexpected invitation read privilege';
    end if;
    if has_function_privilege(api_role::name, 'public._require_helper_invitation_admin(uuid)', 'EXECUTE') then
      raise exception 'Unexpected internal administrator guard execution privilege';
    end if;
    if source_api_role <> 'authenticated' then
      foreach target_function in array array[
        'public.create_helper_invite(uuid)',
        'public.create_helper_with_invite(uuid,text,text)',
        'public.accept_helper_invite(text)', 'public.approve_helper(uuid)',
        'public.list_helper_approval_queue(uuid)', 'public.cancel_helper_invite(uuid)',
        'public.list_helper_invitations(uuid)'
      ] loop
        if has_function_privilege(api_role::name, target_function, 'EXECUTE') then
          raise exception 'Unexpected invitation API execution privilege';
        end if;
      end loop;
    end if;
    end loop;
  end loop;
  -- Unknown permissive write policies are schema drift. Fail rather than drop
  -- policies we have not reviewed; the two intended SELECT policies remain.
  if exists (
    select 1 from pg_catalog.pg_policy as p
    where p.polrelid in ('public.trusted_helpers'::regclass, 'public.helper_invites'::regclass)
      and p.polcmd <> 'r'
  ) then
    raise exception 'Review unexpected helper or invitation write policies';
  end if;
end;
$migration$;

-- Lock ordering within one operation:
-- admin: caller profile -> family -> admin membership -> helper -> invitation;
-- accept: caller profile -> helper -> invitation. Unlocked candidate lookups do
-- not take row locks; authorization/claim conditions are rechecked after locking.
-- Independent helpers are not globally serialized. Multi-operation caller-owned
-- transactions must lock helper IDs consistently; reversed batches, unrelated
-- family_members writes or privileged deletion can still cause 40P01 deadlocks.
-- Retry a deadlocked transaction in full; creation is atomic, not idempotent.

comment on function public.create_helper_with_invite(uuid, text, text) is
  'Admin-only atomic pending helper creation and single-use bearer token issuance. Treat returned token as a secret.';
comment on function public.accept_helper_invite(text) is
  'Authenticated single-use claim. Links the caller and records acceptance; leaves helper pending and grants no family membership.';
comment on function public.approve_helper(uuid) is
  'Admin-only activation after verified recipient acceptance. Does not grant pickup authorization.';

commit;

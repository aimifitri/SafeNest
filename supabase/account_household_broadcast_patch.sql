-- =====================================================
-- SafeNest: group request respects authorization and availability   (PROPOSAL - not applied)
--
-- Optional. Needs pickup_broadcast.sql AND account_household.sql to be applied first.
-- It replaces open_backup_broadcast() (same name, same arguments, same result) with one change in who is asked.
-- The request is still sent to everyone eligible AT THE SAME TIME. It is not turned into a queue.
--
--   Before: every joined family member, plus every active, joined Trusted Circle member.
--   After:  a joined family member only if a guardian marked them "can collect",
--           a Trusted Circle member only if approved (state = 'active') and joined,
--           and in both cases only if person_available() says their saved hours allow it right now.
--
-- If people are approved but none is available it raises 'Nobody available right now' (shown to the parent as a clear
-- message). If nobody is approved and joined it still raises 'Nobody to ask yet'.
--
-- DECISION FOR THE BACKEND TEAM: this makes saved availability mandatory for the group request. Someone who has never
-- saved their hours is not asked. If you would rather treat "never set" as available, change person_available() to
-- return true when there is no row, and say so in the app copy.
-- =====================================================

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
           where fm.family_id = fid and fm.can_collect and public.person_available(fm.user_id)
          union all
          select h.user_id, h.name, nullif(h.role, ''), 'circle', h.id, 2
            from public.trusted_helpers h
           where h.family_id = fid and h.state = 'active' and h.user_id is not null and public.person_available(h.user_id)
        ) x
       where x.user_id <> requester
       order by x.user_id, x.pri
    ) e;
  get diagnostics n = row_count;

  if n = 0 then
    delete from public.backup_broadcasts where id = new_id;
    -- Say why: people are approved but none is available, or nobody is approved and joined at all.
    if exists (
         select 1 from public.family_members fm where fm.family_id = fid and fm.can_collect and fm.user_id <> requester
         union all
         select 1 from public.trusted_helpers h where h.family_id = fid and h.state = 'active' and h.user_id is not null
       ) then
      raise exception 'Nobody available right now';
    end if;
    raise exception 'Nobody to ask yet';
  end if;

  perform public.log_escalation(target_child, fid, new_id, 'broadcast_started', requester,
    jsonb_build_object('reason', trigger_reason, 'asked', n));
  return query select new_id, true, n;
end;
$$;
revoke execute on function public.open_backup_broadcast(uuid, uuid, text) from public, anon, authenticated;

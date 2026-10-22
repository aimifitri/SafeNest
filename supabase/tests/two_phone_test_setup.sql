-- TEST DATA ONLY. Run this in the SQL editor of a TEST Supabase project (or a copy of the data), never on real families.
-- It is not applied automatically and changes nothing until a person runs it.
--
-- Why it exists: the app has no screens yet that create a child, add a trusted helper to the database or link a helper's
-- account (create_helper_invite and accept_helper_invite exist in the database but nothing in the app calls them).
-- So before a two-phone test, these rows have to be added by hand.
--
-- Before running:
--   1. Phone 1: open SafeNest, create the PARENT account, log in once (this creates the family).
--   2. Phone 2: open SafeNest, create the HELPER account.
--   3. Put both emails below, then run the whole file.
-- It is safe to run twice: it adds nothing that already exists.
do $$
declare
  parent_email text := 'parent@example.com';   -- <- change
  helper_email text := 'helper@example.com';   -- <- change
  helper_name  text := 'Test Helper';
  p uuid; h uuid; fid uuid; cid uuid;
begin
  select id into p from auth.users where lower(email) = lower(parent_email);
  select id into h from auth.users where lower(email) = lower(helper_email);
  if p is null then raise exception 'No account for %. Sign up in the app first.', parent_email; end if;
  if h is null then raise exception 'No account for %. Sign up in the app first.', helper_email; end if;
  if p = h then raise exception 'Use two different accounts.'; end if;

  select family_id into fid from public.family_members where user_id = p order by created_at limit 1;
  if fid is null then raise exception 'The parent has no family yet. Log in once as the parent, then run this again.'; end if;

  select id into cid from public.children where family_id = fid order by created_at limit 1;
  if cid is null then
    insert into public.children (family_id, name, age, class_name, school_name, school_address, teacher_name)
    values (fid, 'Test Child', 7, '2 Amanah', 'Test School', 'Test Address', 'Cikgu Test')
    returning id into cid;
  end if;

  if not exists (select 1 from public.trusted_helpers where family_id = fid and user_id = h) then
    insert into public.trusted_helpers (family_id, name, role, user_id, state, invited_by)
    values (fid, helper_name, 'Uncle', h, 'active', p);
  end if;
end $$;

-- Optional: give the school coordinates so Today can estimate the trip (needs school_location.sql applied).
-- update public.children set school_latitude = 2.2, school_longitude = 102.3 where name = 'Test Child';

-- Clean up after the test (removes the test child and, through cascades, its requests and journeys):
-- delete from public.children where name = 'Test Child';
-- delete from public.trusted_helpers where name = 'Test Helper';

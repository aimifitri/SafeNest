-- =====================================================
-- SafeNest: school location (for travel-time estimates on Today)
-- Run any time after schema.sql. Safe to re-run.
-- Without it Today says "SafeNest does not have the school's location yet" and does not guess.
-- Set it per child, e.g. in the Supabase table editor:
--   update public.children set school_latitude = 2.2, school_longitude = 102.3 where id = '...';
-- It is the school's public location, not anybody's live position.
-- =====================================================
alter table public.children add column if not exists school_latitude double precision;
alter table public.children add column if not exists school_longitude double precision;

alter table public.children drop constraint if exists children_school_location_check;
alter table public.children add constraint children_school_location_check check (
  (school_latitude is null and school_longitude is null)
  or (school_latitude is not null and school_longitude is not null
      and school_latitude between -90 and 90 and school_longitude between -180 and 180)
);

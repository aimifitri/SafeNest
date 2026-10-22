
BEGIN;

-- 1. Generate temporary test IDs
DO $$
BEGIN
  PERFORM set_config('safenest_test.user_a', gen_random_uuid()::text, true);
  PERFORM set_config('safenest_test.user_b', gen_random_uuid()::text, true);
  PERFORM set_config('safenest_test.family', gen_random_uuid()::text, true);
  PERFORM set_config('safenest_test.helper_a', gen_random_uuid()::text, true);
  PERFORM set_config('safenest_test.helper_b', gen_random_uuid()::text, true);
END;
$$;

-- 2. Create temporary Auth users
-- The signup trigger creates their profiles.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
(
  current_setting('safenest_test.user_a')::uuid,
  'rpc-a-' || current_setting('safenest_test.user_a') || '@example.invalid',
  '{"full_name":"RPC Test User A"}'::jsonb
),
(
  current_setting('safenest_test.user_b')::uuid,
  'rpc-b-' || current_setting('safenest_test.user_b') || '@example.invalid',
  '{"full_name":"RPC Test User B"}'::jsonb
);

-- 3. Create a temporary family
INSERT INTO public.families (id, name, created_by)
VALUES (
  current_setting('safenest_test.family')::uuid,
  'RPC isolation test family',
  current_setting('safenest_test.user_a')::uuid
);

-- 4. Create one membership for each user
INSERT INTO public.trusted_helpers
  (id, family_id, name, role, user_id, state, invited_by)
VALUES
(
  current_setting('safenest_test.helper_a')::uuid,
  current_setting('safenest_test.family')::uuid,
  'RPC Test Helper A',
  'Aunt',
  current_setting('safenest_test.user_a')::uuid,
  'active',
  current_setting('safenest_test.user_a')::uuid
),
(
  current_setting('safenest_test.helper_b')::uuid,
  current_setting('safenest_test.family')::uuid,
  'RPC Test Helper B',
  'Uncle',
  current_setting('safenest_test.user_b')::uuid,
  'pending',
  current_setting('safenest_test.user_a')::uuid
);

-- 5. Simulate an authenticated user
SET LOCAL ROLE authenticated;

-- Set User A's identity
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    current_setting('safenest_test.user_a'),
    true
  );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('safenest_test.user_a'),
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

-- 6. Test User A's access and isolation
WITH rpc AS MATERIALIZED (
  SELECT *
  FROM public.list_my_joined_circles()
),
assertions AS (
  SELECT
    1 AS seq,
    'User A: authenticated role and correct identity' AS assertion,
    (
      current_user = 'authenticated'
      AND auth.uid() = current_setting('safenest_test.user_a')::uuid
    ) AS passed

  UNION ALL

  SELECT
    2,
    'User A: exactly one membership returned',
    (SELECT count(*) = 1 FROM rpc)

  UNION ALL

  SELECT
    3,
    'User A: own membership and expected fields returned',
    EXISTS (
      SELECT 1
      FROM rpc
      WHERE membership_id = current_setting('safenest_test.helper_a')::uuid
        AND family_id = current_setting('safenest_test.family')::uuid
        AND family_name = 'RPC isolation test family'
        AND relationship = 'Aunt'
        AND state = 'active'
        AND created_at IS NOT NULL
    )

  UNION ALL

  SELECT
    4,
    'User A: User B membership is hidden',
    NOT EXISTS (
      SELECT 1
      FROM rpc
      WHERE membership_id = current_setting('safenest_test.helper_b')::uuid
    )
)

SELECT
  assertion,
  CASE
    WHEN passed THEN 'PASS'
    ELSE 'FAIL'
  END AS result
FROM assertions
ORDER BY seq;

-- 7. Remove all temporary test records
ROLLBACK;

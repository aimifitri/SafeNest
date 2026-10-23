# Database tests

These tests use an in-memory PGlite database and a stand-in for Supabase's `auth` schema. They do not connect to the shared Supabase project. Run only the tests for the SQL change you are reviewing:

```bash
npm install --no-save --package-lock=false @electric-sql/pglite
node supabase/tests/account_household.test.mjs
node supabase/tests/pickup_workflow.test.mjs
node supabase/tests/pickup_journeys.test.mjs
node supabase/tests/pickup_location_sharing.test.mjs
node supabase/tests/school_location.test.mjs
node supabase/tests/pickup_broadcast.test.mjs
node supabase/tests/push_notifications.test.mjs
```

Some suites use proposal SQL or root-level SQL files rather than the versioned migrations. Read each test's setup before interpreting a passing result. A PGlite pass does not verify Supabase grants, deployed policies, Realtime, `pg_cron`, email delivery, or behavior against the shared project.

`two_phone_test_setup.sql` is a manual fixture, not a test suite. It writes test records. Use it only against an explicitly designated test project and follow [PICKUP_TWO_PHONE_TEST.md](../../PICKUP_TWO_PHONE_TEST.md).

## App-side logic tests

These use the `esbuild` dev dependency and do not need Supabase credentials or a database:

```bash
npm test
```

This runs the current tests in `tests/`. Run `npm run typecheck` separately. Neither command applies migrations or tests native UI/device behavior.

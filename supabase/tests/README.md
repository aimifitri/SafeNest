# SQL tests

Run on a throwaway in-memory Postgres (PGlite) with a stand-in for Supabase's `auth` schema:

    npm i --no-save @electric-sql/pglite
    node supabase/tests/pickup_workflow.test.mjs   # backup requests
    node supabase/tests/pickup_journeys.test.mjs   # pickup confirmation
    node supabase/tests/school_location.test.mjs   # school coordinates check constraint
    node supabase/tests/pickup_broadcast.test.mjs  # ask-everyone rounds, opt-in, scheduled check (proposal SQL)

App-side logic tests (no database): `node tests/circleEngine.test.mjs`, `node tests/demoSim.test.mjs`, `node tests/pickupFlow.test.mjs`, `node tests/teacherMessages.test.mjs` and `node tests/eta.test.mjs` (need `esbuild`).

They do not touch your real Supabase project. They cannot check Realtime or pg_cron.

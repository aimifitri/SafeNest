# Backend status

This is a repository-status summary, not a deployment record. Source code, SQL files, or local tests do not prove that a feature is enabled on the shared Supabase project. The shared project's migration state and policies were not inspected for this summary.

The project owner's last guidance says the invitation/acceptance/admin-approval migration is undergoing local security testing. Treat that review as incomplete until the owner updates this document or confirms otherwise. Do not apply SQL to the shared project based on this file.

| Area | Present in the repository | Readiness / evidence boundary |
| --- | --- | --- |
| Auth, profile, household | Supabase client, auth/session context, profile and household APIs, screens | Integrated in app code. Requires a valid local `.env`. Live project configuration, RLS and email flows are not certified here. |
| Joined Circles and invitations | Circle UI/API, joined-circle RPC use, versioned migrations including `20261019_add_list_my_joined_circles.sql` and `20261020_secure_helper_invitations.sql` | Code and migration sources are present. Invitation security review and shared-project deployment status are unverified. Acceptance does not by itself establish pickup permission. |
| Backup requests and pickup journeys | App APIs/hooks and root SQL files such as `pickup_workflow.sql` and `pickup_journeys.sql`; local SQL test scripts | Source exists, but root SQL files and versioned migrations are not yet documented as one canonical release sequence. Deployed functions, grants and policies are unverified. |
| Group backup broadcast | `useCircleBroadcast`, `pickup_broadcast.sql`, and associated SQL tests | The Plan UI still indicates the broadcast backend upgrade is required. Do not treat group broadcast as enabled without owner confirmation. |
| Location | Foreground GPS/map and route estimate; generic `location_sharing.sql`; pickup-scoped UI and `migrations/20261023_pickup_scoped_location_sharing.sql` | Pickup sharing UI and additive SQL are prepared locally. The migration is not approved, tested against a real project, or applied. It depends on `pickup_workflow.sql` and `pickup_journeys.sql`, which remain root-level scripts outside the versioned migration sequence. Do not use live collector tracking until the backend owner verifies the order, reviews the policies, and deploys to a test project first. |
| Push notifications | Proposal SQL and `.txt` client/edge-function examples under `proposals/push-notifications/`, plus a local SQL test | Proposal only; no app integration or deployment is established. The `.txt` files are intentionally not compiled. |

## Migration and test boundaries

- `supabase/schema.sql` is byte-for-byte identical to `supabase/migrations/20261018_initial_schema.sql`. Keep one canonical migration history; if the root file remains for convenience, identify it as a generated snapshot and avoid editing it independently.
- Root-level SQL files and `supabase/snippets/Untitled query *.sql` are not all versioned migrations. The snippets include both diagnostics and a second substantial invitation-security script. Name and reconcile them with the reviewed migration history before relying on them; do not run an unnamed snippet as a deployment step.
- `migrations/20261023_pickup_scoped_location_sharing.sql` depends on the pickup workflow and journey tables/functions. Those prerequisites currently live in root-level SQL files, so the new migration is not independently deployable through the versioned migration history as it stands.
- `supabase/tests/account_household.test.mjs` exercises the root `account_household.sql` and broadcast patch. The app-side `tests/invitationApi.test.mjs` and `tests/invitationSafety.test.mjs` use mocked RPCs and do not verify database RLS or the security behavior of `20261020_secure_helper_invitations.sql`. The manual invitation test query is not a substitute for a repeatable migration-specific authorization suite.
- PGlite checks are useful local evidence, but they do not prove Supabase grants, deployed schema state, concurrent behavior on the hosted service, or successful migration against the actual project.

## Safe status updates

For each backend change, record the migration filename, test project, tests run and result, reviewer/owner approval, and whether it was applied to a test or shared project. Keep credentials out of this file. Never record a service-role key here.

Only the backend owner should mark a migration approved or applied. Before any shared-project change, coordinate explicitly and verify the target project and migration order. Never use `supabase db push` or `supabase db reset` as a substitute for that review.

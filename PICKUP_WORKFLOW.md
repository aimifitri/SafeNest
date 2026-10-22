# Pickup workflow: what changed

## SQL, in this order (Supabase SQL editor, all safe to re-run)
1. `supabase/schema.sql` (already done)
2. `supabase/location_sharing.sql` (optional; if present, closing a journey also stops that person's sharing)
3. `supabase/pickup_workflow.sql`  backup request rules and helper answers
4. `supabase/pickup_journeys.sql`  pickup confirmation (journeys)
5. `supabase/school_location.sql`  school coordinates on `children` (needed for real travel-time estimates)

Re-run step 3 even if you ran it before: `my_backup_assignments()` now also returns `child_id`.

## Backup request (earlier change)
Only the chosen helper can accept or decline. One open request per child. All writes go through functions.

## Pickup confirmation (this change)
A journey is one trip to collect one child: started -> at_school -> collected (or cancelled).
- Who can start: a family member, or a linked helper with an ACCEPTED backup request for that child.
- Only the person who started it can mark "arrived" and "collected" (a removed helper loses that right at once).
- Confirming the handover closes the journey, completes the linked backup request, and stops that
  person's live location sharing. Cancelling also stops sharing. Any family member can cancel.
- The handover is recorded by the collector. The school does NOT verify it, and the app says so.
  School verification / QR / PIN would be a separate feature.

App side
- New: `shared/pickupJourneyApi.ts`, `shared/usePickupJourney.ts`, `today/JourneySteps.tsx`, `shared/backupApi.ts`, `today/HelperAssignments.tsx`.
- Today: when a real journey exists, the status card shows it (no fake ETA, the map dot no longer moves).
  Parents also get a "I'm on my way to collect" card. The handover needs a second tap.
- Helper: the accepted request card now has Start journey / I've arrived at school / I've collected.
- `AppContext` exposes `storedChildId`. `PickupStatus.simulated` and `BackupRequest.simulated` are `boolean`.

## Still not done
- Needs Circle to store helpers in the database, the helper invite link, and a child row in `children`.
  Until then the screens stay on the labelled demo.
- No push notification (a helper must open the app to see a request).
- No timeout for a helper who never answers, and no late-pickup alerts.
- Not tested on a phone, and not tested with Realtime.

## Today pickup decision flow (latest change)
Why Today contradicted itself: the hero was stitched from four unrelated sources (a hard-coded "On track" label, the
mock helper as default collector, a fixed "35 min" figure, and an always-visible "Ask a helper" button), and the
teacher check lived privately inside the Plan screen. Nothing computed "can I arrive on time".

Now one pure function decides everything: `shared/pickupFlow.ts` -> `derivePickupFlow()`. Precedence:
journey > backup request > "I'll still collect" choice > location/ETA. Today, the map dots and Plan all read it
(`today/usePickupFlow.ts`, `shared/resolveCollector`), so there is one answer to "who collects".

Phases: needs_location, checking, eta_unavailable, on_time, late, will_collect, backup_pending, backup_declined,
helper_assigned, travelling, at_school, collected.
- Lateness = predicted arrival minus dismissal, rounded to minutes. Late if more than `PICKUP_CONFIG.lateGraceMinutes` (0).
  1:00 PM dismissal and 1:10 PM arrival = 10 minutes late. The rule is shown under "How SafeNest decides".
- Travel time: foreground GPS (asked only when the parent taps) + OSRM public demo server (`shared/eta.ts`). Driving time, no
  live traffic, rounded UP. Never straight-line. A result older than 5 minutes is refreshed. Missing permission, GPS,
  school coordinates and network each have their own message.
- No stored child yet: a labelled DEMO estimate is used, never presented as real.
- "Find trusted backup" is only offered after the parent chooses it, and says nobody is assigned until a helper accepts.
  It asks the first eligible helper; if declined, "Ask <next helper>". The database allows one open request per child, so
  accepted means assigned.
- The 9 demo scenarios are in Demo controls (top right of the map). All are labelled and contact nobody.

Known limits
- Nearby-helper priority is NOT implemented: there is no consented helper location data. Order is the Circle list order.
- The scheduled collector is assumed to be the signed-in parent (no per-day collector is stored yet).
- "I'll still collect" is remembered on this phone only and resets when the app restarts.
- Real ETA needs `school_latitude/longitude` set on the child (migration 5). Without it Today says it cannot estimate.
- OSRM's public server is for demos. Use your own routing service before real users.
- Not tested on a phone, with real GPS, or with Realtime.


---
The automatic ask-everyone flow (restored from the prototype), its state diagram, backend approvals and tests are in `PICKUP_AUTO_BACKUP.md`.

# Automatic pickup backup and the pickup journey (restored from the original prototype)

The original HTML prototype asks the whole family and Trusted Circle together when the parent is predicted to be
late and has not answered by 5 minutes before dismissal. This app now does the same. The decisions are a port of the
prototype's `tick()`, `isLate()`, `askAt()`, `fireCircle()`, `recipients()`, `reply()`, `allNo()` and `mainCard()`.

## What is real and what is simulated

| Part | Demo (no child stored, or "Demo" in Demo controls) | Real (a child is stored in Supabase) |
| --- | --- | --- |
| Clock, dismissal time | Demo clock and editable dismissal | Phone clock and Pickup Plan |
| Parent location, travel delay | Place, delay and location mode controls | expo-location and OSRM route |
| Decision rules (late? deadline? who is asked?) | Same pure functions (`circleEngine.ts`) | Same pure functions |
| The request to the circle | Local state only. Nobody is contacted | Persisted in Supabase by `start_backup_broadcast` (needs `pickup_broadcast.sql`) |
| Answers | Scripted or tapped in Demo controls | Each person answers on their own phone |
| First accept wins, others closed | Local engine | Database function with a row lock |
| Teacher message and photo | Prepared text. The parent sends it (WhatsApp or share) | Same. SafeNest never sends it |
| Teacher compares the photo | Outside the app. The teacher messages the parent personally | Same. Nothing is recorded in the app |
| Phone alert to the people asked | None | Not built. Needs push infrastructure (see below) |
| Automatic request while the app is closed | Not applicable | Needs a scheduled job (see below). Not deployed |

Without the backend upgrade, real mode says so ("group requests are not enabled") and falls back to asking one
helper at a time. It never claims the circle was asked unless the database confirmed it.

## Pickup state diagram

```
                        +------------------+
   location problem --> | needs_location / |  (no estimate: SafeNest never guesses and never asks anyone on its own)
                        | eta_unavailable  |
                        +------------------+
                                 |
   estimate ready                v
   +---------+  late    +--------------+  tap "I'll still collect"   +--------------+
   | on_time |--------->|     late     |---------------------------->| will_collect |
   +---------+          +--------------+                             +--------------+
        |                      | tap "Find trusted backup"                  |  (never auto-escalated)
        | "I can't make it"    | OR deadline (dismissal - 5 min) reached,   |  "Start journey"
        v                      |    parent unanswered, opt-in ON            v
   +----------+  <-------------+                                     +--------------+
   |  asking  |  everyone eligible asked together (all Pending)      |  travelling  |
   +----------+                                                      +--------------+
     |   |   |                                                              |
     |   |   +-- everyone declined / no response --> nobody --+--> "I will come myself" -> will_collect
     |   |                                                     +--> "Ask everyone again" -> asking
     |   +-- parent cancels --> back to late / on_time
     +-- first accept: others closed ("Not needed")
              |
              v
      helper_assigned  (accepted, NOT collected)
              | demo: "collector starts travelling"      real: the collector taps start on their phone
              v
         travelling  (demo marker moves; real mode shows no live location)
              | demo: "collector arrives at school"      real: the collector taps arrived
              v
        at_school ("At school", parent can send the photo for the teacher)
              | the collector taps "I've picked up {child}"     demo: "Demo: ... says picked up"
              v
          collected ("Picked up", banner)

   The teacher compares the photo with the person at the gate and tells the parent personally (WhatsApp or a call).
   The app has no teacher yes or no. If the person does not match, the child is not released and nobody taps anything.
   Opt-in OFF at the deadline: "Needs your answer" alert only (ask_now). Nothing is sent.
```

Automatic deadline: `dismissal - minutesBefore` (default 5). After `dismissal + 30` minutes it stops acting.
The waiting time for answers is `responseWindowMinutes` (default 10). Unanswered people become "No response".

## Files

New:
- `src/components/shared/circleEngine.ts` (the ported decision engine, pure)
- `src/components/shared/demoSim.ts` (demo clock, location, delay, scripted answers; replaces `demoScenario.ts`)
- `src/components/shared/circleApi.ts`, `src/components/shared/useCircleBroadcast.ts` (real requests, realtime, opt-in settings)
- `src/components/shared/teacherMessages.ts` (teacher text, photo text, WhatsApp link)
- `src/components/today/CircleRows.tsx`, `src/components/today/TeacherSheets.tsx`, `src/components/today/JourneyProgress.tsx`, `src/components/today/PickupBanner.tsx`
- `supabase/pickup_broadcast.sql` (PROPOSAL, not applied), `supabase/tests/pickup_broadcast.test.mjs`
- `tests/circleEngine.test.mjs`, `tests/demoSim.test.mjs`, `tests/teacherMessages.test.mjs`
- `PICKUP_AUTO_BACKUP.md` (this file)

Modified:
- `src/components/shared/pickupFlow.ts` (phases for a round of requests; copy; actions)
- `src/components/shared/pickupDecision.ts`, `src/components/shared/backupApi.ts` (friendlier errors)
- `src/components/today/usePickupFlow.ts`, `PickupStatusCard.tsx`, `DemoControls.tsx`, `TodayDashboard.tsx`
- `src/components/plan/PickupPlan.tsx` (read-only arrangement, Automatic backup opt-in; active panels hidden)
- `src/components/circle/TrustedCircle.tsx` (local backup pickup panel hidden)
- `tests/pickupFlow.test.mjs` (rewritten), `supabase/tests/README.md`

Removed: `src/components/shared/demoScenario.ts` (superseded by `demoSim.ts`).

Not touched: `AppContext.tsx`, Circle, Settings, the Today map, navigation, journeys API, location sharing, all
existing SQL files, `HelperAssignments.tsx` (it already shows requests addressed to the signed-in person).

## Tests

| Command | Checks |
| --- | --- |
| `node tests/circleEngine.test.mjs` | 68: the brief's 12:30 to 12:55 example, opt-in, urgent alert, cutoff, idempotence, first accept wins, expiry, 3000 random sequences |
| `node tests/demoSim.test.mjs` | 68: the full scenario (A declines, B declines, C accepts, others closed, photo, picked up), opt-in off, manual backup, parent confirms, nobody available, no GPS, denied permission, dismissal change, expiry |
| `node tests/pickupFlow.test.mjs` | 45: every phase and its buttons |
| `node tests/teacherMessages.test.mjs`, `node tests/eta.test.mjs` | 9 and 7 |
| `node supabase/tests/pickup_broadcast.test.mjs` | 83 on in-memory Postgres (PGlite): everyone asked together, exclusions, idempotent start, first accept wins, late accept refused, expiry, opt-in, scheduled check conditions, RLS, audit |
| `pickup_workflow`, `pickup_journeys`, `school_location` SQL tests | 41, 37, 4 (unchanged, still pass) |

## Backend changes that need explicit approval (nothing here has been applied or scheduled)

1. Run `supabase/pickup_broadcast.sql`. It changes the schema:
   - `backup_requests`: 5 new columns, states `expired` and `closed`, and the "one active request per child" index now
     covers single-helper requests only.
   - 4 new tables with RLS (`backup_broadcasts`, `pickup_escalation_settings`, `pickup_status_reports`,
     `pickup_escalation_audit`) and no direct writes.
   - REPLACES three functions with the same names: `respond_backup_request`, `my_backup_assignments`,
     `complete_backup_request` (single-helper behaviour is unchanged and tested).
   - New functions listed at the top of the file. A trigger blocks a single-helper request while a round is live.
2. Scheduled job (optional, separate approval). `run_auto_escalation()` and `expire_due_broadcasts()` exist but nothing
   calls them. A backend owner would add `pg_cron` or an Edge Function that runs them every minute (commented examples
   at the end of the SQL). They act only with the parent's opt-in, a fresh phone report, a late prediction, and no
   existing round, journey or "I will collect" answer. Every action is audited.
3. Push notifications (not built). Writing the request to the database does not wake anyone's phone. People see it when
   they open SafeNest. Real delivery needs an Edge Function or webhook on `backup_requests` inserts plus Expo push tokens
   stored per user.
4. Product questions for the team: may any family member change the opt-in or only admins? Which roles should be asked?
   Should a Trusted Circle member see the child's name before accepting (they do now: name and school only)?

## Known limits

- "Nearby" is a highlight only. No real nearby data exists, so it is never shown in real mode.
- A timer inside an open app is not reliable. The app runs its check every 15 seconds while open, and reports status to
  the server every 5 minutes so the scheduled job could act when the app is closed. Without that job, a closed app asks nobody.
- If the phone never produced an estimate (no GPS, denied permission), nothing is sent on its own. The parent gets an alert.
- Demo routing uses the public OSRM demo server. Use your own routing service before real use.
- The app does not verify anyone. The teacher checks the photo in person, and the collector confirms the pickup.

## Where things live (tabs)

- **Today**: the only place with the live pickup. Helper answers show only while a request is open. After someone
  accepts: the collector card, a 5 step progress bar (Asked, Accepted, Travelling, At school, Picked up),
  the photo for the teacher on arrival, the in-app completion banner and the final status.
- **Plan**: school times, today's change, the planned arrangement (read only, links to Today) and the Automatic backup
  opt-in. No teacher panel, no helper answers, no cancel or reset.
- **Circle**: who is approved. The old local "Backup pickup" demo panel is hidden.
- **Demo controls** (sheet on Today): clock, location, delay, who answers, quick setups, and "Cancel and start over" and
  "Restart demo" in one place. The travel, arrival and picked-up buttons sit on the Today card at the step they belong to.

The hidden Plan and Circle panels are not deleted. `SHOW_ACTIVE_PICKUP_PANELS` (Plan) and `SHOW_PICKUP_WORKFLOW`
(Circle) are `false`; their state, handlers and APIs are unchanged.

## Post-acceptance journey

`circleEngine.ts` goes `covered -> travelling -> arrived -> collected`. `collected` can only be reached from `arrived`
(the collector says picked up), or by the parent collecting themselves. There is no teacher approval or rejection in the
app: the teacher compares the photo with the person at the gate and tells the parent directly. This replaced an earlier
version that had `approved` and `rejected` stages and demo teacher buttons.

Demo vs real:
- Demo only: the travel progress and moving marker, the ETA text, and the "Demo: ... picked up" button.
  These live in `demoSim.ts` and never call Supabase.
- Real mode: the collector's own journey buttons (existing `pickup_journeys` functions) drive travelling, at school and
  picked up. The map shows no live helper location. The completion banner is in-app only. Push notifications are not built.
- Supabase: no new SQL for this change. `pickup_broadcast.sql` from before is still only a proposal.

## Next steps (not built)

- Two-phone test of real mode: `PICKUP_TWO_PHONE_TEST.md`, with `supabase/tests/two_phone_test_setup.sql` to add the test child and helper.
- Push notifications: `proposals/push-notifications/README.md`. SQL and Edge Function are proposals, nothing is applied or deployed.

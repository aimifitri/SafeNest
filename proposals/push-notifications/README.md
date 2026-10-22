# Push notifications for pickup (proposal)

Status: **proposal only.** Nothing here is applied, installed or deployed, and the app works the same without it. Today the
app shows a banner while it is open. This would also reach a locked phone.

## What the person gets

| When | Who is told | Text (no names, no place) |
| --- | --- | --- |
| A request is made | Everyone being asked, not the parent | "Backup pickup request. Someone in your family asked for help with a pickup. Open SafeNest to answer." |
| Someone accepts | The parent who asked | "Backup found. Someone accepted. You do not need to collect today." |
| The collector sets off | The family, not the collector | "On the way" |
| The collector reaches school | The family, not the collector | "At school" |
| The collector confirms the pickup | The family, not the collector | "Picked up" |

Declines are not pushed (with a group request they would be noisy). The text is generic on purpose: a lock screen is not a
safe place for a child's name, school or position. The app shows the details after the person opens it and signs in.
Tapping an alert opens Today.

## How it works

```
trigger on backup_requests / pickup_journeys  ->  row in push_outbox
        Database Webhook (INSERT on push_outbox)  ->  Edge Function send-pickup-push
        Edge Function: finds the person's phones in push_tokens  ->  Expo push service  ->  the phone
```

The phone saves its Expo push token with `register_push_token`. Nobody can read tokens or the queue from the app, only the
Edge Function (service role) can.

## Files

| File | What it is |
| --- | --- |
| `push_notifications.sql` | Tables, token functions, triggers. 32 checks in `supabase/tests/push_notifications.test.mjs` on in-memory Postgres. |
| `send-pickup-push.index.ts.txt` | The Edge Function. Not run anywhere yet. |
| `pushNotifications.ts.txt` | Phone side: ask permission, register the token, open Today on tap. Not compiled yet. |

The `.txt` endings are on purpose, so the Expo TypeScript check and Supabase tooling ignore them.

## What the team has to do (nothing is automatic)

Backend team:
1. Review and approve `push_notifications.sql`, apply it after `pickup_broadcast.sql`.
2. Copy the Edge Function to `supabase/functions/send-pickup-push/index.ts` and deploy it.
3. Set its secrets: `supabase secrets set PUSH_WEBHOOK_SECRET=<long random string>` (and `EXPO_ACCESS_TOKEN` if the Expo project
   uses enhanced push security).
4. Create a Database Webhook: table `push_outbox`, event `INSERT`, HTTP request to the function URL, with the header
   `x-webhook-secret: <the same string>`.
5. Optional: a scheduled job that retries rows with `sent_at is null` and deletes old rows. Without it, a failed send is not retried.

App team (agree first; these touch other members' files):
1. `npx expo install expo-notifications` (`expo-device` is already in `package.json`). `AGENTS.md` asks for approval before adding packages.
2. Add the `expo-notifications` plugin to `app.json` and an EAS project id (`extra.eas.projectId`).
3. Copy `pushNotifications.ts.txt` to `src/components/shared/pushNotifications.ts`.
4. Call `configurePushHandler()` once and `usePushTapNavigation()` in the root layout (Member 5).
5. Add a "Pickup alerts" switch in Settings (Member 4) that calls `enablePickupAlerts()` when turned on, and call
   `disablePickupAlerts(token)` on log out. Do not ask for permission at startup.
6. Build a development build. Push does not work in Expo Go on Android, and iOS needs an Apple developer account for push.

## What is verified and what is not

Verified (in-memory Postgres): token rules (format, one phone moves to the newest account, at most 5 per person, nobody can
read or write tokens or the queue from the app), who gets queued for each event, the parent who asks is never told about their
own request, nobody outside the family is told, the text has no child, school or collector name, and applying the file twice
changes nothing.

Not verified: the Edge Function, the Expo push service, the webhook, the phone-side code and the real SDK 57 notification API.
They need a real project and a real phone.

## Known limits

- A group request with many people queues one message each. Only the first accept matters, the rest are not told they were closed.
- If Expo is down, the row stays unsent and nothing retries it until a retry job exists.
- "Sent" means Expo accepted the message. It does not prove the phone showed it.
- Quiet hours, per-person settings and language are not included.

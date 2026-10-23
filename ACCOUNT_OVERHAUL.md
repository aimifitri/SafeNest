# Account, onboarding and settings overhaul

> **Historical status note (2026-10-23):** The account, onboarding, and settings implementation described here has since been merged into `master`. The earlier “ready for a branch and Pull Request” status is obsolete. This note does not establish whether any SQL was applied to a Supabase project; see [BACKEND_STATUS.md](BACKEND_STATUS.md).

## 1. Audit: why a new account looked populated

| Finding | Cause | Fix |
| --- | --- | --- |
| New account showed Laila, Abu, Siti and a school | Screens imported `mockData` directly | One data layer, `HouseholdContext`. Real accounts read children, helpers and members from Supabase. `mockData` is only used when Demo Mode is on. |
| Demo and real data were mixed | `simActive` and sample people were not tied to a mode | Demo Mode is an explicit, labelled mode (`AuthContext.demo`). Demo writes never reach the database. |
| Settings profile was hard-coded | Static text | `MyProfilePage` loads and saves the real profile. |
| Signup had two fields | Minimal form | Three-step `SignupFlow` with validation, saved progress (no passwords) and a submit lock. |
| Password fields had no eye icon | Plain inputs | One shared `PasswordInput`. Every password field has its own show/hide state. |
| Family membership acted like pickup permission | Any member could be asked | `family_members.can_collect` (default false). Members are asked only if they can collect. |
| Availability did not exist | n/a | Weekly slots, time zone, break, one-time changes, accepting toggle. |

## 2. What changed

- Fresh accounts are empty and show a checklist ("Get set up") and empty states on Today, Plan and Circle.
- Signup: account type, name, email, phone, date of birth (adults only), optional gender with "Prefer not to say", language, password with strength guidance and confirm. Success only shows after Supabase accepts the signup. If email confirmation is on, the screen says the account is not active yet.
- Login: eye icon, forgot password (sends a reset email), "Explore the demo".
- Onboarding: skippable. Parent: welcome, household, child, family, Trusted Circle, availability. Helper: welcome, join with code, availability.
- Settings is now a hub: My Profile, My Pickup Availability, Household and children, Appearance, Notifications, Password and security, Privacy. Email and password changes ask for the current password first.
- Availability is shown in the Trusted Circle and decides who is asked. The request is still sent to everyone eligible at the same time. Nothing was made sequential.
- Circle distinguishes approved (a parent said yes), available (inside their hours) and accepted (they said yes to this request). If nobody is available the app says so plainly.
- Plan tab is unchanged in purpose: schedules only. No helper or teacher controls were moved into it.

## 3. Files

New app files are under `src/components/`: `auth/AuthFrame.tsx`, `auth/SignupFlow.tsx`, `household/*`, `onboarding/*`, `settings/AvailabilityEditor.tsx`, `settings/HouseholdPage.tsx`, `settings/MyProfilePage.tsx`, `settings/SecurityPage.tsx`, and in `shared/`: `HouseholdContext.tsx`, `accountRules.ts`, `availability.ts`, `availabilityStore.ts`, `forms.tsx`, `householdApi.ts`, `profileApi.ts`, `setupTasks.ts`, `useAvailability.ts`.

Changed: `app/_layout.tsx`, `auth/LoginScreen.tsx`, `circle/TrustedCircle.tsx`, `navigation/icons.ts`, `plan/PickupPlan.tsx`, `settings/ProfileSettings.tsx`, `settings/SchoolPreferences.tsx`, `shared/AppContext.tsx`, `shared/AuthContext.tsx`, `shared/circleApi.ts`, `shared/ui.tsx`, `today/DeviceLocation.tsx`, `today/TeacherSheets.tsx`, `today/TodayDashboard.tsx`, `today/usePickupFlow.ts`.

SQL (proposals, not applied): `supabase/account_household.sql`, `supabase/account_household_broadcast_patch.sql`.
Tests: `tests/accountRules.test.mjs`, `tests/availability.test.mjs`, `tests/setupTasks.test.mjs`, `supabase/tests/account_household.test.mjs`.
No existing migration was edited.

## 4. Setup and migration order

The app runs without any new SQL. Without it, these things degrade honestly and the screens say so:

- Profile details beyond name are kept in the Supabase auth user metadata.
- Availability is saved on this phone only and the UI says "Saved on this phone only".
- Family invite codes report that a backend upgrade is needed.

To turn everything on, a backend owner runs, on a TEST project first:

1. `supabase/schema.sql` (already applied on your project).
2. `supabase/account_household.sql` (safe to run twice).
3. Optional, only if the ask-everyone broadcast is in use: `supabase/pickup_broadcast.sql`, then `supabase/account_household_broadcast_patch.sql`.

Review before applying: it drops the "Admins add members" policy (members now join only through invite codes), makes child, helper and plan writes guardian-only, and adds an adult-only check on profiles (`NOT VALID`, so old rows are not rejected). No service-role key is used by the app.

## 5. Tests that ran

- `npx tsc --noEmit`: clean.
- Unit: accountRules 39, availability 38, circleEngine 68, demoSim 68, eta 7, pickupFlow 45, realtimeChannel 4, setupTasks 17, teacherMessages 11. All pass.
- SQL on PGlite: account_household 80, pickup_broadcast 83, pickup_journeys 37, pickup_workflow 41, push_notifications 32, school_location 4. All pass. The new file is run twice to prove it is idempotent.
- Web export plus headless Chromium against a fake Supabase: login, eye icon reveal and hide, demo mode, 3-step signup with errors and minor refusal, strength and mismatch messages, success without a fake session, fresh login shows onboarding and no sample people, empty Today, Circle and Plan, add child, add helper (starts pending), save availability, password page eyes, 320 px dark mode with no sideways scroll.

## 6. Not tested

- Expo Go and a real iPhone.
- A real Supabase project, including real RLS, real signup emails and confirmation links.
- Cross-device invites, join codes between two phones, and Realtime.
- Push notifications.
- Email delivery of password resets and email changes.
- The photo picker on a device.

## 7. Known limitations

- No email or SMS is sent for invites. The parent shares the code by hand.
- The language preference changes message text only. App screens are English.
- Date of birth is typed as DD/MM/YYYY (no calendar picker).
- The profile photo stays on the phone.
- The page that opens from a password-reset link is not built. Only the request is.
- "Who would be asked" in the Circle is a preview using the phone's clock. The database decides for real.
- The older single-helper request path is not gated by availability.
- Demo Mode helper edits live in memory only.
- `ProfileSelection.tsx` still imports `mockData` but is not used by the layout.
- The team's backend must approve the RLS changes before they reach production.

# SafeNest two-phone pickup test (real mode)

Goal: prove that the backup request and the pickup journey work between two real accounts on two phones, against a real
Supabase project. Until this passes, real mode is only checked on in-memory test databases and in a browser demo.

Use a TEST Supabase project and dummy accounts. Do not use real children's details.

## 0. What you need

- Two phones (or one phone and one emulator) with the app running. Call them **Parent phone** and **Helper phone**.
- A test Supabase project with these applied by whoever owns the database, in this order:
  `schema.sql`, `location_sharing.sql`, `pickup_workflow.sql`, `pickup_journeys.sql`.
  `pickup_broadcast.sql` is optional and still a proposal: without it, Today asks one helper at a time and says so.
- `.env` pointing at that project (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

## 1. Set up (about 5 minutes)

1. Parent phone: **Create account** (any dummy email), log in. This creates the family.
2. Helper phone: **Create account** with a second dummy email, log in once.
3. In the Supabase SQL editor of the TEST project, put both emails into `supabase/tests/two_phone_test_setup.sql` and run it.
   The app cannot create a child or link a helper to a real account yet, so this adds them for you.
4. Close and reopen the app on both phones.

Check: on the Parent phone, Today shows no "Demo" tag and no "Simulated" banner. If it does, the app is still on the demo
child (the setup script did not find a family or a child).

## 2. The tests

Tick each line. "Expect" is what should happen. Write down what you saw if it differs.

### A. Asking for backup
- [ ] Parent: on Today, tap **Find trusted backup**.
  Expect: Today says a request is open. No "Demo" wording.
- [ ] Helper phone, without reloading: a card appears saying **Needs your answer**.
  Expect: within a few seconds. If it only appears after reopening the app, realtime is not reaching that phone.
- [ ] Parent: tap the request again quickly or from a second place.
  Expect: still one request. No second one is created.

### B. Declining
- [ ] Helper: tap **I cannot**.
  Expect: the helper's card goes away. Parent's Today says nobody can collect yet and offers what to do next.
- [ ] Parent: ask again, and Helper: tap **Yes, I can collect** (go to C).

### C. Accepting
- [ ] Helper: tap **Yes, I can collect**.
  Expect: Helper's card says **You accepted**. Parent's Today says the helper is collecting. It does not say collected.
- [ ] Parent: try to ask someone else now.
  Expect: refused. Once someone accepted, nobody else can be asked.

### D. The journey
- [ ] Helper: tap **Start journey**.
  Expect: Parent's Today says the helper is on the way. No live map position is shown (real mode never shows one).
- [ ] Helper: tap **I've arrived at school**.
  Expect: Parent's Today says the helper is at school. The parent can send the helper's photo to the teacher.
- [ ] Parent: tap **Send photo to teacher** and send it through WhatsApp or the share sheet.
  Expect: the message includes "if it is not the same person, please do not let ... go and message me directly".
  The app cannot tell whether the teacher read it.
- [ ] Helper: tap **I've picked up** and then **Yes, confirm**.
  Expect: Parent's Today says **Picked up**, with a banner "has been picked up by ...". The banner is in the app only.
- [ ] Helper: tap the same buttons again, or Parent: try to ask for backup again.
  Expect: refused with a plain message. Nothing is recorded twice.

### E. Things that go wrong
- [ ] Turn the Helper phone's internet off, tap **Yes, I can collect** on a new request.
  Expect: a message that nothing was sent. The card does not claim success.
- [ ] Turn the internet back on and tap the button again.
  Expect: it works, and the card is up to date.
- [ ] Turn the Parent phone's internet off for about 30 seconds, then on again.
  Expect: while it is off, Today may say "Cannot refresh right now. Showing the last known status." That message goes away
  by itself after the next update (bring the app to the front, or wait for the next change). It should not stay forever.
- [ ] Parent: start a request, then cancel it. Expect the Helper's card to disappear.
- [ ] Log in as a third dummy account that is not in the family.
  Expect: it sees none of the family's requests or journeys.
- [ ] Helper: start a journey, then close the app fully and reopen it.
  Expect: the journey is still shown and the buttons still work.
- [ ] Two phones answering the same request at once (both tap the button together).
  Expect: exactly one accepted, and the other sees a plain message that it was already taken.

### F. Cleanup
- [ ] Run the cleanup lines at the bottom of `two_phone_test_setup.sql`.

## 3. If something fails

Send me: which step, what you expected, what you saw, and the screenshot or error text. Mention which phone.

## 4. What this test does NOT cover

- Push notifications (not built; see `proposals/push-notifications/README.md`).
- The automatic request at the deadline (it needs the proposed scheduled job, `pickup_broadcast.sql`, approved by the backend team).
- Background location and live helper position (not built).
- Anything about the school: the teacher is not in the app.

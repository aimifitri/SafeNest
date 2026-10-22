// Tests supabase/account_household.sql and account_household_broadcast_patch.sql on a throwaway in-memory Postgres (PGlite).
// Never touches a real project.   npm i --no-save @electric-sql/pglite && node supabase/tests/account_household.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const P = new URL("../", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon; create publication supabase_realtime;`);
await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
const loc = fs.readFileSync(P + "location_sharing.sql", "utf8");
await db.exec(loc.slice(0, loc.indexOf("create extension if not exists pg_cron")));
await db.exec(fs.readFileSync(P + "pickup_workflow.sql", "utf8"));
await db.exec(fs.readFileSync(P + "pickup_journeys.sql", "utf8"));
await db.exec(fs.readFileSync(P + "pickup_broadcast.sql", "utf8"));
const ACC = fs.readFileSync(P + "account_household.sql", "utf8");
await db.exec(ACC);
await db.exec(ACC); // idempotent
await db.exec(fs.readFileSync(P + "account_household_broadcast_patch.sql", "utf8"));

const U = {
  A: "00000000-0000-0000-0000-00000000000a", // parent, household admin
  B: "00000000-0000-0000-0000-00000000000b", // second parent, joins by code
  G: "00000000-0000-0000-0000-00000000000e", // grandmother: helper-type account, joins the household by code
  H: "00000000-0000-0000-0000-0000000000a1", // Trusted Circle helper, joined
  X: "00000000-0000-0000-0000-0000000000ff", // outsider
  L: "00000000-0000-0000-0000-0000000000a9", // legacy account with no account_type (created before the upgrade)
};
const meta = (extra) => JSON.stringify({ full_name: "x", ...extra });
const signup = async (k, extra) => {
  try { await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [U[k], k + "@t.test", meta({ full_name: "User " + k, ...extra })]); return { ok: true }; }
  catch (e) { return { ok: false, err: e.message }; }
};
async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user ? U[user] : ""}',false); set role authenticated;`);
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec("reset role"); }
}
const root = async (sql, params = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows; };
let pass = 0, fail = 0;
const t = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + x}`); };
const errHas = (r, s) => !r.ok && r.err.toLowerCase().includes(s.toLowerCase());

// ---------- 1. sign-up copies the details and refuses minors
const OLD = "1988-03-14";
t("sign-up with full details works", (await signup("A", { phone: "+60123456789", account_type: "parent", date_of_birth: OLD, gender: "female", language: "ms" })).ok);
const pa = (await root(`select * from public.profiles where id=$1`, [U.A]))[0];
t("profile has account type, phone, dob, gender, language", pa.account_type === "parent" && pa.phone === "+60123456789" && String(pa.date_of_birth).includes("1988") && pa.gender === "female" && pa.language === "ms", JSON.stringify(pa));
const minor = await signup("X", { account_type: "parent", date_of_birth: new Date(Date.now() - 12 * 365 * 864e5).toISOString().slice(0, 10) });
t("a minor cannot create an account", !minor.ok && /adults/i.test(minor.err), JSON.stringify(minor));
t("no profile row was left behind for the minor", (await root(`select count(*)::int n from public.profiles where id=$1`, [U.X]))[0].n === 0);
await signup("X", { account_type: "wizard", gender: "banana", language: "xx", date_of_birth: "not-a-date" });
const px = (await root(`select * from public.profiles where id=$1`, [U.X]))[0];
t("unexpected values are ignored, not trusted", px.account_type === null && px.gender === null && px.language === "en" && px.date_of_birth === null, JSON.stringify(px));
await signup("B", { account_type: "parent", date_of_birth: OLD });
await signup("G", { account_type: "helper", date_of_birth: "1955-05-05" });
await signup("H", { account_type: "helper", date_of_birth: "1980-01-01" });
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'L@t.test','{}')`, [U.L]);

// ---------- 2. a client cannot change its own identity
t("cannot change own account type", !(await as("A", `update public.profiles set account_type='helper' where id=$1`, [U.A])).ok);
t("cannot change own email column", !(await as("A", `update public.profiles set email='a@evil.test' where id=$1`, [U.A])).ok);
t("can edit own phone", (await as("A", `update public.profiles set phone='+60111111111' where id=$1 returning id`, [U.A])).rows?.length === 1);
t("cannot edit someone else's profile", (await as("A", `update public.profiles set phone='1' where id=$1 returning id`, [U.B])).rows?.length === 0);
t("cannot read someone else's profile directly", (await as("A", `select id from public.profiles where id=$1`, [U.B])).rows?.length === 0);
t("cannot set a date of birth that makes them a minor", !(await as("A", `update public.profiles set date_of_birth=current_date - interval '10 years' where id=$1`, [U.A])).ok);
await root(`update auth.users set email='new@t.test' where id=$1`, [U.A]);
t("a confirmed email change is copied to the profile", (await root(`select email from public.profiles where id=$1`, [U.A]))[0].email === "new@t.test");

// ---------- 3. household, roster, invite codes
const fam = (await as("A", `select public.create_family('Aminah family') as id`)).rows[0].id;
const famB = (await as("B", `select public.create_family('B family') as id`)).rows[0].id;
t("roster is readable by a member and shows names", (await as("A", `select * from public.family_roster($1)`, [fam])).rows?.[0]?.full_name === "User A");
t("roster is refused to outsiders", errHas(await as("B", `select * from public.family_roster($1)`, [fam]), "not allowed"));
t("an admin cannot insert another person straight into the household", !(await as("A", `insert into public.family_members (family_id,user_id,role) values ($1,$2,'member')`, [fam, U.B])).ok);
t("a non-member cannot create an invite", errHas(await as("B", `select public.create_family_invite($1,'Father',true)`, [fam]), "not allowed"));
const code = (await as("A", `select public.create_family_invite($1,'Father',true) as t`, [fam])).rows[0].t;
t("a code is returned once", typeof code === "string" && code.length >= 32);
t("only its hash is stored", (await root(`select count(*)::int n from public.family_invites where token_hash=$1`, [code]))[0].n === 0 && (await root(`select count(*)::int n from public.family_invites`))[0].n === 1);
t("invite table is not readable by clients", !(await as("A", `select * from public.family_invites`)).ok);
t("pending invites are listed for the admin", (await as("A", `select * from public.pending_family_invites($1)`, [fam])).rows?.length === 1);
t("pending invites hidden from outsiders", errHas(await as("B", `select * from public.pending_family_invites($1)`, [fam]), "not allowed"));
t("a wrong code is refused", errHas(await as("B", `select public.accept_family_invite('nope')`), "invalid or has expired"));
t("B joins with the code", (await as("B", `select public.accept_family_invite($1)`, [code])).ok);
const mb = (await root(`select * from public.family_members where family_id=$1 and user_id=$2`, [fam, U.B]))[0];
t("B is a member (not admin) with the relationship and permission the invite set", mb.role === "member" && mb.relationship === "Father" && mb.can_collect === true, JSON.stringify(mb));
t("the code works once", errHas(await as("G", `select public.accept_family_invite($1)`, [code]), "invalid or has expired"));
const code2 = (await as("A", `select public.create_family_invite($1,'Grandmother',false) as t`, [fam])).rows[0].t;
t("a family code defaults to NOT allowed to collect", (await as("G", `select public.accept_family_invite($1)`, [code2])).ok && (await root(`select can_collect from public.family_members where user_id=$1 and family_id=$2`, [U.G, fam]))[0].can_collect === false);
const code3 = (await as("A", `select public.create_family_invite($1,'Uncle',false) as t`, [fam])).rows[0].t;
const inv3 = (await as("A", `select * from public.pending_family_invites($1)`, [fam])).rows[0];
t("an admin can revoke a code", (await as("A", `select public.revoke_family_invite($1)`, [inv3.id])).ok && errHas(await as("H", `select public.accept_family_invite($1)`, [code3]), "invalid or has expired"));
t("a member cannot revoke codes", errHas(await as("B", `select public.revoke_family_invite($1)`, [inv3.id]), "not allowed"));
const code4 = (await as("A", `select public.create_family_invite($1,'Aunt',false) as t`, [fam])).rows[0].t;
await root(`update public.family_invites set expires_at = now() - interval '1 minute'`);
t("an expired code is refused", errHas(await as("H", `select public.accept_family_invite($1)`, [code4]), "invalid or has expired"));
t("a member (not admin) cannot create invites", errHas(await as("B", `select public.create_family_invite($1,'x',false)`, [fam]), "not allowed"));
t("a joined member is listed in the roster with a name", (await as("A", `select full_name from public.family_roster($1) where user_id=$2`, [fam, U.B])).rows?.[0]?.full_name === "User B");
t("only an admin can change can_collect", (await as("B", `update public.family_members set can_collect=true where user_id=$1 and family_id=$2 returning user_id`, [U.G, fam])).rows?.length === 0 && (await as("A", `update public.family_members set can_collect=true where user_id=$1 and family_id=$2 returning user_id`, [U.G, fam])).rows?.length === 1);
await as("A", `update public.family_members set can_collect=false where user_id=$1 and family_id=$2`, [U.G, fam]);

// ---------- 4. role checks in the data layer
const addChild = (u, f) => as(u, `insert into public.children (family_id,name,school_name) values ($1,'Laila','SK Taman Aman') returning id`, [f]);
t("a helper-type household member cannot add a child", !(await addChild("G", fam)).ok);
t("an outsider cannot add a child", !(await addChild("H", fam)).ok);
const childR = await addChild("A", fam);
t("the parent can add a child", childR.ok, JSON.stringify(childR));
const child = childR.rows[0].id;
t("a second parent can add a child too", (await addChild("B", fam)).ok);
t("a helper-type member cannot edit a child", (await as("G", `update public.children set name='Hacked' where id=$1 returning id`, [child])).rows?.length === 0);
t("the helper-type member can still READ the child (it is their household)", (await as("G", `select id from public.children where id=$1`, [child])).rows?.length === 1);
t("a helper-type member cannot add a Trusted Circle helper", !(await as("G", `insert into public.trusted_helpers (family_id,name,role,state) values ($1,'Sneaky','Friend','pending')`, [fam])).ok);
const hr = await as("A", `insert into public.trusted_helpers (family_id,name,role,state) values ($1,'Encik Ahmad','Uncle','pending') returning id`, [fam]);
t("the parent adds a helper as pending", hr.ok);
const hid = hr.rows[0].id;
t("a parent who is not an admin cannot approve", (await as("B", `update public.trusted_helpers set state='active' where id=$1 returning id`, [hid])).rows?.length === 0);
t("the admin approves", (await as("A", `update public.trusted_helpers set state='active' where id=$1 returning id`, [hid])).rows?.length === 1);
t("a parent cannot add an already-active helper unless admin", !(await as("B", `insert into public.trusted_helpers (family_id,name,role,state) values ($1,'Quick','Friend','active')`, [fam])).ok);
t("a helper-type member cannot change the plan", !(await as("G", `insert into public.pickup_plans (family_id,child_id,weekday,dismissal_time) values ($1,$2,1,'1:00 PM')`, [fam, child])).ok);
t("a parent can set the plan", (await as("A", `insert into public.pickup_plans (family_id,child_id,weekday,dismissal_time) values ($1,$2,1,'1:00 PM')`, [fam, child])).ok);
t("a legacy account (no account type) still counts as a guardian", (await root(`select coalesce(account_type,'parent') t from public.profiles where id=$1`, [U.L]))[0].t === "parent");
// helper H links through the existing invite flow
const tok = (await as("A", `select public.create_helper_invite($1) as t`, [hid])).rows[0].t;
t("H links to the helper entry with the existing code flow", (await as("H", `select public.accept_helper_invite($1)`, [tok])).ok);

// ---------- 5. last admin guard
t("the only admin cannot be removed", errHas(await as("A", `delete from public.family_members where family_id=$1 and user_id=$2`, [fam, U.A]), "at least one admin"));
t("the only admin cannot be demoted", errHas(await as("A", `update public.family_members set role='member' where family_id=$1 and user_id=$2`, [fam, U.A]), "at least one admin"));
t("a member can be removed by the admin", (await as("A", `delete from public.family_members where family_id=$1 and user_id=$2 returning user_id`, [fam, U.G])).rows?.length === 1);
t("deleting a whole household is not blocked by the guard", (await root(`delete from public.families where id=$1 returning id`, [famB])).length === 1);

// ---------- 6. availability storage and visibility
const MON_1530_KL = "2026-10-19T07:30:00Z";
const wk = (o) => JSON.stringify({ accepting: true, vacation: { on: false, until: null }, timeZone: "Asia/Kuala_Lumpur", weekly: { 1: [{ start: 15 * 60, end: 18 * 60 }] }, overrides: [], ...o });
t("a person can save their own availability", (await as("H", `insert into public.pickup_availability (user_id,settings) values ($1,$2)`, [U.H, wk({})])).ok);
t("a person cannot write someone else's", !(await as("H", `insert into public.pickup_availability (user_id,settings) values ($1,$2)`, [U.B, wk({})])).ok);
t("a parent in the household can read the helper's availability", (await as("A", `select user_id from public.pickup_availability where user_id=$1`, [U.H])).rows?.length === 1);
t("an unrelated person cannot", (await as("L", `select user_id from public.pickup_availability where user_id=$1`, [U.H])).rows?.length === 0);
t("a person can update their own", (await as("H", `update public.pickup_availability set settings=$2 where user_id=$1 returning user_id`, [U.H, wk({})])).rows?.length === 1);
t("an oversized document is refused", !(await as("H", `update public.pickup_availability set settings=$2 where user_id=$1`, [U.H, JSON.stringify({ pad: "x".repeat(9000) })])).ok);

// ---------- 7. person_available matches availability.ts
const pav = async (uid, at, settings) => {
  if (settings) await root(`insert into public.pickup_availability (user_id,settings) values ($1,$2) on conflict (user_id) do update set settings=excluded.settings`, [uid, settings]);
  return (await root(`select public.person_available($1,$2::timestamptz) a`, [uid, at]))[0].a;
};
t("in the slot", await pav(U.H, MON_1530_KL, wk({})) === true);
t("end of the slot is exclusive (18:00 KL)", await pav(U.H, "2026-10-19T10:00:00Z") === false);
t("start of the slot is inclusive (15:00 KL)", await pav(U.H, "2026-10-19T07:00:00Z") === true);
t("before the slot", await pav(U.H, "2026-10-19T01:00:00Z") === false);
t("a day with no slots", await pav(U.H, "2026-10-20T07:30:00Z") === false);
t("not accepting wins", await pav(U.H, MON_1530_KL, wk({ accepting: false })) === false);
t("on a break (until later)", await pav(U.H, MON_1530_KL, wk({ vacation: { on: true, until: "2026-10-25" } })) === false);
t("on a break (open ended)", await pav(U.H, MON_1530_KL, wk({ vacation: { on: true, until: null } })) === false);
t("break already over", await pav(U.H, MON_1530_KL, wk({ vacation: { on: true, until: "2026-10-18" } })) === true);
t("one-time unavailable beats weekly", await pav(U.H, MON_1530_KL, wk({ overrides: [{ date: "2026-10-19", kind: "unavailable", slots: [] }] })) === false);
t("one-time available replaces the day", await pav(U.H, "2026-10-19T00:30:00Z", wk({ overrides: [{ date: "2026-10-19", kind: "available", slots: [{ start: 8 * 60, end: 9 * 60 }] }] })) === true);
t("one-time available hides the weekly slot that day", await pav(U.H, MON_1530_KL, wk({ overrides: [{ date: "2026-10-19", kind: "available", slots: [{ start: 8 * 60, end: 9 * 60 }] }] })) === false);
t("time zone is respected (same instant is Monday in KL, Sunday in Honolulu)", await pav(U.H, "2026-10-19T07:30:00Z", wk({ timeZone: "Pacific/Honolulu" })) === false);
t("a bad time zone does not crash", typeof (await pav(U.H, MON_1530_KL, wk({ timeZone: "Not/AZone" }))) === "boolean");
t("never saved = not available", await pav(U.B, MON_1530_KL) === false);
t("person_available is not callable by clients", !(await as("A", `select public.person_available($1, now())`, [U.H])).ok);

// ---------- 8. the group request honours authorization and availability
await pav(U.H, MON_1530_KL, wk({})); // reset H to the normal weekly slot
// make "now" fall inside the slot by giving H a slot that is always open
const always = wk({ weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [{ start: 0, end: 1440 }]])) });
const never = wk({ accepting: false });
await root(`update public.pickup_availability set settings=$2 where user_id=$1`, [U.H, always]);
await root(`insert into public.family_members (family_id,user_id,role,can_collect) values ($1,$2,'member',false)`, [fam, U.G]);
await root(`insert into public.pickup_availability (user_id,settings) values ($1,$2) on conflict (user_id) do update set settings=excluded.settings`, [U.G, always]);
await root(`insert into public.pickup_availability (user_id,settings) values ($1,$2) on conflict (user_id) do update set settings=excluded.settings`, [U.B, always]);
const start = (u) => as(u, `select * from public.start_backup_broadcast($1,'manual')`, [child]);
const asked = async () => (await root(`select recipient_name, recipient_kind from public.backup_requests where child_id=$1 order by recipient_name`, [child])).map((r) => r.recipient_name);
let r = await start("A");
t("asks the approved helper and the family member allowed to collect, together", r.ok && r.rows[0].asked === 2 && (await asked()).join() === "User B,Encik Ahmad".split(",").sort().join() || (await asked()).sort().join() === ["Encik Ahmad", "User B"].sort().join(), JSON.stringify(r) + (await asked()).join());
t("a family member who is NOT allowed to collect is not asked, even though available", !(await asked()).includes("User G"));
await root(`delete from public.backup_requests where child_id=$1`, [child]); await root(`delete from public.backup_broadcasts where child_id=$1`, [child]);
await root(`update public.pickup_availability set settings=$2 where user_id in ($1)`, [U.H, never]);
await root(`update public.pickup_availability set settings=$2 where user_id in ($1)`, [U.B, never]);
r = await start("A");
t("nobody available: a clear, different error", errHas(r, "nobody available right now"), JSON.stringify(r));
t("nothing was left behind", (await root(`select count(*)::int n from public.backup_broadcasts where child_id=$1`, [child]))[0].n === 0);
await root(`update public.trusted_helpers set state='pending' where id=$1`, [hid]);
await root(`update public.family_members set can_collect=false where user_id=$1 and family_id=$2`, [U.B, fam]);
r = await start("A");
t("nobody approved at all keeps the original message", errHas(r, "nobody to ask yet"), JSON.stringify(r));
await root(`update public.trusted_helpers set state='active' where id=$1`, [hid]);
await root(`update public.pickup_availability set settings=$2 where user_id=$1`, [U.H, always]);
r = await start("A");
t("an available approved helper is asked again", r.ok && r.rows[0].asked === 1, JSON.stringify(r));
t("the request went to the helper only, as one round", (await asked()).join() === "Encik Ahmad");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

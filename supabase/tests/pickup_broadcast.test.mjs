// Tests supabase/pickup_broadcast.sql on a throwaway in-memory Postgres (PGlite). Never touches a real project.
//   npm i --no-save @electric-sql/pglite && node supabase/tests/pickup_broadcast.test.mjs
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
await db.exec(fs.readFileSync(P + "pickup_broadcast.sql", "utf8")); // idempotent: second run must not fail

const U = {
  A: "00000000-0000-0000-0000-00000000000a", // parent (admin)
  B: "00000000-0000-0000-0000-00000000000b", // second parent (member)
  C: "00000000-0000-0000-0000-00000000000c", // brother (member)
  H: "00000000-0000-0000-0000-0000000000a1", // Trusted Circle, joined
  H2: "00000000-0000-0000-0000-0000000000a2", // Trusted Circle, joined
  X: "00000000-0000-0000-0000-0000000000ff", // outsider
};
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, k + "@t.test", JSON.stringify({ full_name: "User " + k })]);

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ? U[user] : ""}', false); set role authenticated;`);
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec(`reset role`); }
}
const root = async (sql, params = []) => { await db.exec(`reset role`); return (await db.query(sql, params)).rows; };
const rootTry = async (sql) => { await db.exec(`reset role`); try { return { ok: true, rows: (await db.query(sql)).rows }; } catch (e) { return { ok: false, err: e.message }; } };

let pass = 0, fail = 0;
const t = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + x}`); };
const errHas = (r, s) => !r.ok && r.err.toLowerCase().includes(s.toLowerCase());

// ---- setup
const fam = (await as("A", `select public.create_family('Test family') as id`)).rows[0].id;
await db.exec(`insert into public.family_members (family_id, user_id, role) values ('${fam}','${U.B}','member'),('${fam}','${U.C}','member')`);
const mkChild = async (name) => (await as("A", `insert into public.children (family_id, name, school_name, school_address) values ($1,$2,'SK Aman','Jalan 3') returning id`, [fam, name])).rows[0].id;
const child = await mkChild("Laila");
const mkHelper = async (name, user, state) => (await as("A", `insert into public.trusted_helpers (family_id, name, role, user_id, state) values ($1,$2,'Uncle',$3,$4) returning id`, [fam, name, user ? U[user] : null, state])).rows[0].id;
const hH = await mkHelper("Encik Ahmad", "H", "active");
const hH2 = await mkHelper("Kak Ima", "H2", "active");
await mkHelper("Pn. Salmah", null, "pending");
await mkHelper("Unjoined", null, "active");

const start = (u, reason = "manual", c = child) => as(u, `select * from public.start_backup_broadcast($1,$2)`, [c, reason]);
const rows = (u, c = child) => as(u, `select * from public.my_broadcast($1)`, [c]);
const respond = (u, id, acc) => as(u, `select public.respond_backup_request($1,$2) as s`, [id, acc]);
const reqOf = async (name, bid) => (await root(`select id from public.backup_requests where broadcast_id=$1 and recipient_name=$2`, [bid, name]))[0]?.id;
const stateOf = async (id) => (await root(`select state from public.backup_requests where id=$1`, [id]))[0]?.state;
const audit = async (ev, cid = child) => (await root(`select count(*)::int n from public.pickup_escalation_audit where child_id=$1 and event=$2`, [cid, ev]))[0].n;

// ---- opt-in
t("automatic start refused without opt-in", errHas(await start("A", "auto"), "not opted in"), JSON.stringify(await start("A", "auto")));
t("outsider cannot read or change settings", !(await as("X", `select * from public.get_auto_escalation($1)`, [child])).ok && !(await as("X", `select public.set_auto_escalation($1,true,5,10)`, [child])).ok);
t("default settings are off", (await as("A", `select * from public.get_auto_escalation($1)`, [child])).rows[0].enabled === false);
t("impossible minutes are refused", !(await as("A", `select public.set_auto_escalation($1,true,99,10)`, [child])).ok && !(await as("A", `select public.set_auto_escalation($1,true,5,0)`, [child])).ok);

// ---- manual round: everyone together
let r = await start("A", "manual");
t("manual start asks everyone together", r.ok && r.rows[0].created === true && r.rows[0].asked === 4, JSON.stringify(r));
const bid = r.rows[0].broadcast_id;
let br = (await rows("A")).rows;
t("recipients are B, C, Encik Ahmad, Kak Ima", br.map((x) => x.recipient_name).sort().join() === ["Encik Ahmad", "Kak Ima", "User B", "User C"].sort().join(), br.map((x) => x.recipient_name).join());
t("the parent, pending and unjoined members are not asked", !br.some((x) => ["User A", "Pn. Salmah", "Unjoined"].includes(x.recipient_name)));
t("all start as requested together", br.every((x) => x.request_state === "requested" && x.broadcast_state === "open"));
t("family and circle kinds are recorded", br.filter((x) => x.recipient_kind === "family").length === 2 && br.filter((x) => x.recipient_kind === "circle").length === 2);

// ---- idempotent
const again = await start("A", "manual");
t("second start returns the same round, created = false", again.ok && again.rows[0].created === false && again.rows[0].broadcast_id === bid, JSON.stringify(again));
const again2 = await start("B", "again");
t("another parent starting at the same time cannot duplicate", again2.ok && again2.rows[0].created === false && again2.rows[0].broadcast_id === bid);
t("still exactly four requests", (await root(`select count(*)::int n from public.backup_requests where child_id=$1`, [child]))[0].n === 4);
t("a single-helper request is blocked while a round is live", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hH]), "already active"));
t("a second live round cannot exist in the table", !(await rootTry(`insert into public.backup_broadcasts (family_id, child_id, started_by, reason, expires_at) values ('${fam}','${child}','${U.A}','manual', now())`)).ok);

// ---- visibility
t("outsider cannot read the round", !(await rows("X")).ok);
t("a Trusted Circle member cannot read the whole round", !(await rows("H")).ok);
t("helper sees only their own assignment", (await as("H", `select * from public.my_backup_assignments()`)).rows.length === 1);
t("family recipient sees their assignment", (await as("B", `select * from public.my_backup_assignments()`)).rows.length === 1);
t("outsider sees none", (await as("X", `select * from public.my_backup_assignments()`)).rows.length === 0);
t("the parent who asked has no assignment", (await as("A", `select * from public.my_backup_assignments()`)).rows.length === 0);

// ---- answers: decline, decline, accept (the brief's example), others closed
const reqB = await reqOf("User B", bid), reqC = await reqOf("User C", bid), reqH = await reqOf("Encik Ahmad", bid), reqH2 = await reqOf("Kak Ima", bid);
t("someone else cannot answer for B", errHas(await respond("H", reqB, true), "not allowed"));
t("B declines", (await respond("B", reqB, false)).rows?.[0]?.s === "declined");
t("C declines", (await respond("C", reqC, false)).rows?.[0]?.s === "declined");
t("round stays open while others are pending", (await rows("A")).rows[0].broadcast_state === "open");
t("Encik Ahmad accepts", (await respond("H", reqH, true)).rows?.[0]?.s === "accepted");
t("Kak Ima is closed automatically", (await stateOf(reqH2)) === "closed");
t("round is covered", (await rows("A")).rows[0].broadcast_state === "covered");
const late = await respond("H2", reqH2, true);
t("a late accept from Kak Ima fails", !late.ok && /already/i.test(late.err), JSON.stringify(late));
t("Kak Ima's assignment disappeared", (await as("H2", `select * from public.my_backup_assignments()`)).rows.length === 0);
t("exactly one accepted request in the round", (await root(`select count(*)::int n from public.backup_requests where broadcast_id=$1 and state='accepted'`, [bid]))[0].n === 1);
t("legacy single request still blocked while covered", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hH2]), "already active"));

// ---- journey linkage (existing function, unchanged)
t("closed helper cannot start the journey", errHas(await as("H2", `select public.start_pickup_journey($1)`, [child]), "not allowed"));
const j = await as("H", `select public.start_pickup_journey($1) as id`, [child]);
t("the accepted helper can start the journey", j.ok, JSON.stringify(j));
await db.exec(`reset role; update public.pickup_journeys set state='cancelled', ended_at=now() where child_id='${child}'`);

// ---- complete closes the round
t("outsider cannot complete", !(await as("X", `select public.complete_backup_request($1)`, [reqH])).ok);
t("accepted helper completes", (await as("H", `select public.complete_backup_request($1)`, [reqH])).ok);
t("round becomes completed", (await rows("A")).rows[0].broadcast_state === "completed");
r = await start("A", "again");
t("after completion a new round may start", r.ok && r.rows[0].created === true, JSON.stringify(r));
const bid2 = r.rows[0].broadcast_id;

// ---- cancel
t("a Trusted Circle member cannot cancel", !(await as("H", `select public.cancel_backup_broadcast($1)`, [bid2])).ok);
t("family cancels", (await as("A", `select public.cancel_backup_broadcast($1)`, [bid2])).ok);
t("cancelled requests are not offered to helpers", (await as("H", `select * from public.my_backup_assignments()`)).rows.length === 0);
t("answering a cancelled request fails", !(await respond("H", await reqOf("Encik Ahmad", bid2), true)).ok);

// ---- expiry
r = await start("A", "again");
const bid3 = r.rows[0].broadcast_id;
t("expiring too early is refused", errHas(await as("A", `select public.expire_backup_broadcast($1)`, [bid3]), "too early"));
t("accept after the window is refused", await (async () => {
  await db.exec(`reset role; update public.backup_broadcasts set expires_at = now() - interval '1 minute' where id='${bid3}'`);
  const x = await respond("H", await reqOf("Encik Ahmad", bid3), true);
  return !x.ok && /expired/i.test(x.err);
})());
await as("A", `select public.expire_backup_broadcast($1)`, [bid3]);
t("...and the round ended with nobody accepted", (await rows("A")).rows.every((x) => x.broadcast_state === "exhausted" && x.request_state === "expired"));

// ---- everyone declines
r = await start("A", "again");
const bid4 = r.rows[0].broadcast_id;
for (const [u, name] of [["B", "User B"], ["C", "User C"], ["H", "Encik Ahmad"], ["H2", "Kak Ima"]]) await respond(u, await reqOf(name, bid4), false);
t("all declined -> exhausted", (await rows("A")).rows[0].broadcast_state === "exhausted");

// ---- automatic start on the open phone
t("owner opts in", (await as("A", `select public.set_auto_escalation($1,true,5,10)`, [child])).ok);
const s1 = (await as("A", `select * from public.get_auto_escalation($1)`, [child])).rows[0];
t("opt-in recorded with a time", s1.enabled === true && s1.consented_at !== null && s1.minutes_before === 5);
r = await start("A", "auto");
t("automatic round starts once opted in", r.ok && r.rows[0].created === true, JSON.stringify(r));
const bidA = r.rows[0].broadcast_id;
const r2 = await start("B", "auto");
t("automatic start from a second phone returns the same round", r2.ok && r2.rows[0].created === false && r2.rows[0].broadcast_id === bidA);
await as("A", `select public.cancel_backup_broadcast($1)`, [bidA]);
const r3 = await start("A", "auto");
t("an automatic round cannot repeat after cancel (once per day)", r3.ok && r3.rows[0].created === false, JSON.stringify(r3));
t("turning it off clears consent", await (async () => { await as("A", `select public.set_auto_escalation($1,false,5,10)`, [child]); const s = (await as("A", `select * from public.get_auto_escalation($1)`, [child])).rows[0]; return !s.enabled && s.consented_at === null; })());
t("automatic start refused again after opt-out", errHas(await start("A", "auto"), "not opted in"));

// ---- server-side scheduled check (run as the database owner, like pg_cron would)
t("app users cannot call the scheduled check", !(await as("A", `select * from public.run_auto_escalation()`)).ok && !(await as("A", `select public.expire_due_broadcasts()`)).ok);
const c2 = await mkChild("Second child");
const report = (u, c, dismissOffsetMin, arriveOffsetMin, resp = "none") =>
  as(u, `select public.report_pickup_status($1, now() + make_interval(mins => $2), ${arriveOffsetMin === null ? "null" : "now() + make_interval(mins => $3)"}, $4)`, arriveOffsetMin === null ? [c, dismissOffsetMin, resp] : [c, dismissOffsetMin, arriveOffsetMin, resp]);
// bind params differ when arrive is null, so write the two cases explicitly
const rep = async (c, d, a, resp = "none", u = "A") => a === null
  ? as(u, `select public.report_pickup_status($1, now() + make_interval(mins => $2), null, $3)`, [c, d, resp])
  : as(u, `select public.report_pickup_status($1, now() + make_interval(mins => $2), now() + make_interval(mins => $3), $4)`, [c, d, a, resp]);
const run = async () => (await root(`select * from public.run_auto_escalation()`));
const liveAuto = async (c) => (await root(`select count(*)::int n from public.backup_broadcasts where child_id=$1 and reason='auto'`, [c]))[0].n;

t("a stranger cannot report for this child", !(await rep(c2, 3, 13, "none", "X")).ok);
await rep(c2, 3, 13);
t("not opted in -> nothing happens", (await run()).length === 0 && (await liveAuto(c2)) === 0);
await as("A", `select public.set_auto_escalation($1,false,5,10)`, [c2]);
t("opted out (setting exists but off) -> nothing", (await run()).length === 0 && (await liveAuto(c2)) === 0);
await as("A", `select public.set_auto_escalation($1,true,5,10)`, [c2]);
await rep(c2, 30, 40);
t("too early (30 min to go, rule is 5) -> nothing", (await run()).length === 0);
await rep(c2, 3, 3);
t("predicted on time -> nothing", (await run()).length === 0);
await rep(c2, 3, null);
t("no estimate -> the server does not guess", (await run()).length === 0);
await rep(c2, 3, 13, "will_collect");
t("parent said they will collect -> nothing", (await run()).length === 0);
await rep(c2, 3, 13);
await db.exec(`update public.pickup_status_reports set reported_at = now() - interval '45 minutes' where child_id='${c2}'`);
t("stale phone report -> nothing", (await run()).length === 0);
await rep(c2, -40, 0);
t("long after dismissal (cutoff) -> nothing", (await run()).length === 0);
await rep(c2, 3, 13);
await db.exec(`insert into public.pickup_journeys (family_id, child_id, collector_user_id, collector_name) values ('${fam}','${c2}','${U.A}','User A')`);
t("a journey is already in progress -> nothing", (await run()).length === 0);
await db.exec(`update public.pickup_journeys set state='cancelled' where child_id='${c2}'`);
let res = await run();
t("late, no answer, 3 min to dismissal, opted in -> one round, all eligible", res.length === 1 && res[0].asked === 4, JSON.stringify(res));
t("the round is marked automatic and started for the parent", (await root(`select reason, started_by from public.backup_broadcasts where child_id=$1`, [c2]))[0].reason === "auto");
t("running the check again does not resend", (await run()).length === 0 && (await liveAuto(c2)) === 1);
t("recipients can see and answer it", (await as("H", `select * from public.my_backup_assignments()`)).rows.some((x) => x.child_id === c2));
await db.exec(`update public.backup_broadcasts set expires_at = now() - interval '1 minute' where child_id='${c2}'`);
t("expire_due_broadcasts marks it no response", (await root(`select public.expire_due_broadcasts() as n`))[0].n === 1 && (await root(`select count(*)::int n from public.backup_requests where child_id=$1 and state='expired'`, [c2]))[0].n === 4);

// a child with nobody to ask: audited, no half-created round
const c3 = await mkChild("Alone");
await db.exec(`delete from public.family_members where family_id='${fam}' and user_id in ('${U.B}','${U.C}')`);
await db.exec(`update public.trusted_helpers set state='rejected' where family_id='${fam}'`);
await as("A", `select public.set_auto_escalation($1,true,5,10)`, [c3]);
await rep(c3, 3, 13);
t("nobody to ask -> no round, failure audited", (await run()).length === 0 && (await liveAuto(c3)) === 0 && (await audit("auto_failed", c3)) === 1);

// ---- RLS and audit
t("no direct writes to the new tables", !(await as("A", `insert into public.pickup_escalation_settings (child_id, family_id, enabled) values ('${child}','${fam}',true)`)).ok
  && !(await as("A", `update public.backup_broadcasts set state='covered'`)).rows?.length);
t("family reads the audit trail", (await as("A", `select * from public.pickup_escalation_audit where child_id='${child}'`)).rows.length > 5);
t("outsider reads nothing", (await as("X", `select * from public.pickup_escalation_audit`)).rows.length === 0 && (await as("X", `select * from public.backup_broadcasts`)).rows.length === 0 && (await as("X", `select * from public.pickup_status_reports`)).rows.length === 0);
for (const ev of ["opted_in", "opted_out", "broadcast_started", "accepted", "declined", "cancelled", "expired", "completed", "everyone_answered_no"]) t(`audit has "${ev}"`, (await root(`select count(*)::int n from public.pickup_escalation_audit where event=$1`, [ev]))[0].n > 0);

// ---- the legacy single-helper flow still works when no round is live
const hLegacy = await mkHelper("Legacy", "H2", "active");
const child4 = await mkChild("Legacy child");
const lg = await as("A", `select public.request_backup($1,$2) as id`, [child4, hLegacy]);
t("single-helper request still works", lg.ok, JSON.stringify(lg));
t("and the helper can still accept it", lg.ok && (await respond("H2", lg.rows[0].id, true)).rows?.[0]?.s === "accepted");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

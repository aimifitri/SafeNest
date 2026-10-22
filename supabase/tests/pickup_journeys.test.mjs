import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const P = new URL("../", import.meta.url).pathname; // supabase/
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon; create publication supabase_realtime;`);
await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
// location_sharing.sql minus the pg_cron part (PGlite has no pg_cron)
const loc = fs.readFileSync(P + "location_sharing.sql", "utf8");
await db.exec(loc.slice(0, loc.indexOf("create extension if not exists pg_cron")));
await db.exec(fs.readFileSync(P + "pickup_workflow.sql", "utf8"));
await db.exec(fs.readFileSync(P + "pickup_journeys.sql", "utf8"));
await db.exec(fs.readFileSync(P + "pickup_journeys.sql", "utf8")); // idempotent

const U = {
  A: "00000000-0000-0000-0000-00000000000a", // parent (admin)
  B: "00000000-0000-0000-0000-00000000000b", // second parent
  H: "00000000-0000-0000-0000-0000000000a1", // linked helper
  H2: "00000000-0000-0000-0000-0000000000a2",
  X: "00000000-0000-0000-0000-0000000000ff", // outsider
};
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, k + "@t.test", JSON.stringify({ full_name: "User " + k })]);

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${U[user]}',false); set role authenticated;`);
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec("reset role"); }
}
let pass = 0, fail = 0;
const t = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + x}`); };
const errHas = (r, s) => !r.ok && r.err.toLowerCase().includes(s.toLowerCase());

const fam = (await as("A", `select public.create_family('F') as id`)).rows[0].id;
await db.exec(`insert into public.family_members (family_id,user_id,role) values ('${fam}','${U.B}','member')`);
const child = (await as("A", `insert into public.children (family_id,name) values ($1,'Laila') returning id`, [fam])).rows[0].id;
const mk = async (n, u) => (await as("A", `insert into public.trusted_helpers (family_id,name,role,user_id,state) values ($1,$2,'Uncle',$3,'active') returning id`, [fam, n, U[u]])).rows[0].id;
const hH = await mk("H", "H"), hH2 = await mk("H2", "H2");

// ---- who may start
t("outsider cannot start a journey", errHas(await as("X", `select public.start_pickup_journey($1)`, [child]), "not allowed"));
t("helper with NO accepted request cannot start", errHas(await as("H", `select public.start_pickup_journey($1)`, [child]), "not allowed"));
const req = (await as("A", `select public.request_backup($1,$2) as id`, [child, hH])).rows[0].id;
t("helper with only a pending request cannot start", errHas(await as("H", `select public.start_pickup_journey($1)`, [child]), "not allowed"));
await as("H", `select public.respond_backup_request($1,true)`, [req]);
t("other helper (not chosen) cannot start", errHas(await as("H2", `select public.start_pickup_journey($1)`, [child]), "not allowed"));
t("direct INSERT on pickup_journeys blocked", errHas(await as("A", `insert into public.pickup_journeys (family_id,child_id,collector_user_id,collector_name) values ($1,$2,$3,'x')`, [fam, child, U.A]), "permission denied"));

// ---- helper journey, full path
let r = await as("H", `select public.start_pickup_journey($1) as id`, [child]);
t("accepted helper starts a journey", r.ok, r.err);
const jH = r.rows?.[0]?.id;
let row = (await as("A", `select * from public.pickup_journeys where id=$1`, [jH])).rows[0];
t("family sees it: started, collector name, linked to the request", row?.state === "started" && row.collector_name === "User H" && row.backup_request_id === req, JSON.stringify(row));
t("second journey for the same child is refused", errHas(await as("A", `select public.start_pickup_journey($1)`, [child]), "already in progress"));
t("outsider cannot read the journey", (await as("X", `select * from public.pickup_journeys`)).rows.length === 0);
t("other helper cannot read the journey", (await as("H2", `select * from public.pickup_journeys`)).rows.length === 0);
t("collector can read own journey", (await as("H", `select * from public.pickup_journeys`)).rows.length === 1);
const mine = await as("H", `select * from public.my_active_journeys()`);
t("my_active_journeys returns it for the collector", mine.rows?.length === 1 && mine.rows[0].child_name === "Laila" && mine.rows[0].child_id === child);
t("my_active_journeys is empty for others", (await as("A", `select * from public.my_active_journeys()`)).rows.length === 0);

t("parent cannot move the helper's journey forward", errHas(await as("A", `select public.mark_arrived_at_school($1)`, [jH]), "not allowed"));
t("outsider cannot confirm", errHas(await as("X", `select public.confirm_handover($1)`, [jH]), "not allowed"));
t("cannot confirm before arriving", errHas(await as("H", `select public.confirm_handover($1)`, [jH]), "arrived at school first"));
t("collector marks arrived", (await as("H", `select public.mark_arrived_at_school($1)`, [jH])).ok);
t("arrived twice is refused", errHas(await as("H", `select public.mark_arrived_at_school($1)`, [jH]), "already at_school"));
t("arrived_at timestamp recorded", (await as("A", `select arrived_at from public.pickup_journeys where id=$1`, [jH])).rows[0].arrived_at !== null);

t("removed helper cannot confirm", await (async () => {
  await db.exec(`update public.trusted_helpers set state='rejected' where id='${hH}'`);
  const x = await as("H", `select public.confirm_handover($1)`, [jH]);
  await db.exec(`update public.trusted_helpers set state='active' where id='${hH}'`);
  return errHas(x, "not allowed");
})());

r = await as("H", `select public.confirm_handover($1)`, [jH]);
t("collector confirms handover", r.ok, r.err);
row = (await as("A", `select state, ended_at from public.pickup_journeys where id=$1`, [jH])).rows[0];
t("journey is collected and closed", row.state === "collected" && row.ended_at !== null, JSON.stringify(row));
t("linked backup request became completed", (await as("A", `select state from public.backup_requests where id=$1`, [req])).rows[0].state === "completed");
t("confirming twice is refused", errHas(await as("H", `select public.confirm_handover($1)`, [jH]), "already collected"));
t("cannot cancel a finished journey", errHas(await as("A", `select public.cancel_pickup_journey($1)`, [jH]), "already collected"));
t("closed journey is gone from my_active_journeys", (await as("H", `select * from public.my_active_journeys()`)).rows.length === 0);

// ---- parent journey + location sharing stops
r = await as("A", `select public.start_pickup_journey($1) as id`, [child]);
t("after collection a new journey can start (parent)", r.ok, r.err);
const jA = r.rows[0].id;
t("parent journey has no backup request", (await as("A", `select backup_request_id from public.pickup_journeys where id=$1`, [jA])).rows[0].backup_request_id === null);
const share = (await as("A", `select public.start_location_share($1, array[$2]::uuid[]) as id`, [fam, U.H])).rows[0].id;
await as("A", `insert into public.live_locations (share_id, latitude, longitude) values ($1, 2.2, 102.2)`, [share]);
t("live location exists while journey is open", (await as("A", `select * from public.live_locations`)).rows.length === 1);
t("other parent can cancel the journey", (await as("B", `select public.cancel_pickup_journey($1)`, [jA])).ok);
t("cancel stops location sharing and deletes the point", await (async () => {
  const s = (await as("A", `select ended_at from public.location_shares where id=$1`, [share])).rows[0];
  const l = (await as("A", `select * from public.live_locations`)).rows;
  return s.ended_at !== null && l.length === 0;
})());

// parent full path stops sharing too
const jA2 = (await as("A", `select public.start_pickup_journey($1) as id`, [child])).rows[0].id;
const share2 = (await as("A", `select public.start_location_share($1, array[$2]::uuid[]) as id`, [fam, U.H])).rows[0].id;
await as("A", `insert into public.live_locations (share_id, latitude, longitude) values ($1, 2.2, 102.2)`, [share2]);
t("parent cannot confirm before arriving", errHas(await as("A", `select public.confirm_handover($1)`, [jA2]), "arrived at school first"));
await as("A", `select public.mark_arrived_at_school($1)`, [jA2]);
t("the other parent cannot confirm someone else's handover", errHas(await as("B", `select public.confirm_handover($1)`, [jA2]), "not allowed"));
t("parent confirms handover", (await as("A", `select public.confirm_handover($1)`, [jA2])).ok);
t("handover also stops location sharing", (await as("A", `select * from public.live_locations`)).rows.length === 0
  && (await as("A", `select ended_at from public.location_shares where id=$1`, [share2])).rows[0].ended_at !== null);

// outsider cancel on an active one
const jA3 = (await as("A", `select public.start_pickup_journey($1) as id`, [child])).rows[0].id;
t("outsider cannot cancel an active journey", errHas(await as("X", `select public.cancel_pickup_journey($1)`, [jA3]), "not allowed"));
t("helper (not collector, no request) cannot cancel", errHas(await as("H2", `select public.cancel_pickup_journey($1)`, [jA3]), "not allowed"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

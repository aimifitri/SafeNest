import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const P = new URL("../", import.meta.url).pathname; // supabase/
const db = new PGlite();

// --- Minimal stand-in for Supabase's auth schema and roles ---
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
  create publication supabase_realtime;
`);
await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
await db.exec(fs.readFileSync(P + "pickup_workflow.sql", "utf8"));
// idempotency: run the migration a second time
await db.exec(fs.readFileSync(P + "pickup_workflow.sql", "utf8"));

const U = {
  A: "00000000-0000-0000-0000-00000000000a", // parent, admin
  B: "00000000-0000-0000-0000-00000000000b", // second parent (member)
  H: "00000000-0000-0000-0000-0000000000a1", // linked helper
  H2: "00000000-0000-0000-0000-0000000000a2", // another linked helper
  X: "00000000-0000-0000-0000-0000000000ff", // outsider
};
for (const [k, id] of Object.entries(U)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, k + "@t.test", JSON.stringify({ full_name: "User " + k })]);
}

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ? U[user] : ""}', false); set role authenticated;`);
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, err: e.message };
  } finally {
    await db.exec(`reset role`);
  }
}

// --- Setup (as the real app would) ---
const fam = (await as("A", `select public.create_family('Test family') as id`)).rows[0].id;
await db.exec(`insert into public.family_members (family_id, user_id, role) values ('${fam}','${U.B}','member')`);
const child = (await as("A", `insert into public.children (family_id, name, school_name, school_address, teacher_phone) values ($1,'Laila','SK Aman','Jalan 3','012-SECRET') returning id`, [fam])).rows[0].id;
const mkHelper = async (name, user, state) =>
  (await as("A", `insert into public.trusted_helpers (family_id, name, role, user_id, state) values ($1,$2,'Uncle',$3,$4) returning id`, [fam, name, user ? U[user] : null, state])).rows[0].id;
const hH = await mkHelper("Helper H", "H", "active");
const hH2 = await mkHelper("Helper H2", "H2", "active");
const hPending = await mkHelper("Pending", null, "pending");
const hUnlinked = await mkHelper("Unlinked active", null, "active");

let pass = 0, fail = 0;
const t = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + extra}`); };
const errHas = (r, s) => !r.ok && r.err.toLowerCase().includes(s.toLowerCase());

// 1 request
let r = await as("A", `select public.request_backup($1,$2) as id`, [child, hH]);
t("parent can request backup from approved, linked helper", r.ok, r.err);
const req1 = r.rows?.[0]?.id;

// 2 duplicates / other roles
t("second active request for same child is rejected", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hH2]), "already active"));
t("other parent also cannot create a second one", errHas(await as("B", `select public.request_backup($1,$2)`, [child, hH2]), "already active"));
t("outsider cannot request", errHas(await as("X", `select public.request_backup($1,$2)`, [child, hH]), "not allowed"));
t("helper cannot request on the family's behalf", errHas(await as("H", `select public.request_backup($1,$2)`, [child, hH]), "not allowed"));
t("signed-out call rejected", errHas(await as(null, `select public.request_backup($1,$2)`, [child, hH]), "not signed in") || !(await as(null, `select public.request_backup($1,$2)`, [child, hH])).ok);

// 3 direct writes blocked
t("direct INSERT on backup_requests blocked", errHas(await as("A", `insert into public.backup_requests (family_id, child_id, helper_id, state) values ($1,$2,$3,'accepted')`, [fam, child, hH]), "permission denied"));
t("direct UPDATE (fake accept) blocked", errHas(await as("A", `update public.backup_requests set state='accepted' where id=$1`, [req1]), "permission denied"));

// 4 reads
t("family member can read request", (await as("B", `select * from public.backup_requests`)).rows?.length === 1);
t("chosen helper can read their request", (await as("H", `select * from public.backup_requests`)).rows?.length === 1);
t("other helper cannot read it", (await as("H2", `select * from public.backup_requests`)).rows?.length === 0);
t("outsider cannot read it", (await as("X", `select * from public.backup_requests`)).rows?.length === 0);
const asg = await as("H", `select * from public.my_backup_assignments()`);
t("helper assignment shows child + school", asg.rows?.length === 1 && asg.rows[0].child_name === "Laila" && asg.rows[0].school_name === "SK Aman", JSON.stringify(asg));
t("helper assignment does NOT expose teacher phone", asg.rows?.[0] && !("teacher_phone" in asg.rows[0]));
t("helper cannot read children table directly", (await as("H", `select * from public.children`)).rows?.length === 0);
t("other helper sees no assignments", (await as("H2", `select * from public.my_backup_assignments()`)).rows?.length === 0);

// 5 responding
t("requesting parent cannot accept for the helper", errHas(await as("A", `select public.respond_backup_request($1,true)`, [req1]), "not allowed"));
t("other helper cannot accept", errHas(await as("H2", `select public.respond_backup_request($1,true)`, [req1]), "not allowed"));
t("outsider cannot accept", errHas(await as("X", `select public.respond_backup_request($1,true)`, [req1]), "not allowed"));
t("complete before accept is rejected", errHas(await as("A", `select public.complete_backup_request($1)`, [req1]), "only an accepted"));
r = await as("H", `select public.respond_backup_request($1,true) as s`, [req1]);
t("chosen helper accepts", r.ok && r.rows[0].s === "accepted", r.err);
t("answering twice is rejected", errHas(await as("H", `select public.respond_backup_request($1,false)`, [req1]), "already accepted"));
t("still only one active request while accepted", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hH2]), "already active"));

// 6 complete frees the child
r = await as("H", `select public.complete_backup_request($1)`, [req1]);
t("accepted helper can mark pickup completed", r.ok, r.err);
t("completed request visible as completed", (await as("A", `select state from public.backup_requests where id=$1`, [req1])).rows[0]?.state === "completed");
r = await as("A", `select public.request_backup($1,$2) as id`, [child, hH2]);
t("after completion a new request is allowed", r.ok, r.err);
const req2 = r.rows?.[0]?.id;

// 7 decline path
r = await as("H2", `select public.respond_backup_request($1,false) as s`, [req2]);
t("helper declines", r.ok && r.rows[0].s === "declined", r.err);
t("declined helper can no longer accept it", errHas(await as("H2", `select public.respond_backup_request($1,true)`, [req2]), "already declined"));
r = await as("A", `select public.request_backup($1,$2) as id`, [child, hH]);
t("after decline a new request is allowed", r.ok, r.err);
const req3 = r.rows?.[0]?.id;

// 8 cancel
t("outsider cannot cancel", errHas(await as("X", `select public.cancel_backup_request($1)`, [req3]), "not allowed"));
t("helper cannot cancel", errHas(await as("H", `select public.cancel_backup_request($1)`, [req3]), "not allowed"));
t("parent cancels", (await as("B", `select public.cancel_backup_request($1)`, [req3])).ok);
t("cancelled request cannot be accepted", errHas(await as("H", `select public.respond_backup_request($1,true)`, [req3]), "already cancelled"));

// 9 helper eligibility
t("pending helper cannot be requested", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hPending]), "not approved"));
t("approved but not-joined helper cannot be requested", errHas(await as("A", `select public.request_backup($1,$2)`, [child, hUnlinked]), "not joined"));
t("helper from another family rejected", errHas(await as("A", `select public.request_backup($1,$2)`, [child, "00000000-0000-0000-0000-000000000999"]), "not approved"));

// 10 removed helper loses access
r = await as("A", `select public.request_backup($1,$2) as id`, [child, hH]);
const req4 = r.rows?.[0]?.id;
await as("A", `update public.trusted_helpers set state='rejected' where id=$1`, [hH]);
t("removed helper cannot accept", errHas(await as("H", `select public.respond_backup_request($1,true)`, [req4]), "not allowed"));
t("removed helper cannot read the request any more", (await as("H", `select * from public.backup_requests`)).rows?.length === 0);
t("removed helper has no assignments", (await as("H", `select * from public.my_backup_assignments()`)).rows?.length === 0);

// 11 bad state value
const bad = await db.query(`select 1 from pg_constraint where conname='backup_requests_state_check' and pg_get_constraintdef(oid) like '%completed%'`);
t("state constraint includes 'completed'", bad.rows.length === 1);
t("migration is idempotent (ran twice without error)", true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

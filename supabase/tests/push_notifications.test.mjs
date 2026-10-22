// Tests proposals/push-notifications/push_notifications.sql on a throwaway in-memory Postgres (PGlite). Never touches a real project.
//   npm i --no-save @electric-sql/pglite && node supabase/tests/push_notifications.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const P = new URL("../", import.meta.url).pathname;
const PUSH = new URL("../../proposals/push-notifications/push_notifications.sql", import.meta.url).pathname;
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
await db.exec(fs.readFileSync(PUSH, "utf8"));
await db.exec(fs.readFileSync(PUSH, "utf8")); // idempotent: a second run must not fail

const U = {
  A: "00000000-0000-0000-0000-00000000000a", // parent (admin)
  B: "00000000-0000-0000-0000-00000000000b", // second parent
  C: "00000000-0000-0000-0000-00000000000c", // brother
  H: "00000000-0000-0000-0000-0000000000a1", // trusted helper (joined)
  N: "00000000-0000-0000-0000-0000000000a3", // trusted helper who has not joined
  X: "00000000-0000-0000-0000-0000000000ff", // outsider
};
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, k + "@t.test", JSON.stringify({ full_name: "User " + k })]);

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
const outbox = async () => (await root(`select o.kind, o.user_id, o.title, o.body, o.data from public.push_outbox o order by o.created_at, o.kind`));
const who = (rows) => rows.map((r) => Object.entries(U).find(([, id]) => id === r.user_id)?.[0]).sort().join("");
const clear = () => root(`delete from public.push_outbox`);

// ---------- tokens
const T1 = "ExponentPushToken[abc_DEF-123]";
t("not signed in cannot register", errHas(await as(null, `select public.register_push_token($1,'android')`, [T1]), "not signed in"));
t("a bad token is refused", errHas(await as("A", `select public.register_push_token('hello','android')`), "invalid push token"));
t("a script-looking token is refused", errHas(await as("A", `select public.register_push_token($1,'ios')`, ["ExponentPushToken[a];drop table x"]), "invalid push token"));
t("an unknown platform is refused", errHas(await as("A", `select public.register_push_token($1,'web')`, [T1]), "platform"));
t("a good token is stored", (await as("A", `select public.register_push_token($1,'android')`, [T1])).ok && (await root(`select count(*)::int n from public.push_tokens`))[0].n === 1);
await as("A", `select public.register_push_token($1,'android')`, [T1]);
t("registering the same token twice keeps one row", (await root(`select count(*)::int n from public.push_tokens`))[0].n === 1);
t("the app cannot read tokens", !(await as("A", `select * from public.push_tokens`)).ok);
t("the app cannot write tokens directly", !(await as("A", `insert into public.push_tokens (user_id,token,platform) values ($1,'ExponentPushToken[zz]','ios')`, [U.A])).ok);
t("the app cannot read the queue", !(await as("A", `select * from public.push_outbox`)).ok);
t("the app cannot queue a message itself", !(await as("A", `select public.queue_push($1,'backup_requested','x','y','{}'::jsonb)`, [U.B])).ok);
await as("B", `select public.register_push_token($1,'ios')`, [T1]);
const mv = await root(`select user_id, platform from public.push_tokens where token=$1`, [T1]);
t("the same phone logging in as someone else moves the token to them", mv.length === 1 && mv[0].user_id === U.B && mv[0].platform === "ios");
await as("A", `select public.unregister_push_token($1)`, [T1]);
t("one person cannot remove another person's token", (await root(`select count(*)::int n from public.push_tokens`))[0].n === 1);
await as("B", `select public.unregister_push_token($1)`, [T1]);
t("a person can remove their own token (logout)", (await root(`select count(*)::int n from public.push_tokens`))[0].n === 0);
for (let i = 0; i < 7; i++) { await as("A", `select public.register_push_token($1,'android')`, [`ExponentPushToken[tok${i}]`]); await root(`update public.push_tokens set updated_at = now() - ($1 || ' seconds')::interval where token = $2`, [String(100 - i), `ExponentPushToken[tok${i}]`]); }
await as("A", `select public.register_push_token($1,'android')`, ["ExponentPushToken[tok7]"]);
const kept = await root(`select token from public.push_tokens where user_id=$1`, [U.A]);
t("at most 5 phones per person, newest kept", kept.length === 5 && kept.some((r) => r.token.includes("tok7")) && !kept.some((r) => r.token.includes("tok0")), JSON.stringify(kept));
await root(`delete from public.push_tokens`);

// ---------- setup a family
const fam = (await as("A", `select public.create_family('F') as id`)).rows[0].id;
await db.exec(`insert into public.family_members (family_id,user_id,role) values ('${fam}','${U.B}','member'),('${fam}','${U.C}','member')`);
const child = (await as("A", `insert into public.children (family_id,name,school_name,school_address) values ($1,'Laila','SK Aman','Jalan 3') returning id`, [fam])).rows[0].id;
const mk = async (n, u, st = "active") => (await as("A", `insert into public.trusted_helpers (family_id,name,role,user_id,state) values ($1,$2,'Uncle',$3,$4) returning id`, [fam, n, u ? U[u] : null, st])).rows[0].id;
const hH = await mk("Encik Ahmad", "H"); await mk("Not joined", null); await mk("Pending", "N", "pending");
await clear();

// ---------- a group request
const b = await as("A", `select public.start_backup_broadcast($1,'manual') as id`, [child]);
t("group request starts", b.ok, b.err);
let ob = await outbox();
t("everyone asked is told, once each (B, C and the helper)", who(ob) === "BCH" && ob.every((r) => r.kind === "backup_requested"), who(ob));
t("the parent who asked is NOT pushed", !ob.some((r) => r.user_id === U.A));
t("nobody who cannot answer is pushed (not joined, pending)", ob.length === 3);
t("the text is generic: no child, school or place", ob.every((r) => !/laila|aman|jalan/i.test(r.title + r.body + JSON.stringify(r.data))), JSON.stringify(ob[0]));
t("the data carries only an id and a type", ob.every((r) => Object.keys(r.data).sort().join() === "request_id,type"));
// accept
const reqH = (await root(`select id from public.backup_requests where recipient_user_id=$1`, [U.H]))[0].id;
await clear();
t("helper accepts", (await as("H", `select public.respond_backup_request($1,true)`, [reqH])).ok);
ob = await outbox();
t("the parent who asked is told it was accepted (once)", who(ob) === "A" && ob[0].kind === "backup_accepted", who(ob) + JSON.stringify(ob.map((r) => r.kind)));
t("the others who were closed out are not pushed", ob.length === 1);
// decline path on a fresh round
await as("A", `select public.cancel_backup_broadcast($1)`, [b.rows[0].id]);
await root(`update public.backup_requests set state='cancelled' where state in ('requested','accepted')`).catch(() => {});
await clear();

// ---------- journey
await root(`update public.backup_requests set state='accepted', helper_id=$2, recipient_user_id=$3 where id=$1`, [reqH, hH, U.H]).catch(() => {});
await clear();
const j = await as("H", `select public.start_pickup_journey($1) as id`, [child]);
t("journey starts", j.ok, j.err);
ob = await outbox();
t("family is told the collector set off, collector is not", who(ob) === "ABC" && ob.every((r) => r.kind === "journey_started"), who(ob));
await clear();
await as("H", `select public.mark_arrived_at_school($1)`, [j.rows[0].id]);
ob = await outbox();
t("family is told at school", who(ob) === "ABC" && ob.every((r) => r.kind === "journey_at_school"), who(ob));
await clear();
await as("H", `select public.confirm_handover($1)`, [j.rows[0].id]);
ob = await outbox();
t("family is told picked up", who(ob) === "ABC" && ob.every((r) => r.kind === "journey_collected"), who(ob));
t("journey text never names the child, school or collector", ob.every((r) => !/laila|aman|jalan|user h/i.test(r.title + r.body)));
t("no outsider ever gets a message", !(await outbox()).some((r) => r.user_id === U.X));
// cancelled journey sends nothing
await root(`update public.backup_requests set state='cancelled' where state in ('requested','accepted')`).catch(() => {});
await root(`update public.pickup_journeys set state='collected' where state in ('started','at_school')`);
await clear();
await root(`update public.backup_requests set state='accepted' where false`);
t("an update that does not change the state queues nothing", (await root(`select count(*)::int n from public.push_outbox`))[0].n === 0);

// ---------- idempotent triggers: applying twice did not double-queue
await clear();
const fam2 = (await as("B", `select public.create_family('G') as id`)).rows[0].id;
const ch2 = (await as("B", `insert into public.children (family_id,name) values ($1,'Zed') returning id`, [fam2])).rows[0].id;
await as("B", `insert into public.trusted_helpers (family_id,name,role,user_id,state) values ($1,'H','Uncle',$2,'active')`, [fam2, U.H]);
await as("B", `select public.start_backup_broadcast($1,'manual')`, [ch2]);
ob = await outbox();
t("a second family: the helper gets exactly one message after the file was applied twice", who(ob) === "H" && ob.length === 1, who(ob));
t("the other family's members are not pushed", !ob.some((r) => [U.A, U.C].includes(r.user_id)));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon; create publication supabase_realtime;
`);
await db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
await db.exec(fs.readFileSync(path.join(root, "pickup_workflow.sql"), "utf8"));
await db.exec(fs.readFileSync(path.join(root, "pickup_journeys.sql"), "utf8"));
await db.exec(fs.readFileSync(path.join(root, "migrations/20261023_pickup_scoped_location_sharing.sql"), "utf8"));

const users = {
  parent: "00000000-0000-0000-0000-00000000000a",
  member: "00000000-0000-0000-0000-00000000000b",
  outsider: "00000000-0000-0000-0000-0000000000ff",
};
for (const [name, id] of Object.entries(users)) {
  await db.query("insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)", [id, `${name}@test.local`, JSON.stringify({ full_name: name })]);
}

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${users[user]}',false); set role authenticated;`);
  try {
    const result = await db.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await db.exec("reset role");
  }
}

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : `  <- ${detail}`}`);
}
const denied = (result) => !result.ok && /permission denied|row-level security/i.test(result.error);

const family = (await as("parent", "select public.create_family('Test family') as id")).rows[0].id;
await db.exec(`insert into public.family_members (family_id,user_id,role) values ('${family}','${users.member}','member')`);
const child = (await as("parent", "insert into public.children (family_id,name) values ($1,'Test child') returning id", [family])).rows[0].id;
const journey = (await as("parent", "select public.start_pickup_journey($1) as id", [child])).rows[0].id;

check("outsider cannot start location sharing", ! (await as("outsider", "select public.start_pickup_location_share($1)", [journey])).ok);
check("collector can explicitly start location sharing", (await as("parent", "select public.start_pickup_location_share($1)", [journey])).ok);
check("clients cannot create share records directly", denied(await as("parent", "insert into public.pickup_location_shares (journey_id,family_id,collector_user_id) values ($1,$2,$3)", [journey, family, users.parent])));

check("assigned collector can upload current point", (await as("parent", "insert into public.pickup_live_locations (journey_id,latitude,longitude,accuracy_m) values ($1,2.22,102.45,12)", [journey])).ok);
check("family member can read active point", (await as("member", "select * from public.pickup_live_locations where journey_id=$1", [journey])).rows.length === 1);
check("outsider cannot read point", (await as("outsider", "select * from public.pickup_live_locations")).rows.length === 0);
check("non-collector cannot upload point", denied(await as("member", "insert into public.pickup_live_locations (journey_id,latitude,longitude) values ($1,2.3,102.3)", [journey])));

check("collector can stop sharing and point is deleted", (await as("parent", "select public.stop_pickup_location_share($1)", [journey])).ok
  && (await as("parent", "select * from public.pickup_live_locations")).rows.length === 0);
check("family cannot read stopped share", (await as("member", "select * from public.pickup_location_shares")).rows.length === 0);

await as("parent", "select public.start_pickup_location_share($1)", [journey]);
await as("parent", "insert into public.pickup_live_locations (journey_id,latitude,longitude) values ($1,2.22,102.45)", [journey]);
await as("parent", "select public.cancel_pickup_journey($1)", [journey]);
const afterCancel = await db.query("select ended_at from public.pickup_location_shares where journey_id=$1", [journey]);
check("ending journey closes sharing and removes point", afterCancel.rows[0]?.ended_at != null
  && (await as("parent", "select * from public.pickup_live_locations")).rows.length === 0,
  JSON.stringify({ afterCancel, points: await as("parent", "select * from public.pickup_live_locations") }));

const child2 = (await as("parent", "insert into public.children (family_id,name) values ($1,'Second child') returning id", [family])).rows[0].id;
const completedJourney = (await as("parent", "select public.start_pickup_journey($1) as id", [child2])).rows[0].id;
await as("parent", "select public.start_pickup_location_share($1)", [completedJourney]);
await as("parent", "insert into public.pickup_live_locations (journey_id,latitude,longitude) values ($1,2.22,102.45)", [completedJourney]);
await as("parent", "select public.mark_arrived_at_school($1)", [completedJourney]);
const completion = await as("parent", "select public.confirm_handover($1)", [completedJourney]);
const afterCompletion = await db.query("select ended_at from public.pickup_location_shares where journey_id=$1", [completedJourney]);
check("handover completion closes sharing and removes point", completion.ok && afterCompletion.rows[0]?.ended_at != null
  && (await as("parent", "select * from public.pickup_live_locations")).rows.length === 0,
  JSON.stringify({ completion, afterCompletion }));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

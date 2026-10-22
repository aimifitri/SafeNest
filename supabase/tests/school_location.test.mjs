import { PGlite } from "@electric-sql/pglite"; import fs from "node:fs";
const P = new URL("../", import.meta.url).pathname; const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema auth, public to authenticated, anon; create publication supabase_realtime;`);
await db.exec(fs.readFileSync(P+"schema.sql","utf8"));
const m=fs.readFileSync(P+"school_location.sql","utf8"); await db.exec(m); await db.exec(m);
await db.exec(`insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000000a','a@t')`);
await db.exec(`insert into public.families(name,created_by) values('f','00000000-0000-0000-0000-00000000000a')`).catch(()=>{});
const f=(await db.query(`select id from public.families limit 1`)).rows[0]?.id;
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log(c?"PASS":"FAIL",n)};
const ins=async(a,b)=>{try{await db.query(`insert into public.children(family_id,name,school_latitude,school_longitude) values($1,'x',$2,$3)`,[f,a,b]);return true}catch{return false}};
t("valid coords accepted",await ins(2.2,102.3));t("null coords accepted",await ins(null,null));t("lat out of range rejected",!(await ins(95,10)));t("half-set rejected",!(await ins(2.2,null)));
console.log(ok,"passed",bad,"failed");process.exit(bad?1:0)

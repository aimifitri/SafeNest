import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Local state/API contract tests only. No network, authentication, or database operations.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-children-"));
let passed = 0;
const test = (name, run) => { run(); passed++; console.log("PASS", name); };
try {
  const react = path.join(dir, "react.mjs");
  fs.writeFileSync(react, `let cell; export const resetHook = () => { cell = undefined; };
    export const useState = initial => { if (cell === undefined) cell = typeof initial === 'function' ? initial() : initial; return [cell, next => { cell = typeof next === 'function' ? next(cell) : next; }]; };
    export const useCallback = callback => callback;
    export const useSyncExternalStore = () => { throw new Error('UI rendering is outside this test'); };`);
  const out = path.join(dir, "children.mjs");
  await build({ stdin: { contents: `
    export * from './src/components/shared/childScope';
    export * from './src/components/shared/useScopedState';
    export * from './src/components/shared/demoSim';
    export * as TC from './src/components/shared/teacherCheck';
    export { pickupDecision } from './src/components/shared/pickupDecision';
    export { emptyChildDraft, validateChildDraft } from './src/components/shared/accountRules';
    export { resetHook } from 'react';`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "esm", outfile: out, alias: { react }, logLevel: "silent" });
  const S = await import(pathToFileURL(out).href);
  const children = S.demoChildren();
  const [laila, hana] = children;
  const a = S.childScope("demo", "household-a", laila.id);
  const b = S.childScope("demo", "household-a", hana.id);
  test("Laila remains the default and the second child is labelled demo", () => {
    assert.match(S.resolveChild(children, null).name, /Laila/);
    assert.match(hana.name, /demo/); assert.notEqual(laila.id, hana.id);
  });
  test("second child can be selected by stable ID", () => assert.equal(S.resolveChild(children, hana.id), hana));
  test("unknown or removed child falls back only within the current household", () => assert.equal(S.resolveChild([laila], hana.id), laila));
  test("empty and single-child households are safe", () => { assert.equal(S.resolveChild([], null), null); assert.equal(S.resolveChild([laila], null), laila); });
  test("account, household and child boundaries produce different scopes", () => {
    assert.equal(new Set([a, b, S.childScope("other-account", "household-a", laila.id), S.childScope("demo", "other-household", laila.id)]).size, 4);
  });
  test("demo children have distinct regular dismissal schedules", () => assert.notDeepEqual(S.initialWeek(laila.id, true), S.initialWeek(hana.id, true)));
  test("real children receive no sample schedule", () => assert.equal(S.initialWeek(laila.id, false)[1], "1:00 PM"));
  S.resetHook();
  const weekA = S.initialWeek(laila.id, true), weekB = S.initialWeek(hana.id, true);
  const [, saveA] = S.useScopedState(a, weekA);
  saveA(current => ({ ...current, 1: "11:15 AM" }));
  test("weekly edit does not overwrite the second child's plan", () => assert.deepEqual(S.useScopedState(b, weekB)[0], weekB));
  test("switching back retains the first child's weekly edit", () => assert.equal(S.useScopedState(a, weekA)[0][1], "11:15 AM"));
  const [, saveB] = S.useScopedState(b, weekB);
  saveB(current => ({ ...current, 2: "3:00 PM" }));
  saveA(current => ({ ...current, 3: "10:00 AM" })); // response captured before the switch
  test("late save completion updates only its original child", () => { assert.equal(S.useScopedState(a, weekA)[0][3], "10:00 AM"); assert.equal(S.useScopedState(b, weekB)[0][3], weekB[3]); });
  S.resetHook();
  const [, overrideA] = S.useScopedState(a, null);
  overrideA({ weekday: 1, time: "11:00 AM" });
  test("temporary dismissal is separate for every child", () => { assert.equal(S.useScopedState(b, null)[0], null); assert.equal(S.useScopedState(a, null)[0].time, "11:00 AM"); });
  S.resetHook();
  const [, requestA] = S.useScopedState(a, { state: "idle" });
  requestA({ state: "accepted", helperId: "ima" });
  test("backup request and response snapshots do not leak", () => { assert.equal(S.useScopedState(b, { state: "idle" })[0].state, "idle"); assert.equal(S.useScopedState(a, { state: "idle" })[0].helperId, "ima"); });

  const people = [
    { id: "abu", name: "Abu", role: "Father", kind: "family", approved: true },
    { id: "siti", name: "Siti", role: "Mother", kind: "family", approved: true },
    { id: "pending", name: "Pending helper", role: "Neighbour", kind: "circle", approved: false },
  ];
  const env = { people, viewerId: "abu", viewerName: "Abu", planDismiss: 13 * 60, teacherName: "Teacher" };
  const select = (scope, second = false) => { S.sim.selectScope(scope, second); S.pickupDecision.selectScope(scope); S.TC.selectTeacherScope(scope); };
  select(a); S.sim.setAutoReplies(false);
  S.sim.setDismiss(700, env); S.sim.setEscalation({ enabled: false, minutesBefore: 7 }, env);
  S.pickupDecision.willCollect(720); S.TC.setTeacherCheck("Siti", "approved");
  select(b, true);
  test("second child starts with its own dismissal override and automatic backup settings", () => { assert.equal(S.sim.get().dismissOverride, null); assert.equal(S.sim.get().escalation.minutesBefore, 10); });
  test("second demo child has a different authorized collector", () => { const inp = S.simInputs(S.sim.get(), { ...env, planDismiss: 870 }); assert.equal(inp.collectorName, "Siti"); assert.equal(people.find(p => p.id === S.sim.get().engine.collector).approved, true); });
  test("parent decisions and teacher verification never transfer between children", () => { assert.equal(S.pickupDecision.get().choice, "none"); assert.equal(S.TC.getTeacherCheck("Siti"), "notStarted"); });
  S.sim.setEscalation({ enabled: true, minutesBefore: 15 }, { ...env, planDismiss: 870 });
  select(a);
  test("switching back restores original child's automatic settings and override", () => { assert.equal(S.sim.get().escalation.minutesBefore, 7); assert.equal(S.sim.get().escalation.enabled, false); assert.equal(S.sim.get().dismissOverride, 700); });
  test("switching back restores only that child's verification and parent choice", () => { assert.equal(S.pickupDecision.get().leaveAt, 720); assert.equal(S.TC.getTeacherCheck("Siti"), "approved"); });
  S.sim.act("find_backup", env);
  test("pending or unauthorized helper is never asked", () => assert.equal(Object.hasOwn(S.sim.get().engine.replies, "pending"), false));
  const pendingRound = S.sim.get().engine;
  select(b);
  test("backup rounds and collectors remain independent", () => { assert.equal(S.sim.get().engine.collector, "siti"); assert.notEqual(S.sim.get().engine, pendingRound); });
  select(a);
  test("original child's backup round is retained", () => assert.deepEqual(S.sim.get().engine, pendingRound));
  select(b);
  S.sim.depart({ ...env, planDismiss: 870 });
  select(a);
  const aTravel = S.sim.get().travel;
  await new Promise(resolve => setTimeout(resolve, 700));
  test("outgoing child's journey timer cannot advance the selected child's marker", () => assert.equal(S.sim.get().travel, aTravel));
  select(b);
  S.sim.tick({ ...env, planDismiss: 870 });
  await new Promise(resolve => setTimeout(resolve, 700));
  test("returning to a travelling child resumes its own journey animation", () => { assert.equal(S.sim.get().engine.stage, "travelling"); assert.ok(S.sim.get().travel > 0); });
  select("new-demo-session" + a);
  test("a fresh Demo Mode session starts without old requests, overrides or verification", () => { assert.equal(S.sim.get().engine.stage, "plan"); assert.equal(S.sim.get().dismissOverride, null); assert.equal(S.TC.getTeacherCheck("Siti"), "notStarted"); });
  const draft = { ...S.emptyChildDraft(), name: " New child ", age: "6", schoolName: "Demo school", className: "1A" };
  test("existing child form validation accepts supported fields and rejects invalid age", () => { assert.deepEqual(S.validateChildDraft(draft), {}); assert.ok(S.validateChildDraft({ ...draft, age: "-1" }).age); });
  const added = S.demoChildFromDraft(draft, "demo-child-new");
  test("local addition is selectable without replacing Laila or adding unsupported fields", () => { const next = [...children, added]; assert.equal(S.resolveChild(next, added.id).name, "New child"); assert.equal(next[0], laila); assert.equal(next.length, 3); assert.equal(added.age, 6); assert.deepEqual(Object.keys(added).sort(), Object.keys(laila).sort()); });
  test("demo fixtures are fresh copies", () => { const other = S.demoChildren(); other[0].name = "Changed"; assert.match(S.demoChildren()[0].name, /Laila/); });
  const plan = fs.readFileSync("src/components/plan/PickupPlan.tsx", "utf8"), today = fs.readFileSync("src/components/today/TodayDashboard.tsx", "utf8");
  test("Today and Plan both remount child-specific controllers using the same household selection", () => { for (const source of [plan, today]) { assert.match(source, /key=\{household.pickupScope\}/); assert.match(source, /useChildSchool/); assert.match(source, /usePickupFlow\(/); } });
  test("selector precedes Today and reuses the existing child form", () => { assert.ok(plan.indexOf("<ChildSelector />", plan.indexOf("return (", plan.indexOf("if (!hasChild"))) < plan.indexOf('title="Today"')); const selector = fs.readFileSync("src/components/plan/ChildSelector.tsx", "utf8"); assert.match(selector, /<ChildForm/); assert.match(selector, /h.addChild\(draft\)/); });
  S.sim.selectScope("test-end"); // cancel any demo timers
  const database = path.join(dir, "database.mjs");
  fs.writeFileSync(database, `export const queries = []; let responses = [];
    export function configure(next) { queries.length = 0; responses = [...next]; }
    export const supabase = { from(table) { const query = { table, filters: [] }; queries.push(query); return {
      select(columns) { query.columns = columns; return this; },
      eq(column, value) { query.filters.push([column, value]); return this; },
      order() { return this; }, limit() { return this; },
      then(resolve, reject) { return Promise.resolve(responses.shift()).then(resolve, reject); }
    }; } };`);
  const apiOut = path.join(dir, "api.mjs");
  await build({ stdin: { contents: "export { fetchFirstChild } from './src/components/shared/backupApi'; export { configure, queries } from 'test-database';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: apiOut, logLevel: "silent",
    plugins: [{ name: "no-network-database", setup(b) { b.onResolve({ filter: /(?:lib\/supabase|test-database)$/ }, () => ({ path: database })); } }] });
  const api = await import(pathToFileURL(apiOut).href);
  api.configure([{ data: [{ id: "child-b", school_latitude: 3, school_longitude: 101 }], error: null }]);
  const stored = await api.fetchFirstChild("family-a", "child-b");
  test("selected child's school lookup filters both household and child IDs", () => { assert.equal(stored.id, "child-b"); assert.deepEqual(api.queries[0].filters, [["family_id", "family-a"], ["id", "child-b"]]); assert.deepEqual(stored.school, { latitude: 3, longitude: 101 }); });
  api.configure([{ data: null, error: { message: "column does not exist" } }, { data: [{ id: "child-b" }], error: null }]);
  const withoutCoordinates = await api.fetchFirstChild("family-a", "child-b");
  test("missing optional school columns retain exact child and household filters", () => { assert.equal(withoutCoordinates.school, null); assert.equal(api.queries.length, 2); assert.deepEqual(api.queries[1].filters, [["family_id", "family-a"], ["id", "child-b"]]); });
  api.configure([{ data: [{ id: "wrong-child" }], error: null }]);
  const wrong = await api.fetchFirstChild("family-a", "child-b");
  test("unexpected child result is rejected instead of used for pickup requests", () => assert.equal(wrong, null));
  api.configure([{ data: [{ id: "only-child" }], error: null }]);
  const first = await api.fetchFirstChild("family-a");
  test("legacy first-child callers retain single-child behavior", () => { assert.equal(first.id, "only-child"); assert.deepEqual(api.queries[0].filters, [["family_id", "family-a"]]); });
  console.log(`\n${passed} multi-child assertions passed.`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

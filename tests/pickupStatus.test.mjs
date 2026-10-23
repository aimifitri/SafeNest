import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-status-"));
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log("PASS", name); };
try {
  const react = path.join(dir, "react.mjs");
  fs.writeFileSync(react, "export const useSyncExternalStore = () => { throw new Error('No UI hooks in this test'); }; ");
  const out = path.join(dir, "status.mjs");
  await build({ stdin: { contents: `export * from './src/components/shared/pickupStatus'; export * from './src/components/shared/locationQuality'; export * from './src/components/shared/pickupEstimate'; export * from './src/components/shared/demoSim'; export { derivePickupFlow } from './src/components/shared/pickupFlow';`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, alias: { react }, logLevel: "silent" });
  const S = await import(pathToFileURL(out).href);
  const at = (h, m) => new Date(2026, 9, 23, h, m).getTime();
  const ready = (minutes = 20) => ({ kind: "ready", minutes, checkedAt: at(12, 30), source: "demo" });
  const status = (minutes, now = 750, dismissal = 780, phase = "on_time") => S.pickupStatus(ready(minutes), now, dismissal, phase, "Laila", "Siti");
  await test("early estimate reports ten minutes early", () => { const r = status(20); assert.equal(r.kind, "early"); assert.equal(r.minutesLate, -10); assert.equal(r.arrival, 770); });
  await test("exactly-on-time estimate", () => { assert.equal(status(30).kind, "on_time"); assert.equal(status(30).minutesLate, 0); });
  await test("predicted ten minutes late", () => { assert.equal(status(40).kind, "late"); assert.equal(status(40).minutesLate, 10); });
  await test("already past dismissal measures lateness against dismissal, not now", () => { const r = status(15, 785); assert.equal(r.kind, "delayed"); assert.equal(r.arrival, 800); assert.equal(r.minutesLate, 20); });
  await test("today's dismissal override changes the calculation", () => { assert.equal(status(20, 750, 760).minutesLate, 10); assert.equal(status(20, 750, 780).minutesLate, -10); });
  for (const [name, eta, match] of [
    ["denied permission", { kind: "permission_needed", blocked: true }, /Allow foreground/],
    ["missing school pin", { kind: "unavailable", reason: "no_school_location" }, /saved school pin/],
    ["stale GPS", { kind: "unavailable", reason: "stale_gps" }, /too old/],
    ["weak GPS", { kind: "unavailable", reason: "weak_gps" }, /accuracy/],
    ["disabled services", { kind: "unavailable", reason: "location_disabled" }, /Turn on/],
    ["failed route", { kind: "unavailable", reason: "network" }, /route/],
  ]) await test(`${name} gives an honest unavailable state`, () => { const r = S.pickupStatus(eta, 750, 780, "late", "Laila", "Abu"); assert.equal(r.kind, "unavailable"); assert.equal(r.arrival, null); assert.match(r.detail, match); });
  await test("checking is not a predicted delay", () => assert.equal(S.pickupStatus({ kind: "checking" }, 785, 780, "checking", "Laila", "Abu").kind, "checking"));
  for (const [phase, kind] of [["asking", "pending"], ["helper_assigned", "assigned"], ["travelling", "journey"], ["at_school", "journey"], ["collected", "completed"]]) await test(`${phase} takes precedence over a late parent's ETA`, () => { const r = status(40, 750, 780, phase); assert.equal(r.kind, kind); assert.equal(r.arrival, null); });
  await test("cancelled journey does not restart delay monitoring", () => assert.equal(S.pickupStatus(ready(40), 750, 780, "late", "Laila", "Siti", true).kind, "cancelled"));
  const alertInput = { now: 750, dismissal: 780, foreground: true, acknowledged: false, parentResponded: false, blocked: false };
  await test("lateness can warn before the original fifteen-minute window", () => assert.equal(S.shouldShowPickupAlert(status(40), alertInput), true));
  await test("central monitoring config preserves the fifteen-before/thirty-after window", () => { assert.equal(S.pickupMonitoringStage(764, 780), "risk_check"); assert.equal(S.pickupMonitoringStage(765, 780), "pickup_window"); assert.equal(S.pickupMonitoringStage(810, 780), "pickup_window"); assert.equal(S.pickupMonitoringStage(811, 780), "outside"); });
  await test("disabled in-app warning preference prevents automatic popup", () => assert.equal(S.shouldShowPickupAlert(status(40), { ...alertInput, enabled: false }), false));
  await test("hours before dismissal never automatically interrupts", () => assert.equal(S.shouldShowPickupAlert(status(220, 540), { ...alertInput, now: 540 }), false));
  await test("no automatic popup for early or on-time pickup", () => { assert.equal(S.shouldShowPickupAlert(status(20), alertInput), false); assert.equal(S.shouldShowPickupAlert(status(30), alertInput), false); });
  for (const overrides of [{ acknowledged: true }, { parentResponded: true }, { foreground: false }, { blocked: true }, { now: 811 }]) await test(`automatic popup suppressed by ${JSON.stringify(overrides)}`, () => assert.equal(S.shouldShowPickupAlert(status(40), { ...alertInput, ...overrides }), false));
  await test("pending, accepted, completed and cancelled never generate lateness popups", () => { for (const phase of ["asking", "helper_assigned", "travelling", "at_school", "collected"]) assert.equal(S.shouldShowPickupAlert(status(40, 750, 780, phase), alertInput), false); });
  await test("acknowledgements isolate account, family, child, mode, date and dismissal", () => { const base = ["account-a", "family-a", "laila-id", false, "2026-10-23", 780]; const key = S.pickupAlertKey(...base); S.acknowledgePickupAlert(key); assert.equal(S.hasPickupAcknowledgement(key), true); for (const [index, other] of [[0, "account-b"], [1, "family-b"], [2, "hana-id"], [3, true], [4, "2026-10-24"], [5, 790]]) { const args = [...base]; args[index] = other; assert.equal(S.hasPickupAcknowledgement(S.pickupAlertKey(...args)), false); } });
  const fix = { timestamp: at(12, 30), coords: { latitude: 3, longitude: 101, accuracy: 15 } };
  await test("quality accepts fresh precise real phone coordinates", () => assert.equal(S.positionIssue(fix, at(12, 30)), null));
  await test("stale, future, inaccurate and invalid fixes are rejected", () => {
    assert.equal(S.positionIssue(fix, at(12, 32)), "stale_gps"); assert.equal(S.positionIssue({ ...fix, timestamp: at(12, 32) }, at(12, 30)), "stale_gps");
    for (const accuracy of [null, NaN, -1, 101]) assert.equal(S.positionIssue({ ...fix, coords: { ...fix.coords, accuracy } }, at(12, 30)), "weak_gps");
    assert.equal(S.positionIssue({ ...fix, coords: { ...fix.coords, latitude: 95 } }, at(12, 30)), "no_gps");
  });
  await test("cached real ETA expires instead of claiming live GPS", () => { const eta = { ...ready(20), source: "route", accuracy: 15, positionTimestamp: at(12, 30) }; assert.equal(S.usableEta(eta, at(12, 32)).kind, "unavailable"); assert.equal(S.usableEta(eta, at(12, 30)).kind, "ready"); });
  await test("native request deadline is bounded", async () => { await assert.rejects(S.withDeadline(new Promise(() => {}), 5), /timeout/); });
  const create = (changes = {}, school = { latitude: 3.1, longitude: 101.1 }) => S.createPickupEstimate({ permission: async () => ({ granted: true, canAskAgain: true }), services: async () => true, position: async () => fix, route: async () => ({ ok: true, minutes: 40 }), now: () => at(12, 30), ...changes }, school);
  await test("estimate controller publishes actual-adapter result and quality metadata", async () => { const c = create(); await c.refresh(); assert.equal(c.get().minutes, 40); assert.equal(c.get().source, "route"); assert.equal(c.get().accuracy, 15); });
  await test("permission denial never obtains coordinates or routes", async () => { const c = create({ permission: async () => ({ granted: false, canAskAgain: false }), position: async () => { throw Error("must not execute"); } }); await c.refresh(); assert.deepEqual(c.get(), { kind: "permission_needed", blocked: true }); });
  await test("missing school does not use demo coordinates or geocode silently", async () => { let called = false; const c = create({ position: async () => { called = true; return fix; } }, null); await c.refresh(); assert.equal(called, false); assert.equal(c.get().reason, "no_school_location"); });
  await test("disabled services stop acquisition", async () => { const c = create({ services: async () => false }); await c.refresh(); assert.equal(c.get().reason, "location_disabled"); });
  await test("stale GPS never reaches the routing provider", async () => { let called = false; const c = create({ position: async () => ({ ...fix, timestamp: at(12, 0) }), route: async () => { called = true; return { ok: true, minutes: 5 }; } }); await c.refresh(); assert.equal(called, false); assert.equal(c.get().reason, "stale_gps"); });
  await test("route rejection is a route failure, not an invented ETA", async () => { const c = create({ route: async () => { throw Error("offline"); } }); await c.refresh(); assert.deepEqual(c.get(), { kind: "unavailable", reason: "network" }); });
  await test("overlapping refreshes deduplicate position and route work", async () => { let positions = 0, routes = 0; const c = create({ position: async () => { positions++; return fix; }, route: async () => { routes++; return { ok: true, minutes: 20 }; } }); await Promise.all([c.refresh(), c.refresh(), c.refresh()]); assert.equal(positions, 1); assert.equal(routes, 1); });
  await test("outdated results after child switch/unmount cannot publish", async () => {
    let finish; const route = new Promise(resolve => { finish = resolve; });
    const c = create({ route: () => route }); const pending = c.refresh();
    await new Promise(resolve => setTimeout(resolve, 0)); c.invalidate();
    finish({ ok: true, minutes: 99 }); await pending; assert.equal(c.get().kind, "checking");
    await c.refresh(); assert.equal(c.get().minutes, 99);
  });
  await test("Laila and Hana calculations remain independent even with reversed completion", async () => {
    let finishLaila; const pendingRoute = new Promise(resolve => { finishLaila = resolve; });
    const laila = create({ route: () => pendingRoute }), hana = create({ route: async () => ({ ok: true, minutes: 12 }) }, { latitude: 4, longitude: 102 });
    const pending = laila.refresh(); await hana.refresh(); finishLaila({ ok: true, minutes: 40 }); await pending;
    assert.equal(laila.get().minutes, 40); assert.equal(hana.get().minutes, 12);
    assert.equal(S.pickupStatus(laila.get(), 750, 780, "late", "Laila", "Abu").kind, "late");
    assert.equal(S.pickupStatus(hana.get(), 750, 870, "on_time", "Hana", "Siti").kind, "early");
  });
  const people = [{ id: "abu", name: "Abu", role: "Father", kind: "family", approved: true }, { id: "siti", name: "Siti", role: "Mother", kind: "family", approved: true }, { id: "pending", name: "Pending", role: "Neighbour", kind: "circle", approved: false }];
  const env = { people, viewerId: "abu", viewerName: "Abu", planDismiss: 780, teacherName: "Teacher" };
  S.sim.selectScope("status-test-demo"); S.sim.setAutoReplies(false); S.sim.setEscalation({ enabled: false }, env);
  await test("Proceed reuses the demo commitment rather than requesting backup", () => { S.sim.act("still_collect", env); assert.equal(S.sim.get().engine.stage, "committed"); assert.deepEqual(S.sim.get().engine.replies, {}); });
  await test("backup action reuses demo engine and excludes unapproved helpers", () => { S.sim.act("find_backup", env); assert.equal(S.sim.get().engine.stage, "circle"); assert.equal(S.sim.get().engine.replies.pending, undefined); assert.equal(S.sim.act("find_backup", env), false); });
  await test("helper acceptance and journey movement remain simulated", () => { S.answer("siti", "yes", env); assert.equal(S.sim.get().engine.collector, "siti"); const input = S.simInputs(S.sim.get(), env); assert.equal(input.circle.simulated, true); S.sim.act("demo_depart", env); assert.equal(S.sim.get().engine.stage, "travelling"); });
  await test("demo completion suppresses lateness", () => { S.sim.act("demo_arrive", env); S.sim.act("demo_handover", env); assert.equal(S.sim.get().engine.stage, "collected"); assert.equal(status(40, 800, 780, "collected").kind, "completed"); });
  S.sim.selectScope("status-test-done");
  await test("only one modal implementation exists and it makes no separate GPS/network request", () => { const source = fs.readFileSync("src/components/today/PickupStatusModal.tsx", "utf8"); assert.doesNotMatch(source, /expo-location|fetch\(/); assert.match(source, /no other person's|No other person's/); const old = fs.readFileSync("src/components/today/PickupEstimatePopup.tsx", "utf8"); assert.match(old, /PickupStatusModal as PickupEstimatePopup/); });
  await test("late estimates use the modal without competing inline warning", () => {
    for (const phase of ["late", "ask_now", "nobody"]) assert.equal(S.showInlinePickupStatus(phase, status(40, 750, 780, phase)), false);
    assert.equal(S.shouldShowPickupAlert(status(40), alertInput), true);
  });
  await test("commitment and active request/journey cards remain available", () => {
    for (const phase of ["will_collect", "asking", "helper_assigned", "travelling", "at_school", "collected"]) assert.equal(S.showInlinePickupStatus(phase, status(40, 750, 780, phase)), true);
  });
  const dashboard = fs.readFileSync("src/components/today/TodayDashboard.tsx", "utf8");
  const modal = fs.readFileSync("src/components/today/PickupStatusModal.tsx", "utf8");
  await test("automatic trigger uses existing monitoring policy and selects the child modal", () => { assert.match(dashboard, /const eligible = \(\) => shouldShowPickupAlert/); assert.match(dashboard, /setPickupPopupChildId\(child.id\);\s*setPickupPopupVisible\(true\)/); assert.match(dashboard, /showInlinePickupStatus\(flow.phase, pf.status\)/); });
  await test("manual status remains available without a late estimate", () => { assert.match(dashboard, /onPress=\{checkPickupStatus\}/); const manual = dashboard.slice(dashboard.indexOf("const checkPickupStatus"), dashboard.indexOf("const proceedWithPickup")); assert.match(manual, /setPickupPopupVisible\(true\)/); assert.doesNotMatch(manual, /shouldShowPickupAlert/); });
  await test("closing acknowledges only this warning and suppresses repeat presentation", () => { const key = S.demoPickupAlertKey("modal-test", "laila", 0); S.acknowledgePickupAlert(key); assert.equal(S.shouldShowPickupAlert(status(40), { ...alertInput, acknowledged: S.hasPickupAcknowledgement(key) }), false); assert.match(dashboard, /acknowledgePickupAlert\(acknowledgement\);\s*setPickupPopupVisible\(false\)/); });
  await test("reset episode can warn again without affecting another child", () => { const old = S.demoPickupAlertKey("modal-test", "laila", 0), next = S.demoPickupAlertKey("modal-test", "laila", 1), hana = S.demoPickupAlertKey("modal-test", "hana", 0); assert.equal(S.hasPickupAcknowledgement(old), true); for (const key of [next, hana]) assert.equal(S.shouldShowPickupAlert(status(40), { ...alertInput, acknowledged: S.hasPickupAcknowledgement(key) }), true); });
  await test("Demo controls block automatic and manual modal presentation through native dismissal", () => { assert.match(dashboard, /blocked:.*demoPresented.*pickupPopupChildId !== null/); assert.match(dashboard, /if \(demoPresented \|\| locationOpen/); assert.match(dashboard, /onExited=\{\(\) => setDemoPresented\(false\)\}/); const sheet = fs.readFileSync("src/components/shared/Sheet.tsx", "utf8"); assert.match(sheet, /onDismiss=\{finishExit\}/); assert.match(sheet, /if \(!mounted && !onExited\) return null/); assert.match(sheet, /Platform.OS !== "ios"/); });
  await test("status modal uses dark green, scrim, safe areas and scrollable content", () => { assert.match(modal, /card: baseColors.heroStart/); assert.match(modal, /ToneProvider value="hero"/); assert.match(modal, /<Modal transparent/); assert.match(modal, /backgroundColor: colors.scrim/); assert.match(modal, /paddingTop: insets.top/); assert.match(modal, /<ScrollView/); assert.match(modal, /minutesLate} minutes late/); });
  await test("Proceed waits for native modal dismissal before existing GPS transition", () => { assert.match(dashboard, /onProceed=\{\(\) => void proceedWithPickup\(\)\}/); assert.match(dashboard, /if \(pendingGpsOpen.current\)/); assert.match(modal, /onDismiss=\{finishExit\}/); assert.match(modal, /exitPending.current = true;\s*setRendered\(false\)/); assert.match(modal, /onExitedRef.current\(\)/); });
  await test("backup action keeps real-account authorization restrictions", () => { assert.match(modal, /onPress=\{onActivateBackup\} disabled=\{backupBusy \|\| pf.busy \|\| !pf.statusReady \|\| !pf.simActive\}/); assert.match(dashboard, /if \(backupBusy \|\| !pf.simActive\) return/); assert.match(dashboard, /flow.phase === "nobody" \? "ask_again" : "find_backup"/); });
  console.log(`\n${passed} pickup-status assertions passed.`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

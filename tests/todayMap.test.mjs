import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-today-map-"));
let passed = 0;
const test = (name, run) => { run(); passed++; console.log("PASS", name); };
try {
  const out = path.join(dir, "map.mjs");
  await build({ stdin: { contents: "export * from './src/components/today/todayMapModel'; export * from './src/components/today/mapCamera';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  const { todayMapModel: model, shouldCenterHeader: camera } = await import(pathToFileURL(out).href);
  const now = 1800000000000;
  const base = { demo: false, childId: "laila", schoolName: "Selected school", school: { latitude: 3, longitude: 101 }, now,
    snapshot: { kind: "ready", fix: { timestamp: now, coords: { latitude: 4, longitude: 102, accuracy: 10 } }, label: null, message: "", blocked: false },
    simulation: { place: "office", travel: 0 }, collector: { kind: "parent", name: "Parent" }, phase: "monitoring" };
  test("real marker uses only actual GPS", () => { assert.equal(model(base).point.latitude, 4); assert.equal(model(base).point.title, "This phone"); assert.doesNotMatch(model(base).title, /simulated/i); });
  test("GPS update moves marker", () => { const moved = model({ ...base, snapshot: { ...base.snapshot, fix: { ...base.snapshot.fix, coords: { latitude: 5, longitude: 103, accuracy: 12 } } } }); assert.equal(moved.point.latitude, 5); });
  test("missing permission never substitutes demo coordinates", () => { assert.equal(model({ ...base, snapshot: { ...base.snapshot, kind: "permission_needed", fix: null } }).point, null); });
  test("stale GPS never renders a current marker", () => { assert.equal(model({ ...base, now: now + 61000 }).point, null); });
  test("weak accuracy never renders a current marker", () => { assert.equal(model({ ...base, snapshot: { ...base.snapshot, fix: { ...base.snapshot.fix, coords: { ...base.snapshot.fix.coords, accuracy: 500 } } } }).point, null); });
  test("missing school has no invented pin", () => { assert.equal(model({ ...base, school: null }).school, null); });
  test("invalid school has no invented pin", () => { assert.equal(model({ ...base, school: { latitude: NaN, longitude: 101 } }).school, null); });
  test("child selection replaces school", () => { const next = model({ ...base, childId: "hana", school: { latitude: 6, longitude: 104 } }); assert.equal(next.school.latitude, 6); assert.notDeepEqual(next.school, model(base).school); });
  test("demo never consumes actual phone or saved school", () => { const a = model({ ...base, demo: true }); const b = model({ ...base, demo: true, school: null, snapshot: { ...base.snapshot, fix: null } }); assert.deepEqual(a, b); assert.equal(a.title, "Demo GPS ? Simulated"); assert.notEqual(a.point.latitude, 4); });
  test("demo child schools are distinct and deterministic", () => { const a = model({ ...base, demo: true }), b = model({ ...base, demo: true, childId: "demo-child-hana" }); assert.notDeepEqual(a.school, b.school); assert.deepEqual(a, model({ ...base, demo: true })); });
  test("demo place changes parent marker", () => { const a = model({ ...base, demo: true }), b = model({ ...base, demo: true, simulation: { place: "school", travel: 1 } }); assert.notDeepEqual(a.point, b.point); assert.equal(b.point.latitude, b.school.latitude); });
  test("demo movement advances collector without moving real coordinates", () => { const input = { ...base, demo: true, collector: { kind: "helper", name: "Siti" }, phase: "travelling" }; const a = model(input), b = model({ ...input, simulation: { place: "office", travel: 0.8 } }); assert.notDeepEqual(a.additionalPoints, b.additionalPoints); assert.deepEqual(a.point, b.point); assert.deepEqual(model({ ...input, demo: false }).additionalPoints, []); });
  test("first fix centers", () => assert.equal(camera(false, false, 0, 0), true));
  test("subsequent updates preserve exploration", () => assert.equal(camera(true, false, 0, 0), false));
  test("exploring before first fix is respected", () => assert.equal(camera(false, true, 0, 0), false));
  test("explicit recenter works after exploring", () => assert.equal(camera(true, true, 0, 1), true));
  const dashboard = fs.readFileSync("src/components/today/TodayDashboard.tsx", "utf8"), header = fs.readFileSync("src/components/today/TodayGpsHeader.tsx", "utf8"), native = fs.readFileSync("src/components/today/DeviceLocationMap.native.tsx", "utf8");
  test("header integrates one native map without separate location card", () => { assert.match(dashboard, /header=\{headerMap\}/); assert.doesNotMatch(dashboard, /TodayLocationSummary|FullMap|PLACE_XY/); assert.match(header, /cameraMode="explore"/); });
  test("header never adds a location watcher or backend writes", () => { assert.doesNotMatch(header, /watchPosition|supabase|usePhoneLocation/); assert.match(dashboard, /todayActive && !pf.simActive && !locationOpen/); });
  test("navigation map defaults preserved and pan supported", () => { assert.match(native, /cameraMode = "automatic"/); assert.match(native, /onPanDrag/); assert.match(native, /pinColor="#218975"/); });
  test("child and mode changes remount header while existing GPS remains accessible", () => { assert.match(dashboard, /key=\{`\$\{household.pickupScope\}:\$\{pf.simActive/); assert.match(header, /onPress=\{onGps\}/); assert.doesNotMatch(header, /routeCoordinates=/); });
  console.log(`${passed} assertions passed`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

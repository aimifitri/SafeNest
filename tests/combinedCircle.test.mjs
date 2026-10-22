// Merge regression: disabled legacy writes must never contact a backend.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-combined-"));
const out = path.join(dir, "combined.mjs");
try {
  await build({ stdin: { contents: 'export * as legacy from "./src/components/shared/householdApi"; export * as demo from "./src/components/circle/circleDemo";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent", plugins: [{ name: "no-backend", setup(build) {
    build.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: "supabase", namespace: "mock" }));
    build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: 'export const supabase = new Proxy({}, { get() { throw new Error("Unexpected backend access"); } });', loader: "js" }));
  } }] });
  const { legacy, demo } = await import(pathToFileURL(out).href);
  let passed = 0;
  for (const [name, args] of [ ["addHelper", ["family", { name: "Helper", relationship: "Friend", phone: "" }]], ["setHelperState", ["helper", "active"]], ["removeHelper", ["helper"]], ["createHelperInvite", ["helper"]], ["acceptHelperInvite", ["a".repeat(64)]] ]) {
    const result = await legacy[name](...args);
    assert.equal(result.ok, false); assert.match(result.error, /secure invitations/); passed++;
  }
  const actor = demo.DEMO_PERSONAS.find(person => person.id === "abu");
  let state = demo.createCircleDemoState();
  for (const type of ["generate", "accept", "approve"]) state = demo.circleDemoReducer(state, { type, actor });
  assert.equal(state.memberships.find(member => member.id === "demo-invitation-membership").status, "approved"); passed++;
  assert.equal(state.memberships.find(member => member.id === "demo-invitation-membership").userId, "siti"); passed++;
  assert.equal(demo.canManageDemoInvitations(demo.DEMO_PERSONAS.find(person => person.id === "siti")), false); passed++;
  console.log(`${passed} passed, 0 failed`);
} finally { fs.rmSync(out, { force: true }); fs.rmdirSync(dir); }

// Mocked discovery and lifecycle regression tests; never connects to Supabase.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-invitation-safety-"));
const out = path.join(dir, "safety.mjs");
try {
  await build({ stdin: { contents: 'export * from "./src/components/circle/adminFamilies"; export * from "./src/components/circle/invitationLifecycle";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  const { loadAdminFamilies, selectAdminFamily, createInvitationLifecycle } = await import(pathToFileURL(out).href);
  let passed = 0;
  async function test(name, run) { await run(); passed++; console.log("PASS", name); }
  const row = id => ({ family_id: id, user_id: "account-a", role: "admin", families: { id, name: `Family ${id}` } });
  await test("discovers multiple administered families scoped to authenticated identity", async () => {
    const rows = await loadAdminFamilies("account-a", async (userId, from, to) => {
      assert.equal(userId, "account-a"); assert.equal(from, 0); assert.equal(to, 99);
      return { data: [row("one"), row("two")], error: null };
    });
    assert.deepEqual(rows, [{ id: "one", name: "Family one" }, { id: "two", name: "Family two" }]);
  });
  await test("pagination returns families beyond the first server page", async () => {
    const all = Array.from({ length: 205 }, (_, index) => row(String(index)));
    const ranges = [];
    const result = await loadAdminFamilies("account-a", async (_id, from, to) => { ranges.push([from,to]); return { data: all.slice(from, to + 1), error: null }; });
    assert.equal(result.length, 205); assert.deepEqual(ranges, [[0,99],[100,199],[200,299]]);
  });
  await test("foreign account and non-admin membership data fail closed", async () => {
    for (const invalid of [{ ...row("one"), user_id: "account-b" }, { ...row("one"), role: "member" }, { ...row("one"), families: { id: "other", name: "Other" } }]) {
      await assert.rejects(loadAdminFamilies("account-a", async () => ({ data: [invalid], error: null })));
    }
  });
  await test("permission and malformed responses fail closed", async () => {
    await assert.rejects(loadAdminFamilies("account-a", async () => ({ data: null, error: { code: "42501" } })));
    await assert.rejects(loadAdminFamilies("account-a", async () => ({ data: {}, error: null })));
  });
  const families = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
  await test("single-family behavior prefers the existing context when authorized", () => assert.equal(selectAdminFamily(families, null, "two"), "two"));
  await test("invitation selection can change without changing global family", () => { const current = "one"; assert.equal(selectAdminFamily(families, "two", current), "two"); assert.equal(current, "one"); });
  await test("removed authorization cannot preserve a stale selection", () => { assert.equal(selectAdminFamily([families[0]], "two", "two"), "one"); assert.equal(selectAdminFamily([], "two", "one"), null); });
  function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
  async function race(states, dispose = false) {
    const lifecycle = createInvitationLifecycle(); lifecycle.mount("active");
    const ticket = lifecycle.ticket(); const response = deferred(); let displayed = null;
    const request = response.promise.then(value => { if (lifecycle.isCurrent(ticket)) displayed = value; });
    for (const state of states) lifecycle.change(state);
    if (dispose) lifecycle.dispose();
    response.resolve("sensitive-test-code"); await request;
    return displayed;
  }
  await test("active creation response can be displayed", async () => assert.equal(await race([]), "sensitive-test-code"));
  await test("background creation response is discarded", async () => assert.equal(await race(["background"]), null));
  await test("inactive creation response is discarded", async () => assert.equal(await race(["inactive"]), null));
  await test("returning active cannot resurrect old response", async () => assert.equal(await race(["inactive","background","active"]), null));
  await test("unmounted component discards delayed creation response", async () => assert.equal(await race([], true), null));
  await test("remount cannot reuse tickets from previous account or family", () => { const lifecycle = createInvitationLifecycle(); lifecycle.mount("active"); const old = lifecycle.ticket(); lifecycle.dispose(); lifecycle.mount("active"); assert.equal(lifecycle.isCurrent(old), false); assert.equal(lifecycle.isCurrent(lifecycle.ticket()), true); });
  await test("initial inactive state refuses request and active resume allows a new one", () => { const lifecycle = createInvitationLifecycle(); lifecycle.mount("inactive"); assert.equal(lifecycle.isCurrent(lifecycle.ticket()), false); lifecycle.change("active"); assert.equal(lifecycle.isCurrent(lifecycle.ticket()), true); });
  console.log(`${passed} passed, 0 failed`);
} finally { fs.rmSync(out, { force: true }); fs.rmdirSync(dir); }

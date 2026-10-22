// Local mocked RPC contract tests: no Supabase client, credentials or network.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-invitation-"));
const out = path.join(dir, "api.mjs");
try {
  await build({ entryPoints: ["src/components/circle/invitationApi.ts"], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  const { createInvitationApi } = await import(pathToFileURL(out).href);
  const family = "11111111-1111-4111-8111-111111111111";
  const helper = "22222222-2222-4222-8222-222222222222";
  const token = "a".repeat(64);
  let response = { data: null, error: null };
  const calls = [];
  const api = createInvitationApi(async (name, args) => { calls.push({ name, args }); return response; });
  let passed = 0;
  async function test(name, run) { await run(); passed++; console.log("PASS", name); }
  await test("creation uses exact RPC arguments and preserves one-time code", async () => {
    response.data = [{ helper_id: helper, invite_token: token, expires_at: "2026-11-01T00:00:00Z" }];
    assert.equal((await api.create(family, " Helper ", " Friend ")).ok, true);
    assert.deepEqual(calls.at(-1), { name: "create_helper_with_invite", args: { target_family: family, helper_name: "Helper", relationship: "Friend" } });
  });
  await test("invalid creation input never calls RPC", async () => {
    const count = calls.length;
    assert.equal((await api.create(family, "", "")).ok, false);
    assert.equal((await api.create(family, "x", "x".repeat(201))).ok, false);
    assert.equal(calls.length, count);
  });
  await test("acceptance only calls accept RPC, never approval or family switching", async () => {
    response.data = family;
    const count = calls.length;
    assert.deepEqual(await api.accept(` ${token} `), { ok: true, data: family });
    assert.deepEqual(calls.slice(count), [{ name: "accept_helper_invite", args: { invite_token: token } }]);
  });
  await test("malformed codes are not submitted or echoed", async () => {
    const count = calls.length;
    for (const invalid of ["short", token + "a", "A".repeat(64), "https://example.test/" + token]) {
      const result = await api.accept(invalid); assert.equal(result.ok, false); assert.equal(result.error.includes(invalid), false);
    }
    assert.equal(calls.length, count);
  });
  await test("queue uses authenticated family scope and allows unavailable profile name", async () => {
    response.data = [{ membership_id: helper, family_id: family, helper_name: "Helper", relationship: "Friend", accepting_account_id: helper, accepting_account_name: null, accepted_at: "2026-10-23T00:00:00Z" }];
    assert.equal((await api.queue(family)).ok, true);
    assert.deepEqual(calls.at(-1), { name: "list_helper_approval_queue", args: { target_family: family } });
  });
  await test("unexpected queue family is rejected", async () => { response.data[0].family_id = helper; assert.equal((await api.queue(family)).ok, false); });
  await test("approval uses only target helper", async () => { response.data = helper; assert.equal((await api.approve(helper)).ok, true); assert.deepEqual(calls.at(-1), { name: "approve_helper", args: { target_helper: helper } }); });
  await test("malformed identifiers never reach RPC", async () => { const count = calls.length; await api.approve("bad"); await api.queue("bad"); assert.equal(calls.length, count); });
  for (const [code, expected] of [["22023", /expired.*already used/], ["42501", /Permission denied/], ["28000", /sign in/], ["55000", /already changed/], ["23505", /already changed/], ["PGRST202", /not available on this server/]]) {
    await test(`safe server error ${code}`, async () => { response = { data: null, error: { code, message: `secret ${token}` } }; const result = await api.accept(token); assert.equal(result.ok, false); assert.match(result.error, expected); assert.equal(result.error.includes(token), false); });
  }
  await test("network failure is sanitized and never retried", async () => { let count = 0; const failing = createInvitationApi(async () => { count++; throw new Error(token); }); const result = await failing.accept(token); assert.equal(result.ok, false); assert.equal(result.error.includes(token), false); assert.equal(count, 1); });
  await test("malformed successful mutation response is not claimed successful", async () => { response = { data: { token }, error: null }; assert.equal((await api.accept(token)).ok, false); assert.equal((await api.create(family, "Helper", "")).ok, false); });
  console.log(`${passed} passed, 0 failed`);
} finally { fs.rmSync(out, { force: true }); fs.rmdirSync(dir); }

// Local member grouping, permission preservation and Add New Member routing checks.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safenest-members-"));
const out = path.join(dir, "members.mjs");
try {
  await build({ stdin: { contents: 'export * from "./src/components/circle/circleMembers"; export { mockData } from "./src/components/shared/mockData";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  const { MEMBER_TABS, isFamilyRelationship, groupMembers, partitionMembers, manualDemoMember, inviteEntry, mockData } = await import(pathToFileURL(out).href);
  let passed = 0;
  const test = (name, run) => { run(); passed++; console.log("PASS", name); };
  test("Circle Members is left/default, Waiting for Approval is right", () => {
    assert.deepEqual(MEMBER_TABS.map(tab => tab.label), ["Circle Members", "Waiting for Approval"]);
    assert.equal(MEMBER_TABS[0].value, "members");
  });
  for (const relationship of ["Mother", "Grandfather", "Aunt", "Uncle", "Older sibling", "Cousin", "Legal guardian", "Other relative"]) test(`classifies relative ${relationship}`, () => assert.equal(isFamilyRelationship(relationship), true));
  for (const relationship of ["Neighbour", "Babysitter", "Family friend", "Mother's friend", "Other", ""]) test(`keeps nonrelative/unknown ${relationship} as helper`, () => assert.equal(isFamilyRelationship(relationship), false));
  const member = (id, role, overrides = {}) => ({ id, userId: null, kind: "helper", role, approved: false, state: "pending", ...overrides });
  test("relative helper moves visually without changing state, kind or approval", () => {
    const aunt = member("aunt", "Aunt"); const before = JSON.stringify(aunt);
    const grouped = groupMembers([aunt]); assert.equal(grouped.family[0], aunt); assert.equal(grouped.helpers.length, 0); assert.equal(JSON.stringify(aunt), before);
  });
  test("linked household member appears once with original collection permission", () => {
    const parent = member("user-one", "Father", { kind: "family", userId: "user-one", canCollect: false });
    const duplicate = member("helper-one", "Father", { userId: "user-one", approved: true, state: "active" });
    const grouped = groupMembers([duplicate, parent]); assert.deepEqual(grouped.family, [parent]); assert.equal(grouped.family[0].canCollect, false); assert.equal(grouped.helpers.length, 0);
  });
  test("nonrelative household membership stays authorized only by its stored canCollect value", () => { const person = member("family-friend", "Family friend", { kind: "family", canCollect: false }); const grouped = groupMembers([person]); assert.equal(grouped.helpers[0], person); assert.equal(grouped.helpers[0].canCollect, false); assert.equal(grouped.family.length, 0); });
  test("same name does not collapse distinct people", () => { const grouped = groupMembers([member("one", "Neighbour", { name: "Alex" }), member("two", "Neighbour", { name: "Alex" })]); assert.equal(grouped.helpers.length, 2); });
  test("repeated record IDs are not duplicated", () => assert.equal(groupMembers([member("one", "Aunt"), member("one", "Aunt")]).family.length, 1));
  test("rejected helper remains visible without becoming authorized", () => { const grouped = groupMembers([member("one", "Babysitter", { state: "rejected" })]); assert.equal(grouped.helpers[0].state, "rejected"); assert.equal(grouped.helpers[0].approved, false); });
  const draft = { name: "Alex Tan", relationship: "Aunt", phone: "", isAdult: true };
  test("manual demo addition is pending and categorizes into Family", () => { const record = manualDemoMember(draft, "demo-test"); assert.equal(record.state, "pending"); assert.equal(record.approved, false); assert.equal(record.userId, null); assert.equal(groupMembers([record]).family.length, 1); });
  test("manual nonrelative demo addition categorizes into Trusted Helpers", () => assert.equal(groupMembers([manualDemoMember({ ...draft, relationship: "Babysitter" }, "demo-helper")]).helpers.length, 1));
  test("manual addition preserves existing name/relationship/adult/phone validation", () => { for (const invalid of [{ ...draft, name: "" }, { ...draft, relationship: "" }, { ...draft, isAdult: false }, { ...draft, phone: "abc" }]) assert.throws(() => manualDemoMember(invalid, "invalid")); });
  test("invitation entry selects demo simulation only in explicit Demo Mode", () => { assert.equal(inviteEntry(true), "demo"); assert.equal(inviteEntry(false), "secure"); });
  // Source integration checks complement the pure rules; device interactions still need Expo Go.
  const screen = fs.readFileSync("src/components/circle/TrustedCircle.tsx", "utf8");
  const sheet = fs.readFileSync("src/components/circle/AddNewMember.tsx", "utf8");
  test("screen wires default tabs and one member entry; standalone demo tab removed", () => {
    assert.match(screen, /useState<MemberTab>\(MEMBER_TABS\[0\].value\)/);
    assert.equal((screen.match(/<AddNewMember /g) || []).length, 1);
    assert.doesNotMatch(screen, /label="\+ Add New Helper"|<AddFamilyMember|INVITATION DEMO/);
    assert.match(screen, /purpose="join"/); assert.match(screen, /purpose="review"/);
  });
  test("Add New Member routes manual and invite choices without direct writes", () => {
    assert.match(sheet, /setStep\("manual"\)/); assert.match(sheet, /setStep\("invite"\)/);
    assert.match(sheet, /submissionDisabled=\{!demo\}/); assert.match(sheet, /if \(!demo\) return/);
    assert.match(sheet, /<DemoMemberships model=\{model\} invitation/); assert.match(sheet, /purpose="invite"/);
    assert.match(sheet, /<AddFamilyMember embedded/); assert.doesNotMatch(sheet, /supabase\.|\.insert\(/);
  });
  test("pending and accepted-but-unapproved helpers never appear in Circle Members", () => {
    const rows = [member("pending", "Aunt", { joined: true }), member("accepted", "Neighbour", { joined: true, membershipState: "awaitingApproval" })];
    const result = partitionMembers(rows); assert.deepEqual(result.members, []); assert.equal(result.pending.length, 2);
  });
  test("manual demo addition is visible only in Waiting for Approval", () => {
    const added = manualDemoMember(draft, "manual"); const result = partitionMembers([added]); assert.deepEqual(result.members, []); assert.deepEqual(result.pending, [added]);
  });
  test("approval moves a record out of waiting without changing identity or relationship", () => {
    const pending = manualDemoMember(draft, "approve-test");
    assert.equal(partitionMembers([pending]).pending.length, 1);
    const approved = { ...pending, state: "active", approved: true };
    const result = partitionMembers([approved]); assert.equal(result.pending.length, 0); assert.deepEqual(groupMembers(result.members).family, [approved]);
    assert.equal(approved.id, pending.id); assert.equal(approved.role, pending.role);
  });
  test("approved household membership stays visible even without pickup permission", () => {
    const family = member("family", "Father", { kind: "family", membershipState: "active", canCollect: false, approved: false });
    const result = partitionMembers([family]); assert.deepEqual(groupMembers(result.members).family, [family]); assert.equal(result.pending.length, 0); assert.equal(family.canCollect, false);
  });
  test("approved nonrelative is visible in Trusted Helpers only", () => {
    const helper = member("helper", "Babysitter", { state: "active", joined: true }); const result = partitionMembers([helper]); assert.deepEqual(groupMembers(result.members).helpers, [helper]); assert.equal(result.pending.length, 0);
  });
  test("legacy approved but unaccepted helper remains waiting", () => {
    const unjoined = member("unjoined", "Aunt", { state: "active", joined: false, approved: true }); const result = partitionMembers([unjoined]); assert.deepEqual(result.members, []); assert.deepEqual(result.pending, [unjoined]);
  });
  test("rejected cancelled expired revoked and unknown states cannot appear approved", () => {
    const rows = ["rejected", "cancelled", "expired", "revoked", "unknown"].map(state => member(state, "Aunt", { state, joined: true, approved: true }));
    const result = partitionMembers(rows); assert.deepEqual(result.members, []); assert.deepEqual(result.pending, []);
  });
  test("Kak Ima is Neighbour with unchanged identity and active authorization", () => {
    const ima = mockData.trustedHelpers.find(person => person.id === "ima");
    assert.deepEqual(ima, { id: "ima", name: "Kak Ima", role: "Neighbour", state: "active", locationLabel: "Home (demo)" });
    const helper = { ...ima, userId: null, kind: "helper", joined: true, approved: ima.state === "active" };
    const before = JSON.stringify(helper); const result = partitionMembers([helper]);
    assert.deepEqual(groupMembers(result.members).helpers, [helper]); assert.equal(result.pending.length, 0); assert.equal(JSON.stringify(helper), before);
    assert.deepEqual(partitionMembers([{ ...helper, state: "pending", approved: false }]).members, []);
  });
  test("one canonical identity cannot appear in both sections or both tabs", () => {
    const family = member("account", "Mother", { kind: "family", userId: "account", membershipState: "active", canCollect: false });
    const helper = member("helper-row", "Mother", { userId: "account", joined: true });
    const result = partitionMembers([helper, family, family]); const groups = groupMembers(result.members);
    assert.deepEqual(groups.family, [family]); assert.deepEqual(groups.helpers, []); assert.deepEqual(result.pending, []);
  });
  test("screen groups only completed memberships and refreshes after explicit approval", () => {
    assert.match(screen, /groupMembers\(visibility.members\)/); assert.match(screen, /const pending = visibility.pending/);
    assert.match(screen, /onApproved=\{\(\) => h.refresh\(\)\}/);
  });
  console.log(`${passed} passed, 0 failed`);
} finally { fs.rmSync(out, { force: true }); fs.rmdirSync(dir); }

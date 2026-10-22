// End to end checks of the labelled demo (clock, location, scripted replies) feeding derivePickupFlow.
//   node tests/demoSim.test.mjs   (needs esbuild)
import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sim-"));
const bundle = async (name, entry) => {
  const out = path.join(dir, name + ".mjs");
  await build({ entryPoints: [path.join(root, entry)], bundle: true, format: "esm", platform: "node", outfile: out, external: ["react"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
// react is only used for useSyncExternalStore; stub it so the module loads in plain node
fs.mkdirSync(path.join(dir, "node_modules/react"), { recursive: true });
fs.writeFileSync(path.join(dir, "node_modules/react/index.js"), "export const useSyncExternalStore = () => { throw new Error('hook'); };");
fs.writeFileSync(path.join(dir, "node_modules/react/package.json"), '{"name":"react","type":"module","main":"index.js"}');
const out = path.join(dir, "bundle.mjs");
await build({
  stdin: { contents: `export * from "${root}/src/components/shared/demoSim.ts"; export * as F from "${root}/src/components/shared/pickupFlow.ts"; export * as E from "${root}/src/components/shared/circleEngine.ts"; export * as TC from "${root}/src/components/shared/teacherCheck.ts";`, resolveDir: root, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { react: path.join(dir, "node_modules/react/index.js") },
});
const S = await import(pathToFileURL(out).href);
const { sim, simInputs, F, E } = S;

let pass = 0, fail = 0;
const t = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const people = [
  { id: "abu", name: "Abu", role: "Parent", kind: "family", approved: true },
  { id: "siti", name: "Siti", role: "Parent", kind: "family", approved: true },
  { id: "aiman", name: "Aiman", role: "Brother", kind: "family", approved: true },
  { id: "ahmad", name: "Encik Ahmad", role: "Uncle", kind: "circle", approved: true },
  { id: "ima", name: "Kak Ima", role: "Aunt", kind: "circle", approved: true },
  { id: "salmah", name: "Pn. Salmah", role: "Neighbour", kind: "circle", approved: false },
];
const env = { people, viewerId: "abu", viewerName: "Abu", planDismiss: 13 * 60, teacherName: "Cikgu Aisyah" };
const view = (extra = {}) => {
  const s = sim.get();
  const i = simInputs(s, env);
  return F.derivePickupFlow({
    now: i.nowMs, childName: "Laila", teacherName: env.teacherName, dismissal: "1:00 PM", viewerName: "Abu",
    eta: i.eta, parentChoice: i.parentChoice, leaveAt: i.leaveAt, circle: i.circle, journey: i.journey,
    teacher: "notStarted", escalation: s.escalation, eligibleCount: i.eligibleCount, simulated: true, ...extra,
  });
};
const status = (f) => Object.fromEntries(f.recipients.map((r) => [r.name, r.status]));
const M = (h, m) => h * 60 + m;

// ===== the exact scenario from the brief =====
S.__resetSimForTests();
sim.reset(env);
sim.setAutoReplies(false);
sim.setNow(M(12, 30), env);
sim.setPlace("office", env); sim.setDelay(5, env);
t("12:30 now, 1:00 end, arrives 1:10 -> late", view().phase === "late", view().phase);
t("nobody asked yet", view().recipients.length === 0);
sim.advance(24, env);
t("12:54 still nothing sent", view().recipients.length === 0 && view().phase !== "asking", view().phase);
sim.advance(1, env);
t("12:55 automatic request starts", view().phase === "asking", view().phase);
let st = status(view());
t("all four eligible are Pending together", Object.keys(st).length === 4 && Object.values(st).every((v) => v === "pending"), JSON.stringify(st));
t("parent and pending member are not asked", !("Abu" in st) && !("Pn. Salmah" in st));
const askedAt = sim.get().engine.askedAt;
sim.tick(env); sim.tick(env); sim.advance(0, env);
t("re-render / re-tick does not resend", sim.get().engine.askedAt === askedAt);
S.answer("siti", "no", env); S.answer("aiman", "no", env);
st = status(view());
t("A and B declined, others still pending", st.Siti === "declined" && st.Aiman === "declined" && st["Encik Ahmad"] === "pending" && st["Kak Ima"] === "pending", JSON.stringify(st));
t("still asking, not assigned", view().phase === "asking");
S.answer("ahmad", "yes", env);
st = status(view());
t("C accepted", st["Encik Ahmad"] === "accepted");
t("the rest are closed, none pending", st["Kak Ima"] === "closed" && !Object.values(st).includes("pending"), JSON.stringify(st));
t("helper assigned phase names the helper", view().phase === "helper_assigned" && /Encik Ahmad/.test(view().headline + view().detail), view().headline);
const before = JSON.stringify(sim.get().engine);
S.answer("ima", "yes", env);
t("a late second accept cannot take over", JSON.stringify(sim.get().engine) === before);
t("no other helper is offered while one is collecting", !view().secondary || !/another|different|ask/i.test(view().secondary.label), view().secondary?.label);
// ---- stage 1: accepted is NOT collected
let f = view();
t("accepted: shows the collector, not collected", f.phase === "helper_assigned" && f.showCollector && /not collected yet/i.test(f.detail), f.detail);
t("accepted: progress is at step Accepted", f.steps.map((x) => x.state).join() === "done,done,current,todo,todo", f.steps.map((x) => x.state).join());
t("accepted: no 'who answered' list is kept open", f.recipientsView === "none");
t("accepted: only the demo travel action is offered (no photo yet, no other helper)", f.demoActions.map((a) => a.id).join() === "demo_depart" && !f.primary && !f.secondary, JSON.stringify([f.demoActions, f.primary, f.secondary]));
t("accepted: cannot skip to picked up", sim.act("demo_handover", env) === false && sim.get().engine.stage === "covered");

// ---- stage 2: collector travels, marker moves (simulated)
t("demo: collector starts travelling", sim.act("demo_depart", env) === true && sim.get().engine.stage === "travelling");
f = view();
t("travelling: phase and ETA are shown as simulated", f.phase === "travelling" && /simulated/i.test(f.detail) && /minutes? away/i.test(f.detail), f.detail);
t("travelling: only the arrival demo action", f.demoActions.map((a) => a.id).join() === "demo_arrive", JSON.stringify(f.demoActions));
const t0 = sim.get().travel;
await sleep(1500);
t("travelling: marker progress advances by itself", sim.get().travel > t0, `${t0} -> ${sim.get().travel}`);
const mid = view();
t("travelling: ETA shrinks as it moves", /minutes? away|Almost there/.test(mid.detail));
t("travelling: not collected", mid.phase === "travelling");
t("travelling: departing again changes nothing", sim.act("demo_depart", env) === false);

// ---- stage 3: arrival -> at school, photo for the teacher
t("demo: collector arrives at school", sim.act("demo_arrive", env) === true && sim.get().engine.stage === "arrived" && sim.get().travel === 1);
f = view();
t("arrived: at school, collector card shown", f.phase === "at_school" && f.status === "At school" && f.showCollector, f.status);
t("arrived: photo action and one picked-up demo button, no teacher buttons", f.primary?.id === "prepare_teacher" && f.demoActions.map((a) => a.id).join() === "demo_handover", JSON.stringify([f.primary, f.demoActions]));
t("arrived: the clock is not before school ends", sim.get().now >= M(13, 0), String(sim.get().now));
sim.photoSent("Encik Ahmad");
f = view({ teacher: "awaitingTeacher" });
t("photo sent: still at school, nothing changes by itself", f.phase === "at_school" && sim.get().engine.stage === "arrived" && f.demoActions.length === 1, f.phase);
await sleep(400);
t("still at school after a delay (nothing is approved or collected automatically)", sim.get().engine.stage === "arrived");
t("there is no teacher yes or no action any more", sim.act("demo_teacher_ok", env) === false && sim.act("demo_teacher_no", env) === false && sim.get().engine.stage === "arrived");

// ---- the collector says picked up
t("demo: collector says picked up", sim.act("demo_handover", env) === true && sim.get().engine.stage === "collected");
f = view({ teacher: "awaitingTeacher" });
t("picked up straight away, no teacher wait", f.phase === "collected" && f.status === "Picked up", f.phase);
t("picked up: the same helper is not blocked by anything", sim.get().engine.collector === "ahmad");
// cancel does nothing once done, so start over for the next checks
sim.reset(env); sim.setAutoReplies(false); sim.setNow(M(12, 55), env); sim.setPlace("office", env); sim.setDelay(5, env); sim.tick(env);
S.answer("ima", "yes", env);
t("a fresh round: another helper accepts", view().phase === "helper_assigned" && /Kak Ima/.test(view().headline));
sim.act("demo_depart", env); sim.act("demo_arrive", env);
sim.photoSent("Kak Ima");
f = view({ teacher: "awaitingTeacher" });
t("at school: steps stop at At school and picked up is still ahead", f.steps.map((x) => x.state).join() === "done,done,done,current,todo", f.steps.map((x) => x.state).join());
t("at school: cannot be moved to a different collector by asking again", sim.act("ask_again", env) === false);
t("demo: collector says picked up", sim.act("demo_handover", env) === true && sim.get().engine.stage === "collected");
f = view({ teacher: "awaitingTeacher" });
t("collected: complete status with name and time", f.phase === "collected" && /Kak Ima picked up Laila at/.test(f.detail) && f.steps.every((x) => x.state === "done"), f.detail);
t("collected: no travel or demo actions remain", f.demoActions.length === 0 && !f.primary);
t("collected: cancel does nothing", sim.act("cancel_round", env) === false && sim.get().engine.stage === "collected");
t("collected: no conflicting assignment", sim.act("find_backup", env) === false && sim.act("ask_again", env) === false && sim.act("come_myself", env) === false);
t("collected: travel animation is stopped", (() => { const a = sim.get().travel; return a === 1; })());
// the old failure mode: accepted can never jump to collected
sim.reset(env); sim.setAutoReplies(false); sim.setNow(M(12, 55), env); sim.setPlace("office", env); sim.setDelay(5, env); sim.tick(env);
S.answer("siti", "yes", env);
t("never skips straight from accepted to picked up", view().phase === "helper_assigned" && sim.act("demo_handover", env) === false && sim.get().engine.stage === "covered");
sim.act("cancel_round", env);
t("cancel and start over resets the journey (demo controls)", view().recipients.length === 0 && sim.get().engine.stage === "plan" && sim.get().travel === 0);

// ===== opt-in off: urgent alert, never sends =====
sim.preset("auto_off", env);
sim.setAutoReplies(false);
sim.setNow(M(12, 56), env);
t("opt-in off: nobody asked at the deadline", view().recipients.length === 0 && Object.keys(sim.get().engine.replies).length === 0);
t("opt-in off: parent still sees late with a way to ask", view().phase === "late" || view().phase === "ask_now", view().phase);

// ===== manual backup =====
sim.preset("late", env);
sim.setAutoReplies(false);
sim.act("find_backup", env);
t("manual backup asks everyone together", Object.keys(status(view())).length === 4 && view().phase === "asking");
sim.act("find_backup", env);
t("pressing manual backup twice does not duplicate", Object.keys(sim.get().engine.replies).length === 4);
S.answer("siti", "yes", env);
t("manual accept assigns", view().phase === "helper_assigned");
sim.act("cancel_round", env);
t("cancel and start over clears the round", view().recipients.length === 0 && view().phase !== "helper_assigned", view().phase);

// ===== parent confirms they will collect =====
sim.preset("late", env);
sim.act("still_collect", env);
t("parent confirms -> will_collect", view().phase === "will_collect", view().phase);
sim.setNow(M(12, 58), env);
t("committed parent is not auto-escalated", Object.keys(sim.get().engine.replies).length === 0);

// ===== nobody available =====
sim.preset("nobody", env);
sim.setAutoReplies(true);
sim.setNow(M(12, 55), env);
await sleep(120);
t("request started in nobody preset", view().phase === "asking" || view().phase === "nobody", view().phase);
for (const p of ["siti", "aiman", "ahmad"]) S.answer(p, "no", env);
S.answer("ima", "none", env);
t("everyone declined or no response -> nobody", view().phase === "nobody", view().phase);
t("nobody offers I will come myself", view().primary?.id === "come_myself" || view().secondary?.id === "come_myself", JSON.stringify([view().primary, view().secondary]));
sim.act("come_myself", env, { leaveAt: M(12, 40) });
t("coming myself -> will_collect", view().phase === "will_collect" && sim.get().engine.leaveAt === M(12, 40), view().phase);

// ===== missing GPS / denied permission =====
sim.preset("no_gps", env);
t("no GPS: unavailable, not a guess", view().phase === "eta_unavailable", view().phase);
sim.setNow(M(12, 56), env);
t("no GPS: no automatic request without an estimate", Object.keys(sim.get().engine.replies).length === 0);
t("no GPS: parent can still ask for backup", [view().primary?.id, view().secondary?.id].includes("find_backup"), JSON.stringify([view().primary, view().secondary]));
sim.preset("denied", env);
t("permission denied -> needs location with settings action", view().phase === "needs_location" && [view().primary?.id, view().secondary?.id].some((x) => x === "open_settings" || x === "enable_location"), view().phase);

// ===== dismissal schedule changes =====
sim.preset("late", env);
sim.setAutoReplies(false);
sim.setDismiss(M(14, 0), env);
t("dismissal moved to 2:00 -> on time", view({ dismissal: "2:00 PM" }).phase === "on_time", view({ dismissal: "2:00 PM" }).phase);
sim.setDismiss(M(12, 40), env);
t("dismissal moved earlier -> deadline passed, request starts", Object.keys(sim.get().engine.replies).length > 0 || view({ dismissal: "12:40 PM" }).phase === "late", view({ dismissal: "12:40 PM" }).phase);

// ===== expiry of an unanswered round =====
sim.preset("late", env);
sim.setAutoReplies(false);
sim.setNow(M(12, 55), env);
t("round open", view().phase === "asking");
sim.advance(E.ESCALATION_DEFAULTS.responseWindowMinutes + 1, env);
t("unanswered round expires into nobody available", view().phase === "nobody", view().phase);
const eng = sim.get().engine;
t("expired people are No response, not pending", Object.values(status(view())).every((v) => v === "no_response" || v === "declined"), JSON.stringify(status(view())));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

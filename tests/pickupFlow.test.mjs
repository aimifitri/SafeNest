// Tests the pickup state model on its own (no React, no network).
//   node tests/pickupFlow.test.mjs   (needs esbuild)
import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "flow-")), "flow.mjs");
await build({ entryPoints: [path.join(root, "src/components/shared/pickupFlow.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const F = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const t = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + x}`); };
const at = (h, m) => new Date(2026, 9, 21, h, m, 0, 0).getTime();
const ready = (min, now) => ({ kind: "ready", minutes: min, source: "route", checkedAt: now });
const ON = { enabled: true, minutesBefore: 5, responseWindowMinutes: 10 };
const OFF = { ...ON, enabled: false };
const base = (now = at(12, 30)) => ({
  now, childName: "Laila", teacherName: "Cikgu Aisyah", dismissal: "1:00 PM", viewerName: "Abu",
  eta: ready(40, now), parentChoice: "none", leaveAt: null, circle: null, journey: null, teacher: "notStarted",
  escalation: ON, eligibleCount: 4, simulated: false,
});
const flow = (o = {}) => F.derivePickupFlow({ ...base(), ...o });
const ids = (f) => [f.primary?.id, f.secondary?.id].filter(Boolean);
const row = (id, name, status) => ({ id, name, role: "Family", kind: "family", status });
const circle = (rows, extra = {}) => ({ recipients: rows, reason: "auto", collectorName: null, simulated: false, ...extra });

// ---- location and estimate
t("no permission -> needs_location", flow({ eta: { kind: "permission_needed", blocked: false } }).phase === "needs_location");
t("blocked permission offers settings", ids(flow({ eta: { kind: "permission_needed", blocked: true } })).includes("open_settings"));
t("checking -> checking", flow({ eta: { kind: "checking" } }).phase === "checking");
t("no GPS -> eta_unavailable, can still find backup", (() => { const f = flow({ eta: { kind: "unavailable", reason: "no_gps" } }); return f.phase === "eta_unavailable" && [...ids(f), ...(f.more ?? []).map((a) => a.id)].includes("find_backup"); })());

// ---- late / on time (brief: 1:00 end, 1:10 arrival)
let f = flow({ eta: ready(40, at(12, 30)) });
t("12:30 + 40 min = 1:10 vs 1:00 -> late", f.phase === "late", f.phase);
t("late offers collect or find backup", ids(f).join() === "still_collect,find_backup", ids(f).join());
t("late card says when SafeNest asks (12:55)", /12:55/.test(JSON.stringify(f)), JSON.stringify(f.note));
f = flow({ eta: ready(20, at(12, 30)) });
t("12:50 arrival -> on time", f.phase === "on_time", f.phase);
f = flow({ escalation: OFF });
t("opt-in off says SafeNest asks nobody unless you tap", /asks nobody/i.test(JSON.stringify(f)), JSON.stringify(f.note));

// ---- deadline passed without answer
f = flow({ now: at(12, 56), eta: ready(40, at(12, 56)) });
t("after the deadline, unanswered, opt-in on -> ask_now", ["ask_now", "late"].includes(f.phase), f.phase);

// ---- parent said they will collect
f = flow({ parentChoice: "will_collect", leaveAt: null });
t("will_collect", f.phase === "will_collect", f.phase);

// ---- asking
f = flow({ circle: circle([row("a", "Siti", "pending"), row("b", "Aiman", "pending"), row("c", "Encik Ahmad", "pending")]) });
t("asking: all pending listed", f.phase === "asking" && f.recipients.length === 3 && f.recipients.every((r) => r.status === "pending"), f.phase);
t("asking: cancel offered, no ask-again", ids(f).includes("cancel_round") && !ids(f).includes("ask_again"), ids(f).join());
f = flow({ circle: circle([row("a", "Siti", "declined"), row("b", "Aiman", "declined"), row("c", "Encik Ahmad", "pending")]) });
t("some declined, one pending -> still asking", f.phase === "asking", f.phase);

// ---- accepted
f = flow({ circle: circle([row("a", "Siti", "declined"), row("c", "Encik Ahmad", "accepted"), row("d", "Kak Ima", "closed")], { collectorName: "Encik Ahmad" }) });
t("accepted -> helper_assigned with helper name", f.phase === "helper_assigned" && /Encik Ahmad/.test(f.headline + f.detail), f.headline);
t("accepted: no photo button yet (that belongs to arrival), journey steps shown", !f.primary && f.steps?.length === 5 && f.steps[1].state === "done" && f.steps[2].state === "current", JSON.stringify(f.steps));
t("accepted: demo travel action only when simulated", f.demoActions.length === 0 && flow({ simulated: true, circle: circle([row("c", "Encik Ahmad", "accepted")], { collectorName: "Encik Ahmad", simulated: true }) }).demoActions[0]?.id === "demo_depart");
t("accepted: the answers list is no longer shown", f.recipientsView === "none");
t("accepted: nobody else is offered", !ids(f).includes("find_backup") && !ids(f).includes("ask_again"), ids(f).join());
t("accepted: closed person shown as Not needed", f.recipients.some((r) => r.status === "closed"));

// ---- nobody
f = flow({ circle: circle([row("a", "Siti", "declined"), row("b", "Aiman", "no_response")]) });
t("all declined or silent -> nobody", f.phase === "nobody", f.phase);
t("nobody offers I will come myself and ask again", ids(f).includes("come_myself") && ids(f).includes("ask_again"), ids(f).join());
t("nobody mentions no backup available", /no backup|nobody/i.test(f.headline + f.status), f.headline);

// ---- journey
const j = (state, extra = {}) => ({ state, collectorName: "Encik Ahmad", collectorIsViewer: false, ...extra });
f = flow({ journey: j("started") });
t("journey started -> travelling", f.phase === "travelling", f.phase);
f = flow({ journey: j("at_school"), teacher: "notStarted" });
t("at school, photo not sent -> at_school", f.phase === "at_school", f.phase);
f = flow({ journey: j("at_school"), teacher: "awaitingTeacher" });
t("photo sent is still at_school (no teacher state in the app)", f.phase === "at_school", f.phase);
f = flow({ journey: j("at_school"), teacher: "rejected" });
t("an old rejected value cannot create a teacher-said-no phase", f.phase === "at_school", f.phase);
f = flow({ journey: j("collected", { endedAt: at(13, 5) }), teacher: "notStarted" });
t("collected as soon as the collector confirms, whatever the photo state", f.phase === "collected", f.phase);
f = flow({ journey: j("collected", { endedAt: at(13, 5) }), teacher: "awaitingTeacher" });
t("collected after a sent photo is also collected", f.phase === "collected", f.phase);

// ---- post-acceptance journey
const jd = (state, extra = {}) => ({ state, collectorName: "Encik Ahmad", collectorIsViewer: false, ...extra });
f = flow({ simulated: true, journey: jd("started", { etaMinutes: 7 }) });
t("travelling (demo): says it is simulated and shows the ETA", f.phase === "travelling" && /simulated/i.test(f.detail) && /7 minutes away/.test(f.detail), f.detail);
t("travelling: step 3 current, arrival demo action", f.steps[2].state === "current" && f.demoActions[0]?.id === "demo_arrive");
t("travelling (real): no demo actions and no fake location claim", (() => { const r = flow({ journey: jd("started") }); return r.demoActions.length === 0 && !/simulated/i.test(r.detail); })());
f = flow({ simulated: true, journey: jd("at_school") });
t("arrived (demo): at school, photo action, one picked-up demo button", f.phase === "at_school" && f.status === "At school" && f.primary?.id === "prepare_teacher" && f.demoActions.map((a) => a.id).join() === "demo_handover", JSON.stringify([f.status, f.primary, f.demoActions]));
t("arrived: teacher compares the photo and messages the parent, no teacher buttons", /compares the photo/.test(f.detail) && /messages you directly/.test(f.detail) && !f.demoActions.some((a) => /teacher/.test(a.id)));
t("arrived: steps stop at At school", f.steps[3].state === "current" && f.steps[4].state === "todo");
t("arrived (real): no demo buttons", flow({ journey: jd("at_school") }).demoActions.length === 0);
f = flow({ simulated: true, journey: jd("at_school"), teacher: "awaitingTeacher" });
t("photo sent: no second send button, fact says Sent", !f.primary && f.facts.some((x) => x.label === "Photo for the teacher" && x.value === "Sent"), JSON.stringify(f.facts));
f = flow({ journey: { state: "at_school", collectorName: "Abu", collectorIsViewer: true } });
t("collector at school: picked up button, no photo button", f.primary?.id === "confirm_handover" && /picked up/.test(f.primary.label), JSON.stringify(f.primary));
f = flow({ simulated: true, journey: jd("collected", { endedAt: at(13, 1) }) });
t("picked up: all five steps done, collector and time shown", f.phase === "collected" && f.status === "Picked up" && f.steps.every((x) => x.state === "done") && f.facts[0].value === "Encik Ahmad" && /1:01 PM/.test(f.facts[0].note ?? ""));
t("picked up: no teacher check line", !f.facts.some((x) => /teacher/i.test(x.label)));
t("parent collecting has no helper steps or collector card", (() => { const r = flow({ journey: { state: "started", collectorName: "Abu", collectorIsViewer: true } }); return r.steps === null && !r.showCollector; })());

// ---- collector resolution
const c1 = F.resolveCollector({ viewerName: "Abu", journey: null, circle: circle([row("c", "Encik Ahmad", "accepted")], { collectorName: "Encik Ahmad" }) });
t("collector comes from the accepted person", c1.name === "Encik Ahmad", JSON.stringify(c1));
const c2 = F.resolveCollector({ viewerName: "Abu", journey: null, circle: null });
t("no helper -> the parent collects", c2.name === "Abu", JSON.stringify(c2));
const c3 = F.resolveCollector({ viewerName: "Abu", journey: null, circle: circle([row("a", "Siti", "pending")]) });
t("pending request does not name a collector", c3.name === "Abu", JSON.stringify(c3));

// ---- copy rules
const all = [flow(), flow({ circle: circle([row("a", "Siti", "pending")]) }), flow({ journey: j("started") })].map((x) => JSON.stringify(x)).join();
t("no em dashes in copy", !all.includes("—"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

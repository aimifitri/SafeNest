// Automatic escalation + helper acceptance rules, ported from the original HTML prototype.
// Run from the project root: node tests/circleEngine.test.mjs  (needs esbuild)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const out = "tests/.circle.bundle.mjs";
await build({ entryPoints: ["src/components/shared/circleEngine.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const E = await import(pathToFileURL(out).href + "?" + Date.now());
fs.rmSync(out);
let pass = 0, fail = 0;
const t = (n, c, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <- " + extra}`); };

const people = [
  { id: "abu", name: "Abu", role: "Parent", kind: "family", approved: true },
  { id: "siti", name: "Siti", role: "Parent", kind: "family", approved: true },
  { id: "aiman", name: "Aiman", role: "Brother", kind: "family", approved: true },
  { id: "ahmad", name: "Encik Ahmad", role: "Uncle", kind: "circle", approved: true },
  { id: "ima", name: "Kak Ima", role: "Neighbour", kind: "circle", approved: true },
  { id: "salmah", name: "Pn. Salmah", role: "Neighbour", kind: "circle", approved: false },
];
const S_ON = { ...E.ESCALATION_DEFAULTS, enabled: true };
const S_OFF = { ...E.ESCALATION_DEFAULTS, enabled: false };
const M = (h, m) => h * 60 + m;
const ctx = (now, arrival, extra = {}) => ({ now, dismiss: M(13, 0), predictedArrival: arrival, atSchool: false, settings: S_ON, ...extra });

// ---- who is asked
const rec = E.recipients(people, "abu");
t("asks every approved family and circle member except the parent", rec.map((p) => p.id).join() === "siti,aiman,ahmad,ima");
t("pending member (Pn. Salmah) is never asked", !rec.some((p) => p.id === "salmah"));
t("the parent is never asked", !rec.some((p) => p.id === "abu"));
t("duplicates collapse to one request each", E.recipients([...people, people[1]], "abu").length === 4);
t("nearby highlight does not change who is asked", E.recipients(people.map((p) => ({ ...p, nearby: p.id === "ima" })), "abu").length === 4);

// ---- lateness + deadline
t("askAt is 5 minutes before dismissal (12:55)", E.askAt(M(13, 0), S_ON) === M(12, 55));
t("1:10 arrival for 1:00 dismissal is late", E.isPredictedLate(M(13, 10), M(13, 0)));
t("exactly on time is not late", !E.isPredictedLate(M(13, 0), M(13, 0)));
t("already at school is never late", !E.isPredictedLate(M(13, 30), M(13, 0), true));
t("unknown estimate is not 'late'", !E.isPredictedLate(null, M(13, 0)));

// ---- THE brief's example
let e = E.initialEngine;
let c = ctx(M(12, 30), M(13, 10));
t("12:30 predicted 1:10: risk shown, nothing sent yet", !E.shouldAutoEscalate(e, c) && E.tick(e, c, people, "abu") === e);
t("12:54 still nothing", E.tick(e, ctx(M(12, 54), M(13, 10)), people, "abu") === e);
c = ctx(M(12, 55), M(13, 10));
const fired = E.tick(e, c, people, "abu");
t("12:55 automatic escalation starts with no button pressed", fired.stage === "circle" && fired.reason === "auto");
t("everyone eligible is Pending at once", ["siti", "aiman", "ahmad", "ima"].every((id) => fired.replies[id] === "wait") && Object.keys(fired.replies).length === 4);
t("request time recorded", fired.askedAt === M(12, 55));
t("ticking again does not send again (same object)", E.tick(fired, ctx(M(12, 56), M(13, 11)), people, "abu") === fired);
t("re-render with same state cannot restart a round", E.fire(fired, people, "abu", "auto", M(12, 57)) === fired);
let s1 = E.reply(fired, "siti", "no");
t("Helper A declines: still asking", s1.stage === "circle" && s1.replies.siti === "no" && !E.nobodyAvailable(s1));
let s2 = E.reply(s1, "aiman", "no");
t("Helper B declines: still asking", s2.stage === "circle" && s2.replies.aiman === "no");
let s3 = E.reply(s2, "ahmad", "yes");
t("Helper C accepts: confirmed collector", s3.stage === "covered" && s3.collector === "ahmad" && s3.replies.ahmad === "yes");
t("the other outstanding request is closed", s3.replies.ima === "skip");
t("a late 'yes' from the closed helper is ignored", E.reply(s3, "ima", "yes") === s3);
t("a second accept cannot steal the assignment", E.reply(s3, "ima", "yes").collector === "ahmad");
t("asking again is refused once someone is assigned", E.fire(s3, people, "abu", "again", M(13, 0), true) === s3);
let s4 = E.sendPhoto(s3);
t("parent sends photo to teacher", s4.photoSent === true);
t("arrival is refused before anyone accepted", E.arrive(e) === e && E.depart(e) === e);
let s4b = E.depart(s4);
t("collector sets off: travelling", s4b.stage === "travelling" && s4b.collector === "ahmad");
t("departing twice changes nothing", E.depart(s4b) === s4b);
t("accepted can never jump to collected", E.handover(s3) === s3 && E.handover(s4b) === s4b);
t("a new request is refused while travelling", E.fire(s4b, people, "abu", "again", M(13, 0), true) === s4b);
let s5 = E.arrive(s4b);
t("collector arrives: at school", s5.stage === "arrived" && s5.collector === "ahmad");
t("arriving without the demo travel step also works (prototype)", E.arrive(s4).stage === "arrived");
t("there is no teacher yes or no in the engine", E.teacherOk === undefined && E.teacherNo === undefined);
t("arrived stays arrived until the collector says picked up", E.sendPhoto(s5).stage === "arrived");
let s7 = E.handover(s5);
t("the collector saying picked up completes the pickup", s7.stage === "collected" && s7.collector === "ahmad");
t("a collected pickup cannot be cancelled, re-requested or reassigned", E.cancelRound(s7) === s7 && E.fire(s7, people, "abu", "again", M(13, 5), true) === s7 && E.commit(s7) === s7 && E.handover(s7) === s7);
t("handover is refused unless the collector is at school", E.handover(e) === e && E.handover(s3) === s3 && E.handover(s4b) === s4b);
t("cancel and start over resets an arrived collector", E.cancelRound(s5).stage === "plan" && E.cancelRound(s5).collector === null);
t("the same helper can be asked again after a cancel (nobody is blocked)", E.fire(E.cancelRound(s5), people, "abu", "again", M(13, 2), true).replies.ahmad === "wait");

// ---- opt-in and alerts
t("no opt-in: SafeNest does NOT send on its own", !E.shouldAutoEscalate(e, ctx(M(12, 55), M(13, 10), { settings: S_OFF })) && E.tick(e, ctx(M(12, 55), M(13, 10), { settings: S_OFF }), people, "abu") === e);
t("no opt-in: an urgent alert is shown instead", E.urgentAlert(e, ctx(M(12, 55), M(13, 10), { settings: S_OFF })));
t("no opt-in before the deadline: no alert yet", !E.urgentAlert(e, ctx(M(12, 40), M(13, 10), { settings: S_OFF })));
t("opted in and late: alert is not used, the request is", !E.urgentAlert(e, ctx(M(12, 55), M(13, 10))));
t("on time: no request and no alert", !E.shouldAutoEscalate(e, ctx(M(12, 55), M(13, 0))) && !E.urgentAlert(e, ctx(M(12, 55), M(13, 0))));
t("unknown estimate (denied / no GPS): never auto-sends", !E.shouldAutoEscalate(e, ctx(M(12, 55), null)));
t("unknown estimate at the deadline: urgent alert", E.urgentAlert(e, ctx(M(12, 55), null)));
t("unknown estimate before the deadline: no alert", !E.urgentAlert(e, ctx(M(12, 30), null)));
t("parent already at school: nothing", !E.shouldAutoEscalate(e, ctx(M(12, 55), M(13, 10), { atSchool: true })) && !E.urgentAlert(e, ctx(M(12, 55), null, { atSchool: true })));
t("parent said they will collect: no automatic request", E.tick(E.commit(e), ctx(M(12, 56), M(13, 10)), people, "abu").stage === "committed");
t("long after school ends: no surprise request", !E.shouldAutoEscalate(e, ctx(M(13, 40), M(14, 0))));
t("deadline setting is honoured (10 minutes before = 12:50)", E.shouldAutoEscalate(e, ctx(M(12, 50), M(13, 10), { settings: { ...S_ON, minutesBefore: 10 } })));
t("school dismissal change moves the deadline", !E.shouldAutoEscalate(e, { ...ctx(M(12, 55), M(14, 10)), dismiss: M(14, 0) }) && E.shouldAutoEscalate(e, { ...ctx(M(13, 55), M(14, 10)), dismiss: M(14, 0) }));

// ---- manual
const man = E.fire(e, people, "abu", "manual", M(12, 31));
t("manual 'ask my circle' also asks everyone at once", man.stage === "circle" && man.reason === "manual" && Object.keys(man.replies).length === 4);
t("pressing it twice cannot send twice", E.fire(man, people, "abu", "manual", M(12, 32)) === man);
t("parent confirms pickup: stage committed, nothing sent", E.commit(e, M(12, 40)).stage === "committed" && Object.keys(E.commit(e).replies).length === 0);

// ---- nobody available
let n = fired;
for (const id of ["siti", "aiman", "ahmad"]) n = E.reply(n, id, "no");
t("three declines, one waiting: not everyone has answered", !E.nobodyAvailable(n));
n = E.reply(n, "ima", "none");
t("everyone declined or did not respond: nobody available", E.nobodyAvailable(n) && n.stage === "circle");
t("'ask everyone again' starts a fresh round", E.fire(n, people, "abu", "again", M(13, 2), true).replies.siti === "wait");
t("'I will come myself' commits the parent", E.commit(n, M(12, 58)).stage === "committed");
const empty = E.fire(e, [people[0]], "abu", "manual", M(12, 31));
t("nobody eligible at all counts as nobody available (no fake wait)", E.nobodyAvailable(empty) && Object.keys(empty.replies).length === 0);

// ---- no response window
t("before the window ends, requests stay pending", E.expire(fired, M(13, 4), S_ON) === fired);
const ex = E.expire(fired, M(13, 5), S_ON);
t("after the window, unanswered become No response", ["siti", "aiman", "ahmad", "ima"].every((id) => ex.replies[id] === "none") && E.nobodyAvailable(ex));
t("expiry never touches an accepted assignment", E.expire(s3, M(14, 0), S_ON) === s3);

// ---- demo script
const sc = E.replyScript(["siti", "aiman", "ahmad", "ima"], false);
t("demo script: A declines, B declines, C accepts, D never asked", sc.map((x) => x[0] + ":" + x[1]).join() === "siti:no,aiman:no,ahmad:yes");
t("demo script 'nobody can': everyone declines, last gives no response", E.replyScript(["a", "b", "c"], true).map((x) => x[1]).join() === "no,no,none");
t("demo script with two people: first declines, second accepts", E.replyScript(["a", "b"], false).map((x) => x[1]).join() === "no,yes");
t("demo script times increase", sc.every((x, i) => i === 0 || x[2] > sc[i - 1][2]));

// ---- invariants over many random action sequences
let seed = 7; const rnd = (k) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
let bad = "";
for (let run = 0; run < 3000 && !bad; run++) {
  let st = E.initialEngine, now = M(12, 30);
  for (let step = 0; step < 14 && !bad; step++) {
    const ids = ["siti", "aiman", "ahmad", "ima", "salmah", "abu"];
    const before = st;
    switch (rnd(12)) {
      case 0: now += rnd(12); st = E.tick(st, ctx(now, M(13, 10), { settings: rnd(2) ? S_ON : S_OFF }), people, "abu"); break;
      case 1: st = E.fire(st, people, "abu", "manual", now); break;
      case 2: st = E.reply(st, ids[rnd(6)], ["yes", "no", "none"][rnd(3)]); break;
      case 3: st = E.expire(st, now + rnd(30), S_ON); break;
      case 4: st = E.fire(st, people, "abu", "again", now, true); break;
      case 5: st = E.arrive(st); break;
      case 6: st = E.sendPhoto(st); break;
      case 7: st = E.arrive(st); break;
      case 8: st = E.commit(st); break;
      case 9: st = E.depart(st); break;
      case 10: st = E.handover(st); break;
      case 11: st = E.cancelRound(st); break;
    }
    if (st.stage === "collected" && before.stage !== "collected" && before.stage !== "arrived" && before.stage !== "plan" && before.stage !== "committed") bad = "collected without arriving " + before.stage;
    if (st.stage === "collected" && before.stage === "plan") bad = "collected from nothing";
    if (["travelling", "arrived"].includes(st.stage) && !st.collector) bad = "journey without collector";
    if (["travelling", "arrived"].includes(st.stage) && st.stage !== before.stage && !["covered", "travelling", "arrived"].includes(before.stage)) bad = "skipped a step " + before.stage + ">" + st.stage;
    const ys = Object.values(st.replies).filter((r) => r === "yes").length;
    if (ys > 1) bad = "two accepts " + JSON.stringify(st);
    if (st.stage === "covered" && !(ys === 1 && st.replies[st.collector] === "yes")) bad = "covered without one yes " + JSON.stringify(st);
    if (["covered", "travelling", "arrived"].includes(st.stage) && Object.values(st.replies).includes("wait")) bad = "pending after assignment " + JSON.stringify(st);
    if (st.replies.abu !== undefined || st.replies.salmah !== undefined) bad = "asked someone not eligible " + JSON.stringify(st);
    if (st.stage === "collected" && st.collector === null) bad = "collected without collector";
  }
}
t("invariants hold over 3000 random sequences (one accept, nobody pending after assignment, never ask parent/pending)", bad === "", bad);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

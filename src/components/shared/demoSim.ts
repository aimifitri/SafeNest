import { useSyncExternalStore } from "react";

import * as E from "./circleEngine";
import type { CirclePerson, Engine, EscalationSettings } from "./circleEngine";
import { atMinutes } from "./pickupFlow";
import type { ActionId, Eta, FlowCircle, FlowJourney, FlowRecipient, RecipientStatus } from "./pickupFlow";
import { setTeacherCheck } from "./teacherCheck";

// The labelled demo, ported from the approved HTML prototype: a demo clock, an editable dismissal time,
// a parent location with a travel delay, and made-up replies from family and helpers. It is the only place
// that fakes anything. Nothing here contacts a person, reads a real location or touches Supabase.
//
// The decisions themselves live in circleEngine.ts (pure). This file only holds the demo's state, runs the
// scripted replies on timers, and turns the state into the inputs derivePickupFlow() understands.

export type Place = "office" | "road" | "school";
export type LocationMode = "granted" | "denied" | "no_gps" | "offline";
/** Travel time from each place, like the HTML (office 35 minutes, on the road 15). */
export const PLACE_MINUTES: Record<Place, number> = { office: 35, road: 15, school: 0 };
/** Demo only: how long the accepted collector needs to reach the school, and how the marker moves. */
export const COLLECTOR_TRAVEL_MIN = 12;
const TRAVEL_STEPS = 10;
const TRAVEL_STEP_MS = 650;

export type SimState = {
  /** Show the demo on Today. Always on when no child is stored in Supabase. */
  forced: boolean;
  /** Demo clock, minutes after midnight. */
  now: number;
  /** Demo dismissal time. Null = use the Pickup Plan time. */
  dismissOverride: number | null;
  place: Place;
  /** Extra minutes of travel (traffic) on top of the place's travel time. */
  delay: number;
  location: LocationMode;
  /** Demo: everyone says no. */
  nobody: boolean;
  /** Demo: scripted replies arrive by themselves. Off = answer each person with the buttons. */
  autoReplies: boolean;
  /** The parent's opt-in to automatic backup (demo copy of the real setting). */
  escalation: EscalationSettings;
  engine: Engine;
  /** Demo only: how far the accepted collector has travelled, 0 to 1. A made-up number, never a location. */
  travel: number;
  /** The parent's own journey (start, arrived, collected). Only used while nobody else is collecting. */
  parentJourney: "started" | "at_school" | "collected" | null;
  /** One short message after something happens, for example the teacher said no. */
  notice: string | null;
};

export const SIM_START: SimState = {
  forced: false,
  now: 12 * 60 + 5,
  dismissOverride: null,
  place: "office",
  delay: 0,
  location: "granted",
  nobody: false,
  autoReplies: true,
  escalation: { ...E.ESCALATION_DEFAULTS, enabled: true },
  engine: E.initialEngine,
  travel: 0,
  parentJourney: null,
  notice: null,
};

/** What the demo needs from the rest of the app each time. */
export type SimEnv = {
  people: readonly CirclePerson[];
  viewerId: string;
  viewerName: string;
  /** Pickup Plan time for today, minutes after midnight. */
  planDismiss: number;
  teacherName: string;
};

let state: SimState = SIM_START;
let timers: ReturnType<typeof setTimeout>[] = [];
let travelTimer: ReturnType<typeof setTimeout> | null = null;
const stopTravel = () => { if (travelTimer) clearTimeout(travelTimer); travelTimer = null; };
let lastEnv: SimEnv | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<SimState>) => { state = { ...state, ...next }; emit(); };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

export const dismissMinutes = (s: SimState, env: Pick<SimEnv, "planDismiss">): number => s.dismissOverride ?? env.planDismiss;
export const travelMinutes = (s: SimState): number => PLACE_MINUTES[s.place] + s.delay;
export const predictedArrival = (s: SimState): number | null => (s.location === "granted" ? s.now + travelMinutes(s) : null);

/** The demo parent's estimate, like the real thing: ready, or one of the failure kinds. */
export function simEta(s: SimState, nowMs: number): Eta {
  if (s.location === "denied") return { kind: "permission_needed", blocked: true };
  if (s.location === "no_gps") return { kind: "unavailable", reason: "no_gps" };
  if (s.location === "offline") return { kind: "unavailable", reason: "network" };
  return { kind: "ready", minutes: travelMinutes(s), source: "demo", checkedAt: nowMs };
}

export function engineContext(s: SimState, env: SimEnv): E.Context {
  return { now: s.now, dismiss: dismissMinutes(s, env), predictedArrival: predictedArrival(s), atSchool: s.place === "school", settings: s.escalation, graceMinutes: 0 };
}

const statusOf = (r: E.Reply | undefined): RecipientStatus => (r === "yes" ? "accepted" : r === "no" ? "declined" : r === "none" ? "no_response" : r === "skip" ? "closed" : "pending");

/** Turns the demo state into the inputs for derivePickupFlow(). Pure, so it can be tested. */
export function simInputs(s: SimState, env: SimEnv): {
  nowMs: number;
  eta: Eta;
  parentChoice: "none" | "will_collect";
  leaveAt: number | null;
  circle: FlowCircle | null;
  journey: FlowJourney | null;
  collectorName: string | null;
  eligibleCount: number;
} {
  const nowMs = atMinutes(Date.now(), s.now);
  const e = s.engine;
  const eligible = E.recipients(env.people, env.viewerId);
  const byId = new Map(env.people.map((p) => [p.id, p]));
  const rows: FlowRecipient[] = eligible
    .filter((p) => e.replies[p.id] !== undefined)
    .map((p) => ({ id: p.id, name: p.name, role: p.role, kind: p.kind, nearby: p.nearby, status: statusOf(e.replies[p.id]) }));
  const collectorName = e.collector ? (e.collector === env.viewerId ? env.viewerName : byId.get(e.collector)?.name ?? "A helper") : null;
  const inRound = e.stage !== "plan" && e.stage !== "committed";
  const circle: FlowCircle | null = inRound ? { recipients: rows, reason: e.reason, collectorName, simulated: true } : null;

  let journey: FlowJourney | null = null;
  if (e.stage === "travelling") journey = { state: "started", collectorName: collectorName ?? "A helper", collectorIsViewer: false, etaMinutes: Math.max(0, Math.ceil((1 - s.travel) * COLLECTOR_TRAVEL_MIN)) };
  else if (e.stage === "arrived" || e.stage === "approved" || e.stage === "rejected") journey = { state: "at_school", collectorName: collectorName ?? "A helper", collectorIsViewer: false };
  else if (e.stage === "collected") journey = { state: "collected", collectorName: collectorName ?? "A helper", collectorIsViewer: e.collector === env.viewerId, endedAt: nowMs };
  else if (s.parentJourney) journey = { state: s.parentJourney, collectorName: env.viewerName, collectorIsViewer: true, endedAt: s.parentJourney === "collected" ? nowMs : null };

  return {
    nowMs,
    eta: simEta(s, nowMs),
    parentChoice: e.stage === "committed" ? "will_collect" : "none",
    leaveAt: e.stage === "committed" ? e.leaveAt : null,
    circle,
    journey,
    collectorName,
    eligibleCount: eligible.length,
  };
}

// ---------- scripted replies ----------

function scheduleScript(env: SimEnv) {
  clearTimers();
  if (!state.autoReplies) return;
  const ids = Object.keys(state.engine.replies);
  for (const [id, ans, ms] of E.replyScript(ids, state.nobody)) {
    timers.push(setTimeout(() => answer(id, ans, env), ms));
  }
}

function afterEngine(prev: Engine, env: SimEnv) {
  const next = state.engine;
  if (next === prev) return;
  const startedRound = prev.stage !== "circle" && next.stage === "circle" || (next.stage === "circle" && prev.askedAt !== next.askedAt);
  if (startedRound) scheduleScript(env);
  if (next.stage !== "circle") clearTimers();
}

/** Demo only: one person answers. The first "yes" wins and the rest are closed. */
export function answer(id: string, ans: "yes" | "no" | "none", env: SimEnv = lastEnv as SimEnv): void {
  const prev = state.engine;
  const next = E.reply(prev, id, ans);
  if (next === prev) return;
  set({ engine: next });
  if (next.stage === "covered") {
    clearTimers();
    // A new collector starts a new teacher check.
    const name = env?.people.find((p) => p.id === next.collector)?.name;
    if (name) setTeacherCheck(name, "notStarted");
  }
}

// ---------- the controls ----------

export const sim = {
  get: () => state,
  setForced: (forced: boolean) => set({ forced }),
  setNow: (now: number, env: SimEnv) => { set({ now: Math.max(0, Math.min(23 * 60 + 59, now)) }); sim.tick(env); },
  advance: (minutes: number, env: SimEnv) => sim.setNow(state.now + minutes, env),
  setDismiss: (m: number | null, env: SimEnv) => { set({ dismissOverride: m }); sim.tick(env); },
  setPlace: (place: Place, env: SimEnv) => { set({ place, parentJourney: place === "road" ? state.parentJourney ?? "started" : place === "school" ? "at_school" : null }); sim.tick(env); },
  setDelay: (delay: number, env: SimEnv) => { set({ delay: Math.max(0, delay) }); sim.tick(env); },
  setLocation: (location: LocationMode, env: SimEnv) => { set({ location }); sim.tick(env); },
  setNobody: (nobody: boolean) => set({ nobody }),
  setAutoReplies: (autoReplies: boolean) => { set({ autoReplies }); if (!autoReplies) clearTimers(); },
  setEscalation: (escalation: Partial<EscalationSettings>, env: SimEnv) => { set({ escalation: { ...state.escalation, ...escalation } }); sim.tick(env); },
  dismissNotice: () => set({ notice: null }),

  /** The original tick(): called after anything changes. Starts the automatic request at most once. */
  tick(env: SimEnv) {
    lastEnv = env;
    const ctx = engineContext(state, env);
    let engine = E.expire(state.engine, state.now, state.escalation);
    engine = E.tick(engine, ctx, env.people, env.viewerId);
    if (engine !== state.engine) {
      const prev = state.engine;
      set({ engine });
      afterEngine(prev, env);
    }
  },

  /** Runs a button the parent tapped on Today. Returns true when it did something. */
  act(action: ActionId, env: SimEnv, arg?: { leaveAt?: number }): boolean {
    lastEnv = env;
    const prev = state.engine;
    switch (action) {
      case "still_collect": set({ engine: E.commit(prev) }); return true;
      case "find_backup": {
        const next = E.fire(prev, env.people, env.viewerId, "manual", state.now);
        if (next === prev) return false;
        set({ engine: next }); afterEngine(prev, env); return true;
      }
      case "ask_again": {
        const next = E.fire(prev, env.people, env.viewerId, "again", state.now, true);
        if (next === prev) return false;
        resetTeacher(prev, env); stopTravel();
        set({ engine: next, travel: 0 }); afterEngine(prev, env); return true;
      }
      case "come_myself": {
        const next = E.commit(prev, arg?.leaveAt ?? state.now);
        if (next === prev) return false;
        resetTeacher(prev, env); stopTravel(); clearTimers();
        set({ engine: next, travel: 0 });
        return true;
      }
      case "cancel_round": {
        const next = E.cancelRound(prev);
        if (next === prev) return false; // nothing to cancel, or already collected: change nothing
        resetTeacher(prev, env);
        stopTravel(); clearTimers();
        set({ engine: next, travel: 0 });
        return true;
      }
      case "demo_depart": return sim.depart(env);
      case "demo_arrive": return sim.helperArrives(env);
      case "demo_teacher_ok": return sim.teacherSays(true, env);
      case "demo_teacher_no": return sim.teacherSays(false, env);
      case "demo_handover": return sim.handover(env);
      case "start_journey": set({ parentJourney: "started", place: "road", engine: prev.stage === "committed" ? { ...prev, stage: "plan", reason: "", leaveAt: null } : prev }); return true;
      case "arrived_school": set({ parentJourney: "at_school", place: "school" }); return true;
      case "confirm_handover": set({ parentJourney: "collected", engine: E.parentCollects(prev, env.viewerId) }); return true;
      case "cancel_journey": set({ parentJourney: null, place: "office" }); return true;
      default: return false; // location actions and sheet actions are handled by the screen
    }
  },

  /** Demo button: the accepted collector sets off. The marker then moves along the map until they arrive. */
  depart(env: SimEnv): boolean {
    const prev = state.engine;
    const next = E.depart(prev);
    if (next === prev) return false;
    set({ engine: next, travel: 0 });
    const step = () => {
      if (state.engine.stage !== "travelling") { stopTravel(); return; }
      const travel = Math.min(1, state.travel + 1 / TRAVEL_STEPS);
      set({ travel });
      travelTimer = travel < 1 ? setTimeout(step, TRAVEL_STEP_MS) : null;
    };
    stopTravel();
    travelTimer = setTimeout(step, TRAVEL_STEP_MS);
    sim.tick(env);
    return true;
  },
  /** Demo button: the collector reaches the school (not before school ends, so the clock catches up). */
  helperArrives(env?: SimEnv): boolean {
    const prev = state.engine;
    const next = E.arrive(prev);
    if (next === prev) return false;
    stopTravel();
    const end = env ? dismissMinutes(state, env) : state.now;
    set({ engine: next, travel: 1, now: Math.max(state.now, end) });
    if (env) sim.tick(env);
    return true;
  },
  /** The parent sent the photo message. */
  photoSent(collectorName: string) {
    setTeacherCheck(collectorName, "awaitingTeacher");
    set({ engine: E.sendPhoto(state.engine) });
  },
  /** Demo button: the teacher answers. OK approves the collector only. No means nothing is collected. */
  teacherSays(ok: boolean, env: SimEnv): boolean {
    const prev = state.engine;
    const collector = prev.collector ? env.people.find((p) => p.id === prev.collector)?.name : null;
    const next = ok ? E.teacherOk(prev) : E.teacherNo(prev);
    if (next === prev) return false;
    if (collector) setTeacherCheck(collector, ok ? "approved" : "rejected");
    set({ engine: next });
    return true;
  },
  /** Demo button: the child is handed over after the teacher approved. This completes the pickup. */
  handover(env: SimEnv): boolean {
    const prev = state.engine;
    const next = E.handover(prev);
    if (next === prev) return false;
    stopTravel();
    set({ engine: next, travel: 1 });
    sim.tick(env);
    return true;
  },

  reset(env: SimEnv) {
    clearTimers(); stopTravel();
    lastEnv = env;
    for (const p of env.people) setTeacherCheck(p.name, "notStarted");
    state = { ...SIM_START, forced: state.forced, escalation: { ...state.escalation }, autoReplies: state.autoReplies };
    emit();
    sim.tick(env);
  },

  /** Quick setups for the cases in the brief. Each starts from a clean demo. */
  preset(name: "ontime" | "late" | "nobody" | "no_gps" | "denied" | "auto_off", env: SimEnv) {
    sim.reset(env);
    const dismiss = dismissMinutes(state, env);
    // Every setup starts with automatic backup ON (the opt-in), except the one that tests it being off.
    const on = { ...state.escalation, enabled: true };
    const base: Partial<SimState> = { now: dismiss - 30, place: "office", delay: 0, location: "granted", nobody: false, escalation: on };
    if (name === "ontime") set({ ...base, now: dismiss - 55 });
    else if (name === "late") set({ ...base, delay: 5 }); // 12:30 now, 1:00 ends, arrives 1:10
    else if (name === "nobody") set({ ...base, delay: 5, nobody: true });
    else if (name === "no_gps") set({ ...base, location: "no_gps" });
    else if (name === "denied") set({ ...base, location: "denied" });
    else set({ ...base, delay: 5, escalation: { ...state.escalation, enabled: false } });
    sim.tick(env);
  },
};

/** A new attempt starts a fresh teacher check for whoever was the collector. */
function resetTeacher(e: Engine, env: SimEnv) {
  const name = e.collector ? env.people.find((p) => p.id === e.collector)?.name : null;
  if (name) setTeacherCheck(name, "notStarted");
}

export function useSim(): SimState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );
}

/** Test helper: put the demo in a known state without timers. */
export function __resetSimForTests(next: Partial<SimState> = {}): void {
  clearTimers(); stopTravel();
  state = { ...SIM_START, ...next };
}

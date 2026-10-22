// The original SafeNest pickup rules, ported from the approved HTML prototype as pure functions.
// No React, no network, no timers. Times are minutes after midnight so the demo clock and the real
// clock use the same code.
//
//   HTML              here
//   isLate()          isPredictedLate()
//   askAt()           askAt()
//   tick()            tick()  (-> shouldAutoEscalate)
//   recipients()      recipients()
//   fireCircle()      fire()
//   reply()           reply()
//   allNo()           allAnswered() / nobodyAvailable()
//
// Real mode uses the same decision helpers (askAt, shouldAutoEscalate, urgentAlert, recipients) but
// the state itself lives in Supabase. Only the demo keeps an Engine in memory.

export type Reply = "wait" | "yes" | "no" | "none" | "skip";
// wait = Pending, yes = Accepted, no = Declined, none = No response, skip = closed because someone else accepted.

export type CirclePerson = {
  id: string;
  name: string;
  role: string;
  kind: "family" | "circle";
  /** Pending and rejected people are never asked. */
  approved: boolean;
  /** Visual highlight only. It never changes who is asked. */
  nearby?: boolean;
};

export type EscalationSettings = {
  /** The parent's informed opt-in to automatic requests. Without it SafeNest only shows an urgent alert. */
  enabled: boolean;
  /** Ask this many minutes before school ends if the parent has not answered. */
  minutesBefore: number;
  /** After this many minutes a request nobody answered counts as "No response". */
  responseWindowMinutes: number;
};

export const ESCALATION_DEFAULTS: EscalationSettings = { enabled: false, minutesBefore: 5, responseWindowMinutes: 10 };
/** Never start an automatic request later than this many minutes after school ends. */
export const ESCALATION_CUTOFF_AFTER = 30;

/**
 * plan -> circle (asking) -> covered (accepted) -> travelling -> arrived (teacher checks) -> approved (teacher OK)
 * -> collected (handover confirmed). "rejected" = the teacher said no: the child is NOT collected.
 * There is no way from covered/travelling straight to collected.
 */
export type Stage = "plan" | "committed" | "circle" | "covered" | "travelling" | "arrived" | "approved" | "rejected" | "collected";
export type Reason = "" | "auto" | "manual" | "no" | "again";

export type Engine = {
  stage: Stage;
  reason: Reason;
  replies: Readonly<Record<string, Reply>>;
  collector: string | null;
  /** Minutes after midnight when the current request round started. */
  askedAt: number | null;
  photoSent: boolean;
  /** "I will come myself": when the parent says they will leave. */
  leaveAt: number | null;
  /** People the teacher did not approve today. They are not asked again. */
  rejected: readonly string[];
};

export const initialEngine: Engine = { stage: "plan", reason: "", replies: {}, collector: null, askedAt: null, photoSent: false, leaveAt: null, rejected: [] };

/** Stages where somebody is already assigned and the pickup is under way (no new request may start). */
const ASSIGNED: readonly Stage[] = ["covered", "travelling", "arrived", "approved", "collected"];

// ---------- derived values ----------

/** Everyone who may be asked: approved family and circle members, except the parent who is asking. Each person once. */
export function recipients(people: readonly CirclePerson[], viewerId: string): CirclePerson[] {
  const seen = new Set<string>();
  return people.filter((p) => {
    if (!p.approved || p.id === viewerId || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export const askAt = (dismiss: number, settings: Pick<EscalationSettings, "minutesBefore">): number => dismiss - settings.minutesBefore;

/** The parent would arrive after school ends. Not late once they are at school. */
export function isPredictedLate(predictedArrival: number | null, dismiss: number, atSchool = false, graceMinutes = 0): boolean {
  return !atSchool && predictedArrival !== null && predictedArrival > dismiss + graceMinutes;
}

export type Context = {
  now: number;
  dismiss: number;
  /** Minutes after midnight, or null when SafeNest cannot estimate (no permission, no GPS, offline). */
  predictedArrival: number | null;
  atSchool: boolean;
  settings: EscalationSettings;
  /** Minutes after dismissal that still count as on time. Default 0. */
  graceMinutes?: number;
};

const inWindow = (c: Context) => c.now >= askAt(c.dismiss, c.settings) && c.now <= c.dismiss + ESCALATION_CUTOFF_AFTER;

/** All conditions for an AUTOMATIC request (original tick()). Needs the opt-in, a known late estimate and the deadline. */
export function shouldAutoEscalate(e: Pick<Engine, "stage">, c: Context): boolean {
  return e.stage === "plan" && c.settings.enabled && isPredictedLate(c.predictedArrival, c.dismiss, c.atSchool, c.graceMinutes) && inWindow(c);
}

/**
 * The deadline has passed, the parent has not answered, and SafeNest may NOT (or cannot) ask on its own:
 * no opt-in, or it cannot tell whether the parent will be late. Show an urgent alert instead of sending.
 */
export function urgentAlert(e: Pick<Engine, "stage">, c: Context): boolean {
  if (e.stage !== "plan" || c.atSchool || !inWindow(c)) return false;
  if (c.predictedArrival === null) return true;
  return isPredictedLate(c.predictedArrival, c.dismiss, false, c.graceMinutes) && !c.settings.enabled;
}

// ---------- transitions (each returns the SAME object when nothing changes) ----------

/** Original fireCircle(): everyone eligible becomes Pending together. Does nothing if a round is already running or done. */
export function fire(e: Engine, people: readonly CirclePerson[], viewerId: string, reason: Reason, now: number, force = false): Engine {
  if (!force && e.stage !== "plan") return e;
  if (force && ASSIGNED.includes(e.stage)) return e;
  const replies: Record<string, Reply> = {};
  for (const p of recipients(people, viewerId)) if (!e.rejected.includes(p.id)) replies[p.id] = "wait";
  return { ...e, stage: "circle", reason, replies, collector: null, askedAt: now, photoSent: false };
}

/** The original tick(). Starts the automatic request at most once. */
export function tick(e: Engine, c: Context, people: readonly CirclePerson[], viewerId: string): Engine {
  return shouldAutoEscalate(e, c) ? fire(e, people, viewerId, "auto", c.now) : e;
}

/** Original reply(). The first "yes" wins; everyone still waiting is closed. Answers after that are ignored. */
export function reply(e: Engine, id: string, ans: "yes" | "no" | "none"): Engine {
  if (e.stage !== "circle" || e.replies[id] !== "wait") return e;
  const replies: Record<string, Reply> = { ...e.replies, [id]: ans };
  if (ans === "yes") {
    for (const k of Object.keys(replies)) if (replies[k] === "wait") replies[k] = "skip";
    return { ...e, stage: "covered", collector: id, replies, photoSent: false };
  }
  return { ...e, replies };
}

/** Requests nobody answered within the window become "No response". */
export function expire(e: Engine, now: number, settings: Pick<EscalationSettings, "responseWindowMinutes">): Engine {
  if (e.stage !== "circle" || e.askedAt === null || now < e.askedAt + settings.responseWindowMinutes) return e;
  if (!Object.values(e.replies).includes("wait")) return e;
  const replies: Record<string, Reply> = {};
  for (const [k, v] of Object.entries(e.replies)) replies[k] = v === "wait" ? "none" : v;
  return { ...e, replies };
}

/** Everybody has answered and nobody said yes (original allNo()). Also true when there was nobody to ask. */
export function nobodyAvailable(e: Engine): boolean {
  return e.stage === "circle" && Object.values(e.replies).every((r) => r !== "wait");
}

export const commit = (e: Engine, leaveAt: number | null = null): Engine => (ASSIGNED.includes(e.stage) ? e : { ...e, stage: "committed", leaveAt, collector: null, photoSent: false });
/** The accepted collector sets off. Only after acceptance. */
export const depart = (e: Engine): Engine => (e.stage === "covered" ? { ...e, stage: "travelling" } : e);
/** The collector reaches the school: the teacher checks them. Only after acceptance. */
export const arrive = (e: Engine): Engine => (e.stage === "covered" || e.stage === "travelling" ? { ...e, stage: "arrived" } : e);
export const sendPhoto = (e: Engine): Engine => ({ ...e, photoSent: true });
/** Teacher says OK. This is identity approval only: the child is not collected until the handover is confirmed. */
export const teacherOk = (e: Engine): Engine => (e.stage === "arrived" ? { ...e, stage: "approved" } : e);
/** The child is handed over after the teacher approved. This completes the pickup. */
export const handover = (e: Engine): Engine => (e.stage === "approved" ? { ...e, stage: "collected" } : e);
/** Teacher says no: nothing is collected. The collector is remembered as rejected and the parent decides what happens next. */
export const teacherNo = (e: Engine): Engine => (e.stage === "arrived" && e.collector ? { ...e, stage: "rejected", photoSent: false, rejected: [...e.rejected, e.collector] } : e);
export const parentCollects = (e: Engine, viewerId: string): Engine => (e.stage === "collected" ? e : { ...e, stage: "collected", collector: viewerId });
export const cancelRound = (e: Engine): Engine => (e.stage === "collected" || e.stage === "plan" || e.stage === "committed" ? e : { ...initialEngine });

// ---------- demo helpers ----------

/**
 * Who answers, and when (ms after the request). Mirrors the HTML script: the first two decline and the
 * third accepts. With "nobody" everyone declines and the last one never answers.
 */
export function replyScript(ids: readonly string[], nobody: boolean): Array<[string, "yes" | "no" | "none", number]> {
  if (ids.length === 0) return [];
  const gaps = [1900, 3400, 5600, 6800, 8000];
  const at = (i: number) => gaps[Math.min(i, gaps.length - 1)];
  if (nobody) return ids.map((id, i): [string, "yes" | "no" | "none", number] => [id, i === ids.length - 1 && ids.length > 1 ? "none" : "no", at(i)]);
  const yesIndex = Math.min(2, ids.length - 1);
  return ids.slice(0, yesIndex + 1).map((id, i): [string, "yes" | "no" | "none", number] => [id, i === yesIndex ? "yes" : "no", at(i)]);
}

/** Minutes helpers for the demo clock and the leave sheet. */
export const clock = (m: number): string => {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export function parseClockMinutes(label: string): number | null {
  const m = /^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM)$/.exec(label.trim());
  return m ? (Number(m[1]) % 12 + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]) : null;
}

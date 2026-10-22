// The single place that decides what Today (and Plan) say about pickup.
//
// Everything shown (headline, status, facts, buttons, the list of who was asked) comes from ONE phase
// returned by derivePickupFlow(). Screens never combine mock status, requests and journeys themselves.
// No React, no network, so every phase can be tested on its own.
//
// Rules, in order (the first that applies wins). They follow the approved HTML prototype:
//   1. A pickup journey exists            -> travelling / at school / teacher check / collected
//   2. A request round exists             -> someone accepted (assigned) / asking everyone / nobody can
//   3. The parent said they will collect  -> will collect
//   4. Otherwise location + travel time   -> needs location / checking / unavailable / on time / late / ask now
//
// "Late" = predicted arrival is more than PICKUP_CONFIG.lateGraceMinutes after school ends.
// Nobody is "assigned" until somebody accepted. "Ask another helper" is never offered after that.

import { askAt, clock, isPredictedLate, urgentAlert } from "./circleEngine";
import type { EscalationSettings } from "./circleEngine";
import type { VerificationState } from "./types";

export const PICKUP_CONFIG = {
  /** Minutes after dismissal that still count as on time. 0 = any predicted lateness is flagged. */
  lateGraceMinutes: 0,
  /** Refresh the travel-time estimate when it is older than this. */
  etaMaxAgeMinutes: 5,
} as const;

export type Eta =
  | { kind: "permission_needed"; blocked: boolean }
  | { kind: "checking" }
  | { kind: "unavailable"; reason: "no_school_location" | "no_gps" | "network" }
  | {
      kind: "ready";
      /** Travel time in minutes. */
      minutes: number;
      /** "route" = from the routing service. "demo" = a made-up number for the demo clock. */
      source: "route" | "demo";
      /** When the position was read (real) or the demo clock time (demo), as epoch ms. */
      checkedAt: number;
    };

export type FlowJourney = {
  state: "started" | "at_school" | "collected";
  collectorName: string;
  collectorIsViewer: boolean;
  endedAt?: number | null;
  /** Demo only: made-up minutes until the collector reaches school. Never set from a real location. */
  etaMinutes?: number | null;
};

export type RecipientStatus = "pending" | "accepted" | "declined" | "no_response" | "closed";
export type FlowRecipient = {
  id: string;
  name: string;
  role: string;
  kind: "family" | "circle";
  /** Highlight only. Never changes who is asked. */
  nearby?: boolean;
  status: RecipientStatus;
};

/** One round of requests. Everyone eligible is asked together. */
export type FlowCircle = {
  recipients: FlowRecipient[];
  reason: "auto" | "manual" | "no" | "again" | "";
  /** The person who accepted, if any. */
  collectorName: string | null;
  /** true = local demo state. Nobody was contacted. */
  simulated: boolean;
  /** The database could only ask ONE person (group requests are not enabled there yet). */
  singleOnly?: boolean;
};

export type FlowInput = {
  /** Epoch ms. The demo uses its own clock. */
  now: number;
  childName: string;
  teacherName: string;
  /** "1:00 PM" */
  dismissal: string;
  /** Set when today's time was changed from the regular one. */
  usualDismissal?: string;
  viewerName: string;
  eta: Eta;
  parentChoice: "none" | "will_collect";
  /** "I will come myself": minutes after midnight the parent says they will leave. */
  leaveAt: number | null;
  circle: FlowCircle | null;
  journey: FlowJourney | null;
  teacher: VerificationState;
  escalation: EscalationSettings;
  /** How many people could be asked right now (approved, joined, not the parent). */
  eligibleCount: number;
  /** The whole picture is a labelled demo. */
  simulated: boolean;
};

export type PickupPhase =
  | "needs_location"
  | "checking"
  | "eta_unavailable"
  | "on_time"
  | "late"
  | "ask_now"
  | "will_collect"
  | "asking"
  | "nobody"
  | "helper_assigned"
  | "travelling"
  | "at_school"
  | "teacher_pending"
  | "handover_pending"
  | "teacher_rejected"
  | "collected";

export type ActionId =
  | "enable_location"
  | "open_settings"
  | "retry_eta"
  | "start_journey"
  | "still_collect"
  | "find_backup"
  | "cancel_round"
  | "ask_again"
  | "come_myself"
  | "message_teacher"
  | "prepare_teacher"
  | "arrived_school"
  | "confirm_handover"
  | "cancel_journey"
  // Demo only. They exist only while the whole pickup is simulated, and never write to Supabase.
  | "demo_depart"
  | "demo_arrive"
  | "demo_teacher_ok"
  | "demo_teacher_no"
  | "demo_handover";

/** Actions that only open a sheet in the app. They never change anything by themselves. */
export const SHEET_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>(["come_myself", "message_teacher", "prepare_teacher"]);

export type FlowAction = { id: ActionId; label: string };
/** One step of the pickup progress bar. */
export type FlowStep = { label: string; state: "done" | "current" | "todo" | "failed" };
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
export type Fact = { label: string; value: string; note?: string };

export type PickupFlow = {
  phase: PickupPhase;
  tone: Tone;
  /** Short pill text. */
  status: string;
  headline: string;
  detail: string;
  facts: Fact[];
  primary: FlowAction | null;
  secondary: FlowAction | null;
  /** Smaller actions kept behind "More options". */
  more: FlowAction[];
  /** Demo-only buttons for this exact step (collector sets off, arrives, teacher says OK or no, handover). Empty outside the demo. */
  demoActions: FlowAction[];
  /** Progress of a backup collector's pickup. Null when the parent collects or no helper is involved. */
  steps: FlowStep[] | null;
  /** Show the collector identity card (name, relationship, approved photo) for this phase. */
  showCollector: boolean;
  /** One plain line under the buttons (for example what happens at the deadline). */
  note: string | null;
  /** Everyone asked, with their answer. Empty when no round exists. */
  recipients: FlowRecipient[];
  /** Whether the list is open, tucked away, or not shown. */
  recipientsView: "open" | "tucked" | "none";
  /** Why SafeNest decided this (shown on request). */
  rule: string | null;
  /** Where the arrival estimate came from, if there is one. */
  estimate: "route" | "demo" | null;
  /** True for the urgent alert (deadline passed, nothing was sent). */
  urgent: boolean;
  simulated: boolean;
};

// ---------- time helpers ----------

/** "1:00 PM" -> minutes after midnight, or null if it does not parse. */
export function parseClock(label: string): number | null {
  const m = /^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM)$/.exec(label.trim());
  if (!m) return null;
  const hour = Number(m[1]) % 12 + (m[3] === "PM" ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

/** Minutes after midnight (local) for an epoch time. */
export function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Today's date at the given minutes after midnight, as epoch ms (local time). */
export function atMinutes(now: number, minutes: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + minutes * 60_000;
}

/** Today's date at the given clock label, as epoch ms (local time). */
export function dismissalMs(now: number, label: string): number | null {
  const mins = parseClock(label);
  return mins === null ? null : atMinutes(now, mins);
}

export function formatClock(ms: number): string {
  return clock(minutesOfDay(ms));
}

export const minutesText = (n: number): string => `${n} minute${n === 1 ? "" : "s"}`;

/** Predicted arrival as minutes after midnight, or null when it cannot be known. */
export function predictedArrivalMinutes(eta: Eta): number | null {
  if (eta.kind !== "ready") return null;
  return minutesOfDay(eta.checkedAt + eta.minutes * 60_000);
}

/** Minutes the predicted arrival is after school ends (negative = early). Null if it cannot be known. */
export function latenessMinutes(input: Pick<FlowInput, "dismissal" | "eta">): number | null {
  const arrival = predictedArrivalMinutes(input.eta);
  const end = parseClock(input.dismissal);
  return arrival === null || end === null ? null : arrival - end;
}

/** Estimated arrival as a clock time, or null. */
export function arrivalClock(input: Pick<FlowInput, "eta">): string | null {
  const a = predictedArrivalMinutes(input.eta);
  return a === null ? null : clock(a);
}

// ---------- who is collecting ----------

export type Collector = { name: string; kind: "parent" | "helper" | "other" };

/**
 * One answer to "who is collecting?" for every screen.
 * A live journey wins (it names whoever actually started it), then whoever accepted, then the parent.
 */
export function resolveCollector(args: {
  viewerName: string;
  journey: Pick<FlowJourney, "collectorName" | "collectorIsViewer"> | null;
  circle: Pick<FlowCircle, "collectorName"> | null;
}): Collector {
  if (args.journey) {
    return { name: args.journey.collectorIsViewer ? args.viewerName : args.journey.collectorName, kind: args.journey.collectorIsViewer ? "parent" : "other" };
  }
  if (args.circle?.collectorName) return { name: args.circle.collectorName, kind: "helper" };
  return { name: args.viewerName, kind: "parent" };
}

/** What each person's answer is called on screen. */
export const STATUS_LABEL: Record<RecipientStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  no_response: "No response",
  closed: "Not needed",
};

// ---------- the decision ----------

const RULE_TEXT = `SafeNest compares your predicted arrival with the time school ends. If you would arrive more than ${PICKUP_CONFIG.lateGraceMinutes} minutes after, it warns you and asks what you want to do. If you do not answer by the deadline and automatic backup is on, it asks your family and Trusted Circle together.`;

const reasonText = (reason: FlowCircle["reason"], deadline: string): string =>
  reason === "auto" ? `You had not answered by ${deadline}, so SafeNest asked for you.`
  : reason === "again" ? "You asked everyone again."
  : reason === "" ? ""
  : "You asked your circle.";

const STEP_LABELS = ["Asked", "Accepted", "Travelling", "At school", "Teacher check", "Handover"] as const;
/** Progress bar for a backup collector. `at` = index of the current step (0-5, 6 = all done). */
export function helperSteps(at: number, failedAt: number | null = null): FlowStep[] {
  return STEP_LABELS.map((label, i): FlowStep => ({ label, state: failedAt === i ? "failed" : i < at ? "done" : i === at ? "current" : "todo" }));
}

export function derivePickupFlow(input: FlowInput): PickupFlow {
  const { childName, teacherName, circle, journey, simulated, escalation } = input;
  const nowMin = minutesOfDay(input.now);
  const dismissMin = parseClock(input.dismissal);
  const arrivalMin = predictedArrivalMinutes(input.eta);
  const late = latenessMinutes(input);
  const arrival = arrivalClock(input);
  const predictedLate = dismissMin !== null && isPredictedLate(arrivalMin, dismissMin, false, PICKUP_CONFIG.lateGraceMinutes);
  const deadline = dismissMin === null ? input.dismissal : clock(askAt(dismissMin, escalation));
  const ends: Fact = {
    label: input.usualDismissal ? "School ends today" : "School ends",
    value: input.dismissal,
    note: input.usualDismissal ? `Usually ${input.usualDismissal}` : undefined,
  };
  const demoTag = simulated ? "Demo. " : "";
  const act = (id: ActionId, label: string): FlowAction => ({ id, label });
  const base = {
    simulated,
    estimate: (input.eta.kind === "ready" ? input.eta.source : null) as "route" | "demo" | null,
    rule: null as string | null,
    more: [] as FlowAction[],
    secondary: null as FlowAction | null,
    primary: null as FlowAction | null,
    demoActions: [] as FlowAction[],
    steps: null as FlowStep[] | null,
    showCollector: false,
    note: null as string | null,
    recipients: [] as FlowRecipient[],
    recipientsView: "none" as "open" | "tucked" | "none",
    urgent: false,
  };
  const recipients = circle?.recipients ?? [];
  const askBackup = act("find_backup", "Find trusted backup");
  const sendPhoto = (label = "Send photo to teacher") => act("prepare_teacher", label);
  const teacherWaiting = input.teacher === "awaitingTeacher" || input.teacher === "photoPrepared";
  const photoSent = input.teacher === "awaitingTeacher" || input.teacher === "approved";

  // 1. A journey exists.
  if (journey) {
    const who = journey.collectorIsViewer ? "You are" : `${journey.collectorName} is`;
    const whoName = journey.collectorIsViewer ? "You" : journey.collectorName;
    const rows = { recipients: [] as FlowRecipient[], recipientsView: "none" as "open" | "tucked" | "none" };
    const helper = !journey.collectorIsViewer;
    const demoBtn = (id: ActionId, label: string) => (simulated ? act(id, label) : null);
    const demoList = (...a: Array<FlowAction | null>): FlowAction[] => a.filter((x): x is FlowAction => x !== null);
    const collectorFact: Fact = { label: "Collector", value: journey.collectorIsViewer ? "You" : journey.collectorName };

    if (journey.state === "collected") {
      if (input.teacher === "rejected") {
        return { ...base, ...rows, phase: "teacher_rejected", tone: "danger", status: "Teacher said no", headline: `${teacherName} did not approve this collector`, detail: `${whoName} recorded the handover of ${childName}, but the teacher check was rejected. Contact the school now.`, facts: [collectorFact, { label: "Teacher check", value: "Rejected" }], steps: helper ? helperSteps(4, 4) : null, showCollector: helper };
      }
      if (teacherWaiting) {
        return { ...base, ...rows, phase: "teacher_pending", tone: "warning", status: "Teacher check pending", headline: `Waiting for ${teacherName} to confirm`, detail: `${whoName} recorded the handover of ${childName}. ${teacherName} has not confirmed yet.`, facts: [collectorFact, { label: "Teacher check", value: "Pending" }], steps: helper ? helperSteps(4) : null, showCollector: helper };
      }
      const confirmed = input.teacher === "approved";
      const when = journey.endedAt ? ` at ${formatClock(journey.endedAt)}` : "";
      return {
        ...base, ...rows, phase: "collected", tone: "success", status: "Collected",
        headline: `${childName} has been collected`,
        detail: `${demoTag}${journey.collectorName} collected ${childName}${when}. ${confirmed ? `${teacherName} confirmed the collector${simulated ? " in this demo" : ""}.` : `Confirmed by ${journey.collectorName}. The school has not verified it.`}`,
        facts: [{ label: "Collected by", value: journey.collectorName, note: journey.endedAt ? `at ${formatClock(journey.endedAt)}` : undefined }, { label: "Teacher check", value: confirmed ? "Approved" : "Not used" }],
        steps: helper ? helperSteps(6) : null, showCollector: helper,
      };
    }

    if (journey.state === "at_school") {
      if (input.teacher === "rejected") {
        return {
          ...base, ...rows, phase: "teacher_rejected", tone: "danger", status: "Teacher said no",
          headline: `${teacherName} did not approve ${journey.collectorName}`,
          detail: `${demoTag}${childName} has NOT been handed over and stays at school. ${simulated ? "Demo notification: " : ""}You have been told. Choose what happens next.`,
          facts: [collectorFact, { label: "Teacher check", value: "Rejected" }],
          primary: simulated ? act("come_myself", "I will come myself") : null,
          secondary: simulated ? act("ask_again", "Ask everyone else") : null,
          more: [],
          note: simulated ? `${journey.collectorName} will not be asked again today. Nothing is collected until a new collector is approved.` : `Contact the school. ${childName} should not leave with ${journey.collectorName}.`,
          steps: helper ? helperSteps(4, 4) : null, showCollector: helper,
        };
      }
      if (input.teacher === "approved") {
        return {
          ...base, ...rows, phase: "handover_pending", tone: "success", status: "Teacher approved",
          headline: `${teacherName} approved ${journey.collectorName}`,
          detail: journey.collectorIsViewer ? `Tap when ${childName} is with you.` : `${childName} is not collected yet. It is complete once ${childName} is handed over to ${journey.collectorName}.`,
          facts: [collectorFact, { label: "Teacher check", value: "Approved" }],
          primary: journey.collectorIsViewer ? act("confirm_handover", `I've collected ${childName}`) : null,
          demoActions: demoList(!journey.collectorIsViewer ? demoBtn("demo_handover", `Demo: ${childName} is handed over`) : null),
          steps: helper ? helperSteps(5) : null, showCollector: helper,
        };
      }
      if (teacherWaiting) {
        return {
          ...base, ...rows, phase: "teacher_pending", tone: "info", status: "Teacher is checking",
          headline: `${teacherName} is checking ${journey.collectorName}`,
          detail: `${demoTag}Photo sent. ${childName} leaves only after the teacher approves ${journey.collectorName}.`,
          facts: [collectorFact, { label: "Teacher check", value: "Pending" }],
          demoActions: demoList(demoBtn("demo_teacher_ok", "Demo: teacher says OK"), demoBtn("demo_teacher_no", "Demo: teacher says no")),
          steps: helper ? helperSteps(4) : null, showCollector: helper,
        };
      }
      return {
        ...base, ...rows, phase: "at_school", tone: "info", status: helper ? "Teacher is checking" : "At school",
        headline: helper ? `${teacherName} checks ${journey.collectorName}` : `${who} at school for ${childName}`,
        detail: journey.collectorIsViewer ? `Tap when ${childName} is with you.` : `${demoTag}${journey.collectorName} is at the school gate. ${teacherName} checks the photo before ${childName} leaves.`,
        facts: [ends, collectorFact],
        primary: journey.collectorIsViewer ? act("confirm_handover", `I've collected ${childName}`) : sendPhoto(),
        secondary: journey.collectorIsViewer ? act("cancel_journey", "Cancel journey") : null,
        more: journey.collectorIsViewer || simulated ? [] : [act("cancel_journey", "Cancel journey")],
        demoActions: demoList(!journey.collectorIsViewer ? demoBtn("demo_teacher_ok", "Demo: teacher says OK") : null, !journey.collectorIsViewer ? demoBtn("demo_teacher_no", "Demo: teacher says no") : null),
        steps: helper ? helperSteps(4) : null, showCollector: helper,
      };
    }

    const mins = journey.etaMinutes;
    return {
      ...base, ...rows, phase: "travelling", tone: "info", status: "On the way",
      headline: journey.collectorIsViewer ? `You're on the way to collect ${childName}` : `${journey.collectorName} is on the way to collect ${childName}`,
      detail: journey.collectorIsViewer
        ? "Tap when you reach the school."
        : simulated
          ? `Demo. The marker on the map is simulated, not a real location.${mins !== undefined && mins !== null ? (mins > 0 ? ` About ${minutesText(mins)} away.` : " Almost there.") : ""}`
          : `You'll see an update when ${journey.collectorName} reaches the school.`,
      facts: [ends, collectorFact],
      primary: journey.collectorIsViewer ? act("arrived_school", "I've arrived at school") : null,
      secondary: journey.collectorIsViewer ? act("cancel_journey", "Cancel journey") : null,
      more: journey.collectorIsViewer || simulated ? [] : [act("cancel_journey", "Cancel journey")],
      demoActions: demoList(!journey.collectorIsViewer ? demoBtn("demo_arrive", `Demo: ${journey.collectorName} arrives at school`) : null),
      steps: helper ? helperSteps(2) : null, showCollector: helper,
    };
  }

  // 2. A round of requests exists.
  if (circle) {
    const accepted = recipients.find((r) => r.status === "accepted");
    const pending = recipients.some((r) => r.status === "pending");
    const askedCount = recipients.length;

    if (accepted) {
      const helper = accepted.name;
      const teacherFact: Fact = { label: "Teacher check", value: "Not started" };
      const demoStart = simulated ? [act("demo_depart", `Demo: ${helper} starts travelling`)] : [];
      return {
        ...base, phase: "helper_assigned", tone: "success", status: circle.simulated ? "Demo helper" : "Helper assigned",
        recipients, recipientsView: "none",
        headline: `${helper} is collecting ${childName}`,
        detail: circle.simulated
          ? `Demo only. ${helper} "accepted" in this demo. Nobody was contacted. You do not need to collect ${childName}. ${childName} is not collected yet.`
          : `${helper} accepted. You do not need to collect ${childName} today. Everyone else was told it is covered. ${childName} is not collected yet.`,
        facts: [{ label: "Collector", value: helper }, teacherFact],
        more: simulated ? [] : [act("cancel_round", "Cancel and start over")],
        demoActions: demoStart,
        steps: helperSteps(2),
        showCollector: true,
        note: `${teacherName} checks ${helper} when they reach the school.`,
      };
    }

    if (pending) {
      const waiting = recipients.filter((r) => r.status === "pending").length;
      const single = circle.singleOnly === true;
      return {
        ...base, phase: "asking", tone: "info", status: circle.simulated ? "Demo request" : "Asking",
        recipients, recipientsView: "open",
        headline: single ? "Asking a trusted helper" : "Asking your circle",
        detail: circle.simulated
          ? `Demo only. Nobody was contacted. ${reasonText(circle.reason, deadline)} The first person to accept becomes the collector.`
          : `${reasonText(circle.reason, deadline)} The first person to accept becomes the collector. Until then ${childName} is still your responsibility.`.trim(),
        facts: [ends, { label: "Asked", value: `${askedCount} ${askedCount === 1 ? "person" : "people"}`, note: `${waiting} waiting` }],
        secondary: act("cancel_round", "Cancel requests"),
        note: single ? "Your database can only ask one person at a time. Group requests need the backend upgrade." : null,
      };
    }

    // Everybody answered and nobody accepted.
    return {
      ...base, phase: "nobody", tone: "danger", status: "Nobody available",
      recipients, recipientsView: askedCount ? "open" : "none",
      headline: askedCount === 0 ? `Nobody can be asked for ${childName}` : `Nobody can collect ${childName}`,
      detail: askedCount === 0
        ? "No approved family member or trusted helper is available to ask. Add and approve people in Trusted Circle, or collect them yourself."
        : "Everyone said no or did not answer. No backup is available, so you need to collect them yourself.",
      facts: [ends, { label: "Backup", value: "None available" }],
      primary: act("come_myself", "I will come myself"),
      secondary: askedCount === 0 ? null : act("ask_again", "Ask everyone again"),
    };
  }

  // 3. The parent said they will collect.
  if (input.parentChoice === "will_collect") {
    const travel = input.eta.kind === "ready" ? input.eta.minutes : null;
    const planned = input.leaveAt !== null && travel !== null ? input.leaveAt + travel : arrivalMin;
    const plannedLate = planned !== null && dismissMin !== null ? planned - dismissMin : late;
    const isLate = plannedLate !== null && plannedLate > PICKUP_CONFIG.lateGraceMinutes;
    const arrives = planned !== null ? clock(planned) : null;
    return {
      ...base, phase: "will_collect", tone: isLate ? "warning" : "info", status: "You're collecting",
      headline: arrives ? `You'll arrive about ${arrives}` : `You're collecting ${childName}`,
      detail: `${demoTag}${isLate && plannedLate !== null ? `That is ${minutesText(plannedLate)} after school ends at ${input.dismissal}. ${childName} will wait at school.` : `You chose to collect ${childName} yourself.`}`,
      facts: [ends, { label: arrives ? "Est. arrival" : "Collector", value: arrives ?? "You", note: isLate && plannedLate !== null ? `${minutesText(plannedLate)} after` : undefined }],
      primary: isLate ? act("message_teacher", "Message the teacher") : act("start_journey", "Start pickup journey"),
      secondary: isLate ? act("start_journey", "Start pickup journey") : askBackup,
      more: isLate ? [act("find_backup", "Find trusted backup instead")] : [],
      note: isLate ? `Tell ${teacherName} you will be late. You review the message before it goes anywhere.` : null,
    };
  }

  // 4. Decide from location and travel time.
  const eta = input.eta;
  const ctx = dismissMin === null
    ? null
    : { now: nowMin, dismiss: dismissMin, predictedArrival: arrivalMin, atSchool: false, settings: escalation, graceMinutes: PICKUP_CONFIG.lateGraceMinutes };
  const urgent = ctx !== null && urgentAlert({ stage: "plan" }, ctx);
  const autoNote = escalation.enabled
    ? `If you do not answer by ${deadline}, SafeNest asks your family and Trusted Circle together.`
    : `Automatic backup is off. SafeNest alerts you at ${deadline} but asks nobody unless you tap.`;
  const minsLeft = dismissMin === null ? null : Math.max(0, dismissMin - nowMin);

  if (eta.kind === "permission_needed" || eta.kind === "checking" || eta.kind === "unavailable") {
    const why =
      eta.kind === "permission_needed"
        ? eta.blocked ? "Location is turned off for SafeNest." : "SafeNest needs your phone's location to estimate your trip."
        : eta.kind === "checking" ? "Estimating your travel time."
        : eta.reason === "no_school_location" ? "SafeNest does not have the school's location yet."
        : eta.reason === "no_gps" ? "Your phone could not find its location."
        : "SafeNest could not reach the route service.";
    const cantTell = `Because it can't tell if you will be late, it will not ask anyone on its own. It will alert you at ${deadline}.`;

    if (urgent) {
      return {
        ...base, phase: "ask_now", tone: "danger", urgent: true, status: "Needs your answer",
        headline: minsLeft !== null && minsLeft > 0 ? `School ends in ${minutesText(minsLeft)} and SafeNest can't check your trip` : `School has ended and SafeNest can't check your trip`,
        detail: `${why} Nothing was sent to anyone. Will you collect ${childName}, or should SafeNest ask your circle now?`,
        facts: [ends, { label: "Collector", value: "You" }],
        primary: act("still_collect", "I'll still collect"),
        secondary: askBackup,
        more: eta.kind === "permission_needed" ? [eta.blocked ? act("open_settings", "Open phone settings") : act("enable_location", "Check my travel time")] : eta.kind === "unavailable" && eta.reason !== "no_school_location" ? [act("retry_eta", "Try again")] : [],
      };
    }
    if (eta.kind === "checking") {
      return { ...base, phase: "checking", tone: "info", status: "Checking", headline: "Checking your trip to school", detail: why, facts: [ends, { label: "Collector", value: "You" }], more: [askBackup] };
    }
    if (eta.kind === "permission_needed") {
      return {
        ...base, phase: "needs_location", tone: "info", status: "Location needed",
        headline: "Check if you can arrive in time",
        detail: `${why} School ends at ${input.dismissal}. ${eta.blocked ? "Turn it on in your phone settings." : "Your location is not shared with anyone."}`,
        facts: [ends, { label: "Collector", value: "You" }],
        primary: eta.blocked ? act("open_settings", "Open phone settings") : act("enable_location", "Check my travel time"),
        secondary: act("start_journey", "Start pickup journey anyway"),
        more: [askBackup],
        note: cantTell,
      };
    }
    return {
      ...base, phase: "eta_unavailable", tone: "warning", status: "Estimate unavailable",
      headline: "Can't estimate your arrival",
      detail: `${why} School ends at ${input.dismissal}. You can still start your journey or ask for backup.`,
      facts: [ends, { label: "Collector", value: "You" }],
      primary: eta.reason === "no_school_location" ? act("start_journey", "Start pickup journey") : act("retry_eta", "Try again"),
      secondary: eta.reason === "no_school_location" ? askBackup : act("start_journey", "Start pickup journey anyway"),
      more: eta.reason === "no_school_location" ? [] : [askBackup],
      note: cantTell,
    };
  }

  // eta.kind === "ready"
  const sourceNote = eta.source === "demo" ? "Demo estimate" : `Checked ${formatClock(eta.checkedAt)}`;
  if (predictedLate && late !== null) {
    if (urgent) {
      return {
        ...base, phase: "ask_now", tone: "danger", urgent: true, status: "Needs your answer",
        headline: minsLeft !== null && minsLeft > 0 ? `School ends in ${minutesText(minsLeft)}. You may be ${minutesText(late)} late` : `School has ended. You may be ${minutesText(late)} late`,
        detail: `${demoTag}Estimated arrival ${arrival}. Automatic backup is off, so nothing was sent. Will you still collect ${childName}, or should SafeNest ask your circle now?`,
        facts: [ends, { label: "Est. arrival", value: arrival ?? "", note: `${minutesText(late)} late · ${sourceNote}` }],
        primary: act("still_collect", "I'll still collect"),
        secondary: askBackup,
        rule: RULE_TEXT,
      };
    }
    return {
      ...base, phase: "late", tone: "warning", status: "May be late", rule: RULE_TEXT,
      headline: `You may arrive ${minutesText(late)} after school ends`,
      detail: `${demoTag}Estimated arrival ${arrival}. School ends at ${input.dismissal}, so ${childName} may be waiting. Can you still collect, or do you want backup?`,
      facts: [ends, { label: "Est. arrival", value: arrival ?? "", note: `${minutesText(late)} late · ${sourceNote}` }],
      primary: act("still_collect", "I'll still collect"),
      secondary: askBackup,
      note: autoNote,
    };
  }
  const early = late === null ? 0 : -late;
  return {
    ...base, phase: "on_time", tone: "success", status: "On time", rule: RULE_TEXT,
    headline: `You're on track to collect ${childName}`,
    detail: `${demoTag}You should arrive about ${arrival}${early > 0 ? `, ${minutesText(early)} before school ends at ${input.dismissal}` : `, just as school ends at ${input.dismissal}`}.`,
    facts: [ends, { label: "Est. arrival", value: arrival ?? "", note: `${early > 0 ? `${minutesText(early)} early` : "on time"} · ${sourceNote}` }],
    primary: act("start_journey", "Start pickup journey"),
    secondary: act("find_backup", "I can't make it"),
  };
}

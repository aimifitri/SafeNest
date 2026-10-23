import { AppState, Linking } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAppContext } from "../shared/AppContext";
import { useAuth } from "../shared/AuthContext";
import { isUuid } from "../shared/backupApi";
import { recipientStatus, reportPickupStatus } from "../shared/circleApi";
import * as E from "../shared/circleEngine";
import type { CirclePerson, EscalationSettings } from "../shared/circleEngine";
import { answer, dismissMinutes, sim, simInputs, travelMinutes, useSim } from "../shared/demoSim";
import type { SimEnv } from "../shared/demoSim";
import { useChildSchool } from "../shared/HouseholdContext";
import { pickupDecision, usePickupDecision } from "../shared/pickupDecision";
import { atMinutes, derivePickupFlow, minutesOfDay, parseClock, resolveCollector, predictedArrivalMinutes } from "../shared/pickupFlow";
import type { ActionId, Eta, FlowCircle, FlowJourney, FlowRecipient, PickupFlow } from "../shared/pickupFlow";
import { setTeacherCheck, useTeacherCheck } from "../shared/teacherCheck";
import { useCircleBroadcast } from "../shared/useCircleBroadcast";
import { usePickupEta } from "../shared/usePickupEta";
import { monitoringWindow, pickupStatus, usableEta } from "../shared/pickupStatus";
import { usePickupJourney } from "../shared/usePickupJourney";

// Gathers every source of pickup facts, hands them to derivePickupFlow() once, and runs the action
// the parent taps. Two layers, never mixed:
//   1. Demo  (no child stored in Supabase yet, or "Preview the demo" in Demo controls):
//      a demo clock, mock location and made-up replies from demoSim.ts. Labelled. Nobody is contacted.
//   2. Real  (a child is stored): real GPS + route, real requests in Supabase, real journeys.
// The decisions (late? deadline? ask everyone?) are the same pure functions in both layers.

const TICK_MS = 15_000;
const REPORT_EVERY_MS = 5 * 60_000;

export function usePickupFlow(screenActive = true) {
  const ctx = useAppContext();
  const { session, profile } = useAuth();
  const simState = useSim();
  const decision = usePickupDecision();
  const { child, school, household } = useChildSchool();
  const realMode = ctx.storedChildId !== null;
  // Sample simulation only in Demo Mode (or when the developer toggle forces it for a stored child). A real account
  // with no child yet shows an empty Today instead of a simulated one.
  const simActive = household.demo || (realMode && simState.forced);
  const realActive = realMode && !simActive;

  const journeyCtl = usePickupJourney(realActive ? ctx.storedChildId : null);
  const circleCtl = useCircleBroadcast(realActive ? ctx.storedChildId : null);


  const caregiver = ctx.selectedCaregiver;
  const weekday = new Date().getDay();
  const weekdayKey = (weekday === 0 ? 1 : Math.min(weekday, 5)) as 1 | 2 | 3 | 4 | 5;
  const usual = ctx.weeklySchedule[weekdayKey] ?? "1:00 PM";
  const changedToday = ctx.temporaryDismissal?.weekday === weekdayKey;
  const planLabel = changedToday && ctx.temporaryDismissal ? ctx.temporaryDismissal.time : usual;
  const planDismiss = parseClock(planLabel) ?? 13 * 60;

  // Everyone who could be asked: family and approved Trusted Circle members.
  const people: CirclePerson[] = useMemo(() => {
    // Family are listed, but only people with explicit pickup authorization count as approved. Demo family are all approved.
    const family: CirclePerson[] = household.members.map((m) => ({ id: m.userId, name: m.name, role: m.relationship || "Family member", kind: "family", approved: household.demo || m.canCollect, nearby: false }));
    const circle: CirclePerson[] = ctx.trustedHelpers.map((h) => ({ id: h.id, name: h.name, role: h.role, kind: "circle", approved: h.state === "active", nearby: false }));
    return [...family, ...circle];
  }, [ctx.trustedHelpers, household.members, household.demo]);
  // The parent using the app is never asked. Match the mock family list by id or by name.
  const viewerName = caregiver?.name ?? "You";
  const viewerId = session?.user.id
    ?? people.find((p) => p.id === caregiver?.id || p.name === caregiver?.name)?.id
    ?? caregiver?.id
    ?? "you";
  const env: SimEnv = useMemo(
    () => ({ people, viewerId, viewerName, planDismiss, teacherName: school.teacher }),
    [people, viewerId, viewerName, planDismiss, school.teacher],
  );

  // A slow tick so deadlines (12:55) pass on screen even if nothing else changes.
  const [realNow, setRealNow] = useState(() => Date.now());
  useEffect(() => {
    if (!realActive || !screenActive) return;
    const id = setInterval(() => setRealNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [realActive, screenActive]);

  const hasLiveJourney = journeyCtl.journey?.state === "started" || journeyCtl.journey?.state === "at_school";
  const parentAccount = profile?.accountType === "parent";
  const monitor = screenActive && realActive && parentAccount && ctx.planConfigured && journeyCtl.lastState !== "collected" && journeyCtl.lastState !== "cancelled"
    && (monitoringWindow(minutesOfDay(realNow), planDismiss) || hasLiveJourney);
  const etaCtl = usePickupEta(ctx.schoolLocation, monitor, household.pickupScope);
  useEffect(() => {
    if (realActive && (journeyCtl.lastState === "collected" || journeyCtl.lastState === "cancelled")) etaCtl.stop();
  }, [realActive, journeyCtl.lastState]);

  // ---- layer inputs
  let nowMs: number;
  let dismissMin: number;
  let eta: Eta;
  let parentChoice: "none" | "will_collect";
  let leaveAt: number | null;
  let circle: FlowCircle | null;
  let journey: FlowJourney | null;
  let escalation: EscalationSettings;
  let eligibleCount: number;
  let simulated: boolean;
  let collectorKey: string;
  let singleOnly = false;

  const nextLegacyHelper = ctx.trustedHelpers.find((h) => h.state === "active" && isUuid(h.id) && !decision.declined.includes(h.id)) ?? null;

  if (simActive) {
    const inp = simInputs(simState, env);
    nowMs = inp.nowMs; dismissMin = dismissMinutes(simState, env); eta = inp.eta; parentChoice = inp.parentChoice; leaveAt = inp.leaveAt;
    circle = inp.circle; journey = inp.journey; escalation = simState.escalation; eligibleCount = inp.eligibleCount; simulated = true;
    collectorKey = inp.collectorName ?? viewerName;
  } else {
    nowMs = realNow; dismissMin = planDismiss;
    eta = realMode ? usableEta(etaCtl.eta, realNow) : { kind: "checking" };
    parentChoice = decision.choice; leaveAt = decision.leaveAt; simulated = false;
    const live = journeyCtl.journey;
    journey = live
      ? { state: live.state, collectorName: live.collectorName, collectorIsViewer: live.collectorUserId === session?.user.id, endedAt: live.endedAt ? Date.parse(live.endedAt) : null }
      : null;
    const eligibleHelpers = ctx.trustedHelpers.filter((h) => h.state === "active" && isUuid(h.id));
    eligibleCount = circleCtl.available ? Math.max(eligibleHelpers.length, circleCtl.broadcast?.recipients.length ?? 0) : eligibleHelpers.length;
    // Without the backend upgrade, SafeNest cannot ask everyone, so it also cannot promise to do it automatically.
    escalation = { ...circleCtl.settings, enabled: circleCtl.settings.enabled && circleCtl.available === true && circleCtl.settingsAvailable === true };
    const b = circleCtl.broadcast;
    if (circleCtl.available && b && b.state !== "cancelled") {
      const rows: FlowRecipient[] = b.recipients.map((r) => ({ id: r.requestId, name: r.name, role: r.role, kind: r.kind, status: recipientStatus(r.state) }));
      circle = { recipients: rows, reason: b.reason, collectorName: rows.find((r) => r.status === "accepted")?.name ?? null, simulated: false };
    } else if (circleCtl.available === false && ctx.backupRequest.state !== "idle") {
      // Fallback: the database can only ask one helper at a time.
      singleOnly = true;
      const h = ctx.trustedHelpers.find((x) => x.id === ctx.backupRequest.helperId);
      const st = ctx.backupRequest.state;
      circle = {
        recipients: [{ id: h?.id ?? "helper", name: h?.name ?? "Helper", role: h?.role ?? "", kind: "circle", status: st === "requested" ? "pending" : st === "accepted" ? "accepted" : "declined" }],
        reason: "manual", collectorName: st === "accepted" ? h?.name ?? "A helper" : null, simulated: ctx.backupRequest.simulated, singleOnly: true,
      };
    } else {
      circle = null;
    }
    collectorKey = resolveCollector({ viewerName, journey, circle }).name;
  }

  const storedTeacher = useTeacherCheck(collectorKey);
  const teacher = storedTeacher;
  const collector = resolveCollector({ viewerName, journey, circle });
  const dismissalLabel = E.clock(dismissMin);

  const flow: PickupFlow = derivePickupFlow({
    now: nowMs, childName: child.name, teacherName: school.teacher, dismissal: dismissalLabel,
    usualDismissal: changedToday && !simState.dismissOverride ? usual : undefined,
    viewerName, eta, parentChoice, leaveAt, circle, journey, teacher, escalation, eligibleCount, simulated,
  });

  // ---- real mode, phone open: the same automatic rule as the demo. Also reports status to the server.
  const nowMin = minutesOfDay(nowMs);
  const arrivalMin = predictedArrivalMinutes(eta);
  const stage: E.Stage = journey ? "arrived" : circle ? "circle" : parentChoice === "will_collect" ? "committed" : "plan";
  const engineCtx: E.Context = { now: nowMin, dismiss: dismissMin, predictedArrival: arrivalMin, atSchool: false, settings: escalation, graceMinutes: 0 };
  const shouldAuto = screenActive && AppState.currentState === "active" && realActive && journeyCtl.lastState !== "collected" && journeyCtl.lastState !== "cancelled" && journeyCtl.ready && monitoringWindow(nowMin, dismissMin) && ctx.planConfigured && circleCtl.available === true && E.shouldAutoEscalate({ stage }, engineCtx);
  const autoFired = useRef<string | null>(null);
  const dayKey = new Date(nowMs).toDateString();
  useEffect(() => {
    if (!shouldAuto || autoFired.current === dayKey || circleCtl.busy) return;
    autoFired.current = dayKey; // once per day on this phone. The database also refuses a second round.
    void circleCtl.start("auto").then((ok) => { if (!ok) autoFired.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAuto, dayKey]);

  // Demo: the same rule on the demo clock.
  useEffect(() => {
    if (simActive) sim.tick(env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simActive, env, simState.escalation]);

  // Tell the server how today looks (when something changes, and every few minutes) so a scheduled check can
  // act when this app is closed. Skipped when the backend upgrade is not there.
  const reportKey = `${parentChoice}|${arrivalMin}|${dismissMin}|${circle ? 1 : 0}|${Math.floor(realNow / REPORT_EVERY_MS)}`;
  useEffect(() => {
    if (!screenActive || !realActive || journeyCtl.lastState === "collected" || journeyCtl.lastState === "cancelled" || !ctx.planConfigured || !ctx.storedChildId || circleCtl.available !== true || circleCtl.settingsAvailable !== true) return;
    void reportPickupStatus(
      ctx.storedChildId, new Date(atMinutes(nowMs, dismissMin)),
      arrivalMin === null ? null : new Date(atMinutes(nowMs, arrivalMin)),
      parentChoice,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenActive, realActive, journeyCtl.lastState, ctx.planConfigured, circleCtl.available, circleCtl.settingsAvailable, reportKey]);

  // A declined single-helper request is remembered so the one-at-a-time fallback moves on.
  const declinedId = ctx.backupRequest.state === "declined" ? ctx.backupRequest.helperId : undefined;
  useEffect(() => {
    if (realActive && declinedId) pickupDecision.addDeclined(declinedId);
  }, [realActive, declinedId]);

  // When a pickup finishes, forget today's choices so tomorrow starts clean.
  const finished = flow.phase === "collected";
  const wasFinished = useRef(false);
  useEffect(() => {
    if (finished && !wasFinished.current && realActive) pickupDecision.reset();
    wasFinished.current = finished;
  }, [finished, realActive]);

  const busy = ctx.backupBusy || journeyCtl.busy || circleCtl.busy;
  const error = simActive ? null : journeyCtl.error ?? circleCtl.error ?? ctx.backupError;
  const travelMin = eta.kind === "ready" ? eta.minutes : simActive ? travelMinutes(simState) : null;

  /** Runs the tapped action. Resolves true when it worked. Sheet actions are handled by the screen. */
  const run = async (action: ActionId, arg?: { leaveAt?: number }): Promise<boolean> => {
    if (simActive) {
      if (action === "enable_location" || action === "open_settings" || action === "retry_eta") { sim.setLocation("granted", env); return true; }
      return sim.act(action, env, arg);
    }
    switch (action) {
      case "enable_location": await etaCtl.request(); return true;
      case "retry_eta": await etaCtl.refresh(); return true;
      case "open_settings": await Linking.openSettings(); return true;
      case "still_collect": pickupDecision.willCollect(); return true;
      case "come_myself": pickupDecision.willCollect(arg?.leaveAt ?? null); return true;
      case "start_journey": return journeyCtl.start();
      case "arrived_school": return journeyCtl.arrived();
      case "confirm_handover": return journeyCtl.handover();
      case "cancel_journey": return journeyCtl.cancel();
      case "find_backup":
      case "ask_again": {
        pickupDecision.clearChoice();
        if (circleCtl.available) return circleCtl.start(action === "ask_again" ? "again" : "manual");
        if (circleCtl.available === false && nextLegacyHelper) return ctx.requestBackupPickup(nextLegacyHelper.id);
        return false;
      }
      case "cancel_round":
        if (circleCtl.available) return circleCtl.cancel();
        return ctx.resetBackupRequest();
      default: return false;
    }
  };

  /** The parent sent (or shared) the photo message. SafeNest cannot see whether the teacher read it. */
  const markMessageSent = (): void => {
    if (simActive) sim.photoSent(collector.name);
    else setTeacherCheck(collector.name, "awaitingTeacher");
  };

  const status = pickupStatus(eta, nowMin, dismissMin, flow.phase, child.name, collector.name, realActive && journeyCtl.lastState === "cancelled");
  return {
    statusReady: simActive || (journeyCtl.ready && circleCtl.available === true && !journeyCtl.error && !circleCtl.error),
    eta, status, nowMs, parentResponded: parentChoice === "will_collect",
    journeyActive: journey !== null,
    refreshEta: () => realActive && parentAccount ? etaCtl.refresh() : Promise.resolve(),
    flow,
    env,
    dismissal: dismissalLabel,
    dismissMin,
    nowMin,
    leaveAt,
    collector,
    collectorRole: people.find((p) => p.name === collector.name)?.role ?? "",
    /** Database-confirmed pickup journey; null for demo journeys. */
    liveJourney: simActive ? null : journeyCtl.journey,
    realMode,
    simActive,
    busy,
    error,
    notice: simActive ? simState.notice : null,
    clearError: () => { ctx.dismissBackupError(); journeyCtl.clearError(); circleCtl.clearError(); sim.dismissNotice(); },
    /** Travel minutes from where the parent is now, for the "I will come myself" sheet. Null when unknown. */
    travelMin,
    eligibleCount,
    singleOnly,
    people,
    viewerId,
    /** Group requests work in this database (real mode only). Null = still checking or demo. */
    groupRequests: simActive ? true : circleCtl.available,
    escalation,
    escalationSettings: circleCtl,
    run,
    markMessageSent,
    demo: {
      state: simState,
      answer: (id: string, ans: "yes" | "no" | "none") => answer(id, ans, env),
    },
  };
}

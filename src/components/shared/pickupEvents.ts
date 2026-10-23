import type { RecipientStatus } from "./pickupFlow";
import type { VerificationState } from "./types";

// Meaningful pickup events, derived from the state SafeNest already has (requests, journey, teacher check).
// Nothing here is a timer or a made-up event. A "milestone" is a fact that became true, with a stable key, so a
// repeated snapshot, a re-render, a reconnect or a screen remount produces the SAME keys and never a new event.
// The user closing the status pop-up acknowledges the milestones it showed. Pure: no React, no storage, no network.

export type MilestoneKind =
  | "backup_requested" | "helper_declined" | "helper_accepted"
  | "journey_started" | "journey_at_school" | "teacher_approved" | "teacher_rejected"
  | "journey_collected" | "journey_cancelled";

export type Milestone = { key: string; kind: MilestoneKind; rank: number };

export type EventSource = {
  /** Identity of the current request round (the server's broadcast id, or a demo round id). Null = no round. */
  roundId: string | null;
  /** Who started the round. "manual" and "again" are the parent's own tap, so they are not announced back. */
  reason: "" | "auto" | "manual" | "no" | "again";
  recipients: ReadonlyArray<{ id: string; status: RecipientStatus }>;
  journey: { id: string; state: "started" | "at_school" | "collected"; collectorIsViewer: boolean; endedAt: number | null } | null;
  /** Journey cancelled today (the server keeps no id for it, so the day is its identity). */
  cancelledToday: boolean;
  collectorName: string | null;
  teacher: VerificationState;
  /** Epoch ms, used only to ignore a completed journey from a previous day. */
  now: number;
};

const RANK: Record<MilestoneKind, number> = {
  backup_requested: 10, helper_declined: 20, helper_accepted: 30, journey_started: 40, journey_at_school: 50,
  teacher_approved: 60, teacher_rejected: 60, journey_collected: 70, journey_cancelled: 80,
};
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Every meaningful fact that is true right now, oldest first. Idempotent: the same state always gives the same keys. */
export function deriveMilestones(src: EventSource): Milestone[] {
  const out: Milestone[] = [];
  const add = (kind: MilestoneKind, key: string) => out.push({ key, kind, rank: RANK[kind] });
  if (src.roundId) {
    if (src.reason !== "manual" && src.reason !== "again") add("backup_requested", `req:${src.roundId}`);
    for (const r of src.recipients) {
      if (r.status === "declined") add("helper_declined", `dec:${src.roundId}:${r.id}`);
      else if (r.status === "accepted") add("helper_accepted", `acc:${src.roundId}:${r.id}`);
    }
  }
  const j = src.journey;
  // The parent's own taps (their own journey) are not announced back to them.
  if (j && !j.collectorIsViewer) {
    const fresh = j.state !== "collected" || (j.endedAt !== null && sameDay(j.endedAt, src.now));
    if (fresh) {
      add("journey_started", `jrn:${j.id}:started`);
      if (j.state === "at_school" || j.state === "collected") add("journey_at_school", `jrn:${j.id}:at_school`);
      if (src.teacher === "approved" || src.teacher === "rejected") {
        add(src.teacher === "approved" ? "teacher_approved" : "teacher_rejected", `teach:${j.id}:${src.collectorName ?? ""}:${src.teacher}`);
      }
      if (j.state === "collected") add("journey_collected", `jrn:${j.id}:collected`);
    }
  }
  if (src.cancelledToday) add("journey_cancelled", `jrn:cancelled:${new Date(src.now).toDateString()}`);
  return out.sort((a, b) => a.rank - b.rank);
}

export const pendingMilestones = (all: readonly Milestone[], acked: ReadonlySet<string>): Milestone[] => all.filter((m) => !acked.has(m.key));
/** The newest unacknowledged milestone: the one the pop-up is about. */
export const latestPending = (all: readonly Milestone[], acked: ReadonlySet<string>): Milestone | null => {
  const p = pendingMilestones(all, acked);
  return p.length ? p[p.length - 1] : null;
};
/** Closing the pop-up acknowledges everything it was able to show, including events that arrived while it was open. */
export function acknowledged(acked: ReadonlySet<string>, shown: readonly Milestone[], max = 200): Set<string> {
  const next = new Set(acked);
  for (const m of shown) next.add(m.key);
  return new Set([...next].slice(-max));
}

// ---- storage identity and format (non-sensitive: event keys only, no names, coordinates or addresses beyond ids)
export const eventStoreKey = (account: string, family: string | null, child: string) => "pickup-events-v1:" + JSON.stringify([account, family, child]);
export const demoEventScope = (pickupScope: string, resetVersion: number) => "demo:" + JSON.stringify([pickupScope, resetVersion]);
/** null = no record yet (first run for this account and child): the caller baselines instead of announcing history. */
export function parseAcked(raw: string | null): Set<string> | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === "string")) : new Set();
  } catch { return new Set(); }
}
export const serializeAcked = (acked: ReadonlySet<string>) => JSON.stringify([...acked]);

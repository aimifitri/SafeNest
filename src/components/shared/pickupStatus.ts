import type { Eta, PickupPhase } from "./pickupFlow";
import { LOCATION_POLICY } from "./locationQuality";

export const PICKUP_MONITORING = { beforeMinutes: 15, afterMinutes: 30, riskLookAheadMinutes: 120 } as const;
export function pickupMonitoringStage(now: number, dismissal: number): "outside" | "risk_check" | "pickup_window" {
  if (now < dismissal - PICKUP_MONITORING.riskLookAheadMinutes || now > dismissal + PICKUP_MONITORING.afterMinutes) return "outside";
  return now < dismissal - PICKUP_MONITORING.beforeMinutes ? "risk_check" : "pickup_window";
}
export function monitoringWindow(now: number, dismissal: number) { return pickupMonitoringStage(now, dismissal) !== "outside"; }
export function usableEta(eta: Eta, nowMs: number): Eta {
  if (eta.kind !== "ready" || eta.source === "demo") return eta;
  if (nowMs - (eta.positionTimestamp ?? eta.checkedAt) > LOCATION_POLICY.maxAgeMs || eta.checkedAt > nowMs + 10_000) return { kind: "unavailable", reason: "stale_gps" };
  return { ...eta, checkedAt: nowMs };
}
export type PickupStatus = {
  kind: "early" | "on_time" | "late" | "delayed" | "checking" | "unavailable" | "pending" | "assigned" | "journey" | "completed" | "cancelled";
  title: string; detail: string; arrival: number | null; minutesLate: number | null;
};
export function pickupStatus(eta: Eta, now: number, dismissal: number, phase: PickupPhase, child: string, collector: string, cancelled = false): PickupStatus {
  const basic = { arrival: null, minutesLate: null };
  if (cancelled) return { ...basic, kind: "cancelled", title: "Pickup journey cancelled", detail: "Foreground estimate monitoring has stopped for this journey. Review your pickup arrangement below." };
  if (phase === "collected") return { ...basic, kind: "completed", title: "Pickup completed", detail: "Completion is recorded in the pickup journey. No lateness alert is needed." };
  if (phase === "asking") return { ...basic, kind: "pending", title: "Backup requested", detail: "A request is already pending. Review responses in the existing pickup card." };
  if (phase === "helper_assigned") return { ...basic, kind: "assigned", title: `${collector} accepted`, detail: "The confirmed collector's journey updates are shown in the pickup card." };
  if (phase === "travelling" || phase === "at_school") return { ...basic, kind: "journey", title: phase === "at_school" ? `${collector} is at school` : `${collector} is on the way`, detail: "Review the existing journey controls below. This phone's estimate is not the other collector's live location." };
  if (eta.kind === "checking") return { ...basic, kind: "checking", title: "Checking pickup status", detail: "Checking this phone's location and the driving route." };
  if (eta.kind !== "ready") {
    const detail = eta.kind === "permission_needed" ? "Allow foreground location to estimate this phone's trip. You can deny access."
      : eta.reason === "no_school_location" ? "A saved school pin is required for this status estimate. An address search alone is not a confirmed school location."
      : eta.reason === "stale_gps" ? "The location reading is too old. Refresh the estimate."
      : eta.reason === "weak_gps" ? "GPS accuracy is too low. Move somewhere with better reception and retry."
      : eta.reason === "location_disabled" ? "Turn on this phone's location services and retry."
      : eta.reason === "network" ? "The driving route could not be calculated. Check the connection and retry."
      : "This phone could not obtain a usable location. Try again.";
    return { ...basic, kind: "unavailable", title: "Estimate unavailable", detail };
  }
  const arrival = now + eta.minutes;
  const minutesLate = Math.ceil(arrival - dismissal);
  if (now > dismissal) return { arrival, minutesLate, kind: "delayed", title: "Pickup is delayed.", detail: `You are already past dismissal and may arrive approximately ${Math.max(0, minutesLate)} minutes late for ${child}.` };
  if (minutesLate > 0) return { arrival, minutesLate, kind: "late", title: "You may be late.", detail: `Based on this phone's location, you may arrive ${minutesLate} minutes after ${child}'s dismissal.` };
  if (minutesLate === 0) return { arrival, minutesLate, kind: "on_time", title: "Pickup is on time.", detail: `You're expected to arrive around ${child}'s dismissal time.` };
  return { arrival, minutesLate, kind: "early", title: "You're on track.", detail: `You're expected to arrive ${-minutesLate} minutes before ${child}'s dismissal.` };
}
export function shouldShowPickupAlert(status: PickupStatus, input: { now: number; dismissal: number; acknowledged: boolean; parentResponded: boolean; foreground: boolean; blocked: boolean; enabled?: boolean }) {
  const window = pickupMonitoringStage(input.now, input.dismissal);
  return input.enabled !== false && input.foreground && !input.blocked && !input.acknowledged && !input.parentResponded
    && window !== "outside"
    && (window === "pickup_window" || (status.arrival !== null && status.arrival > input.dismissal))
    && (status.kind === "late" || status.kind === "delayed");
}
// Non-sensitive acknowledgement only; no coordinates, school address, or child name is stored.
export function pickupAlertKey(account: string, family: string | null, child: string, demo: boolean, day: string, dismissal: number) {
  return "pickup-status-v1:" + JSON.stringify([account, family, child, demo, day, dismissal]);
}

const acknowledgedAlerts = new Set<string>();
export const hasPickupAcknowledgement = (key: string) => acknowledgedAlerts.has(key);
export const acknowledgePickupAlert = (key: string) => { acknowledgedAlerts.add(key); };

/** Demo acknowledgement belongs to one child episode; real acknowledgement keys stay unchanged. */
export const demoPickupAlertKey = (base: string, scope: string, resetVersion: number) => base + JSON.stringify([scope, resetVersion]);

/** Uncovered late estimates are presented by PickupStatusModal, not a competing warning card. */
export function showInlinePickupStatus(phase: PickupPhase, status: PickupStatus) {
  return phase === "will_collect" || !["late", "delayed"].includes(status.kind);
}

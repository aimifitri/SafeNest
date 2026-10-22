export const LOCATION_POLICY = { maxAgeMs: 60_000, maxAccuracyMeters: 100, positionTimeoutMs: 10_000 } as const;
export type PositionFix = { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number | null } };
export function positionIssue(fix: PositionFix, now: number): "stale_gps" | "weak_gps" | "no_gps" | null {
  const { latitude, longitude, accuracy } = fix.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "no_gps";
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > LOCATION_POLICY.maxAgeMs || fix.timestamp - now > 10_000) return "stale_gps";
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > LOCATION_POLICY.maxAccuracyMeters) return "weak_gps";
  return null;
}
// Native location operations cannot be cancelled; callers also invalidate their response generation.
export function withDeadline<T>(promise: Promise<T>, ms: number = LOCATION_POLICY.positionTimeoutMs): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function locationIssueMessage(issue: "stale_gps" | "weak_gps" | "no_gps") {
  return issue === "stale_gps" ? "The GPS reading is stale. Refresh this phone's location."
    : issue === "weak_gps" ? "GPS accuracy is too low for navigation. Try again with better reception."
    : "The phone returned invalid location coordinates. Try again.";
}

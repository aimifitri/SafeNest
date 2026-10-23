import { LOCATION_POLICY, positionIssue, withDeadline, type PositionFix } from "./locationQuality";

export type PhoneLocationSnapshot = {
  kind: "idle" | "checking" | "ready" | "permission_needed" | "unavailable";
  fix: PositionFix | null; label: string | null; message: string; blocked: boolean;
};
export type PhoneLocationAdapters = {
  permission: (ask: boolean) => Promise<{ granted: boolean; canAskAgain: boolean }>;
  services: () => Promise<boolean>;
  position: () => Promise<PositionFix>;
  reverse: (point: { latitude: number; longitude: number }) => Promise<string | null>;
  now: () => number;
};
const empty: PhoneLocationSnapshot = { kind: "idle", fix: null, label: null, message: "Current location unavailable", blocked: false };
// Private app-memory state only. No Supabase, persistent storage, sharing or continuous watcher.
export function createPhoneLocation(adapters: PhoneLocationAdapters) {
  let snapshot = empty;
  let generation = 0;
  let pending: Promise<PositionFix> | null = null;
  let lastReverseAt = -Infinity;
  const listeners = new Set<() => void>();
  const emit = (next: PhoneLocationSnapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const invalidate = () => { generation++; pending = null; lastReverseAt = -Infinity; emit(empty); };
  const accept = (fix: PositionFix) => {
    const issue = positionIssue(fix, adapters.now());
    if (issue) throw new Error(issue);
    const previous = snapshot.fix;
    const sameArea = previous && Math.abs(previous.coords.latitude - fix.coords.latitude) < 0.001 && Math.abs(previous.coords.longitude - fix.coords.longitude) < 0.001;
    emit({ kind: "ready", fix, label: sameArea ? snapshot.label : null, message: "", blocked: false });
    if (adapters.now() - lastReverseAt < 30_000) return;
    lastReverseAt = adapters.now();
    const mine = generation;
    void withDeadline(adapters.reverse(fix.coords), 5000).then(label => {
      if (mine === generation && snapshot.fix?.timestamp === fix.timestamp && positionIssue(fix, adapters.now()) === null) emit({ ...snapshot, label });
    }).catch(() => { /* Coordinates remain available if address lookup is unreliable or unavailable. */ });
  };
  return {
    get: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invalidate, accept,
    read(ask = false, force = false): Promise<PositionFix> {
      if (pending) return pending;
      if (!force && snapshot.fix && positionIssue(snapshot.fix, adapters.now()) === null && adapters.now() - snapshot.fix.timestamp < 30_000) return Promise.resolve(snapshot.fix);
      const mine = ++generation;
      const current = () => { if (mine !== generation) throw new Error("Location request cancelled"); };
      emit({ ...empty, kind: "checking", message: "Checking this phone's location..." });
      pending = (async () => {
        try {
          const permission = await withDeadline(adapters.permission(ask)); current();
          if (!permission.granted) {
            emit({ ...empty, kind: "permission_needed", blocked: !permission.canAskAgain, message: "Foreground location permission is needed. No location is being shared." });
            throw new Error("permission_needed");
          }
          const services = await withDeadline(adapters.services()); current();
          if (!services) throw new Error("location_disabled");
          const fix = await withDeadline(adapters.position()); current();
          accept(fix); return fix;
        } catch (cause) {
          if (mine === generation && snapshot.kind !== "permission_needed") emit({ ...empty, kind: "unavailable", message: cause instanceof Error ? cause.message : "no_gps" });
          throw cause;
        } finally { if (mine === generation) pending = null; }
      })();
      return pending;
    },
  };
}
export function phoneLocationView(snapshot: PhoneLocationSnapshot, now: number, demoPlace: string | null = null) {
  if (demoPlace !== null) return { title: "Simulated location", label: demoPlace, detail: "Demo only. This is not this phone's GPS.", current: false };
  const fix = snapshot.fix;
  if (fix && positionIssue(fix, now) === null && snapshot.kind === "ready") return {
    title: "Your current location", label: snapshot.label || `${fix.coords.latitude.toFixed(5)}, ${fix.coords.longitude.toFixed(5)}`,
    detail: `Updated ${Math.max(0, Math.floor((now - fix.timestamp) / 1000))} seconds ago. Accuracy +/-${Math.round(fix.coords.accuracy ?? 0)} m. This summary does not start location sharing.`, current: true,
  };
  if (fix && positionIssue(fix, now) === "stale_gps") return { title: "Last location is stale", label: `${fix.coords.latitude.toFixed(5)}, ${fix.coords.longitude.toFixed(5)}`, detail: "Not a current live position. Refresh to update.", current: false };
  const detail = snapshot.kind === "permission_needed" ? snapshot.message
    : snapshot.kind === "checking" ? snapshot.message
    : snapshot.message === "location_disabled" ? "Turn on this phone's location services."
    : snapshot.message === "weak_gps" ? "GPS accuracy is too low. Try again with better reception."
    : snapshot.message === "stale_gps" ? "The phone returned an old location. Try again."
    : "Allow foreground location or refresh when GPS is available.";
  return { title: "Your current location", label: "Current location unavailable", detail, current: false };
}

export function monitorPhoneLocation(controller: ReturnType<typeof createPhoneLocation>, environment: {
  isActive: () => boolean;
  every: (callback: () => void) => () => void;
  onAppState: (callback: (state: string) => void) => () => void;
}) {
  let alive = true;
  const refresh = () => { if (alive && environment.isActive()) void controller.read().catch(() => {}); };
  refresh();
  const stopTimer = environment.every(refresh);
  const unsubscribe = environment.onAppState(next => {
    if (!alive) return;
    if (next === "active") refresh();
    else if (next === "background") controller.invalidate();
  });
  return () => { alive = false; stopTimer(); unsubscribe(); controller.invalidate(); };
}

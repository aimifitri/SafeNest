import type { Eta } from "./pickupFlow";
import type { LatLng, RouteResult } from "./eta";
import { positionIssue, withDeadline, type PositionFix } from "./locationQuality";

export type EstimateAdapters = {
  permission: (ask: boolean) => Promise<{ granted: boolean; canAskAgain: boolean }>;
  services: () => Promise<boolean>;
  position: () => Promise<PositionFix>;
  route: (from: LatLng, to: LatLng, signal: AbortSignal) => Promise<RouteResult>;
  now: () => number;
};
// One controller per account/household/child/school. Shared by mounted Today and Plan hooks.
export function createPickupEstimate(adapters: EstimateAdapters, school: LatLng | null) {
  let snapshot: Eta = { kind: "checking" };
  let generation = 0;
  let pending: Promise<void> | null = null;
  let abort: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Eta) => { snapshot = next; listeners.forEach(listener => listener()); };
  const invalidate = () => { generation++; abort?.abort(); abort = null; pending = null; set({ kind: "checking" }); };
  return {
    get: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invalidate,
    refresh(ask = false): Promise<void> {
      if (pending) return pending;
      if (!school || !Number.isFinite(school.latitude) || !Number.isFinite(school.longitude) || Math.abs(school.latitude) > 90 || Math.abs(school.longitude) > 180) {
        set({ kind: "unavailable", reason: "no_school_location" }); return Promise.resolve();
      }
      const mine = ++generation;
      const controller = new AbortController(); abort = controller;
      const current = () => mine === generation && !controller.signal.aborted;
      const publish = (next: Eta) => { if (current()) set(next); };
      set({ kind: "checking" });
      pending = (async () => {
        try {
          const permission = await withDeadline(adapters.permission(ask));
          if (!current()) return;
          if (!permission.granted) { publish({ kind: "permission_needed", blocked: !permission.canAskAgain }); return; }
          const services = await withDeadline(adapters.services());
          if (!current()) return;
          if (!services) { publish({ kind: "unavailable", reason: "location_disabled" }); return; }
          const fix = await withDeadline(adapters.position());
          if (!current()) return;
          const issue = positionIssue(fix, adapters.now());
          if (issue) { publish({ kind: "unavailable", reason: issue }); return; }
          let route: RouteResult;
          try { route = await withDeadline(adapters.route(fix.coords, school, controller.signal)); }
          catch { publish({ kind: "unavailable", reason: "network" }); return; }
          if (!current()) return;
          if (!route.ok || !Number.isFinite(route.minutes) || route.minutes < 0) { publish({ kind: "unavailable", reason: "network" }); return; }
          const finalIssue = positionIssue(fix, adapters.now());
          if (finalIssue) { publish({ kind: "unavailable", reason: finalIssue }); return; }
          publish({ kind: "ready", minutes: route.minutes, source: "route", checkedAt: adapters.now(), accuracy: fix.coords.accuracy, positionTimestamp: fix.timestamp });
        } catch { publish({ kind: "unavailable", reason: "no_gps" }); }
        finally { if (mine === generation) { pending = null; controller.abort(); abort = null; } }
      })();
      return pending;
    },
  };
}

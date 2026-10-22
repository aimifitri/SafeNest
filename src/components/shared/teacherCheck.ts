import { useSyncExternalStore } from "react";

import type { VerificationState } from "./types";

// The teacher check, shared by Pickup Plan (where it is prepared and simulated) and Today
// (where it decides whether a pickup counts as complete). It used to live in a variable inside
// Plan, which Today could not see. Simulated: no photo is taken and no identity is verified.
// A decision belongs to ONE collector. If the collector changes, the check starts again.
type Record = { collector: string | null; state: VerificationState };

let current: Record = { collector: null, state: "notStarted" };
let scope = "default";
const scopes = new Map<string, Record>();
export function selectTeacherScope(next: string) {
  if (scope === next) return;
  scopes.set(scope, current); scope = next;
  current = scopes.get(scope) ?? { collector: null, state: "notStarted" };
  listeners.forEach(listener => listener());
}
const listeners = new Set<() => void>();

export function setTeacherCheck(collector: string | null, state: VerificationState): void {
  if (collector === null) return; // nobody to check
  current = { collector, state };
  listeners.forEach((l) => l());
}

export function getTeacherCheck(collector: string | null): VerificationState {
  return collector !== null && current.collector === collector ? current.state : "notStarted";
}

export function useTeacherCheck(collector: string | null): VerificationState {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => current,
    () => current,
  );
  return collector !== null && snap.collector === collector ? snap.state : "notStarted";
}

import { useSyncExternalStore } from "react";

// Small things about today's pickup that no server stores, kept outside AppContext so its
// shared-state contract does not change. Held in app memory only: they reset when the app restarts.
//   choice   : the parent chose to collect (an acknowledgement, not an assignment).
//   leaveAt  : when they said they will leave (minutes after midnight), for the teacher message.
//   declined : helpers who declined during this episode, so the one-at-a-time fallback skips them.
// The labelled demo keeps its own state in demoSim.ts.
type Snapshot = {
  choice: "none" | "will_collect";
  leaveAt: number | null;
  declined: readonly string[];
};

const empty: Snapshot = { choice: "none", leaveAt: null, declined: [] };
let snap: Snapshot = empty;
let scope = "default";
const scopes = new Map<string, Snapshot>();
const listeners = new Set<() => void>();
const set = (next: Partial<Snapshot>) => {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
};

export const pickupDecision = {
  selectScope(next: string) { if (scope === next) return; scopes.set(scope, snap); scope = next; snap = scopes.get(scope) ?? empty; listeners.forEach(listener => listener()); },
  get: () => snap,
  willCollect: (leaveAt: number | null = null) => set({ choice: "will_collect", leaveAt }),
  clearChoice: () => set({ choice: "none", leaveAt: null }),
  addDeclined: (helperId: string) => {
    if (!snap.declined.includes(helperId)) set({ declined: [...snap.declined, helperId] });
  },
  clearDeclined: () => set({ declined: [] }),
  /** New day or finished pickup: forget everything. */
  reset: () => set(empty),
};

export function usePickupDecision(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => snap,
    () => snap,
  );
}

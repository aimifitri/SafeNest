import { useSyncExternalStore } from "react";

// Pending helper approvals that only exist in Trusted Circle's local state (helpers invited this visit).
// Trusted Circle publishes the count; AppShell adds it to the shared-context pending count for the tab badge.
let localPending = 0;
const listeners = new Set<() => void>();

export function setLocalPendingCount(n: number): void {
  if (n === localPending) return;
  localPending = n;
  listeners.forEach((l) => l());
}

export function useLocalPendingCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => localPending,
    () => 0,
  );
}

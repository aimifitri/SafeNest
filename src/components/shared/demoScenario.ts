import { useSyncExternalStore } from "react";

// Demo controls: pick a simulated pickup situation to preview how Today looks. Never real tracking.
// Frontend only, held in app memory, and kept outside AppContext so the team's shared-state contract is unchanged.
export type ScenarioKey = "default" | "road" | "school" | "late" | "arrived";
export type Scenario = { state: "onTrack" | "late" | "arrived"; currentPlace: "office" | "road" | "school"; etaMinutes: number };

export const scenarios: ReadonlyArray<{ key: ScenarioKey; label: string; detail: string; value: Scenario | null }> = [
  { key: "default", label: "Normal day", detail: "Collector is getting ready to leave.", value: null },
  { key: "road", label: "On the way", detail: "Collector is travelling to school.", value: { state: "onTrack", currentPlace: "road", etaMinutes: 12 } },
  { key: "school", label: "Waiting at school", detail: "Collector is at the school gate.", value: { state: "onTrack", currentPlace: "school", etaMinutes: 0 } },
  { key: "late", label: "Running late", detail: "Collector may arrive after dismissal.", value: { state: "late", currentPlace: "office", etaMinutes: 50 } },
  { key: "arrived", label: "Pickup complete", detail: "Child has been collected.", value: { state: "arrived", currentPlace: "school", etaMinutes: 0 } },
];

let current: ScenarioKey = "default";
const listeners = new Set<() => void>();

export function setScenario(k: ScenarioKey): void {
  if (k === current) return;
  current = k;
  listeners.forEach((l) => l());
}

export function useScenarioKey(): ScenarioKey {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => current,
    () => current,
  );
}

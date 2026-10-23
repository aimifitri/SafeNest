import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { PositionFix } from "./locationQuality";
import { monitorPhoneLocation } from "./phoneLocation";
import { phoneLocationFor } from "./phoneLocationService";

export function usePhoneLocation(scope: string, enabled: boolean) {
  const entry = useMemo(() => phoneLocationFor(scope), [scope]);
  const controller = entry.controller;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, controller.get);
  useEffect(() => entry.retain(), [entry]);
  useEffect(() => {
    if (!enabled) return;
    return monitorPhoneLocation(controller, {
      isActive: () => AppState.currentState === "active",
      every: refresh => { const timer = setInterval(refresh, 30_000); return () => clearInterval(timer); },
      onAppState: callback => { const sub = AppState.addEventListener("change", callback); return () => sub.remove(); },
    });
  }, [controller, enabled]);
  return { snapshot, accept: (fix: PositionFix) => { try { controller.accept(fix); } catch { controller.invalidate(); } }, refresh: () => controller.read(false, true), request: () => controller.read(true, true) };
}

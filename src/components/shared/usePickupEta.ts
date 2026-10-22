import * as Location from "expo-location";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { fetchRouteMinutes, type LatLng } from "./eta";
import { createPickupEstimate } from "./pickupEstimate";
import { phoneLocationFor } from "./phoneLocationService";
import { LOCATION_POLICY } from "./locationQuality";

const estimates = new Map<string, { phone: ReturnType<typeof phoneLocationFor>; controller: ReturnType<typeof createPickupEstimate>; users: number; activeUsers: number }>();
export function usePickupEta(school: LatLng | null, enabled: boolean, scope = "default") {
  const key = JSON.stringify([scope, school?.latitude, school?.longitude]);
  const entry = useMemo(() => {
    const existing = estimates.get(key);
    if (existing) return existing;
    const phone = phoneLocationFor(scope);
    const created = { users: 0, activeUsers: 0, phone, controller: createPickupEstimate({
      permission: ask => ask ? Location.requestForegroundPermissionsAsync() : Location.getForegroundPermissionsAsync(),
      services: () => Location.hasServicesEnabledAsync(),
      position: () => phone.controller.read(),
      route: (from, to, signal) => fetchRouteMinutes(from, to, { signal }),
      now: Date.now,
    }, school) };
    estimates.set(key, created); return created;
  }, [key]);
  const controller = entry.controller;
  const eta = useSyncExternalStore(controller.subscribe, controller.get, controller.get);
  useEffect(() => {
    entry.users++;
    const releasePhone = entry.phone.retain();
    estimates.set(key, entry);
    const lifecycle = AppState.addEventListener("change", next => { if (next === "background") controller.invalidate(); });
    return () => { lifecycle.remove(); releasePhone(); if (--entry.users === 0) { controller.invalidate(); estimates.delete(key); } };
  }, [entry, controller, key]);
  useEffect(() => {
    if (!enabled) return;
    entry.activeUsers++;
    const refresh = () => {
      if (AppState.currentState !== "active") return;
      const current = controller.get();
      if (current.kind !== "ready" || Date.now() - (current.positionTimestamp ?? current.checkedAt) >= LOCATION_POLICY.maxAgeMs) void controller.refresh();
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    const sub = AppState.addEventListener("change", next => { if (next === "active") refresh(); });
    return () => { clearInterval(timer); sub.remove(); if (--entry.activeUsers === 0) controller.invalidate(); };
  }, [controller, entry, enabled]);
  return { eta, stop: controller.invalidate, request: () => controller.refresh(true), refresh: () => controller.refresh(false) };
}

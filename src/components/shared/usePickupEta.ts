import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { fetchRouteMinutes } from "./eta";
import type { LatLng } from "./eta";
import { PICKUP_CONFIG } from "./pickupFlow";
import type { Eta } from "./pickupFlow";

const POSITION_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * The parent's travel time to school, from this phone's location (foreground only).
 * Nothing is sent anywhere except the two coordinates to the routing service.
 * `school` null means SafeNest does not know where the school is, so no estimate is possible.
 * When `enabled` is false the hook does nothing (demo mode supplies its own numbers).
 */
export function usePickupEta(school: LatLng | null, enabled: boolean) {
  const [eta, setEta] = useState<Eta>({ kind: "checking" });
  const lastCheck = useRef(0);
  const running = useRef(false);

  const compute = useCallback(async (silent: boolean) => {
    if (!school) {
      setEta({ kind: "unavailable", reason: "no_school_location" });
      return;
    }
    if (running.current) return;
    running.current = true;
    if (!silent) setEta({ kind: "checking" });
    try {
      let position: Location.LocationObject;
      try {
        position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), POSITION_TIMEOUT_MS);
      } catch {
        setEta({ kind: "unavailable", reason: "no_gps" });
        return;
      }
      const checkedAt = Date.now();
      const route = await fetchRouteMinutes(position.coords, school);
      if (!route.ok) {
        setEta({ kind: "unavailable", reason: route.reason === "network" ? "network" : "no_gps" });
        return;
      }
      lastCheck.current = checkedAt;
      setEta({ kind: "ready", minutes: route.minutes, source: "route", checkedAt });
    } finally {
      running.current = false;
    }
  }, [school]);

  // Look at the current permission without asking. Granted -> estimate. Otherwise wait for the parent to tap.
  const evaluate = useCallback(async () => {
    if (!school) {
      setEta({ kind: "unavailable", reason: "no_school_location" });
      return;
    }
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === "granted") await compute(false);
      else setEta({ kind: "permission_needed", blocked: permission.status === "denied" && !permission.canAskAgain });
    } catch {
      setEta({ kind: "unavailable", reason: "no_gps" });
    }
  }, [school, compute]);

  // The parent tapped "Check my travel time": this is the only place the permission is asked.
  const request = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === "granted") await compute(false);
      else setEta({ kind: "permission_needed", blocked: !permission.canAskAgain });
    } catch {
      setEta({ kind: "unavailable", reason: "no_gps" });
    }
  }, [compute]);

  const refresh = useCallback(() => evaluate(), [evaluate]);

  useEffect(() => {
    if (!enabled) return;
    void evaluate();
    const maxAge = PICKUP_CONFIG.etaMaxAgeMinutes * 60_000;
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && lastCheck.current > 0 && Date.now() - lastCheck.current >= maxAge) void compute(true);
    }, 60_000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && lastCheck.current > 0 && Date.now() - lastCheck.current >= maxAge) void compute(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, evaluate, compute]);

  return { eta, request, refresh };
}

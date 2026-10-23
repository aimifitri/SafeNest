import { useEffect, useRef, useState } from "react";

import { fetchRouteSummary } from "../shared/eta";
import type { RouteBasis } from "../shared/etaModes";
import { isValidCoord, needsEtaRefresh, type Coord } from "./mapGeo";

export type SchoolEta =
  | { state: "no_school" }
  | { state: "no_gps" }
  | { state: "loading"; basis: RouteBasis | null }
  | { state: "ready"; basis: RouteBasis }
  | { state: "failed"; basis: null };

/**
 * Road time and distance from this phone to the child's saved school, from the existing routing service.
 * It only looks the route up when the phone has moved a fair distance or the last answer is old, and it
 * ignores answers that arrive after the phone moved on. Nothing is drawn and no directions are kept.
 */
export function useSchoolEta(from: Coord | null, school: Coord | null, enabled: boolean, retryKey = 0): SchoolEta {
  const [eta, setEta] = useState<SchoolEta>({ state: "loading", basis: null });
  const last = useRef<{ at: Coord; school: Coord; time: number } | null>(null);
  const generation = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; controllerRef.current?.abort(); }, []);
  const lastRetry = useRef(retryKey);
  const lat = from?.latitude, lon = from?.longitude, sLat = school?.latitude, sLon = school?.longitude;

  useEffect(() => {
    if (!enabled) { generation.current++; last.current = null; return; }
    if (!isValidCoord(school)) { generation.current++; last.current = null; setEta({ state: "no_school" }); return; }
    if (!isValidCoord(from)) { setEta({ state: "no_gps" }); return; }
    if (retryKey !== lastRetry.current) { lastRetry.current = retryKey; last.current = null; }
    const now = { at: { latitude: from.latitude, longitude: from.longitude }, school: { latitude: school.latitude, longitude: school.longitude }, time: Date.now() };
    if (!needsEtaRefresh(last.current, now)) return;
    last.current = now;
    const mine = ++generation.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setEta((prev) => ({ state: "loading", basis: prev.state === "ready" ? prev.basis : null }));
    void fetchRouteSummary(now.at, now.school, { signal: controller.signal }).then((r) => {
      if (mine !== generation.current) return;
      if (r.ok) setEta({ state: "ready", basis: { minutes: r.minutes, meters: r.meters } });
      else { last.current = null; setEta({ state: "failed", basis: null }); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lat, lon, sLat, sLon, retryKey]);
  return eta;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { ApiResult } from "./backupApi";
import {
  cancelJourney,
  confirmHandover,
  fetchLatestJourney,
  markArrived,
  startJourney,
  subscribeToJourneys,
  toLiveJourney,
} from "./pickupJourneyApi";
import type { LiveJourney } from "./pickupJourneyApi";

/**
 * The latest pickup journey for a stored child, kept up to date live.
 * Pass null while the app is still on the demo child: nothing is loaded and `enabled` is false.
 * Every action resolves true only after the server confirmed it.
 */
export function usePickupJourney(childId: string | null) {
  const [journey, setJourney] = useState<LiveJourney | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!childId) return;
    const res = await fetchLatestJourney(childId);
    if (res.ok) setJourney(toLiveJourney(res.data));
    else setError(res.error); // keep what was shown, do not pretend it is fresh
  }, [childId]);

  useEffect(() => {
    if (!childId) {
      setJourney(null);
      return;
    }
    void refresh();
    const unsubscribe = subscribeToJourneys(childId, () => void refresh());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [childId, refresh]);

  // One action at a time, so a double tap cannot record a step twice.
  const run = async (action: () => Promise<ApiResult<unknown>>): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) setError(res.error);
      await refresh();
      return res.ok;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    enabled: childId !== null,
    journey,
    busy,
    error,
    clearError: () => setError(null),
    start: () => (childId ? run(() => startJourney(childId)) : Promise.resolve(false)),
    arrived: () => (journey ? run(() => markArrived(journey.id)) : Promise.resolve(false)),
    handover: () => (journey ? run(() => confirmHandover(journey.id)) : Promise.resolve(false)),
    cancel: () => (journey ? run(() => cancelJourney(journey.id)) : Promise.resolve(false)),
  };
}

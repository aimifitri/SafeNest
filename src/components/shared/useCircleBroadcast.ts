import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { subscribeToRequests } from "./backupApi";
import {
  cancelBroadcast, expireBroadcast, fetchBroadcast, fetchEscalationSettings, saveEscalationSettings, startBroadcast,
} from "./circleApi";
import type { Broadcast } from "./circleApi";
import { ESCALATION_DEFAULTS } from "./circleEngine";
import type { EscalationSettings } from "./circleEngine";

const POLL_MS = 20_000;

/**
 * The real "ask everyone together" round for a stored child, kept up to date live.
 * Pass null while the app is on the demo child: nothing is loaded.
 *
 * `available` is null until the first answer, false when the database does not have
 * supabase/pickup_broadcast.sql yet (then Today asks one helper at a time and says so),
 * true when group requests work. Every action resolves true only after the server confirmed it.
 */
export function useCircleBroadcast(childId: string | null) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [settings, setSettings] = useState<EscalationSettings>(ESCALATION_DEFAULTS);
  const [settingsAvailable, setSettingsAvailable] = useState<boolean | null>(null);
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  // True while the shown error only means a background refresh failed. It clears itself when a refresh works again.
  const refreshErrorRef = useRef(false);
  const expiredFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!childId) return;
    const res = await fetchBroadcast(childId);
    if (res.ok) {
      setAvailable(true);
      setBroadcast(res.data);
      if (refreshErrorRef.current) {
        refreshErrorRef.current = false;
        setError(null);
      }
    } else if (res.missing) {
      setAvailable(false);
      setBroadcast(null);
    } else {
      // Keep what was shown, do not pretend it is fresh. A message from a failed action is not overwritten.
      setError((prev) => {
        if (prev !== null) return prev;
        refreshErrorRef.current = true;
        return "Cannot refresh right now. Showing the last known status.";
      });
    }
  }, [childId]);

  const loadSettings = useCallback(async () => {
    if (!childId) return;
    const res = await fetchEscalationSettings(childId);
    if (res.ok) {
      setSettingsAvailable(true);
      setSettings({ enabled: res.data.enabled, minutesBefore: res.data.minutesBefore, responseWindowMinutes: res.data.responseWindowMinutes });
      setConsentedAt(res.data.consentedAt);
    } else if (res.missing) {
      setSettingsAvailable(false);
    }
  }, [childId]);

  useEffect(() => {
    if (!childId) {
      setAvailable(null);
      setBroadcast(null);
      return;
    }
    void refresh();
    void loadSettings();
    const unsubscribe = subscribeToRequests(`circle-${childId}`, () => void refresh());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [childId, refresh, loadSettings]);

  // Realtime can miss an event (phone asleep), so an open round is also re-read now and then.
  const open = broadcast?.state === "open";
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

  // Requests nobody answered become "No response" once the waiting time is over (the database checks the time).
  useEffect(() => {
    if (!broadcast || broadcast.state !== "open" || expiredFor.current === broadcast.id) return;
    const dueAt = Date.parse(broadcast.startedAt) + settings.responseWindowMinutes * 60_000;
    const wait = Math.max(0, dueAt - Date.now()) + 1_000;
    const id = setTimeout(async () => {
      expiredFor.current = broadcast.id;
      await expireBroadcast(broadcast.id);
      await refresh();
    }, wait);
    return () => clearTimeout(id);
  }, [broadcast, settings.responseWindowMinutes, refresh]);

  // One action at a time, so a double tap or a re-render cannot send twice. The database also refuses duplicates.
  const run = async (action: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    refreshErrorRef.current = false;
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong. Nothing was changed.");
      await refresh();
      return res.ok;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    enabled: childId !== null,
    available,
    broadcast,
    settings,
    settingsAvailable,
    consentedAt,
    busy,
    error,
    clearError: () => setError(null),
    /** Ask everyone now. An open round is reused, so this never sends the same requests twice. */
    start: (reason: "auto" | "manual" | "again") =>
      childId ? run(async () => {
        const res = await startBroadcast(childId, reason);
        if (res.ok) setAvailable(true);
        else if (res.missing) setAvailable(false);
        return res.ok ? { ok: true } : { ok: false, error: res.error };
      }) : Promise.resolve(false),
    cancel: () => (broadcast ? run(async () => {
      const res = await cancelBroadcast(broadcast.id);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }) : Promise.resolve(false)),
    saveSettings: (next: EscalationSettings) =>
      childId ? run(async () => {
        const res = await saveEscalationSettings(childId, next);
        if (res.ok) await loadSettings();
        return res.ok ? { ok: true } : { ok: false, error: res.error };
      }) : Promise.resolve(false),
    refresh,
  };
}

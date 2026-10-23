import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { uniqueChannelName } from "../shared/realtimeChannel";
import { Btn, Press, T, useColors } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";

type PickupPoint = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  updated_at: string;
};

type ShareRow = {
  journey_id: string;
  expires_at: string;
  ended_at: string | null;
};

export function PickupLocationControls({ journeyId }: { journeyId: string }) {
  const colors = useColors();
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const lastUpload = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let current = true;
    void supabase.from("pickup_location_shares")
      .select("expires_at, ended_at")
      .eq("journey_id", journeyId)
      .maybeSingle()
      .then(({ data }) => {
        if (current) setSharing(Boolean(data && !data.ended_at && Date.parse(data.expires_at) > Date.now()));
      });
    return () => { current = false; };
  }, [journeyId]);

  const sendPoint = useCallback(async (point: Location.LocationObject, force = false) => {
    const now = Date.now();
    if (!force && now - lastUpload.current < 10_000) return;
    lastUpload.current = now;
    const { error: uploadError } = await supabase.from("pickup_live_locations").upsert({
      journey_id: journeyId,
      latitude: point.coords.latitude,
      longitude: point.coords.longitude,
      accuracy_m: point.coords.accuracy,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "journey_id" });
    if (uploadError) {
      lastUpload.current = 0;
      setError("Location update failed. Check the connection; the last point may be out of date.");
    } else setError(null);
  }, [journeyId]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Allow foreground location access to share this pickup. Background tracking is not used.");
        setBusy(false);
        return;
      }
      if (!await Location.hasServicesEnabledAsync()) {
        setError("Turn on location services to share this pickup.");
        setBusy(false);
        return;
      }
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { error: startError } = await supabase.rpc("start_pickup_location_share", { target_journey: journeyId });
      if (startError) {
        setError("Pickup location sharing is unavailable. The approved SafeNest location migration must be applied first.");
        setBusy(false);
        return;
      }
      lastUpload.current = 0;
      setSharing(true);
      await sendPoint(initial, true);
    } catch {
      setError("Could not start location sharing. Check the location permission and connection.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    const { error: stopError } = await supabase.rpc("stop_pickup_location_share", { target_journey: journeyId });
    if (stopError) setError("Could not stop sharing. Keep the app open and try again.");
    else { setSharing(false); setError(null); }
    setBusy(false);
  };

  useEffect(() => {
    if (!sharing || !appActive) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
      (point) => { if (active) void sendPoint(point); },
    ).then((next) => {
      if (active) subscription = next;
      else next.remove();
    }).catch(() => setError("Live location updates stopped. Reopen the app to resume sharing."));
    return () => { active = false; subscription?.remove(); };
  }, [sharing, appActive, sendPoint]);

  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <T s={0.72} w={700} c="muted">PICKUP LOCATION</T>
      <T s={0.82} c="muted" lh={1.4}>Share this phone’s location with the child’s family while this pickup is active. Updates run while this screen is open and the app is in the foreground. Sharing expires after 4 hours and stops when the journey ends.</T>
      {sharing ? (
        <Btn kind="o" color={colors.danger} loading={busy} onPress={() => void stop()}>Stop sharing this pickup</Btn>
      ) : (
        <Btn kind="s" loading={busy} onPress={() => void start()}>Share location for this pickup</Btn>
      )}
      {sharing ? <T s={0.8} w={700} c={colors.primaryInk}>Pickup location sharing is on.</T> : null}
      {error ? <T s={0.8} c={colors.danger} lh={1.35}>{error}</T> : null}
    </View>
  );
}

export function PickupLocationViewer({ journeyId, collectorName }: { journeyId: string; collectorName: string }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [share, setShare] = useState<ShareRow | null>(null);
  const [point, setPoint] = useState<PickupPoint | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now());

  const refresh = useCallback(async () => {
    const { data, error: shareError } = await supabase
      .from("pickup_location_shares")
      .select("journey_id, expires_at, ended_at")
      .eq("journey_id", journeyId)
      .maybeSingle();
    if (shareError) { setLoadError(true); return; }
    setLoadError(false);
    const next = data as ShareRow | null;
    setShare(next?.ended_at === null && Date.parse(next.expires_at) > Date.now() ? next : null);
  }, [journeyId]);

  useEffect(() => {
    void refresh();
    const name = uniqueChannelName(`pickup-location-share-${journeyId}`);
    const channel = supabase.channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_location_shares", filter: `journey_id=eq.${journeyId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_live_locations", filter: `journey_id=eq.${journeyId}` }, (payload) => {
        if (payload.eventType === "DELETE") setPoint(null);
        else setPoint(payload.new as PickupPoint);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [journeyId, refresh]);

  useEffect(() => {
    if (!expanded || !share) return;
    let current = true;
    void supabase.from("pickup_live_locations")
      .select("latitude, longitude, accuracy_m, updated_at")
      .eq("journey_id", journeyId)
      .maybeSingle()
      .then(({ data }) => { if (current) setPoint((data as PickupPoint | null) ?? null); });
    return () => { current = false; };
  }, [expanded, journeyId, share]);

  useEffect(() => {
    if (!expanded || !share) return;
    const timer = setInterval(() => setCheckedAt(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [expanded, share]);

  const stale = !point || checkedAt - Date.parse(point.updated_at) > 45_000;
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Press onPress={() => setExpanded((value) => !value)} label={`${expanded ? "Hide" : "View"} ${collectorName}'s pickup location`} state={{ selected: expanded }} style={{ minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primarySoft }}>
        <T s={0.88} w={700} c={colors.primaryInk}>{expanded ? "Hide collector location" : "View collector location"}</T>
        <T s={0.78} w={600} c={colors.primaryInk}>{share && !stale ? "Live" : "Pickup location"}</T>
      </Press>
      {expanded ? loadError ? (
        <T s={0.82} c="muted" lh={1.4}>Pickup location sharing is not available yet. The backend migration must be reviewed and applied.</T>
      ) : !share ? (
        <T s={0.82} c="muted" lh={1.4}>{collectorName} has not started sharing location for this pickup.</T>
      ) : point ? (
        <View style={{ gap: 6 }}>
          <View style={{ height: 220, overflow: "hidden", borderRadius: 14 }}>
            <DeviceLocationMap point={{ latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy_m, title: `${collectorName} · pickup`, detail: `Updated ${new Date(point.updated_at).toLocaleTimeString()}` }} />
          </View>
          <T s={0.78} w={700} c={stale ? colors.warningInk : colors.primaryInk}>
            {stale ? `Last update ${new Date(point.updated_at).toLocaleTimeString()} · may be out of date` : `Updated ${new Date(point.updated_at).toLocaleTimeString()} · ±${Math.round(point.accuracy_m ?? 0)} m`}
          </T>
          <T s={0.76} c="muted">This is the collector’s phone location, not confirmation that the child is with them.</T>
        </View>
      ) : (
        <T s={0.82} c="muted" lh={1.4}>Sharing is on. Waiting for the collector’s first location update…</T>
      ) : null}
    </View>
  );
}

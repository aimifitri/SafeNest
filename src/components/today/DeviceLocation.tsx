import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Linking, Modal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppContext } from "../shared/AppContext";
import { ETA_MODES, estimateForMode, type EtaMode } from "../shared/etaModes";
import { positionIssue, locationIssueMessage, withDeadline } from "../shared/locationQuality";
import { Btn, Glass, Press, T } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { DeviceLocationCoordinate, DeviceLocationPoint } from "./DeviceLocationMap.types";
import { TripSharing } from "./TripSharing";
import { startBrowserLocation } from "./browserLocation";
import { isValidCoord } from "./mapGeo";
import { useSchoolEta } from "./usePhoneGpsEta";

export type LiveLocationUpdate = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

type DeviceLocationModalProps = {
  visible: boolean;
  onClose: () => void;
  schoolName?: string;
  schoolAddress?: string;
  schoolLocation?: DeviceLocationCoordinate | null;
  requireSavedSchoolLocation?: boolean;
  demoPreview?: boolean;
  allowSharing?: boolean;
  /** Where the Today map was looking, so this map continues from the same spot instead of jumping. */
  initialCenter?: DeviceLocationCoordinate | null;
  /** Demo Mode only: the demo scenario's travel time. Shown as "Demo ETA". */
  demoEtaMinutes?: number | null;
  onLocationUpdate?: (update: LiveLocationUpdate) => void;
  onLocationError?: (error: Error) => void;
};

/**
 * Phone GPS: a large, simple view of THIS phone's own location, plus a short "time to school" estimate.
 * It is not navigation. There is no search, no route drawn, no turn-by-turn and no one else on the map.
 */
export function DeviceLocationModal({
  visible,
  onClose,
  schoolName = "the school",
  schoolLocation,
  onLocationUpdate,
  onLocationError,
  requireSavedSchoolLocation = false,
  demoPreview = false,
  allowSharing = true,
  initialCenter = null,
  demoEtaMinutes = null,
}: DeviceLocationModalProps) {
  const { theme, schoolLocation: contextSchoolLocation } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const school = schoolLocation ?? (requireSavedSchoolLocation ? null : contextSchoolLocation);
  const subscription = useRef<LocationSubscription | null>(null);
  const trackingRequestId = useRef(0);
  const starting = useRef(false);
  const callbacks = useRef({ onLocationUpdate, onLocationError });
  callbacks.current = { onLocationUpdate, onLocationError };
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [gpsNow, setGpsNow] = useState(Date.now);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<EtaMode>("recommended");
  const [recenter, setRecenter] = useState(0);
  const [retry, setRetry] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(180);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setReduceMotion(v); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Only a fresh, accurate fix is shown as "your location". A weak or old one is never drawn as current.
  const fresh = location !== null && positionIssue(location, gpsNow) === null;
  const stale = location !== null && positionIssue(location, gpsNow) === "stale_gps";
  const point = useMemo<DeviceLocationPoint | null>(() => fresh && location ? {
    latitude: location.coords.latitude, longitude: location.coords.longitude,
    accuracy: location.coords.accuracy, title: "You", detail: "This phone's location",
  } : null, [fresh, location]);

  const stopTracking = () => {
    starting.current = false;
    trackingRequestId.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
    setBusy(false);
  };

  const reportLocationError = (message: string, reason?: string) => {
    setError(message);
    callbacks.current.onLocationError?.(new Error(reason ? `${message} ${reason}` : message));
  };

  const updateLocation = (next: LocationObject) => {
    const issue = positionIssue(next, Date.now());
    setGpsNow(Date.now());
    if (issue) {
      // Keep listening, but never show this reading as the current position.
      setLocation(null);
      reportLocationError(locationIssueMessage(issue));
      return;
    }
    setError("");
    setLocation(next);
    callbacks.current.onLocationUpdate?.({
      latitude: next.coords.latitude, longitude: next.coords.longitude, accuracy: next.coords.accuracy,
      speed: next.coords.speed, heading: next.coords.heading, timestamp: next.timestamp,
    });
  };

  const startTracking = async () => {
    if (starting.current || tracking) return;
    starting.current = true;
    const requestId = trackingRequestId.current + 1;
    trackingRequestId.current = requestId;
    const isCurrentRequest = () => requestId === trackingRequestId.current && visible;
    setBusy(true);
    setError("");
    setPermissionBlocked(false);
    try {
      if (Platform.OS === "web") {
        const watcher = await startBrowserLocation(updateLocation, (message) => { reportLocationError(message); }, isCurrentRequest);
        if (!isCurrentRequest()) { watcher.remove(); return; }
        subscription.current?.remove();
        subscription.current = watcher;
        setTracking(true);
        return;
      }
      let permission = await Location.getForegroundPermissionsAsync();
      if (!isCurrentRequest()) return;
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!isCurrentRequest()) return;
      if (permission.status !== "granted") {
        setPermissionBlocked(!permission.canAskAgain);
        reportLocationError("Location permission is needed to show this phone on the map.");
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrentRequest()) return;
      if (!servicesEnabled) {
        reportLocationError("Turn on location services on this phone, then try again.");
        return;
      }
      const initial = await withDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!isCurrentRequest()) return;
      updateLocation(initial);
      const next = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
        (update) => { if (isCurrentRequest()) updateLocation(update); },
        (reason) => {
          if (!isCurrentRequest()) return;
          reportLocationError("Live GPS updates stopped because the location signal failed.", reason);
          stopTracking();
        },
      );
      if (!isCurrentRequest()) { next.remove(); return; }
      subscription.current?.remove();
      subscription.current = next;
      setTracking(true);
    } catch (cause) {
      if (!isCurrentRequest()) return;
      const reason = cause instanceof Error ? cause.message : "Unknown location error";
      reportLocationError("Unable to get this phone's location. Check GPS availability and try again.", reason);
    } finally {
      if (isCurrentRequest()) { starting.current = false; setBusy(false); }
    }
  };
  const startRef = useRef(startTracking);
  startRef.current = startTracking;

  // Start when the screen opens. Clean up completely when it closes or unmounts.
  useEffect(() => {
    if (!visible) {
      stopTracking();
      setLocation(null); setError(""); setPermissionBlocked(false); setMode("recommended"); setShareOpen(false);
      return;
    }
    void startRef.current();
    return () => { stopTracking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Foreground only: stop when the app goes to the background, resume when it returns.
  useEffect(() => {
    if (!visible) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") stopTracking();
      else if (state === "active") void startRef.current();
    });
    return () => listener.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Notice a reading that has gone stale because the signal stopped.
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setGpsNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [visible]);

  // ---- ETA (estimate only)
  const demoEta = demoPreview && demoEtaMinutes !== null;
  const schoolEta = useSchoolEta(point, isValidCoord(school) ? school : null, visible && !demoEta, retry);
  const estimate = useMemo(() => {
    if (demoEta) return estimateForMode({ minutes: demoEtaMinutes!, meters: null }, mode);
    if (schoolEta.state === "ready" || (schoolEta.state === "loading" && schoolEta.basis)) return estimateForMode(schoolEta.basis, mode);
    return null;
  }, [demoEta, demoEtaMinutes, schoolEta, mode]);
  const etaLine = (() => {
    if (estimate) return estimate;
    if (schoolEta.state === "no_school") return { headline: "ETA unavailable", note: "Saved school coordinates are unavailable. Add the school location in Settings to see an estimate." };
    if (schoolEta.state === "no_gps") return { headline: "ETA unavailable", note: point ? "Waiting for the route." : "Waiting for this phone's location." };
    if (schoolEta.state === "failed") return { headline: "ETA unavailable", note: "The route service could not be reached." };
    if (mode === "transit") return { headline: "ETA unavailable", note: "No public transport data is available." };
    return { headline: "Calculating...", note: "Finding the time from where you are." };
  })();
  const etaLoading = schoolEta.state === "loading" && !demoEta;

  const closeScreen = () => { stopTracking(); onClose(); };
  const showProblem = !point;
  const problem = error || (stale ? "The last GPS reading is stale. It is not a current live position." : busy ? "" : "Waiting for this phone's location.");

  return (
    <Modal visible={visible} animationType={reduceMotion ? "none" : "fade"} onRequestClose={closeScreen} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.map }}>
        {point ? (
          <DeviceLocationMap mode="me" point={point} initialCenter={initialCenter} initialDelta={0.006} recenterRequest={recenter} reduceMotion={reduceMotion} />
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Press onPress={closeScreen} label="Close Phone GPS" style={{ width: 48, height: 48 }}>
              <Glass style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="close" size={24} color={c.ink} />
              </Glass>
            </Press>
            {point && location ? (
              <Glass radius={14} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                <T s={0.78} w={700}>{tracking ? "Live" : "Paused"}, accuracy {location.coords.accuracy === null ? "unknown" : `${Math.round(location.coords.accuracy)} m`}</T>
              </Glass>
            ) : null}
            <View style={{ width: 48 }} />
          </View>
          {demoPreview ? (
            <Glass radius={14} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <T s={0.76} c="muted" lh={1.3}>Demo Mode. This is your phone's real location. Demo people and times are not used here.</T>
            </Glass>
          ) : null}
        </View>

        {showProblem ? (
          <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: "28%" }}>
            <Glass radius={18} style={{ padding: 16, gap: 10 }}>
              <T w={800}>{busy ? "Finding your location..." : "Your location is not available"}</T>
              {problem ? <T s={0.88} c="muted" lh={1.4}>{problem}</T> : null}
              {!busy ? (
                <View style={{ gap: 8 }}>
                  {permissionBlocked && Platform.OS !== "web" ? <Btn kind="o" onPress={() => void Linking.openSettings()} label="Open phone settings">Open phone settings</Btn> : null}
                  <Btn kind="p" onPress={() => { stopTracking(); void startRef.current(); }} label="Try again">Try again</Btn>
                </View>
              ) : null}
              <T s={0.74} c="muted" lh={1.3}>No placeholder location is shown. Nothing is shared until you choose to.</T>
            </Glass>
          </View>
        ) : null}

        {point ? (
          <View pointerEvents="box-none" style={{ position: "absolute", right: 12, bottom: panelHeight + 12 }}>
            <Press onPress={() => setRecenter((n) => n + 1)} label="Recenter on my location" style={{ width: 48, height: 48 }}>
              <Glass style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color={c.primaryInk} />
              </Glass>
            </Press>
          </View>
        ) : null}

        <View
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%", backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.line, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4, gap: 10 }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }} accessibilityLabel="Vehicle, for the time estimate only">
            {ETA_MODES.map((m) => {
              const on = m.id === mode;
              return (
                <Press key={m.id} onPress={() => setMode(m.id)} label={`${m.label}, for the time estimate`} role="button" state={{ selected: on }}
                  style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: on ? c.primarySoft : "transparent", borderWidth: 1, borderColor: on ? c.primary : c.line }}>
                  <MaterialCommunityIcons name={m.icon as never} size={20} color={on ? c.primaryInk : c.muted} />
                  <T s={0.9} w={on ? 800 : 600} c={on ? c.primaryInk : c.ink}>{m.label}</T>
                </Press>
              );
            })}
          </ScrollView>
          <View style={{ paddingHorizontal: 16, gap: 2 }}>
            <T s={0.76} c="muted">{demoEta ? "Demo ETA to school" : `Estimated time to ${schoolName}`}</T>
            <T s={1.5} w={800} lh={1.15}>{etaLine.headline}</T>
            <T s={0.8} c="muted" lh={1.35}>{etaLine.note}{etaLoading && estimate ? " Updating." : ""}</T>
            {schoolEta.state === "failed" && !demoEta ? (
              <View style={{ alignSelf: "flex-start", marginTop: 4 }}><Btn kind="o" sm onPress={() => setRetry((n) => n + 1)} label="Try the estimate again">Try again</Btn></View>
            ) : null}
          </View>
          {allowSharing ? (
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              <Btn kind="o" sm onPress={() => setShareOpen((v) => !v)} label={shareOpen ? "Hide trip sharing" : "Share my trip"}>{shareOpen ? "Hide trip sharing" : "Share my trip"}</Btn>
              <ScrollView style={{ display: shareOpen ? "flex" : "none", maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                {allowSharing ? <TripSharing
                  visible={visible}
                  hidden={!shareOpen}
                  tracking={tracking}
                  point={tracking && point && location ? { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy } : null}
                /> : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}


// @ts-check
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";

/**
 * @typedef {import("expo-location").LocationObject} LocationObject
 * @typedef {import("expo-location").LocationSubscription} LocationSubscription
 * @typedef {import("react-native-maps").Region} Region
 * @typedef {{
 *   latitude: number;
 *   longitude: number;
 *   accuracy: number | null;
 *   speed: number | null;
 *   heading: number | null;
 *   timestamp: number;
 * }} LocationUpdate
 * @typedef {{
 *   onLocationChange?: (update: LocationUpdate) => void;
 *   onError?: (error: Error) => void;
 * }} LiveLocationMapProps
 */

const h = React.createElement;
const DEFAULT_REGION = {
  latitude: 3.139,
  longitude: 101.6869,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/**
 * Live foreground GPS map. On web, shows location details without loading the native map module.
 * Location updates are local to this screen and are not uploaded to a server.
 *
 * @param {LiveLocationMapProps} props
 * @returns {React.ReactElement}
 */
export default function LiveLocationMap({ onLocationChange, onError } = {}) {
  const subscriptionRef = useRef(/** @type {LocationSubscription | null} */ (null));
  const requestIdRef = useRef(0);
  const callbacksRef = useRef({ onLocationChange, onError });
  callbacksRef.current = { onLocationChange, onError };

  const [location, setLocation] = useState(/** @type {LocationObject | null} */ (null));
  const [region, setRegion] = useState(/** @type {Region} */ (DEFAULT_REGION));
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const stopWatching = useCallback(() => {
    requestIdRef.current += 1;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setStatus((current) => current === "requesting" ? "idle" : "stopped");
  }, []);

  useEffect(() => () => {
    requestIdRef.current += 1;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") stopWatching();
    });
    return () => listener.remove();
  }, [stopWatching]);

  /** @type {(message: string, detail?: string) => void} */
  const reportError = useCallback((message, detail) => {
    const nextError = new Error(detail ? `${message} ${detail}` : message);
    setErrorMessage(message);
    setStatus("error");
    callbacksRef.current.onError?.(nextError);
  }, []);

  /** @type {(nextLocation: LocationObject) => void} */
  const handleLocation = useCallback((nextLocation) => {
    setLocation(nextLocation);
    setRegion({
      latitude: nextLocation.coords.latitude,
      longitude: nextLocation.coords.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
    callbacksRef.current.onLocationChange?.({
      latitude: nextLocation.coords.latitude,
      longitude: nextLocation.coords.longitude,
      accuracy: nextLocation.coords.accuracy,
      speed: nextLocation.coords.speed,
      heading: nextLocation.coords.heading,
      timestamp: nextLocation.timestamp,
    });
  }, []);

  const startWatching = useCallback(async () => {
    if (status === "requesting" || status === "tracking") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestId === requestIdRef.current;
    setStatus("requesting");
    setErrorMessage("");
    setPermissionBlocked(false);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!isCurrentRequest()) return;

      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!isCurrentRequest()) return;

      if (permission.status !== "granted") {
        setPermissionBlocked(!permission.canAskAgain);
        reportError("Location permission is required to show your position.");
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrentRequest()) return;
      if (!servicesEnabled) {
        reportError("Location services are turned off. Enable GPS and try again.");
        return;
      }

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isCurrentRequest()) return;
      handleLocation(initialLocation);

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (nextLocation) => {
          if (isCurrentRequest()) handleLocation(nextLocation);
        },
        (reason) => {
          if (!isCurrentRequest()) return;
          reportError("The GPS signal was lost. Try starting location tracking again.", reason);
          subscriptionRef.current?.remove();
          subscriptionRef.current = null;
        },
      );

      if (!isCurrentRequest()) {
        subscription.remove();
        return;
      }
      subscriptionRef.current?.remove();
      subscriptionRef.current = subscription;
      setStatus("tracking");
    } catch (cause) {
      if (!isCurrentRequest()) return;
      const detail = cause instanceof Error ? cause.message : "Unknown location error.";
      reportError("Unable to get your location. Check GPS availability and try again.", detail);
    } finally {
      if (isCurrentRequest() && subscriptionRef.current === null && status === "requesting") {
        setStatus((current) => current === "requesting" ? "idle" : current);
      }
    }
  }, [handleLocation, reportError, status]);

  const latitude = location?.coords.latitude;
  const longitude = location?.coords.longitude;
  const accuracy = location?.coords.accuracy;
  const updatedAt = location ? new Date(location.timestamp).toLocaleTimeString() : null;
  const maps = Platform.OS === "web" ? null : require("react-native-maps");
  const NativeMapView = maps?.default;
  const Marker = maps?.Marker;

  return h(
    View,
    { style: styles.container },
    h(
      View,
      { style: styles.header },
      h(Text, { style: styles.title }, "Your location"),
      h(Text, { style: styles.subtitle }, status === "tracking" ? "Live GPS tracking" : "Foreground location only"),
    ),
    NativeMapView && Marker && location
      ? h(
        View,
        { style: styles.mapContainer },
        h(
          NativeMapView,
          {
            style: styles.map,
            region,
            showsUserLocation: true,
            showsMyLocationButton: true,
            showsCompass: true,
            accessibilityLabel: "Map centered on your live location",
          },
          h(Marker, {
            coordinate: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            },
            title: "You are here",
            description: accuracy == null ? "Current device location" : `Accuracy about ${Math.round(accuracy)} m`,
          }),
        ),
      )
      : h(
        View,
        { style: styles.mapFallback, accessibilityRole: "summary" },
        h(Text, { style: styles.fallbackTitle }, Platform.OS === "web" ? "Location details" : "Waiting for GPS location"),
        latitude != null && longitude != null
          ? h(Text, { style: styles.coordinates }, `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
          : h(Text, { style: styles.fallbackText }, "Start tracking to display your current coordinates."),
        Platform.OS === "web"
          ? h(Text, { style: styles.fallbackText }, "The interactive map is available in the iOS and Android app.")
          : null,
      ),
    location
      ? h(
        View,
        { style: styles.metrics },
        h(Text, { style: styles.metric }, `Accuracy: ${accuracy == null ? "unknown" : `±${Math.round(accuracy)} m`}`),
        h(Text, { style: styles.metric }, `Latitude: ${latitude?.toFixed(6)}`),
        h(Text, { style: styles.metric }, `Longitude: ${longitude?.toFixed(6)}`),
        h(Text, { style: styles.metric }, `Updated: ${updatedAt}`),
      )
      : null,
    errorMessage
      ? h(
        View,
        { style: styles.errorContainer, accessibilityLiveRegion: "polite" },
        h(Text, { style: styles.errorText }, errorMessage),
        permissionBlocked && Platform.OS !== "web"
          ? h(
            Pressable,
            { onPress: () => void Linking.openSettings(), accessibilityRole: "button", style: styles.settingsButton },
            h(Text, { style: styles.settingsButtonText }, "Open app settings"),
          )
          : null,
      )
      : null,
    h(
      View,
      { style: styles.actions },
      status === "tracking"
        ? h(
          Pressable,
          { onPress: stopWatching, accessibilityRole: "button", style: [styles.button, styles.stopButton] },
          h(Text, { style: styles.buttonText }, "Stop tracking"),
        )
        : h(
          Pressable,
          {
            onPress: () => void startWatching(),
            disabled: status === "requesting",
            accessibilityRole: "button",
            accessibilityState: { disabled: status === "requesting", busy: status === "requesting" },
            style: [styles.button, status === "requesting" ? styles.disabledButton : null],
          },
          status === "requesting"
            ? h(ActivityIndicator, { color: "#FFFFFF" })
            : null,
          h(Text, { style: styles.buttonText }, status === "requesting" ? "Getting location..." : "Use current location"),
        ),
    ),
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#F4F8FB",
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    color: "#17313B",
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: "#526875",
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    minHeight: 280,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#E4EEF0",
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#E4EEF0",
  },
  fallbackTitle: {
    color: "#17313B",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  fallbackText: {
    color: "#526875",
    fontSize: 14,
    textAlign: "center",
  },
  coordinates: {
    color: "#0B5F69",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  metrics: {
    gap: 5,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  metric: {
    color: "#17313B",
    fontSize: 14,
  },
  errorContainer: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FDE7E4",
  },
  errorText: {
    color: "#B3261E",
    fontSize: 14,
  },
  settingsButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  settingsButtonText: {
    color: "#0B5F69",
    fontSize: 14,
    fontWeight: "700",
  },
  actions: {
    gap: 8,
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#0F7D86",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  stopButton: {
    backgroundColor: "#B3261E",
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
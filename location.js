// @ts-check
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";

/**
 * @typedef {import("expo-location").LocationObject} LocationObject
 * @typedef {import("expo-location").LocationSubscription} LocationSubscription
 * @typedef {import("react-native-maps").Region} Region
 * @typedef {{ latitude: number; longitude: number }} Coordinate
 * @typedef {"driving" | "walking" | "transit"} TravelMode
 * @typedef {{
 *   coordinates: Coordinate[];
 *   distanceMeters: number;
 *   durationSeconds: number;
 *   source: "OSRM" | "Estimate";
 *   summary: string;
 * }} PlannedRoute
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
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;
const DEFAULT_REGION = {
  latitude: 3.139,
  longitude: 101.6869,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
/** @type {Array<{ id: TravelMode; label: string; speedMetersPerSecond: number }>} */
const ROUTE_MODES = [
  { id: "driving", label: "Driving", speedMetersPerSecond: 13.9 },
  { id: "walking", label: "Walking", speedMetersPerSecond: 1.4 },
  { id: "transit", label: "Transit", speedMetersPerSecond: 8.3 },
];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/** @param {Coordinate} first @param {Coordinate} second */
function distanceBetween(first, second) {
  const radians = (/** @type {number} */ degrees) => degrees * Math.PI / 180;
  const latDelta = radians(second.latitude - first.latitude);
  const lonDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** @param {number} meters */
function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** @param {number} seconds */
function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

/** @param {number} seconds */
function formatEta(seconds) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** @param {string} query @param {AbortSignal} signal @returns {Promise<Coordinate>} */
async function geocodePlace(query, signal) {
  const address = query.trim();
  if (!address) throw new Error("Enter a location to search.");

  // Native uses the platform geocoder; web uses OpenStreetMap's public geocoder.
  if (Platform.OS !== "web") {
    const results = await Location.geocodeAsync(address);
    const first = results[0];
    if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
      throw new Error(`No location was found for "${address}".`);
    }
    return { latitude: first.latitude, longitude: first.longitude };
  }

  const previousRequest = nominatimQueue;
  /** @type {() => void} */
  let releaseRequest = () => {};
  nominatimQueue = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  await previousRequest;
  try {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (signal.aborted) throw new Error("Place search was cancelled.");
    lastNominatimRequestAt = Date.now();

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Place search failed (HTTP ${response.status}).`);
    const payload = await response.json();
    if (!Array.isArray(payload) || !isRecord(payload[0])) {
      throw new Error(`No location was found for "${address}".`);
    }
    const latitude = Number(payload[0].lat);
    const longitude = Number(payload[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Place search returned invalid coordinates.");
    }
    return { latitude, longitude };
  } finally {
    releaseRequest();
  }
}

/**
 * @param {Coordinate} origin
 * @param {Coordinate} destination
 * @param {TravelMode} mode
 * @param {AbortSignal} signal
 * @returns {Promise<PlannedRoute>}
 */
async function getPlannedRoute(origin, destination, mode, signal) {
  if (mode !== "driving") {
    // The public OSRM endpoint offers driving only; avoid presenting a car route as transit/walking.
    const directDistance = distanceBetween(origin, destination);
    const estimatedRoadFactor = mode === "transit" ? 1.25 : 1.15;
    const distanceMeters = directDistance * estimatedRoadFactor;
    const selectedMode = ROUTE_MODES.find((item) => item.id === mode);
    return {
      coordinates: [origin, destination],
      distanceMeters,
      durationSeconds: distanceMeters / (selectedMode?.speedMetersPerSecond ?? 1.4),
      source: "Estimate",
      summary: mode === "walking" ? "Approximate walking path" : "Approximate transit journey",
    };
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Driving route request failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (!isRecord(payload) || payload.code !== "Ok" || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) {
    const reason = isRecord(payload) && typeof payload.message === "string" ? payload.message : "No drivable route was found.";
    throw new Error(reason);
  }

  const rawRoute = payload.routes[0];
  const geometry = isRecord(rawRoute.geometry) ? rawRoute.geometry.coordinates : null;
  if (!Array.isArray(geometry) || typeof rawRoute.distance !== "number" || typeof rawRoute.duration !== "number") {
    throw new Error("The routing service returned an incomplete route.");
  }
  const coordinates = geometry.map((pair) => {
    if (!Array.isArray(pair) || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
      throw new Error("The routing service returned invalid route coordinates.");
    }
    return { longitude: pair[0], latitude: pair[1] };
  });
  if (coordinates.length < 2) throw new Error("The routing service returned no route geometry.");

  /** @type {string[]} */
  const roadNames = [];
  if (Array.isArray(rawRoute.legs)) {
    for (const leg of rawRoute.legs) {
      if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
      for (const step of leg.steps) {
        if (isRecord(step) && typeof step.name === "string" && step.name.trim()) roadNames.push(step.name.trim());
      }
    }
  }
  return {
    coordinates,
    distanceMeters: rawRoute.distance,
    durationSeconds: rawRoute.duration,
    source: "OSRM",
    summary: [...new Set(roadNames)].slice(0, 3).join(" · ") || "Suggested driving route",
  };
}

/**
 * @typedef {{
 *   fitToCoordinates: (coordinates: Coordinate[], options: { edgePadding: { top: number; right: number; bottom: number; left: number }; animated: boolean }) => void;
 *   animateToRegion: (region: Region, duration?: number) => void;
 * }} MapHandle
 */

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
  const routeRequestRef = useRef(0);
  const routeAbortRef = useRef(/** @type {AbortController | null} */ (null));
  const locationRef = useRef(/** @type {LocationObject | null} */ (null));
  const useCurrentOriginRef = useRef(true);
  const mapRef = useRef(/** @type {MapHandle | null} */ (null));
  const callbacksRef = useRef({ onLocationChange, onError });
  callbacksRef.current = { onLocationChange, onError };

  const [location, setLocation] = useState(/** @type {LocationObject | null} */ (null));
  const [region, setRegion] = useState(/** @type {Region} */ (DEFAULT_REGION));
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [originText, setOriginText] = useState("Current Location");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState(/** @type {Coordinate | null} */ (null));
  const [destination, setDestination] = useState(/** @type {Coordinate | null} */ (null));
  const [travelMode, setTravelMode] = useState(/** @type {TravelMode} */ ("driving"));
  const [route, setRoute] = useState(/** @type {PlannedRoute | null} */ (null));
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

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
    routeRequestRef.current += 1;
    routeAbortRef.current?.abort();
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
    locationRef.current = nextLocation;
    setLocation(nextLocation);
    const nextRegion = {
      latitude: nextLocation.coords.latitude,
      longitude: nextLocation.coords.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setRegion(nextRegion);
    if (useCurrentOriginRef.current) {
      const currentCoordinate = {
        latitude: nextLocation.coords.latitude,
        longitude: nextLocation.coords.longitude,
      };
      setOrigin(currentCoordinate);
      mapRef.current?.animateToRegion(nextRegion, 350);
    }
    callbacksRef.current.onLocationChange?.({
      latitude: nextLocation.coords.latitude,
      longitude: nextLocation.coords.longitude,
      accuracy: nextLocation.coords.accuracy,
      speed: nextLocation.coords.speed,
      heading: nextLocation.coords.heading,
      timestamp: nextLocation.timestamp,
    });
  }, []);

  /** @returns {Promise<Coordinate | null>} */
  const startWatching = useCallback(async () => {
    if (status === "tracking" || status === "requesting") {
      const current = locationRef.current;
      return current
        ? { latitude: current.coords.latitude, longitude: current.coords.longitude }
        : null;
    }

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
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrentRequest()) return;
      if (!servicesEnabled) {
        reportError("Location services are turned off. Enable GPS and try again.");
        return null;
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
      return {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
      };
    } catch (cause) {
      if (!isCurrentRequest()) return;
      const detail = cause instanceof Error ? cause.message : "Unknown location error.";
      reportError("Unable to get your location. Check GPS availability and try again.", detail);
      return null;
    } finally {
      if (isCurrentRequest() && subscriptionRef.current === null && status === "requesting") {
        setStatus((current) => current === "requesting" ? "idle" : current);
      }
    }
  }, [handleLocation, reportError, status]);

  const calculateRoute = useCallback(async (
    /** @type {Coordinate} */ start,
    /** @type {Coordinate} */ end,
    /** @type {TravelMode} */ mode,
  ) => {
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRouteLoading(true);
    setRouteError("");
    try {
      const nextRoute = await getPlannedRoute(start, end, mode, controller.signal);
      if (requestId !== routeRequestRef.current) return;
      setRoute(nextRoute);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      const message = cause instanceof Error ? cause.message : "Unable to calculate the route.";
      setRouteError(message);
      callbacksRef.current.onError?.(cause instanceof Error ? cause : new Error(message));
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false);
    }
  }, []);

  const invalidateRoute = useCallback(() => {
    routeAbortRef.current?.abort();
    routeRequestRef.current += 1;
    setRouteLoading(false);
  }, []);

  const findRoute = useCallback(async () => {
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRouteLoading(true);
    setRouteError("");
    setErrorMessage("");
    setRoute(null);
    try {
      /** @type {Coordinate} */
      let start;
      if (originText.trim().toLowerCase() === "current location") {
        useCurrentOriginRef.current = true;
        const currentFix = await startWatching();
        if (!currentFix) throw new Error("Allow location access to use your current position as the starting point.");
        start = currentFix;
      } else {
        useCurrentOriginRef.current = false;
        start = await geocodePlace(originText, controller.signal);
      }
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      const end = await geocodePlace(destinationText, controller.signal);
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;

      setOrigin(start);
      setDestination(end);
      await calculateRoute(start, end, travelMode);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      const message = cause instanceof Error ? cause.message : "Unable to find these locations.";
      setRouteError(message);
      setRouteLoading(false);
      callbacksRef.current.onError?.(cause instanceof Error ? cause : new Error(message));
    }
  }, [calculateRoute, destinationText, originText, startWatching, travelMode]);

  useEffect(() => {
    if (Platform.OS === "web" || !mapRef.current) return;
    if (route?.coordinates.length) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 56, right: 40, bottom: 56, left: 40 },
        animated: true,
      });
      return;
    }
    if (origin && destination) {
      mapRef.current.fitToCoordinates([origin, destination], {
        edgePadding: { top: 56, right: 40, bottom: 56, left: 40 },
        animated: true,
      });
      return;
    }
    if (origin) {
      mapRef.current.animateToRegion({
        ...origin,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }, 350);
    }
  }, [destination, origin, route]);

  const latitude = location?.coords.latitude;
  const longitude = location?.coords.longitude;
  const accuracy = location?.coords.accuracy;
  const updatedAt = location ? new Date(location.timestamp).toLocaleTimeString() : null;
  const maps = Platform.OS === "web" ? null : require("react-native-maps");
  const NativeMapView = maps?.default;
  const Marker = maps?.Marker;
  const Polyline = maps?.Polyline;
  const selectedMode = ROUTE_MODES.find((item) => item.id === travelMode);
  const isUsingCurrentLocation = originText.trim().toLowerCase() === "current location";

  return h(
    ScrollView,
    {
      style: styles.scrollView,
      contentContainerStyle: styles.container,
      keyboardShouldPersistTaps: "handled",
    },
    h(
      View,
      { style: styles.header },
      h(Text, { style: styles.title }, "Plan your route"),
      h(Text, { style: styles.subtitle }, status === "tracking" ? "Live GPS tracking is on" : "Search places or use your current location"),
    ),
    h(
      View,
      { style: styles.searchCard },
      h(Text, { style: styles.fieldLabel }, "Starting point"),
      h(TextInput, {
        value: originText,
        onChangeText: (value) => {
          invalidateRoute();
          setOriginText(value);
          useCurrentOriginRef.current = value.trim().toLowerCase() === "current location";
          setOrigin(null);
          setRoute(null);
        },
        placeholder: "Current Location or enter a place",
        placeholderTextColor: "#83949C",
        accessibilityLabel: "Starting point",
        returnKeyType: "next",
        style: styles.input,
      }),
      h(
        View,
        { style: styles.swapRow },
        h(Text, { style: styles.fieldLabel }, "Destination"),
        h(
          Pressable,
          {
            onPress: () => {
              invalidateRoute();
              const oldOrigin = originText;
              const oldDestination = destinationText;
              setOriginText(oldDestination);
              setDestinationText(oldOrigin);
              useCurrentOriginRef.current = oldDestination.trim().toLowerCase() === "current location";
              setOrigin(destination);
              setDestination(origin);
              setRoute(null);
            },
            accessibilityRole: "button",
            accessibilityLabel: "Swap starting point and destination",
            style: styles.swapButton,
          },
          h(Text, { style: styles.swapText }, "Swap"),
        ),
      ),
      h(TextInput, {
        value: destinationText,
        onChangeText: (value) => {
          invalidateRoute();
          setDestinationText(value);
          setDestination(null);
          setRoute(null);
        },
        placeholder: "Enter a destination, e.g. UiTM Jasin",
        placeholderTextColor: "#83949C",
        accessibilityLabel: "Destination",
        returnKeyType: "search",
        onSubmitEditing: () => void findRoute(),
        style: styles.input,
      }),
      h(Text, { style: styles.fieldLabel }, "Travel mode"),
      h(
        View,
        { style: styles.modeRow },
        ...ROUTE_MODES.map((item) => h(
          Pressable,
          {
            key: item.id,
            onPress: () => {
              setTravelMode(item.id);
              if (origin && destination) void calculateRoute(origin, destination, item.id);
            },
            accessibilityRole: "button",
            accessibilityState: { selected: travelMode === item.id },
            style: [styles.modeButton, travelMode === item.id ? styles.modeButtonSelected : null],
          },
          h(Text, { style: [styles.modeText, travelMode === item.id ? styles.modeTextSelected : null] }, item.label),
        )),
      ),
      h(
        Pressable,
        {
          onPress: () => void findRoute(),
          disabled: routeLoading || !destinationText.trim(),
          accessibilityRole: "button",
          accessibilityState: { disabled: routeLoading || !destinationText.trim(), busy: routeLoading },
          style: [styles.button, routeLoading || !destinationText.trim() ? styles.disabledButton : null],
        },
        routeLoading ? h(ActivityIndicator, { color: "#FFFFFF" }) : null,
        h(Text, { style: styles.buttonText }, routeLoading ? "Finding route..." : "Find route"),
      ),
      isUsingCurrentLocation
        ? h(
          Pressable,
          {
            onPress: () => {
              useCurrentOriginRef.current = true;
              setOriginText("Current Location");
              void startWatching();
            },
            disabled: status === "requesting" || status === "tracking",
            accessibilityRole: "button",
            style: styles.currentLocationButton,
          },
          h(Text, { style: styles.currentLocationText }, status === "tracking" ? "Current location is updating" : "Use current location"),
        )
        : null,
    ),
    NativeMapView && Marker
      ? h(
        View,
        { style: styles.mapContainer },
        h(
          NativeMapView,
          /** @type {React.ComponentProps<typeof NativeMapView> & { ref: React.Ref<MapHandle> }} */ ({
            ref: mapRef,
            style: styles.map,
            initialRegion: region,
            showsUserLocation: true,
            showsMyLocationButton: true,
            showsCompass: true,
            accessibilityLabel: "Map showing the route between the selected locations",
          }),
          origin ? h(Marker, { coordinate: origin, title: isUsingCurrentLocation ? "Current location" : "Starting point" }) : null,
          destination ? h(Marker, { coordinate: destination, title: "Destination" }) : null,
          route && Polyline
            ? h(Polyline, {
              coordinates: route.coordinates,
              strokeColor: "#0F7D86",
              strokeWidth: 5,
              lineCap: "round",
              lineJoin: "round",
            })
            : null,
        ),
      )
      : h(
        View,
        { style: styles.mapFallback, accessibilityRole: "summary" },
        h(Text, { style: styles.fallbackTitle }, Platform.OS === "web" ? "Map preview unavailable on web" : "Waiting for GPS location"),
        route
          ? h(Text, { style: styles.coordinates }, `${route.summary} · ${formatDistance(route.distanceMeters)}`)
          : origin && destination
            ? h(Text, { style: styles.coordinates }, `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)} → ${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}`)
            : h(Text, { style: styles.fallbackText }, "Your route map and location markers will appear here."),
        Platform.OS === "web"
          ? h(Text, { style: styles.fallbackText }, "Place search and route estimates work here; the interactive map is available in the iOS and Android app.")
          : null,
      ),
    route
      ? h(
        View,
        { style: styles.routeCard },
        h(
          View,
          { style: styles.routeStats },
          h(View, null,
            h(Text, { style: styles.routePrimary }, formatDuration(route.durationSeconds)),
            h(Text, { style: styles.routeSecondary }, formatDistance(route.distanceMeters)),
          ),
          h(View, { style: styles.etaContainer },
            h(Text, { style: styles.routeSecondary }, "ETA"),
            h(Text, { style: styles.etaText }, formatEta(route.durationSeconds)),
          ),
        ),
        h(Text, { style: styles.routeSummary }, route.summary),
        h(Text, { style: styles.routeNote }, route.source === "OSRM"
          ? "Suggested driving route · OSRM public routing · no live traffic or toll data"
          : `${selectedMode?.label ?? "Route"} estimate only; no live path provider is connected for this mode.`),
        h(Text, { style: styles.routeNote }, "Place search uses device geocoding, or © OpenStreetMap contributors on web."),
      )
      : null,
    routeError
      ? h(View, { style: styles.errorContainer, accessibilityLiveRegion: "polite" }, h(Text, { style: styles.errorText }, routeError))
      : null,
    location
      ? h(
        View,
        { style: styles.metrics },
        h(Text, { style: styles.metric }, `GPS accuracy: ${accuracy == null ? "unknown" : `±${Math.round(accuracy)} m`}`),
        h(Text, { style: styles.metric }, `Current coordinates: ${latitude?.toFixed(6)}, ${longitude?.toFixed(6)}`),
        h(Text, { style: styles.metric }, `Last update: ${updatedAt}`),
        h(Text, { style: styles.metric }, `Tracking status: ${status === "tracking" ? "Active" : "Stopped"}`),
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
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    width: "100%",
    backgroundColor: "#F4F8FB",
    padding: 16,
    gap: 12,
    paddingBottom: 32,
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
  searchCard: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  fieldLabel: {
    color: "#17313B",
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D5E0E4",
    borderRadius: 10,
    color: "#17313B",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
  },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swapButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swapText: {
    color: "#0B5F69",
    fontSize: 13,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#D5E0E4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  modeButtonSelected: {
    borderColor: "#0F7D86",
    backgroundColor: "#E8F5F5",
  },
  modeText: {
    color: "#526875",
    fontSize: 12,
    fontWeight: "600",
  },
  modeTextSelected: {
    color: "#0B5F69",
  },
  currentLocationButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  currentLocationText: {
    color: "#0B5F69",
    fontSize: 14,
    fontWeight: "700",
  },
  mapContainer: {
    height: 320,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#E4EEF0",
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    minHeight: 260,
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
  routeCard: {
    gap: 9,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  routeStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routePrimary: {
    color: "#17313B",
    fontSize: 21,
    fontWeight: "700",
  },
  routeSecondary: {
    color: "#526875",
    fontSize: 14,
  },
  etaContainer: {
    alignItems: "flex-end",
  },
  etaText: {
    color: "#0B5F69",
    fontSize: 17,
    fontWeight: "700",
  },
  routeSummary: {
    color: "#17313B",
    fontSize: 15,
    fontWeight: "600",
  },
  routeNote: {
    color: "#526875",
    fontSize: 12,
    lineHeight: 17,
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
// @ts-check
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
 *   atDistanceMeters: number;
 *   distanceMeters: number;
 *   instruction: string;
 *   streetName: string;
 *   icon: string;
 *   isArrival: boolean;
 * }} ManeuverStep
 * @typedef {{
 *   coordinates: Coordinate[];
 *   cumulativeDistances: number[];
 *   distanceMeters: number;
 *   durationSeconds: number;
 *   steps: ManeuverStep[];
 *   mode: TravelMode;
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
 * @typedef {{
 *   fitToCoordinates: (coordinates: Coordinate[], options: {
 *     edgePadding: { top: number; right: number; bottom: number; left: number };
 *     animated: boolean;
 *   }) => void;
 *   animateToRegion: (region: Region, duration?: number) => void;
 *   animateCamera: (camera: {
 *     center: Coordinate;
 *     pitch: number;
 *     heading: number;
 *     zoom: number;
 *   }, options?: { duration?: number }) => void;
 * }} MapHandle
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
const TRAVEL_MODES = [
  { id: "driving", label: "Drive", speedMetersPerSecond: 13.9 },
  { id: "walking", label: "Walk", speedMetersPerSecond: 1.4 },
  { id: "transit", label: "Transit", speedMetersPerSecond: 8.3 },
];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/** @param {number} meters */
function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

/** @param {number} seconds */
function formatDuration(seconds) {
  if (seconds <= 0) return "0 min";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours} hr ${totalMinutes % 60} min`
    : `${totalMinutes} min`;
}

/** @param {number} seconds */
function formatEta(seconds) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** @param {Coordinate} first @param {Coordinate} second */
function distanceBetween(first, second) {
  const toRadians = (/** @type {number} */ degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const term = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(first.latitude))
    * Math.cos(toRadians(second.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
}

/** @param {Coordinate} first @param {Coordinate} second */
function bearingBetween(first, second) {
  const toRadians = (/** @type {number} */ degrees) => degrees * Math.PI / 180;
  const toDegrees = (/** @type {number} */ radians) => radians * 180 / Math.PI;
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
    - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * @param {string} maneuverType
 * @param {string} modifier
 * @returns {{ instruction: string; icon: string }}
 */
function describeManeuver(maneuverType, modifier) {
  const direction = modifier.replace(/_/g, " ");
  if (maneuverType === "arrive") return { instruction: "Arrive at your destination", icon: "◎" };
  if (maneuverType === "roundabout" || maneuverType === "rotary") {
    return { instruction: `Enter the roundabout${direction ? `, ${direction}` : ""}`, icon: "⟳" };
  }
  if (maneuverType === "uturn") return { instruction: "Make a U-turn", icon: "↶" };
  if (maneuverType === "turn" || maneuverType === "end of road" || maneuverType === "fork") {
    const turn = direction ? direction.charAt(0).toUpperCase() + direction.slice(1) : "ahead";
    const verb = maneuverType === "fork" ? "Keep" : "Turn";
    const icon = direction.includes("left") ? "↰" : direction.includes("right") ? "↱" : "↑";
    return { instruction: `${verb} ${turn}`, icon };
  }
  if (maneuverType === "merge") return { instruction: "Merge onto the road", icon: "↗" };
  if (maneuverType === "on ramp" || maneuverType === "off ramp") {
    return { instruction: maneuverType === "on ramp" ? "Take the ramp" : "Exit the ramp", icon: "↗" };
  }
  return { instruction: "Continue straight", icon: "↑" };
}

/** @param {number} meters */
function formatManeuverDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 100) return `${Math.round(meters / 50) * 50} m`;
  return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}

/** @param {PlannedRoute} route @param {Coordinate} position */
function getRouteProgress(route, position) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  route.coordinates.forEach((coordinate, index) => {
    const distance = distanceBetween(position, coordinate);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return Math.min(
    route.distanceMeters,
    route.cumulativeDistances[closestIndex] ?? 0,
  );
}

/**
 * Uses Expo's native place geocoder. Web uses the OpenStreetMap search endpoint
 * because Expo Location's native geocoder is not available in browsers.
 * @param {string} place
 * @param {AbortSignal} signal
 * @returns {Promise<Coordinate>}
 */
async function geocodePlace(place, signal) {
  const query = place.trim();
  if (!query) throw new Error("Enter a destination to search.");

  if (Platform.OS !== "web") {
    const matches = await Location.geocodeAsync(query);
    const match = matches[0];
    if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
      throw new Error(`No place was found for "${query}". Try adding a city or region.`);
    }
    return { latitude: match.latitude, longitude: match.longitude };
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

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Place search failed (HTTP ${response.status}).`);
    const result = await response.json();
    if (!Array.isArray(result) || !isRecord(result[0])) {
      throw new Error(`No place was found for "${query}". Try adding a city or region.`);
    }

    const latitude = Number(result[0].lat);
    const longitude = Number(result[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Place search returned invalid coordinates.");
    }
    return { latitude, longitude };
  } finally {
    releaseRequest();
  }
}

/**
 * Gets a driving route from OSRM or a clearly marked non-driving estimate.
 * @param {Coordinate} origin
 * @param {Coordinate} destination
 * @param {TravelMode} mode
 * @param {AbortSignal} signal
 * @returns {Promise<PlannedRoute>}
 */
async function getPlannedRoute(origin, destination, mode, signal) {
  if (mode !== "driving") {
    const directDistance = distanceBetween(origin, destination);
    const distanceMeters = directDistance * (mode === "walking" ? 1.15 : 1.25);
    const modeInfo = TRAVEL_MODES.find((item) => item.id === mode);
    return {
      coordinates: [origin, destination],
      distanceMeters,
      durationSeconds: distanceMeters / (modeInfo?.speedMetersPerSecond ?? 1.4),
      cumulativeDistances: [0, distanceMeters],
      steps: [],
      mode,
      source: "Estimate",
      summary: mode === "walking" ? "Approximate walking connection" : "Approximate transit journey",
    };
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Route request failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (
    !isRecord(payload)
    || payload.code !== "Ok"
    || !Array.isArray(payload.routes)
    || !isRecord(payload.routes[0])
  ) {
    const detail = isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : "No driving route was found.";
    throw new Error(detail);
  }

  const rawRoute = payload.routes[0];
  const geometry = isRecord(rawRoute.geometry) ? rawRoute.geometry.coordinates : null;
  if (
    !Array.isArray(geometry)
    || typeof rawRoute.distance !== "number"
    || typeof rawRoute.duration !== "number"
  ) {
    throw new Error("The routing service returned an incomplete route.");
  }

  const coordinates = geometry.map((pair) => {
    if (
      !Array.isArray(pair)
      || typeof pair[0] !== "number"
      || typeof pair[1] !== "number"
    ) {
      throw new Error("The routing service returned invalid route geometry.");
    }
    return { longitude: pair[0], latitude: pair[1] };
  });
  if (coordinates.length < 2) throw new Error("The routing service returned no route geometry.");

  /** @type {number[]} */
  const cumulativeDistances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distanceBetween(coordinates[index - 1], coordinates[index]),
    );
  }

  /** @type {string[]} */
  const roadNames = [];
  /** @type {ManeuverStep[]} */
  const steps = [];
  let stepDistance = 0;
  if (Array.isArray(rawRoute.legs)) {
    for (const leg of rawRoute.legs) {
      if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
      for (const step of leg.steps) {
        if (!isRecord(step)) continue;
        const name = typeof step.name === "string" ? step.name.trim() : "";
        if (name) roadNames.push(name);
        if (!isRecord(step.maneuver)) continue;
        const maneuverType = typeof step.maneuver.type === "string" ? step.maneuver.type : "continue";
        const modifier = typeof step.maneuver.modifier === "string" ? step.maneuver.modifier : "";
        const description = describeManeuver(maneuverType, modifier);
        steps.push({
          atDistanceMeters: stepDistance,
          distanceMeters: typeof step.distance === "number" ? step.distance : 0,
          instruction: description.instruction,
          streetName: name || "the road",
          icon: description.icon,
          isArrival: maneuverType === "arrive",
        });
        if (typeof step.distance === "number") stepDistance += step.distance;
      }
    }
  }

  return {
    coordinates,
    cumulativeDistances,
    distanceMeters: rawRoute.distance,
    durationSeconds: rawRoute.duration,
    steps,
    mode,
    source: "OSRM",
    summary: [...new Set(roadNames)].slice(0, 3).join(" · ") || "Suggested driving route",
  };
}

/**
 * A compact route planner with foreground GPS tracking. Location updates stay
 * on-device unless the parent explicitly handles the onLocationChange callback.
 * @param {LiveLocationMapProps} props
 * @returns {React.ReactElement}
 */
export default function LiveLocationMap({ onLocationChange, onError } = {}) {
  const subscriptionRef = useRef(/** @type {LocationSubscription | null} */ (null));
  const locationRef = useRef(/** @type {LocationObject | null} */ (null));
  const locationRequestRef = useRef(0);
  const locationPromiseRef = useRef(/** @type {Promise<Coordinate | null> | null} */ (null));
  const routeRequestRef = useRef(0);
  const routeAbortRef = useRef(/** @type {AbortController | null} */ (null));
  const mapRef = useRef(/** @type {MapHandle | null} */ (null));
  const centeredOnLocationRef = useRef(false);
  const navigationActiveRef = useRef(false);
  const previousNavigationPositionRef = useRef(/** @type {Coordinate | null} */ (null));
  const navigationHeadingRef = useRef(0);
  const callbacksRef = useRef({ onLocationChange, onError });
  callbacksRef.current = { onLocationChange, onError };

  const [location, setLocation] = useState(/** @type {LocationObject | null} */ (null));
  const [originText, setOriginText] = useState("Current location");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState(/** @type {Coordinate | null} */ (null));
  const [destination, setDestination] = useState(/** @type {Coordinate | null} */ (null));
  const [route, setRoute] = useState(/** @type {PlannedRoute | null} */ (null));
  const [travelMode, setTravelMode] = useState(/** @type {TravelMode} */ ("driving"));
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState(0);
  const [navigationSpeed, setNavigationSpeed] = useState(/** @type {number | null} */ (null));
  const [locationStatus, setLocationStatus] = useState("requesting");
  const [locationError, setLocationError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);

  /** @type {(nextLocation: LocationObject) => void} */
  const handleLocation = useCallback((nextLocation) => {
    locationRef.current = nextLocation;
    setLocation(nextLocation);
    setNavigationSpeed(nextLocation.coords.speed);
    const currentCoordinate = {
      latitude: nextLocation.coords.latitude,
      longitude: nextLocation.coords.longitude,
    };
    const previousCoordinate = previousNavigationPositionRef.current;
    if (typeof nextLocation.coords.heading === "number" && nextLocation.coords.heading >= 0) {
      navigationHeadingRef.current = nextLocation.coords.heading;
    } else if (previousCoordinate && distanceBetween(previousCoordinate, currentCoordinate) > 2) {
      navigationHeadingRef.current = bearingBetween(previousCoordinate, currentCoordinate);
    }
    previousNavigationPositionRef.current = currentCoordinate;

    if (navigationActiveRef.current) {
      mapRef.current?.animateCamera({
        center: currentCoordinate,
        pitch: 45,
        heading: navigationHeadingRef.current,
        zoom: 17,
      }, { duration: 800 });
    }

    if (originTextRef.current) {
      setOrigin(currentCoordinate);
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

  const originTextRef = useRef(true);
  originTextRef.current = originText.trim().toLowerCase() === "current location";

  /** @type {(message: string, detail?: string) => void} */
  const reportLocationError = useCallback((message, detail) => {
    const error = new Error(detail ? `${message} ${detail}` : message);
    setLocationError(message);
    setLocationStatus("error");
    callbacksRef.current.onError?.(error);
  }, []);

  const startWatching = useCallback(() => {
    if (locationStatus === "tracking") {
      const current = locationRef.current;
      return Promise.resolve(current
        ? { latitude: current.coords.latitude, longitude: current.coords.longitude }
        : null);
    }
    if (locationPromiseRef.current) return locationPromiseRef.current;

    const requestId = locationRequestRef.current + 1;
    locationRequestRef.current = requestId;
    const isCurrentRequest = () => requestId === locationRequestRef.current;
    setLocationStatus("requesting");
    setLocationError("");
    setPermissionBlocked(false);

    const request = (async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!isCurrentRequest()) return null;
        if (permission.status !== "granted") {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!isCurrentRequest()) return null;
        if (permission.status !== "granted") {
          setPermissionBlocked(!permission.canAskAgain);
          reportLocationError("Allow location access to show your live position.");
          return null;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!isCurrentRequest()) return null;
        if (!servicesEnabled) {
          reportLocationError("Location services are off. Turn on GPS and try again.");
          return null;
        }

        const firstFix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isCurrentRequest()) return null;
        handleLocation(firstFix);

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
            reportLocationError(
              "The GPS signal was lost. Try refreshing your location.",
              reason,
            );
            subscriptionRef.current?.remove();
            subscriptionRef.current = null;
          },
        );

        if (!isCurrentRequest()) {
          subscription.remove();
          return null;
        }
        subscriptionRef.current?.remove();
        subscriptionRef.current = subscription;
        setLocationStatus("tracking");
        return {
          latitude: firstFix.coords.latitude,
          longitude: firstFix.coords.longitude,
        };
      } catch (cause) {
        if (!isCurrentRequest()) return null;
        const detail = cause instanceof Error ? cause.message : "Unknown location error.";
        reportLocationError("Unable to get your location. Check GPS availability.", detail);
        return null;
      }
    })();
    locationPromiseRef.current = request;
    void request.finally(() => {
      if (locationPromiseRef.current === request) locationPromiseRef.current = null;
    });
    return request;
  }, [handleLocation, locationStatus, reportLocationError]);

  const stopWatching = useCallback(() => {
    locationRequestRef.current += 1;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setLocationStatus("stopped");
  }, []);

  useEffect(() => {
    void startWatching();
    return () => {
      locationRequestRef.current += 1;
      routeRequestRef.current += 1;
      routeAbortRef.current?.abort();
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !location || !mapRef.current || centeredOnLocationRef.current) return;
    centeredOnLocationRef.current = true;
    mapRef.current.animateToRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    }, 350);
  }, [location]);

  useEffect(() => {
    if (Platform.OS === "web" || !mapRef.current || !route) return;
    if (navigationActive) return;
    mapRef.current.fitToCoordinates(route.coordinates, {
      edgePadding: { top: 44, right: 36, bottom: 44, left: 36 },
      animated: true,
    });
  }, [navigationActive, route]);

  useEffect(() => {
    if (!navigationActive || !route || !location) return;
    const progress = getRouteProgress(route, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    setNavigationProgress((current) => Math.max(current, progress));
  }, [location, navigationActive, route]);

  useEffect(() => {
    if (!navigationActive || Platform.OS === "web" || !location || !mapRef.current) return;
    mapRef.current.animateCamera({
      center: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      pitch: 45,
      heading: navigationHeadingRef.current,
      zoom: 17,
    }, { duration: 700 });
  }, [location, navigationActive]);

  /** @param {TravelMode} [requestedMode] */
  const findRoute = useCallback(async (requestedMode = travelMode) => {
    if (!destinationText.trim()) {
      setRouteError("Enter a destination to plan your route.");
      return;
    }

    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRouteLoading(true);
    setRoute(null);
    setRouteError("");

    try {
      let start;
      if (originText.trim().toLowerCase() === "current location") {
        start = await startWatching();
        if (!start) throw new Error("Your current location is unavailable. Check location permission and try again.");
      } else {
        start = await geocodePlace(originText, controller.signal);
      }
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;

      const end = await geocodePlace(destinationText, controller.signal);
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;

      setOrigin(start);
      setDestination(end);
      const plannedRoute = await getPlannedRoute(start, end, requestedMode, controller.signal);
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      setRoute(plannedRoute);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      const message = cause instanceof Error ? cause.message : "Unable to plan this route.";
      setRouteError(message);
      callbacksRef.current.onError?.(cause instanceof Error ? cause : new Error(message));
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false);
    }
  }, [destinationText, originText, startWatching, travelMode]);

  const invalidateRoute = useCallback(() => {
    routeAbortRef.current?.abort();
    routeRequestRef.current += 1;
    setRoute(null);
    setRouteError("");
    setRouteLoading(false);
    setNavigationProgress(0);
  }, []);

  const startNavigation = useCallback(async () => {
    if (!route || route.source !== "OSRM" || route.mode !== "driving") {
      setRouteError("Turn-by-turn navigation is available for planned driving routes only.");
      return;
    }
    if (originText.trim().toLowerCase() !== "current location") {
      setRouteError("Set the starting point to Current location to begin live navigation.");
      return;
    }
    const currentFix = await startWatching();
    if (!currentFix) {
      setRouteError("Live navigation needs location access. Enable GPS and try again.");
      return;
    }
    previousNavigationPositionRef.current = currentFix;
    const heading = locationRef.current?.coords.heading;
    if (typeof heading === "number" && heading >= 0) navigationHeadingRef.current = heading;
    setNavigationProgress(getRouteProgress(route, currentFix));
    navigationActiveRef.current = true;
    setNavigationActive(true);
    setRouteError("");
    mapRef.current?.animateCamera({
      center: currentFix,
      pitch: 45,
      heading: navigationHeadingRef.current,
      zoom: 17,
    }, { duration: 700 });
  }, [originText, route, startWatching]);

  const exitNavigation = useCallback(() => {
    navigationActiveRef.current = false;
    setNavigationActive(false);
    previousNavigationPositionRef.current = null;
    stopWatching();
    if (route) {
      setTimeout(() => {
        const current = locationRef.current;
        if (current) {
          mapRef.current?.animateCamera({
            center: {
              latitude: current.coords.latitude,
              longitude: current.coords.longitude,
            },
            pitch: 0,
            heading: 0,
            zoom: 13,
          }, { duration: 300 });
        }
        mapRef.current?.fitToCoordinates(route.coordinates, {
          edgePadding: { top: 44, right: 36, bottom: 44, left: 36 },
          animated: true,
        });
      }, 100);
    }
  }, [route, stopWatching]);

  const maps = Platform.OS === "web" ? null : require("react-native-maps");
  const NativeMapView = maps?.default;
  const Marker = maps?.Marker;
  const Polyline = maps?.Polyline;
  const currentOrigin = originText.trim().toLowerCase() === "current location";
  const currentCoordinate = location
    ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
    : origin;
  const mapRegion = location
    ? {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    }
    : DEFAULT_REGION;

  const remainingDistance = route
    ? Math.max(0, route.distanceMeters - navigationProgress)
    : 0;
  const remainingDuration = route && route.distanceMeters > 0
    ? route.durationSeconds * remainingDistance / route.distanceMeters
    : 0;
  const routeManeuvers = route?.steps.filter((step) => !step.isArrival) ?? [];
  const nextManeuverIndex = routeManeuvers.findIndex(
    (step) => step.atDistanceMeters > navigationProgress + 8,
  );
  const arrivalManeuver = route?.steps.find((step) => step.isArrival) ?? null;
  const activeManeuver = remainingDistance <= 30
    ? null
    : nextManeuverIndex >= 0
      ? routeManeuvers[nextManeuverIndex]
      : null;
  const followingManeuver = nextManeuverIndex >= 0
    ? routeManeuvers[nextManeuverIndex + 1]
    : null;
  const previewManeuver = followingManeuver ?? arrivalManeuver;
  const distanceToManeuver = activeManeuver
    ? Math.max(0, activeManeuver.atDistanceMeters - navigationProgress)
    : remainingDistance;
  const displayedSpeed = typeof navigationSpeed === "number" && navigationSpeed >= 0
    ? `${Math.round(navigationSpeed * 3.6)} km/h`
    : "-- km/h";
  const canStartNavigation = Boolean(
    route
    && route.source === "OSRM"
    && route.mode === "driving"
    && Platform.OS !== "web"
    && currentOrigin,
  );

  const mapContent = NativeMapView && Marker && Polyline
    ? h(
      View,
      { style: [styles.mapFrame, navigationActive ? styles.navigationMapFrame : null] },
      h(
        NativeMapView,
        /** @type {React.ComponentProps<typeof NativeMapView> & { ref: React.Ref<MapHandle> }} */ ({
          ref: mapRef,
          style: styles.map,
          initialRegion: mapRegion,
          showsUserLocation: true,
          showsMyLocationButton: false,
          showsCompass: !navigationActive,
          accessibilityLabel: navigationActive
            ? "Live navigation map"
            : "Navigation map showing the current location and planned route",
        }),
        !currentOrigin && origin
          ? h(Marker, { coordinate: origin, title: "Starting point" })
          : null,
        destination
          ? h(Marker, { coordinate: destination, title: destinationText || "Destination" })
          : null,
        route
          ? h(Polyline, {
            coordinates: route.coordinates,
            strokeColor: "#187C78",
            strokeWidth: navigationActive ? 7 : 6,
            lineCap: "round",
            lineJoin: "round",
          })
          : null,
      ),
      !navigationActive
        ? h(
          React.Fragment,
          null,
          h(
            View,
            { style: styles.mapBadge },
            h(View, { style: styles.statusDot }),
            h(Text, { style: styles.mapBadgeText }, locationStatus === "tracking" ? "LIVE" : "MAP"),
          ),
          h(
            Pressable,
            {
              onPress: () => {
                if (currentCoordinate) {
                  mapRef.current?.animateToRegion({
                    ...currentCoordinate,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012,
                  }, 350);
                } else {
                  void startWatching();
                }
              },
              accessibilityRole: "button",
              accessibilityLabel: "Center map on current location",
              style: styles.centerButton,
            },
            h(Text, { style: styles.centerGlyph }, "⌖"),
          ),
        )
        : null,
    )
    : h(
      View,
      { style: [styles.mapFrame, styles.mapFallback, navigationActive ? styles.navigationMapFrame : null] },
      h(Text, { style: styles.fallbackGlyph }, "⌖"),
      h(Text, { style: styles.fallbackTitle }, Platform.OS === "web" ? "Map preview is available in the mobile app" : "Map is loading"),
      h(
        Text,
        { style: styles.fallbackText },
        Platform.OS === "web"
          ? "Place search and route estimates remain available here."
          : "Your map will appear as soon as the native map is ready.",
      ),
    );

  const plannerScreen = h(
    ScrollView,
    {
      style: styles.scroll,
      contentContainerStyle: styles.content,
      keyboardShouldPersistTaps: "handled",
    },
    h(
      View,
      { style: styles.top },
      h(
        View,
        { style: styles.heading },
        h(Text, { style: styles.eyebrow }, "SAFENEST NAVIGATION"),
        h(Text, { style: styles.title }, "Plan your trip"),
      ),
      h(
        View,
        { style: styles.searchCard },
        h(
          View,
          { style: styles.locationRail, accessibilityElementsHidden: true },
          h(View, { style: styles.originDot }),
          h(View, { style: styles.railLine }),
          h(View, { style: styles.destinationDot }),
        ),
        h(
          View,
          { style: styles.fields },
          h(Text, { style: styles.fieldLabel }, "STARTING POINT"),
          h(TextInput, {
            value: originText,
            onChangeText: (value) => {
              setOriginText(value);
              setOrigin(null);
              invalidateRoute();
            },
            placeholder: "Current location or enter a place",
            placeholderTextColor: "#89969A",
            accessibilityLabel: "Starting point",
            returnKeyType: "next",
            autoCapitalize: "words",
            style: styles.input,
          }),
          h(View, { style: styles.divider }),
          h(Text, { style: styles.fieldLabel }, "DESTINATION"),
          h(TextInput, {
            value: destinationText,
            onChangeText: (value) => {
              setDestinationText(value);
              setDestination(null);
              invalidateRoute();
            },
            placeholder: "e.g. UiTM Jasin or AEON Bandaraya Melaka",
            placeholderTextColor: "#89969A",
            accessibilityLabel: "Destination",
            returnKeyType: "search",
            autoCapitalize: "words",
            onSubmitEditing: () => void findRoute(),
            style: styles.input,
          }),
        ),
      ),
      h(
        View,
        { style: styles.locationLine },
        h(View, { style: [styles.statusDot, locationStatus === "tracking" ? styles.statusLive : null] }),
        h(
          Text,
          { style: styles.locationStatus },
          locationStatus === "tracking"
            ? "Using your live location"
            : locationStatus === "requesting"
              ? "Finding your location..."
              : locationStatus === "error"
                ? "Location unavailable"
                : "Location tracking paused",
        ),
        locationStatus !== "tracking"
          ? h(
            Pressable,
            {
              onPress: () => void startWatching(),
              accessibilityRole: "button",
              style: styles.refreshButton,
            },
            h(Text, { style: styles.refreshText }, "Refresh"),
          )
          : h(
            Pressable,
            {
              onPress: stopWatching,
              accessibilityRole: "button",
              style: styles.refreshButton,
            },
            h(Text, { style: styles.refreshText }, "Pause"),
          )
      ),
    ),
    h(
      View,
      { style: styles.modeRow, accessibilityRole: "toolbar", accessibilityLabel: "Travel mode" },
      ...TRAVEL_MODES.map((mode) => h(
        Pressable,
        {
          key: mode.id,
          onPress: () => {
            setTravelMode(mode.id);
            if (route) void findRoute(mode.id);
          },
          accessibilityRole: "button",
          accessibilityState: { selected: travelMode === mode.id },
          style: [styles.modeChip, travelMode === mode.id ? styles.modeChipSelected : null],
        },
        h(Text, { style: [styles.modeText, travelMode === mode.id ? styles.modeTextSelected : null] }, mode.label),
      )),
    ),
    mapContent,
    route
      ? h(
        View,
        { style: styles.tripCard },
        h(
          View,
          { style: styles.tripTopline },
          h(Text, { style: styles.tripLabel }, `${route.mode === "driving" ? "SUGGESTED DRIVE" : `ESTIMATED ${route.mode.toUpperCase()}`}`),
          h(Text, { style: styles.routeSummary, numberOfLines: 1 }, route.summary),
        ),
        h(
          View,
          { style: styles.statsRow },
          h(
            View,
            { style: styles.stat },
            h(Text, { style: styles.statValue }, formatDistance(route.distanceMeters)),
            h(Text, { style: styles.statLabel }, "DISTANCE"),
          ),
          h(View, { style: styles.statDivider }),
          h(
            View,
            { style: styles.stat },
            h(Text, { style: styles.statValue }, formatDuration(route.durationSeconds)),
            h(Text, { style: styles.statLabel }, "DRIVE TIME"),
          ),
          h(View, { style: styles.statDivider }),
          h(
            View,
            { style: styles.stat },
            h(Text, { style: styles.statValue }, formatEta(route.durationSeconds)),
            h(Text, { style: styles.statLabel }, "ARRIVAL"),
          ),
        ),
        h(
          Text,
          { style: styles.disclaimer },
          route.source === "OSRM"
            ? "Suggested driving route. Live traffic and toll data are not included."
            : "Approximate distance and time with a straight-line map connection; no walking or transit route provider is connected.",
        ),
        h(
          Pressable,
          {
            onPress: () => void startNavigation(),
            disabled: routeLoading || !canStartNavigation,
            accessibilityRole: "button",
            accessibilityState: {
              disabled: routeLoading || !canStartNavigation,
            },
            style: [
              styles.startNavigationButton,
              !canStartNavigation
                ? styles.planButtonDisabled
                : null,
            ],
          },
          h(Text, { style: styles.startNavigationText }, "Start Navigation"),
        ),
        !canStartNavigation
          ? h(
            Text,
            { style: styles.navigationAvailability },
            Platform.OS === "web"
              ? "Live navigation is available in the iOS and Android app."
              : !currentOrigin
                ? "Set the starting point to Current location to begin live navigation."
                : "Turn-by-turn navigation requires a driving route.",
          )
          : null,
      )
      : null,
    routeError
      ? h(
        View,
        { style: styles.errorCard, accessibilityLiveRegion: "polite" },
        h(Text, { style: styles.errorTitle }, "Couldn't plan this route"),
        h(Text, { style: styles.errorText }, routeError),
      )
      : null,
    locationError
      ? h(
        View,
        { style: styles.locationError, accessibilityLiveRegion: "polite" },
        h(Text, { style: styles.errorText }, locationError),
        permissionBlocked && Platform.OS !== "web"
          ? h(
            Pressable,
            {
              onPress: () => void Linking.openSettings(),
              accessibilityRole: "button",
              style: styles.settingsButton,
            },
            h(Text, { style: styles.settingsText }, "Open settings"),
          )
          : null,
      )
      : null,
    h(
      Pressable,
      {
        onPress: () => void findRoute(),
        disabled: routeLoading || !destinationText.trim(),
        accessibilityRole: "button",
        accessibilityState: { disabled: routeLoading || !destinationText.trim(), busy: routeLoading },
        style: [styles.planButton, routeLoading || !destinationText.trim() ? styles.planButtonDisabled : null],
      },
      routeLoading ? h(ActivityIndicator, { color: "#FFFFFF" }) : null,
      h(Text, { style: styles.planButtonText }, routeLoading ? "Planning route..." : "Show route"),
    ),
    h(
      View,
      { style: styles.footer },
      h(Text, { style: styles.footerText }, "Place search · Driving route by OSRM"),
      Platform.OS === "web"
        ? h(Text, { style: styles.footerText }, "© OpenStreetMap contributors")
        : null,
    ),
  );

  const navigationScreen = h(
    View,
    { style: styles.navigationScreen },
    mapContent,
    h(
      View,
      { style: styles.turnBanner, accessibilityLiveRegion: "polite" },
      h(
        View,
        { style: styles.turnIconContainer },
        h(Text, { style: styles.turnIcon }, remainingDistance <= 30 ? "◎" : activeManeuver?.icon ?? "↑"),
      ),
      h(
        View,
        { style: styles.turnCopy },
        h(
          View,
          { style: styles.turnInstructionLine },
          h(
            Text,
            { style: styles.turnInstruction, numberOfLines: 1 },
            remainingDistance <= 30 ? "You have arrived" : activeManeuver?.instruction ?? "Continue to destination",
          ),
          remainingDistance > 30
            ? h(Text, { style: styles.turnDistance }, formatManeuverDistance(distanceToManeuver))
            : null,
        ),
        h(Text, { style: styles.turnStreet, numberOfLines: 1 }, activeManeuver?.streetName ?? destinationText),
        previewManeuver && remainingDistance > 30
          ? h(
            Text,
            { style: styles.thenInstruction, numberOfLines: 1 },
            `Then ${previewManeuver.instruction.toLowerCase()}`,
          )
          : null,
      ),
    ),
    h(
      View,
      { style: styles.navigationBottom },
      locationStatus === "error"
        ? h(Text, { style: styles.navigationGpsError }, "GPS signal lost · guidance is paused")
        : null,
      h(
        View,
        { style: styles.navigationStats },
        h(
          View,
          { style: styles.navigationStat },
          h(Text, { style: styles.navigationStatValue }, formatDuration(remainingDuration)),
          h(Text, { style: styles.navigationStatLabel }, "LEFT"),
        ),
        h(
          View,
          { style: styles.navigationStat },
          h(Text, { style: styles.navigationStatValue }, formatDistance(remainingDistance)),
          h(Text, { style: styles.navigationStatLabel }, "DISTANCE"),
        ),
        h(
          View,
          { style: styles.navigationStat },
          h(Text, { style: styles.navigationStatValue }, formatEta(remainingDuration)),
          h(Text, { style: styles.navigationStatLabel }, "ETA"),
        ),
        h(
          View,
          { style: styles.navigationStat },
          h(Text, { style: styles.navigationStatValue }, displayedSpeed),
          h(Text, { style: styles.navigationStatLabel }, "SPEED"),
        ),
      ),
      h(
        Pressable,
        {
          onPress: exitNavigation,
          accessibilityRole: "button",
          accessibilityLabel: "Exit navigation and stop location tracking",
          style: styles.exitButton,
        },
        h(Text, { style: styles.exitButtonText }, "Exit"),
      ),
    ),
  );

  return navigationActive ? navigationScreen : plannerScreen;
}

const styles = StyleSheet.create({
  navigationScreen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#E6EFEC",
  },
  navigationMapFrame: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    height: "100%",
    borderRadius: 0,
  },
  turnBanner: {
    position: "absolute",
    top: 42,
    left: 14,
    right: 14,
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#147B76",
    shadowColor: "#18302D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 6,
  },
  turnIconContainer: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  turnIcon: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "600",
  },
  turnCopy: {
    flex: 1,
    gap: 4,
  },
  turnInstructionLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  turnInstruction: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  turnDistance: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  turnStreet: {
    color: "#E1F3F0",
    fontSize: 13,
    fontWeight: "600",
  },
  thenInstruction: {
    color: "#C8E6E2",
    fontSize: 11,
  },
  navigationBottom: {
    position: "absolute",
    right: 12,
    bottom: 20,
    left: 12,
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#18302D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 7,
  },
  navigationGpsError: {
    color: "#A84436",
    fontSize: 11,
    fontWeight: "600",
  },
  navigationStats: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  navigationStat: {
    flex: 1,
    gap: 5,
  },
  navigationStatValue: {
    color: "#1A302F",
    fontSize: 16,
    fontWeight: "700",
  },
  navigationStatLabel: {
    color: "#84938F",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  exitButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F1F5F4",
  },
  exitButtonText: {
    color: "#445955",
    fontSize: 14,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#F4F7F6",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
  },
  top: {
    gap: 14,
  },
  heading: {
    gap: 4,
  },
  eyebrow: {
    color: "#68817F",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: "#172B2A",
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  searchCard: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#E6ECEA",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#223B39",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  locationRail: {
    width: 14,
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 4,
  },
  originDot: {
    width: 10,
    height: 10,
    borderWidth: 2,
    borderColor: "#16827D",
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  railLine: {
    flex: 1,
    minHeight: 22,
    width: 1,
    backgroundColor: "#C8D4D1",
  },
  destinationDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: "#F17856",
  },
  fields: {
    flex: 1,
    gap: 5,
  },
  fieldLabel: {
    color: "#7A8C89",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  input: {
    minHeight: 36,
    padding: 0,
    color: "#1A302F",
    fontSize: 15,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: "#EDF1F0",
  },
  locationLine: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A6B3B0",
  },
  statusLive: {
    backgroundColor: "#25A37A",
  },
  locationStatus: {
    flex: 1,
    color: "#627470",
    fontSize: 12,
    fontWeight: "500",
  },
  refreshButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  refreshText: {
    color: "#16827D",
    fontSize: 12,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    minHeight: 34,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#E0E8E5",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  modeChipSelected: {
    borderColor: "#147B76",
    backgroundColor: "#E5F2EF",
  },
  modeText: {
    color: "#697B77",
    fontSize: 11,
    fontWeight: "600",
  },
  modeTextSelected: {
    color: "#126D68",
    fontWeight: "700",
  },
  mapFrame: {
    height: 340,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#E6EFEC",
  },
  map: {
    flex: 1,
  },
  mapBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B302D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 5,
    elevation: 3,
  },
  mapBadgeText: {
    color: "#334B47",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  centerButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B302D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 5,
    elevation: 3,
  },
  centerGlyph: {
    color: "#16827D",
    fontSize: 25,
    lineHeight: 29,
  },
  mapFallback: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  fallbackGlyph: {
    color: "#16827D",
    fontSize: 30,
  },
  fallbackTitle: {
    color: "#253A37",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  fallbackText: {
    maxWidth: 270,
    color: "#71827F",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  tripCard: {
    gap: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E6ECEA",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  tripTopline: {
    gap: 4,
  },
  tripLabel: {
    color: "#16827D",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  routeSummary: {
    color: "#61736F",
    fontSize: 12,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  statValue: {
    color: "#1A302F",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  statLabel: {
    color: "#84938F",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 7,
    backgroundColor: "#E9EEEC",
  },
  disclaimer: {
    color: "#899693",
    fontSize: 10,
    lineHeight: 15,
  },
  startNavigationButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#147B76",
  },
  startNavigationText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  navigationAvailability: {
    color: "#899693",
    fontSize: 10,
    textAlign: "center",
  },
  errorCard: {
    gap: 5,
    padding: 13,
    borderWidth: 1,
    borderColor: "#F1D2CA",
    borderRadius: 13,
    backgroundColor: "#FFF7F4",
  },
  locationError: {
    gap: 8,
    padding: 13,
    borderRadius: 13,
    backgroundColor: "#FFF7F4",
  },
  errorTitle: {
    color: "#9C4031",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#9C4031",
    fontSize: 12,
    lineHeight: 18,
  },
  settingsButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  settingsText: {
    color: "#16827D",
    fontSize: 12,
    fontWeight: "700",
  },
  planButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 15,
    backgroundColor: "#147B76",
  },
  planButtonDisabled: {
    opacity: 0.48,
  },
  planButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    gap: 3,
    paddingTop: 1,
  },
  footerText: {
    color: "#9AA6A3",
    fontSize: 9,
    textAlign: "center",
  },
});

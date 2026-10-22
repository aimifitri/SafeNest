import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, ScrollView, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { mockData } from "../shared/mockData";
import { Btn, Input, Press, T } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { DeviceLocationCoordinate, DeviceLocationPoint, RouteCoordinate } from "./DeviceLocationMap.types";
import { TripSharing } from "./TripSharing";

type SearchTarget = "start" | "destination";

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
  onLocationUpdate?: (update: LiveLocationUpdate) => void;
  onLocationError?: (error: Error) => void;
};

const DEMO_PLACES: ReadonlyArray<{ name: string; coordinate: DeviceLocationCoordinate }> = [
  { name: "Kajang, Selangor", coordinate: { latitude: 2.9935, longitude: 101.7878 } },
  { name: "Kuala Lumpur, Malaysia", coordinate: { latitude: 3.139, longitude: 101.6869 } },
  { name: "Putrajaya, Malaysia", coordinate: { latitude: 2.9264, longitude: 101.6964 } },
  { name: "Shah Alam, Selangor", coordinate: { latitude: 3.0738, longitude: 101.5183 } },
  { name: "Bandar Baru Bangi, Selangor", coordinate: { latitude: 2.959, longitude: 101.752 } },
];

type PlannedRoute = {
  id: string;
  coordinates: RouteCoordinate[];
  cumulativeMeters: number[];
  maneuvers: NavigationManeuver[];
  distanceMeters: number;
  durationSeconds: number;
  roadSummary: string;
};

type NavigationManeuver = {
  distanceAlongMeters: number;
  instruction: string;
  modifier: string | null;
};

type NavigationProgress = {
  travelledCoordinates: RouteCoordinate[];
  travelledMeters: number;
  remainingMeters: number;
  deviationMeters: number;
  nearestIndex: number;
};

type CoordinateResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "valid"; coordinate: DeviceLocationCoordinate };

function parseCoordinates(latitudeText: string, longitudeText: string): CoordinateResult {
  if (!latitudeText.trim() && !longitudeText.trim()) return { kind: "empty" };
  if (!latitudeText.trim() || !longitudeText.trim()) return { kind: "invalid" };

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { kind: "invalid" };
  }
  return { kind: "valid", coordinate: { latitude, longitude } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function distanceBetween(first: DeviceLocationCoordinate, second: DeviceLocationCoordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoordinate(coordinate: DeviceLocationCoordinate): boolean {
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180;
}

async function geocodeAddress(address: string): Promise<DeviceLocationCoordinate> {
  if (Platform.OS !== "web") {
    const results = await Location.geocodeAsync(address);
    const first = results[0];
    if (!first) throw new Error("No coordinates were found for this address.");
    const coordinate = { latitude: first.latitude, longitude: first.longitude };
    if (!isValidCoordinate(coordinate)) throw new Error("The address returned invalid coordinates.");
    return coordinate;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Address lookup failed with status ${response.status}.`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !isRecord(payload[0])) {
    throw new Error("No coordinates were found for this address.");
  }
  const coordinate = {
    latitude: Number(payload[0].lat),
    longitude: Number(payload[0].lon),
  };
  if (!isValidCoordinate(coordinate)) throw new Error("The address returned invalid coordinates.");
  return coordinate;
}

function makeManeuverInstruction(type: string, modifier: string | null, roadName: string): string {
  const road = roadName ? ` at ${roadName}` : "";
  if (type === "arrive") return "Arrive at destination";
  if (type === "roundabout" || type === "rotary") return `Enter the roundabout${road}`;
  if (type === "merge") return `Merge${modifier ? ` ${modifier}` : ""}${road}`;
  if (type === "fork") return `Keep ${modifier ?? "straight"}${road}`;
  if (type === "on ramp") return `Take the ramp${road}`;
  if (type === "off ramp") return `Take the exit${road}`;
  if (type === "depart") return `Head toward${roadName ? ` ${roadName}` : " your destination"}`;
  if (modifier) return `Turn ${modifier}${road}`;
  return `Continue${road}`;
}

function parsePickupMinute(time: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(time);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (meridiem === "PM") hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function parseOsrmResponse(payload: unknown): PlannedRoute[] {
  if (!isRecord(payload) || typeof payload.code !== "string") {
    throw new Error("The routing service returned an invalid response.");
  }
  if (payload.code !== "Ok") {
    throw new Error(typeof payload.message === "string" ? payload.message : "No driving route was found.");
  }
  if (!Array.isArray(payload.routes)) throw new Error("The routing service returned no routes.");

  const routes: PlannedRoute[] = payload.routes.map((rawRoute, routeIndex) => {
    if (!isRecord(rawRoute) || !isRecord(rawRoute.geometry)) {
      throw new Error("The routing service returned an incomplete route.");
    }
    const distance = rawRoute.distance;
    const duration = rawRoute.duration;
    const rawPairs = rawRoute.geometry.coordinates;
    if (typeof distance !== "number" || !Number.isFinite(distance) || typeof duration !== "number" || !Number.isFinite(duration) || !Array.isArray(rawPairs)) {
      throw new Error("The routing service returned invalid route details.");
    }

    const coordinates: RouteCoordinate[] = rawPairs.map((pair): RouteCoordinate => {
      if (!Array.isArray(pair) || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
        throw new Error("The routing service returned invalid route coordinates.");
      }
      const [longitude, latitude] = pair;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error("The routing service returned out-of-range route coordinates.");
      }
      return { latitude, longitude };
    });
    if (coordinates.length < 2) throw new Error("The routing service returned an incomplete route path.");

    const cumulativeMeters = [0];
    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = coordinates[index - 1];
      const current = coordinates[index];
      if (previous && current) {
        cumulativeMeters.push((cumulativeMeters[index - 1] ?? 0) + distanceBetween(previous, current));
      }
    }

    const roadNames: string[] = [];
    const maneuvers: NavigationManeuver[] = [];
    let distanceAlongMeters = 0;
    if (Array.isArray(rawRoute.legs)) {
      for (const leg of rawRoute.legs) {
        if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
        for (const step of leg.steps) {
          if (!isRecord(step)) continue;
          const roadName = typeof step.name === "string" ? step.name.trim() : "";
          if (roadName) roadNames.push(roadName);
          const stepDistance = typeof step.distance === "number" && Number.isFinite(step.distance)
            ? Math.max(0, step.distance)
            : 0;
          if (isRecord(step.maneuver) && typeof step.maneuver.type === "string") {
            const modifier = typeof step.maneuver.modifier === "string" ? step.maneuver.modifier : null;
            const instruction = makeManeuverInstruction(step.maneuver.type, modifier, roadName);
            if (step.maneuver.type !== "depart") {
              maneuvers.push({ distanceAlongMeters, instruction, modifier });
            }
          }
          distanceAlongMeters += stepDistance;
        }
      }
    }
    const summary = [...new Set(roadNames)].slice(0, 3);
    return {
      id: `osrm-${routeIndex}`,
      coordinates,
      cumulativeMeters,
      maneuvers,
      distanceMeters: distance,
      durationSeconds: duration,
      roadSummary: summary.length > 0 ? `via ${summary.join(" · ")}` : "Suggested driving route",
    };
  });

  if (routes.length === 0) throw new Error("No route was found for these locations.");
  return routes;
}

function getNavigationProgress(route: PlannedRoute, coordinate: DeviceLocationCoordinate, lastIndex: number) {
  let nearestIndex = Math.min(lastIndex, route.coordinates.length - 1);
  let deviationMeters = Number.POSITIVE_INFINITY;
  for (let index = Math.max(0, lastIndex - 3); index < route.coordinates.length; index += 1) {
    const routeCoordinate = route.coordinates[index];
    if (!routeCoordinate) continue;
    const distance = distanceBetween(coordinate, routeCoordinate);
    if (distance < deviationMeters) {
      deviationMeters = distance;
      nearestIndex = index;
    }
  }

  const nearestCoordinate = route.coordinates[nearestIndex];
  const totalPathMeters = route.cumulativeMeters[route.cumulativeMeters.length - 1] ?? 0;
  const routeMetersCovered = route.cumulativeMeters[nearestIndex] ?? 0;
  const remainingMeters = Math.max(0, totalPathMeters - routeMetersCovered)
    + (nearestCoordinate ? distanceBetween(coordinate, nearestCoordinate) : 0);
  return {
    travelledCoordinates: route.coordinates.slice(0, nearestIndex + 1),
    travelledMeters: routeMetersCovered,
    remainingMeters,
    deviationMeters,
    nearestIndex,
  };
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(meters))} m`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Arrived";
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

function formatEta(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatNavigationEta(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function DeviceLocationModal({ visible, onClose, onLocationUpdate, onLocationError }: DeviceLocationModalProps) {
  const {
    theme,
    schoolLocation,
    weeklySchedule,
    temporaryDismissal,
    requestBackupPickup,
    backupBusy,
    backupError,
    backupRequest,
  } = useAppContext();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const subscription = useRef<LocationSubscription | null>(null);
  const trackingRequestId = useRef(0);
  const schoolLocationRequestId = useRef(0);
  const routingRequestId = useRef(0);
  const routingController = useRef<AbortController | null>(null);
  const routeOptionsRef = useRef<PlannedRoute[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);
  const navigationActiveRef = useRef(false);
  const schoolDestinationRef = useRef(false);
  const automaticRouteKeyRef = useRef<string | null>(null);
  const automaticPromptDateRef = useRef<string | null>(null);
  const progressIndexRef = useRef(0);
  const callbacks = useRef({ onLocationUpdate, onLocationError });
  callbacks.current = { onLocationUpdate, onLocationError };
  const [location, setLocation] = useState<LocationObject | null>(null);
  const locationRef = useRef<LocationObject | null>(null);
  const [currentLatitude, setCurrentLatitude] = useState("");
  const [currentLongitude, setCurrentLongitude] = useState("");
  const [destinationLatitude, setDestinationLatitude] = useState("");
  const [destinationLongitude, setDestinationLongitude] = useState("");
  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [activeSearch, setActiveSearch] = useState<SearchTarget | null>(null);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [error, setError] = useState("");
  const [routeOptions, setRouteOptions] = useState<PlannedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState<NavigationProgress | null>(null);
  const [autoPresented, setAutoPresented] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");

  routeOptionsRef.current = routeOptions;
  selectedRouteIdRef.current = selectedRouteId;

  const screenPresented = visible || autoPresented;
  const currentCoordinates = parseCoordinates(currentLatitude, currentLongitude);
  const destinationCoordinates = parseCoordinates(destinationLatitude, destinationLongitude);
  const destinationPoint = destinationCoordinates.kind === "valid" ? destinationCoordinates.coordinate : null;

  useEffect(() => {
    if (screenPresented) return;
    trackingRequestId.current += 1;
    schoolLocationRequestId.current += 1;
    routingRequestId.current += 1;
    routingController.current?.abort();
    routingController.current = null;
    subscription.current?.remove();
    subscription.current = null;
    locationRef.current = null;
    routeOptionsRef.current = [];
    selectedRouteIdRef.current = null;
    navigationActiveRef.current = false;
    schoolDestinationRef.current = false;
    automaticRouteKeyRef.current = null;
    progressIndexRef.current = 0;
    setLocation(null);
    setCurrentLatitude("");
    setCurrentLongitude("");
    setDestinationLatitude("");
    setDestinationLongitude("");
    setStartText("");
    setDestinationText("");
    setActiveSearch(null);
    setExpandedRoute(null);
    setPreviewRoute(null);
    setTracking(false);
    setBusy(false);
    setPermissionBlocked(false);
    setError("");
    setRouteOptions([]);
    setSelectedRouteId(null);
    setRouteLoading(false);
    setRouteError("");
    setSchoolLoading(false);
    setNavigationActive(false);
    setNavigationProgress(null);
    setEstimateOpen(false);
    setBackupNotice("");
  }, [screenPresented]);

  useEffect(() => {
    if (!visible) return;
    setEstimateOpen(true);
    setBackupNotice("");
  }, [visible]);

  useEffect(() => {
    const checkPickupTime = () => {
      const now = new Date();
      const day = now.getDay();
      if (day < 1 || day > 5) return;
      const weekday = day as 1 | 2 | 3 | 4 | 5;
      const scheduledText = temporaryDismissal?.weekday === weekday
        ? temporaryDismissal.time
        : weeklySchedule[weekday];
      const scheduledMinute = parsePickupMinute(scheduledText);
      if (scheduledMinute === null || now.getHours() * 60 + now.getMinutes() < scheduledMinute) return;
      const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      if (automaticPromptDateRef.current === dateKey) return;
      automaticPromptDateRef.current = dateKey;
      setAutoPresented(true);
      setEstimateOpen(true);
    };

    checkPickupTime();
    const timer = setInterval(checkPickupTime, 30_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPickupTime();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [temporaryDismissal, weeklySchedule]);

  useEffect(() => () => {
    trackingRequestId.current += 1;
    routingRequestId.current += 1;
    routingController.current?.abort();
    subscription.current?.remove();
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopNavigation();
    });
    return () => listener.remove();
  }, []);

  const stopTracking = () => {
    trackingRequestId.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
    setBusy(false);
  };

  const stopNavigation = () => {
    navigationActiveRef.current = false;
    setNavigationActive(false);
    stopTracking();
  };

  const clearRoutePlan = () => {
    schoolLocationRequestId.current += 1;
    schoolDestinationRef.current = false;
    automaticRouteKeyRef.current = null;
    routingRequestId.current += 1;
    routingController.current?.abort();
    routingController.current = null;
    routeOptionsRef.current = [];
    selectedRouteIdRef.current = null;
    navigationActiveRef.current = false;
    progressIndexRef.current = 0;
    setRouteOptions([]);
    setSelectedRouteId(null);
    setRouteLoading(false);
    setSchoolLoading(false);
    setRouteError("");
    setNavigationActive(false);
    setNavigationProgress(null);
    setPreviewRoute(null);
  };

  const reportLocationError = (message: string, reason?: string) => {
    setError(message);
    callbacks.current.onLocationError?.(new Error(reason ? `${message} ${reason}` : message));
  };

  const updateLocation = (next: LocationObject) => {
    const latitude = next.coords.latitude;
    const longitude = next.coords.longitude;
    locationRef.current = next;
    setLocation(next);
    setCurrentLatitude(latitude.toFixed(6));
    setCurrentLongitude(longitude.toFixed(6));
    setStartText("Current location");
    setActiveSearch(null);
    const selectedRoute = routeOptionsRef.current.find((route) => route.id === selectedRouteIdRef.current);
    if (navigationActiveRef.current && selectedRoute) {
      const progress = getNavigationProgress(selectedRoute, { latitude, longitude }, progressIndexRef.current);
      progressIndexRef.current = progress.nearestIndex;
      setNavigationProgress(progress);
      if (progress.remainingMeters <= 35) {
        navigationActiveRef.current = false;
        setNavigationActive(false);
        subscription.current?.remove();
        subscription.current = null;
        setTracking(false);
      }
    }
    callbacks.current.onLocationUpdate?.({
      latitude,
      longitude,
      accuracy: next.coords.accuracy,
      speed: next.coords.speed,
      heading: next.coords.heading,
      timestamp: next.timestamp,
    });
  };

  const calculateRoutes = async (
    origin: DeviceLocationCoordinate,
    destination: DeviceLocationCoordinate,
    preferredRouteId?: string | null,
  ): Promise<boolean> => {
    const requestId = routingRequestId.current + 1;
    routingRequestId.current = requestId;
    routingController.current?.abort();
    const controller = new AbortController();
    routingController.current = controller;
    setRouteLoading(true);
    setRouteError("");
    routeOptionsRef.current = [];
    selectedRouteIdRef.current = null;
    setRouteOptions([]);
    setSelectedRouteId(null);
    setPreviewRoute(null);
    navigationActiveRef.current = false;
    setNavigationActive(false);
    setNavigationProgress(null);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?alternatives=true&steps=true&overview=full&geometries=geojson`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Routing service responded with status ${response.status}.`);
      const payload: unknown = await response.json();
      const routes = parseOsrmResponse(payload);
      if (requestId !== routingRequestId.current) return false;
      const selectedRoute = routes.find((route) => route.id === preferredRouteId) ?? routes[0] ?? null;
      routeOptionsRef.current = routes;
      selectedRouteIdRef.current = selectedRoute?.id ?? null;
      progressIndexRef.current = 0;
      setRouteOptions(routes);
      setSelectedRouteId(selectedRoute?.id ?? null);
      setPreviewRoute(selectedRoute?.id ?? null);
      return selectedRoute !== null;
    } catch (cause) {
      if (requestId !== routingRequestId.current || controller.signal.aborted) return false;
      const message = cause instanceof Error ? cause.message : "Unknown routing error.";
      setRouteError(`Unable to calculate a route. ${message}`);
      return false;
    } finally {
      if (requestId === routingRequestId.current) {
        routingController.current = null;
        setRouteLoading(false);
      }
    }
  };

  const startTracking = async (
    navigateAfterFix = false,
    plannedDestination?: DeviceLocationCoordinate,
    preferredRouteId?: string | null,
  ): Promise<DeviceLocationCoordinate | null> => {
    if (busy || tracking) {
      const current = locationRef.current;
      return current
        ? { latitude: current.coords.latitude, longitude: current.coords.longitude }
        : null;
    }
    const requestId = trackingRequestId.current + 1;
    trackingRequestId.current = requestId;
    const isCurrentRequest = () => requestId === trackingRequestId.current && screenPresented;
    setBusy(true);
    setError("");
    setPermissionBlocked(false);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!isCurrentRequest()) return null;
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!isCurrentRequest()) return null;
      if (permission.status !== "granted") {
        setPermissionBlocked(!permission.canAskAgain);
        reportLocationError("Location permission is needed to show this phone on the map.");
        return null;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrentRequest()) return null;
      if (!servicesEnabled) {
        reportLocationError("Turn on location services on this phone, then try again.");
        return null;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isCurrentRequest()) return null;
      updateLocation(initial);
      if (navigateAfterFix && plannedDestination) {
        const routeReady = await calculateRoutes(
          { latitude: initial.coords.latitude, longitude: initial.coords.longitude },
          plannedDestination,
          preferredRouteId,
        );
        if (!isCurrentRequest() || !routeReady) return null;
        const selectedRoute = routeOptionsRef.current.find((route) => route.id === selectedRouteIdRef.current);
        if (!selectedRoute) return null;
        const progress = getNavigationProgress(selectedRoute, {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
        }, 0);
        progressIndexRef.current = progress.nearestIndex;
        setNavigationProgress(progress);
        navigationActiveRef.current = true;
        setNavigationActive(true);
      }
      const currentCoordinate = {
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      };
      const nextSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (next) => {
          if (isCurrentRequest()) updateLocation(next);
        },
        (reason) => {
          if (!isCurrentRequest()) return;
          reportLocationError("Live GPS updates stopped because the location signal failed.", reason);
          navigationActiveRef.current = false;
          setNavigationActive(false);
          stopTracking();
        },
      );
      if (!isCurrentRequest()) {
        nextSubscription.remove();
        return null;
      }
      subscription.current?.remove();
      subscription.current = nextSubscription;
      setTracking(true);
      return currentCoordinate;
    } catch (cause) {
      if (!isCurrentRequest()) return null;
      const reason = cause instanceof Error ? cause.message : "Unknown location error";
      reportLocationError("Unable to get this phone's location. Check GPS availability and try again.", reason);
      return null;
    } finally {
      if (isCurrentRequest()) setBusy(false);
    }
  };

  const startTrackingRef = useRef(startTracking);
  startTrackingRef.current = startTracking;
  const calculateRoutesRef = useRef(calculateRoutes);
  calculateRoutesRef.current = calculateRoutes;

  useEffect(() => {
    if (!screenPresented) return;
    void startTrackingRef.current();
  }, [screenPresented]);

  useEffect(() => {
    if (!screenPresented) return;
    let cancelled = false;
    const requestId = schoolLocationRequestId.current + 1;
    schoolLocationRequestId.current = requestId;
    const isCurrentRequest = () => !cancelled && requestId === schoolLocationRequestId.current;
    setSchoolLoading(true);
    schoolDestinationRef.current = false;

    void (async () => {
      try {
        const schoolCoordinate = schoolLocation && isValidCoordinate(schoolLocation)
          ? schoolLocation
          : await geocodeAddress(`${mockData.school.name}, ${mockData.school.address}`);
        if (!isCurrentRequest()) return;
        const schoolName = schoolLocation ? "Child's school" : mockData.school.name;
        setDestinationLatitude(schoolCoordinate.latitude.toFixed(6));
        setDestinationLongitude(schoolCoordinate.longitude.toFixed(6));
        setDestinationText(schoolName);
        setActiveSearch(null);
        schoolDestinationRef.current = true;
        setSchoolLoading(false);
      } catch (cause) {
        if (!isCurrentRequest()) return;
        setSchoolLoading(false);
        const reason = cause instanceof Error
          ? cause.message
          : "Unknown school geocoding error.";
        const message = `Unable to locate ${mockData.school.name}. ${reason}`;
        setRouteError(message);
        callbacks.current.onLocationError?.(new Error(message));
      }
    })();

    return () => {
      cancelled = true;
      schoolLocationRequestId.current += 1;
    };
  }, [screenPresented, schoolLocation]);

  useEffect(() => {
    if (!screenPresented || schoolLoading || !schoolDestinationRef.current || !location || !destinationPoint) return;
    const routeKey = `${destinationPoint.latitude.toFixed(6)},${destinationPoint.longitude.toFixed(6)}`;
    if (automaticRouteKeyRef.current === routeKey) return;
    automaticRouteKeyRef.current = routeKey;
    void calculateRoutesRef.current({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }, destinationPoint);
  }, [
    screenPresented,
    schoolLoading,
    location?.coords.latitude,
    location?.coords.longitude,
    destinationPoint?.latitude,
    destinationPoint?.longitude,
  ]);

  const currentPoint: DeviceLocationPoint | null = currentCoordinates.kind === "valid"
    ? {
      ...currentCoordinates.coordinate,
      accuracy: location?.coords.accuracy ?? null,
      title: startText || "Starting point",
      detail: undefined,
    }
    : null;
  const selectDestination = (coordinate: DeviceLocationCoordinate) => {
    clearRoutePlan();
    setDestinationLatitude(coordinate.latitude.toFixed(6));
    setDestinationLongitude(coordinate.longitude.toFixed(6));
    setDestinationText("Map pin");
    setActiveSearch(null);
    setPreviewRoute(null);
  };
  const routeReady = currentPoint !== null && destinationPoint !== null;
  const displayedRoute = routeOptions.find((route) => route.id === previewRoute) ?? null;
  const selectedRoute = routeOptions.find((route) => route.id === selectedRouteId) ?? null;
  const navigationRemainingRatio = selectedRoute && navigationProgress && selectedRoute.distanceMeters > 0
    ? Math.min(1, navigationProgress.remainingMeters / selectedRoute.distanceMeters)
    : 1;
  const navigationRemainingSeconds = navigationProgress && navigationProgress.remainingMeters <= 35
    ? 0
    : (selectedRoute?.durationSeconds ?? 0) * navigationRemainingRatio;
  const nextManeuver = selectedRoute && navigationProgress
    ? selectedRoute.maneuvers.find((maneuver) => maneuver.distanceAlongMeters > navigationProgress.travelledMeters + 15)
    : undefined;
  const navigationTurnDistance = nextManeuver && navigationProgress
    ? Math.max(0, nextManeuver.distanceAlongMeters - navigationProgress.travelledMeters)
    : navigationProgress?.remainingMeters ?? 0;

  const startNavigation = async () => {
    if (!routeReady || !destinationPoint || routeLoading || busy) return;
    setRouteError("");
    if (tracking && location) {
      const preferredRouteId = selectedRouteId;
      const routeCalculated = await calculateRoutes(
        { latitude: location.coords.latitude, longitude: location.coords.longitude },
        destinationPoint,
        preferredRouteId,
      );
      if (!routeCalculated) return;
      const route = routeOptionsRef.current.find((candidate) => candidate.id === selectedRouteIdRef.current);
      if (!route) return;
      selectedRouteIdRef.current = route.id;
      setSelectedRouteId(route.id);
      setPreviewRoute(route.id);
      progressIndexRef.current = 0;
      const progress = getNavigationProgress(route, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }, 0);
      setNavigationProgress(progress);
      navigationActiveRef.current = true;
      setNavigationActive(true);
      return;
    }
    await startTracking(true, destinationPoint, selectedRouteId);
  };

  const placesForSearch = (target: SearchTarget) => {
    const query = (target === "start" ? startText : destinationText).trim().toLowerCase();
    return DEMO_PLACES
      .filter((place) => !query || place.name.toLowerCase().includes(query))
      .slice(0, 4);
  };

  const choosePlace = (target: SearchTarget, place: (typeof DEMO_PLACES)[number]) => {
    clearRoutePlan();
    const { latitude, longitude } = place.coordinate;
    if (target === "start") {
      stopTracking();
      setLocation(null);
      setCurrentLatitude(latitude.toFixed(6));
      setCurrentLongitude(longitude.toFixed(6));
      setStartText(place.name);
    } else {
      setDestinationLatitude(latitude.toFixed(6));
      setDestinationLongitude(longitude.toFixed(6));
      setDestinationText(place.name);
    }
    setActiveSearch(null);
    setPreviewRoute(null);
  };

  const editPlaceText = (target: SearchTarget, value: string) => {
    clearRoutePlan();
    setActiveSearch(target);
    setPreviewRoute(null);
    if (target === "start") {
      stopTracking();
      setLocation(null);
      setCurrentLatitude("");
      setCurrentLongitude("");
      setStartText(value);
    } else {
      setDestinationLatitude("");
      setDestinationLongitude("");
      setDestinationText(value);
    }
  };

  const searchAndEstimate = async () => {
    setEstimateOpen(true);
    setBackupNotice("");
    setRouteError("");
    setActiveSearch(null);
    try {
      let origin = currentCoordinates.kind === "valid" ? currentCoordinates.coordinate : null;
      if (!origin && startText.trim().toLowerCase() === "current location" && locationRef.current) {
        origin = {
          latitude: locationRef.current.coords.latitude,
          longitude: locationRef.current.coords.longitude,
        };
      }
      if (!origin && startText.trim()) {
        origin = await geocodeAddress(startText.trim());
        setCurrentLatitude(origin.latitude.toFixed(6));
        setCurrentLongitude(origin.longitude.toFixed(6));
      }
      if (!origin && locationRef.current) {
        origin = {
          latitude: locationRef.current.coords.latitude,
          longitude: locationRef.current.coords.longitude,
        };
      }
      let destination = destinationPoint;
      if (!destination && destinationText.trim()) {
        destination = await geocodeAddress(destinationText.trim());
        setDestinationLatitude(destination.latitude.toFixed(6));
        setDestinationLongitude(destination.longitude.toFixed(6));
      }
      if (!origin || !destination) {
        setRouteError("Enter or select both a starting point and destination to calculate an estimate.");
        return;
      }
      if (!startText.trim()) setStartText("Current location");
      await calculateRoutes(origin, destination, selectedRouteId);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Unknown address lookup error.";
      setRouteError(`Unable to find one of these locations. ${reason}`);
    }
  };

  const closeEstimate = () => {
    setEstimateOpen(false);
    if (autoPresented) setAutoPresented(false);
  };

  const closeScreen = () => {
    closeEstimate();
    stopNavigation();
    onClose();
  };

  const activateBackup = async () => {
    setBackupNotice("");
    try {
      const activated = await requestBackupPickup();
      setBackupNotice(activated
        ? backupRequest.simulated
          ? "Backup pickup preview activated. No helper was contacted."
          : "Backup pickup request sent."
        : "Unable to activate backup pickup. Check the pickup plan and try again.");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Unknown backup request error.";
      setBackupNotice(`Unable to activate backup pickup. ${reason}`);
    }
  };

  const destinationSuggestions = activeSearch ? placesForSearch(activeSearch) : [];

  return (
    <Modal visible={screenPresented} animationType="slide" onRequestClose={closeScreen} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        {navigationActive ? (
          <View style={{ minHeight: 86, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.primary }}>
            <View style={{ width: 68, alignItems: "center", gap: 2 }}>
              <MaterialCommunityIcons
                name={nextManeuver?.modifier?.includes("left") ? "arrow-left" : nextManeuver?.modifier?.includes("right") ? "arrow-right" : "arrow-up"}
                size={28}
                color={colors.onPrimary}
              />
              <T s={0.75} w={700} c={colors.onPrimary}>in {formatDistance(navigationTurnDistance)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T s={1} w={800} c={colors.onPrimary} lh={1.25}>
                {navigationProgress && navigationProgress.remainingMeters <= 35
                  ? "Arrive at destination"
                  : nextManeuver?.instruction ?? "Continue to destination"}
              </T>
            </View>
          </View>
        ) : (
          <View style={{ minHeight: 72, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Input
              accessibilityLabel="Starting point"
              value={startText}
              onFocus={() => setActiveSearch("start")}
              onChangeText={(value) => editPlaceText("start", value)}
              placeholder="Current location"
              returnKeyType="search"
              onSubmitEditing={() => void searchAndEstimate()}
              style={{ flex: 1, minWidth: 0, width: 0, minHeight: 48, paddingHorizontal: 9, borderRadius: 12, fontSize: 14 }}
            />
            <Input
              accessibilityLabel="Destination"
              value={destinationText}
              onFocus={() => setActiveSearch("destination")}
              onChangeText={(value) => editPlaceText("destination", value)}
              placeholder="Destination"
              returnKeyType="search"
              onSubmitEditing={() => void searchAndEstimate()}
              style={{ flex: 1, minWidth: 0, width: 0, minHeight: 48, paddingHorizontal: 9, borderRadius: 12, fontSize: 14 }}
            />
            <Press
              onPress={() => void searchAndEstimate()}
              label="Search route and show pickup estimate"
              disabled={routeLoading}
              style={{ width: 44, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}
            >
              <MaterialCommunityIcons name="magnify" size={24} color={colors.onPrimary} />
            </Press>
            <Press
              onPress={closeScreen}
              label="Close route planner"
              style={{ width: 36, height: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="x" size={20} color={colors.ink} stroke={2} />
            </Press>
          </View>
        )}

        <View style={{ flex: 1, minHeight: 240, marginHorizontal: navigationActive ? 0 : 12, marginBottom: navigationActive ? 0 : 8, borderRadius: navigationActive ? 0 : 18, overflow: "hidden", backgroundColor: colors.map }}>
          {Platform.OS === "web" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: colors.map }}>
              <MaterialCommunityIcons name="map-outline" size={34} color={colors.primary} />
              <T s={0.92} w={700} align="center">Map preview</T>
              <T s={0.8} c="muted" align="center">Interactive map and route drawing are available in the iOS and Android app.</T>
            </View>
          ) : currentPoint || destinationPoint ? (
            <DeviceLocationMap
              point={currentPoint}
              destination={destinationPoint}
              destinationTitle={destinationText || "Destination"}
              showPreview={displayedRoute !== null || previewRoute !== null}
              routeCoordinates={displayedRoute?.coordinates}
              travelledCoordinates={navigationProgress?.travelledCoordinates}
              navigationActive={navigationActive}
              onSelectDestination={selectDestination}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
              <Icon name="look" size={34} color={colors.primary} stroke={1.8} />
              <T w={700} align="center">{schoolLoading ? "Finding your location and the school" : "Choose a starting point and destination"}</T>
              <T s={0.88} c="muted" align="center" lh={1.4}>
                {schoolLoading ? "Preparing the pickup route." : "The route map appears when both points are set."}
              </T>
            </View>
          )}
          {navigationActive && Platform.OS !== "web" ? (
            <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%", width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.card, elevation: 5 }}>
              <MaterialCommunityIcons name="car" size={23} color={colors.onPrimary} />
            </View>
          ) : null}
        </View>

        {navigationActive ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
            <View style={{ flex: 1 }}>
              <T s={0.72} w={700} c="muted">ETA</T>
              <T s={1.2} w={800}>{navigationProgress && navigationProgress.remainingMeters <= 35 ? "Arrived" : formatNavigationEta(navigationRemainingSeconds)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T s={0.72} w={700} c="muted">REMAINING</T>
              <T s={1.2} w={800}>{formatDistance(navigationProgress?.remainingMeters ?? selectedRoute?.distanceMeters ?? 0)}</T>
            </View>
            <Btn kind="o" sm color={colors.danger} onPress={stopNavigation} label="Exit active navigation">
              Exit
            </Btn>
          </View>
        ) : (
          <ScrollView
            style={{ flexGrow: 0, maxHeight: "48%" }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 18), gap: 12 }}
          >
            {activeSearch ? (
              <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }}>
                {destinationSuggestions.length > 0 ? destinationSuggestions.map((place) => (
                  <Press
                    key={place.name}
                    onPress={() => choosePlace(activeSearch, place)}
                    label={`Use ${place.name}`}
                    style={{ minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}
                  >
                    <Icon name="today" size={18} color={colors.muted} />
                    <T s={0.9}>{place.name}</T>
                  </Press>
                )) : (
                  <View style={{ padding: 12 }}>
                    <T s={0.82} c="muted">Type an address and tap search, or choose a destination on the map.</T>
                  </View>
                )}
              </View>
            ) : null}

            {schoolLoading ? <T s={0.78} c="muted">Finding {mockData.school.name} from the saved school details...</T> : null}
            {error ? (
              <View style={{ gap: 8 }}>
                <T s={0.88} c={colors.danger} lh={1.35}>{error}</T>
                {permissionBlocked && Platform.OS !== "web" ? <Btn kind="o" onPress={() => void Linking.openSettings()}>Open phone settings</Btn> : null}
              </View>
            ) : null}
            {routeError ? <T s={0.84} c={colors.danger}>{routeError}</T> : null}

            {routeReady ? (
              <View style={{ gap: 10, paddingTop: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T s={1.05} w={800}>Route options</T>
                  <View style={{ backgroundColor: colors.warning, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                    <T s={0.66} w={700} c={colors.warningInk}>OSRM</T>
                  </View>
                </View>
                <T s={0.78} c="muted" lh={1.35}>
                  Driving estimates use public OSRM and OpenStreetMap data. Live traffic and toll data are not provided.
                </T>
                <Btn
                  kind="p"
                  icon="drive"
                  onPress={() => {
                    if (currentPoint && destinationPoint) void calculateRoutes(currentPoint, destinationPoint);
                  }}
                  disabled={routeLoading || busy || navigationActive}
                  loading={routeLoading}
                >
                  {routeLoading ? "Calculating route..." : "Refresh estimate"}
                </Btn>

                {routeOptions.map((route) => {
                  const selected = selectedRouteId === route.id;
                  const expanded = expandedRoute === route.id;
                  const remainingRatio = route.distanceMeters > 0 && navigationProgress && selected
                    ? Math.min(1, navigationProgress.remainingMeters / route.distanceMeters)
                    : 1;
                  const remainingSeconds = navigationProgress && selected && navigationProgress.remainingMeters <= 35
                    ? 0
                    : route.durationSeconds * remainingRatio;
                  return (
                    <View
                      key={route.id}
                      style={{
                        gap: 8, padding: 13, borderRadius: 16,
                        backgroundColor: colors.card,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.line,
                      }}
                    >
                      <Press
                        onPress={() => {
                          if (navigationActive) return;
                          selectedRouteIdRef.current = route.id;
                          setSelectedRouteId(route.id);
                          setPreviewRoute(route.id);
                          setNavigationProgress(null);
                          progressIndexRef.current = 0;
                        }}
                        disabled={navigationActive}
                        label={`Select route option ${route.roadSummary}`}
                        style={{ gap: 4 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <T s={1.15} w={800}>{formatDuration(remainingSeconds)}</T>
                          <T s={0.88} w={700} c="muted">{formatDistance(navigationProgress && selected ? navigationProgress.remainingMeters : route.distanceMeters)}</T>
                        </View>
                        <T s={0.82} w={700}>{route.roadSummary}</T>
                        <T s={0.78} c="muted">
                          {navigationProgress && selected && navigationProgress.remainingMeters <= 35
                            ? "Arrived"
                            : `ETA ${formatEta(navigationProgress && selected ? remainingSeconds : route.durationSeconds)}`}
                          {" · Toll and live traffic info unavailable"}
                        </T>
                      </Press>
                      {expanded ? (
                        <T s={0.78} c="muted" lh={1.4}>
                          Road names and turn prompts are derived from OSRM route steps. Live traffic, toll pricing, and voice guidance are not provided.
                        </T>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Btn kind="o" sm flex onPress={() => setExpandedRoute(expanded ? null : route.id)} label={`${expanded ? "Hide" : "Show"} route details`}>
                          {expanded ? "Hide details" : "Details"}
                        </Btn>
                        <Btn
                          kind={selected ? "s" : "o"}
                          sm
                          flex
                          disabled={navigationActive}
                          onPress={() => {
                            selectedRouteIdRef.current = route.id;
                            setSelectedRouteId(route.id);
                            setPreviewRoute(route.id);
                            setNavigationProgress(null);
                            progressIndexRef.current = 0;
                          }}
                          label="Preview route on map"
                        >
                          {selected ? "Previewing" : "Preview"}
                        </Btn>
                      </View>
                      {selected ? (
                        <Btn kind="p" icon="drive" onPress={() => void startNavigation()} disabled={routeLoading || busy} loading={busy}>
                          {busy ? "Starting GPS..." : "Start navigation"}
                        </Btn>
                      ) : null}
                    </View>
                  );
                })}
                {navigationProgress && !navigationActive ? (
                  <View style={{ gap: 5, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
                    <T s={0.9} w={700} c={colors.primaryInk}>
                      {navigationProgress.remainingMeters <= 35 ? "Arrived at destination" : "Navigation stopped"}
                    </T>
                    {navigationProgress.deviationMeters > 100 ? (
                      <T s={0.78} c={colors.warningInk}>You appear away from the planned route. Refresh the estimate from your current location.</T>
                    ) : null}
                  </View>
                ) : null}
                <T s={0.72} c="muted">Routing by OSRM · Map data © OpenStreetMap contributors</T>
              </View>
            ) : (
              <T s={0.82} c="muted">Set a starting point and destination to see a route estimate.</T>
            )}
            <TripSharing
              visible={screenPresented}
              tracking={tracking}
              point={tracking && location ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy,
              } : null}
            />
          </ScrollView>
        )}

        {estimateOpen ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 18), backgroundColor: colors.scrim }}>
            <View style={{ width: "100%", maxWidth: 440, padding: 20, borderRadius: 22, backgroundColor: colors.card, gap: 16, elevation: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T s={1.15} w={800}>Pickup estimate</T>
                <Press onPress={closeEstimate} label="Close pickup estimate" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="x" size={20} color={colors.ink} stroke={2} />
                </Press>
              </View>

              <View style={{ minHeight: 112, alignItems: "center", justifyContent: "center", padding: 16, gap: 6, borderRadius: 16, backgroundColor: colors.primarySoft }}>
                {routeLoading || busy || schoolLoading ? (
                  <T s={0.98} w={700} c={colors.primaryInk} align="center">Calculating estimate...</T>
                ) : selectedRoute ? (
                  <>
                    <T s={1.5} w={800} c={colors.primaryInk} align="center">
                      {formatDistance(selectedRoute.distanceMeters)} · {formatDuration(selectedRoute.durationSeconds)}
                    </T>
                    <T s={0.88} w={700} c={colors.primaryInk} align="center">ETA {formatEta(selectedRoute.durationSeconds)}</T>
                  </>
                ) : (
                  <T s={0.98} w={700} c={colors.primaryInk} align="center">Estimate location will show here</T>
                )}
              </View>

              {routeError ? <T s={0.82} c={colors.danger} lh={1.35}>{routeError}</T> : null}
              {backupNotice ? <T s={0.82} c={colors.primaryInk} lh={1.35}>{backupNotice}</T> : null}
              {backupError ? <T s={0.82} c={colors.danger} lh={1.35}>{backupError}</T> : null}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Btn
                  kind="p"
                  flex
                  onPress={() => {
                    setEstimateOpen(false);
                    void startNavigation();
                  }}
                  disabled={!routeReady || routeLoading || busy || !selectedRoute}
                  loading={busy}
                  label="Start navigation to the school"
                >
                  GO
                </Btn>
                <Btn
                  kind="o"
                  flex
                  onPress={() => void activateBackup()}
                  disabled={backupBusy}
                  loading={backupBusy}
                  label="Activate backup pickup"
                >
                  activate back up
                </Btn>
              </View>

              <T s={0.82} w={800} c="muted" align="center" up>PICK UP "{mockData.child.name}" NOW</T>
              <T s={0.7} c="muted" align="center">Route and arrival estimates are approximate; live traffic is not included.</T>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
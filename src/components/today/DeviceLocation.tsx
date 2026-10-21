import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, ScrollView, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { Btn, Input, Press, T } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { DeviceLocationCoordinate, DeviceLocationPoint, RouteCoordinate } from "./DeviceLocationMap.types";
import { TripSharing } from "./TripSharing";

type SearchTarget = "start" | "destination";
type TravelMode = "driving" | "motorcycle" | "transit" | "walking" | "cycling";

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

const TRAVEL_MODES: ReadonlyArray<{ id: TravelMode; label: string; icon: "car" | "motorbike" | "bus" | "walk" | "bicycle" }> = [
  { id: "driving", label: "Driving", icon: "car" },
  { id: "motorcycle", label: "Motorcycle", icon: "motorbike" },
  { id: "transit", label: "Transit", icon: "bus" },
  { id: "walking", label: "Walking", icon: "walk" },
  { id: "cycling", label: "Bicycle", icon: "bicycle" },
];

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
  distanceMeters: number;
  durationSeconds: number;
  roadSummary: string;
};

type NavigationProgress = {
  travelledCoordinates: RouteCoordinate[];
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
    if (Array.isArray(rawRoute.legs)) {
      for (const leg of rawRoute.legs) {
        if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
        for (const step of leg.steps) {
          if (isRecord(step) && typeof step.name === "string" && step.name.trim()) roadNames.push(step.name.trim());
        }
      }
    }
    const summary = [...new Set(roadNames)].slice(0, 3);
    return {
      id: `osrm-${routeIndex}`,
      coordinates,
      cumulativeMeters,
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

function formatSpeed(speed: number | null): string {
  return speed === null || speed < 0 ? "Unavailable" : `${Math.round(speed * 3.6)} km/h`;
}

function formatHeading(heading: number | null): string {
  if (heading === null || heading < 0) return "Unavailable";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const normalized = ((heading % 360) + 360) % 360;
  return `${Math.round(normalized)}° ${directions[Math.round(normalized / 45) % directions.length]}`;
}

export function DeviceLocationModal({ visible, onClose, onLocationUpdate, onLocationError }: DeviceLocationModalProps) {
  const { theme } = useAppContext();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const subscription = useRef<LocationSubscription | null>(null);
  const trackingRequestId = useRef(0);
  const routingRequestId = useRef(0);
  const routingController = useRef<AbortController | null>(null);
  const routeOptionsRef = useRef<PlannedRoute[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);
  const navigationActiveRef = useRef(false);
  const progressIndexRef = useRef(0);
  const callbacks = useRef({ onLocationUpdate, onLocationError });
  callbacks.current = { onLocationUpdate, onLocationError };
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [currentLatitude, setCurrentLatitude] = useState("");
  const [currentLongitude, setCurrentLongitude] = useState("");
  const [destinationLatitude, setDestinationLatitude] = useState("");
  const [destinationLongitude, setDestinationLongitude] = useState("");
  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [activeSearch, setActiveSearch] = useState<SearchTarget | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
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
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState<NavigationProgress | null>(null);

  routeOptionsRef.current = routeOptions;
  selectedRouteIdRef.current = selectedRouteId;

  useEffect(() => {
    if (visible) return;
    trackingRequestId.current += 1;
    routingRequestId.current += 1;
    routingController.current?.abort();
    routingController.current = null;
    subscription.current?.remove();
    subscription.current = null;
    routeOptionsRef.current = [];
    selectedRouteIdRef.current = null;
    navigationActiveRef.current = false;
    progressIndexRef.current = 0;
    setLocation(null);
    setCurrentLatitude("");
    setCurrentLongitude("");
    setDestinationLatitude("");
    setDestinationLongitude("");
    setStartText("");
    setDestinationText("");
    setActiveSearch(null);
    setShowCoordinates(false);
    setTravelMode("driving");
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
    setNavigationActive(false);
    setNavigationProgress(null);
  }, [visible]);

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
    setLocation(next);
    setCurrentLatitude(latitude.toFixed(6));
    setCurrentLongitude(longitude.toFixed(6));
    setStartText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
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

  const editCurrentCoordinate = (setter: (value: string) => void, value: string) => {
    clearRoutePlan();
    stopTracking();
    setLocation(null);
    setStartText("Pinned starting point");
    setter(value);
    setPreviewRoute(null);
  };

  const calculateRoutes = async (
    origin: DeviceLocationCoordinate,
    destination: DeviceLocationCoordinate,
    preferredRouteId?: string | null,
  ): Promise<boolean> => {
    if (travelMode !== "driving") {
      setRouteOptions([]);
      setSelectedRouteId(null);
      setPreviewRoute(null);
      setRouteError("The public OSRM routing profile supports driving routes only. Select Driving to calculate a route.");
      return false;
    }
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
  ) => {
    if (busy || tracking) return;
    const requestId = trackingRequestId.current + 1;
    trackingRequestId.current = requestId;
    const isCurrentRequest = () => requestId === trackingRequestId.current && visible;
    setBusy(true);
    setError("");
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
        reportLocationError("Location permission is needed to show this phone on the map.");
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrentRequest()) return;
      if (!servicesEnabled) {
        reportLocationError("Turn on location services on this phone, then try again.");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isCurrentRequest()) return;
      updateLocation(initial);
      if (navigateAfterFix && plannedDestination) {
        const routeReady = await calculateRoutes(
          { latitude: initial.coords.latitude, longitude: initial.coords.longitude },
          plannedDestination,
          preferredRouteId,
        );
        if (!isCurrentRequest() || !routeReady) return;
        navigationActiveRef.current = true;
        setNavigationActive(true);
      }
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
        return;
      }
      subscription.current?.remove();
      subscription.current = nextSubscription;
      setTracking(true);
    } catch (cause) {
      if (!isCurrentRequest()) return;
      const reason = cause instanceof Error ? cause.message : "Unknown location error";
      reportLocationError("Unable to get this phone's location. Check GPS availability and try again.", reason);
    } finally {
      if (isCurrentRequest()) setBusy(false);
    }
  };

  const currentCoordinates = parseCoordinates(currentLatitude, currentLongitude);
  const destinationCoordinates = parseCoordinates(destinationLatitude, destinationLongitude);
  const currentPoint: DeviceLocationPoint | null = currentCoordinates.kind === "valid"
    ? {
      ...currentCoordinates.coordinate,
      accuracy: location?.coords.accuracy ?? null,
      title: startText || "Starting point",
      detail: tracking ? "Live device location" : "Selected current location",
    }
    : null;
  const destinationPoint = destinationCoordinates.kind === "valid" ? destinationCoordinates.coordinate : null;
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

  const startNavigation = async () => {
    if (!routeReady || !destinationPoint || routeLoading || busy) return;
    setRouteError("");
    if (travelMode !== "driving") {
      setRouteError("The public OSRM routing profile supports driving routes only. Select Driving to navigate.");
      return;
    }
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

  const swapLocations = () => {
    clearRoutePlan();
    stopTracking();
    setLocation(null);
    setStartText(destinationText);
    setDestinationText(startText);
    setCurrentLatitude(destinationLatitude);
    setCurrentLongitude(destinationLongitude);
    setDestinationLatitude(currentLatitude);
    setDestinationLongitude(currentLongitude);
    setPreviewRoute(null);
    setActiveSearch(null);
  };

  const destinationSuggestions = activeSearch ? placesForSearch(activeSearch) : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <T s={1.15} w={800}>Plan a route</T>
            <T s={0.78} c="muted">{tracking ? "Live location active" : "Route preview"}</T>
          </View>
          <Press onPress={onClose} label="Close my location" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={20} color={colors.ink} stroke={2} />
          </Press>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) }}
        >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
          accessibilityLabel="Transportation modes"
        >
          {TRAVEL_MODES.map((mode) => {
            const selected = travelMode === mode.id;
            return (
              <Press
                key={mode.id}
                onPress={() => {
                  clearRoutePlan();
                  setTravelMode(mode.id);
                  setPreviewRoute(null);
                }}
                label={`${mode.label} travel mode`}
                state={{ selected }}
                style={{
                  minWidth: 72, minHeight: 58, paddingHorizontal: 10, borderRadius: 14,
                  alignItems: "center", justifyContent: "center", gap: 3,
                  backgroundColor: selected ? colors.primarySoft : colors.card,
                  borderWidth: 1, borderColor: selected ? colors.primary : colors.line,
                }}
              >
                <MaterialCommunityIcons name={mode.icon} size={21} color={selected ? colors.primaryInk : colors.muted} />
                <T s={0.68} w={selected ? 700 : 600} c={selected ? colors.primaryInk : "muted"}>{mode.label}</T>
              </Press>
            );
          })}
        </ScrollView>

        <View style={{ height: 220, minHeight: 180, marginHorizontal: 12, borderRadius: 18, overflow: "hidden", backgroundColor: colors.map }}>
          {currentPoint || destinationPoint ? (
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
              <T w={700} align="center">Choose a starting point and destination</T>
              <T s={0.88} c="muted" align="center" lh={1.4}>The route map appears when both points are set.</T>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Input
                  accessibilityLabel="Starting point"
                  value={startText}
                  onFocus={() => setActiveSearch("start")}
                  onChangeText={(value) => editPlaceText("start", value)}
                  placeholder="Starting point or current location"
                  returnKeyType="search"
                />
                <Input
                  accessibilityLabel="Destination"
                  value={destinationText}
                  onFocus={() => setActiveSearch("destination")}
                  onChangeText={(value) => editPlaceText("destination", value)}
                  placeholder="Destination (e.g. Kajang, Selangor)"
                  returnKeyType="search"
                />
              </View>
              <Press
                onPress={swapLocations}
                label="Swap starting point and destination"
                style={{
                  width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center",
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
                }}
              >
                <Icon name="swap" size={21} color={colors.primary} />
              </Press>
            </View>

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
                    <T s={0.82} c="muted">No demo places match. Choose a point on the map or enter coordinates.</T>
                  </View>
                )}
              </View>
            ) : null}

            <Press
              onPress={() => void startTracking()}
              disabled={busy || tracking}
              label="Use this device's current GPS location"
              style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}
            >
              <Icon name="look" size={18} color={colors.primary} />
              <T s={0.86} w={700} c={colors.primaryInk}>{busy ? "Finding your location..." : tracking ? "Using live device location" : "Use current location"}</T>
            </Press>
          </View>

          <Press
            onPress={() => setShowCoordinates((shown) => !shown)}
            label={showCoordinates ? "Hide coordinate entry" : "Enter coordinates manually"}
            style={{ minHeight: 40, justifyContent: "center" }}
          >
            <T s={0.82} w={700} c={colors.primaryInk}>{showCoordinates ? "Hide coordinate entry" : "Enter coordinates manually"}</T>
          </Press>
          {showCoordinates ? (
            <View style={{ gap: 8 }}>
              <T s={0.82} c="muted">Decimal coordinates: latitude -90 to 90, longitude -180 to 180.</T>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input accessibilityLabel="Starting latitude" value={currentLatitude} onChangeText={(value) => editCurrentCoordinate(setCurrentLatitude, value)} placeholder="Start latitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input accessibilityLabel="Starting longitude" value={currentLongitude} onChangeText={(value) => editCurrentCoordinate(setCurrentLongitude, value)} placeholder="Start longitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input accessibilityLabel="Destination latitude" value={destinationLatitude} onChangeText={(value) => { clearRoutePlan(); setDestinationLatitude(value); setDestinationText("Pinned destination"); setPreviewRoute(null); }} placeholder="End latitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input accessibilityLabel="Destination longitude" value={destinationLongitude} onChangeText={(value) => { clearRoutePlan(); setDestinationLongitude(value); setDestinationText("Pinned destination"); setPreviewRoute(null); }} placeholder="End longitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
              </View>
              {currentCoordinates.kind === "invalid" ? <T s={0.82} c={colors.danger}>Enter a valid starting latitude and longitude.</T> : null}
              {destinationCoordinates.kind === "invalid" ? <T s={0.82} c={colors.danger}>Enter a valid destination latitude and longitude.</T> : null}
            </View>
          ) : null}

          {location ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T s={0.72} c="muted">ACCURACY</T>
                  <T s={0.9} w={700}>{location.coords.accuracy === null ? "Unknown" : `About ${Math.round(location.coords.accuracy)} m`}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T s={0.72} c="muted">UPDATED</T>
                  <T s={0.9} w={700}>{new Date(location.timestamp).toLocaleTimeString()}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T s={0.72} c="muted">STATUS</T>
                  <T s={0.9} w={700} c={tracking ? colors.success : colors.muted}>{tracking ? "Live" : "Stopped"}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T s={0.72} c="muted">SPEED</T>
                  <T s={0.9} w={700}>{formatSpeed(location.coords.speed)}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T s={0.72} c="muted">HEADING</T>
                  <T s={0.9} w={700}>{formatHeading(location.coords.heading)}</T>
                </View>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={{ gap: 8 }}>
              <T s={0.88} c={colors.danger} lh={1.35}>{error}</T>
              {permissionBlocked && Platform.OS !== "web" ? <Btn kind="o" onPress={() => void Linking.openSettings()}>Open phone settings</Btn> : null}
            </View>
          ) : null}

          {routeReady ? (
            <View style={{ gap: 10, paddingTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T s={1.05} w={800}>Route options</T>
                <View style={{ backgroundColor: colors.warning, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                  <T s={0.66} w={700} c={colors.warningInk}>OSRM</T>
                </View>
              </View>
              <T s={0.78} c="muted" lh={1.35}>
                Routes use the public OSRM driving service and OpenStreetMap data. Live traffic and toll data are not provided.
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
                {routeLoading ? "Calculating route..." : "Find driving routes"}
              </Btn>
              {travelMode !== "driving" ? (
                <T s={0.82} c={colors.warningInk}>The selected public OSRM service supports driving routes only. Select Driving to calculate.</T>
              ) : null}
              {routeError ? <T s={0.84} c={colors.danger}>{routeError}</T> : null}

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
                        Route distance and estimated duration are from OSRM. Turn-by-turn guidance, traffic, and toll pricing are not included.
                      </T>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Btn
                        kind="o"
                        sm
                        flex
                        onPress={() => setExpandedRoute(expanded ? null : route.id)}
                        label={`${expanded ? "Hide" : "Show"} route details`}
                      >
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
                    {selected && !navigationActive ? (
                      <Btn kind="p" icon="drive" onPress={() => void startNavigation()} disabled={routeLoading || busy} loading={busy}>
                        {busy ? "Starting GPS..." : "Go"}
                      </Btn>
                    ) : null}
                  </View>
                );
              })}
              {navigationProgress ? (
                <View style={{ gap: 5, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
                  <T s={0.9} w={700} c={colors.primaryInk}>
                    {navigationProgress.remainingMeters <= 35
                      ? "Arrived at destination"
                      : navigationActive
                        ? `On route · ${formatDistance(navigationProgress.remainingMeters)} remaining`
                        : "Navigation stopped"}
                  </T>
                  {navigationActive && navigationProgress.deviationMeters > 100 ? (
                    <T s={0.78} c={colors.warningInk}>You appear away from the planned route. Stop and recalculate from your current location.</T>
                  ) : null}
                </View>
              ) : null}
              {navigationActive ? (
                <Btn kind="o" icon="cantx" color={colors.danger} onPress={stopNavigation} label="Stop navigation and GPS tracking">
                  Stop navigation
                </Btn>
              ) : null}
              <T s={0.72} c="muted">Routing by OSRM · Map data © OpenStreetMap contributors</T>
            </View>
          ) : (
            <T s={0.82} c="muted">Choose a start and destination before requesting a driving route.</T>
          )}

          {tracking && !navigationActive ? <Btn kind="o" icon="cantx" color={colors.danger} onPress={stopTracking} label="Stop live location updates">Stop GPS</Btn> : null}
          <T s={0.76} c="muted" align="center" lh={1.35}>
            GPS updates run only while this screen is open. Route matching and arrival estimates are approximate; this screen does not provide turn-by-turn voice guidance. {Platform.OS === "web" ? "Interactive map selection is available in the native app." : "Tap the map to set a destination."}
          </T>
          <TripSharing
            visible={visible}
            tracking={tracking}
            point={tracking && location ? {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            } : null}
          />
        </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
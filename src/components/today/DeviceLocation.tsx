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
import type { DeviceLocationCoordinate, DeviceLocationPoint } from "./DeviceLocationMap.types";
import { TripSharing } from "./TripSharing";

type SearchTarget = "start" | "destination";
type TravelMode = "driving" | "motorcycle" | "transit" | "walking" | "cycling";

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

type DemoRoute = {
  id: string;
  duration: string;
  distance: string;
  road: string;
  status: string;
  toll: string;
};

const DEMO_ROUTES: Record<TravelMode, readonly DemoRoute[]> = {
  driving: [
    { id: "fastest", duration: "1 hr 41 min", distance: "141 km", road: "via Lebuhraya Utara-Selatan/E2", status: "Fastest · usual traffic", toll: "Toll roads may apply" },
    { id: "alternative", duration: "1 hr 56 min", distance: "149 km", road: "via the alternate highway", status: "Alternative route", toll: "Toll roads may apply" },
  ],
  motorcycle: [
    { id: "fastest", duration: "1 hr 41 min", distance: "141 km", road: "via Lebuhraya Utara-Selatan/E2", status: "Fastest · usual traffic", toll: "Toll roads may apply" },
    { id: "alternative", duration: "1 hr 56 min", distance: "149 km", road: "via the alternate highway", status: "Alternative route", toll: "Toll roads may apply" },
  ],
  transit: [
    { id: "fastest", duration: "2 hr 18 min", distance: "141 km", road: "via sample rail and bus connections", status: "Suggested transit option", toll: "Fares not available" },
    { id: "alternative", duration: "2 hr 42 min", distance: "149 km", road: "via alternate sample connections", status: "Alternative transit option", toll: "Fares not available" },
  ],
  walking: [
    { id: "fastest", duration: "28 hr 12 min", distance: "141 km", road: "via sample walking paths", status: "Suggested walking option", toll: "No toll estimate" },
    { id: "alternative", duration: "29 hr 48 min", distance: "149 km", road: "via alternate sample paths", status: "Alternative walking option", toll: "No toll estimate" },
  ],
  cycling: [
    { id: "fastest", duration: "9 hr 24 min", distance: "141 km", road: "via sample cycling paths", status: "Suggested cycling option", toll: "No toll estimate" },
    { id: "alternative", duration: "9 hr 56 min", distance: "149 km", road: "via alternate sample paths", status: "Alternative cycling option", toll: "No toll estimate" },
  ],
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

export function DeviceLocationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAppContext();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const subscription = useRef<LocationSubscription | null>(null);
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

  useEffect(() => {
    if (visible) return;
    subscription.current?.remove();
    subscription.current = null;
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
  }, [visible]);

  useEffect(() => () => subscription.current?.remove(), []);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopTracking();
    });
    return () => listener.remove();
  }, []);

  const stopTracking = () => {
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
  };

  const updateLocation = (next: LocationObject) => {
    const latitude = next.coords.latitude;
    const longitude = next.coords.longitude;
    setLocation(next);
    setCurrentLatitude(latitude.toFixed(6));
    setCurrentLongitude(longitude.toFixed(6));
    setStartText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    setActiveSearch(null);
  };

  const editCurrentCoordinate = (setter: (value: string) => void, value: string) => {
    stopTracking();
    setLocation(null);
    setStartText("Pinned starting point");
    setter(value);
    setPreviewRoute(null);
  };

  const startTracking = async () => {
    if (busy || tracking) return;
    setBusy(true);
    setError("");
    setPermissionBlocked(false);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== "granted") {
        setPermissionBlocked(!permission.canAskAgain);
        setError("Location permission is needed to show this phone on the map.");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setError("Turn on location services on this phone, then try again.");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      updateLocation(initial);
      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        updateLocation,
      );
      setTracking(true);
    } catch {
      setError("Unable to get this phone's location. Check GPS availability and try again.");
    } finally {
      setBusy(false);
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
    setDestinationLatitude(coordinate.latitude.toFixed(6));
    setDestinationLongitude(coordinate.longitude.toFixed(6));
    setDestinationText("Map pin");
    setActiveSearch(null);
    setPreviewRoute(null);
  };
  const routeReady = currentPoint !== null && destinationPoint !== null;

  const placesForSearch = (target: SearchTarget) => {
    const query = (target === "start" ? startText : destinationText).trim().toLowerCase();
    return DEMO_PLACES
      .filter((place) => !query || place.name.toLowerCase().includes(query))
      .slice(0, 4);
  };

  const choosePlace = (target: SearchTarget, place: (typeof DEMO_PLACES)[number]) => {
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
                onPress={() => { setTravelMode(mode.id); setPreviewRoute(null); }}
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
              showPreview={previewRoute !== null}
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
                  <Input accessibilityLabel="Destination latitude" value={destinationLatitude} onChangeText={(value) => { setDestinationLatitude(value); setDestinationText("Pinned destination"); setPreviewRoute(null); }} placeholder="End latitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input accessibilityLabel="Destination longitude" value={destinationLongitude} onChangeText={(value) => { setDestinationLongitude(value); setDestinationText("Pinned destination"); setPreviewRoute(null); }} placeholder="End longitude" keyboardType="numbers-and-punctuation" maxLength={16} />
                </View>
              </View>
              {currentCoordinates.kind === "invalid" ? <T s={0.82} c={colors.danger}>Enter a valid starting latitude and longitude.</T> : null}
              {destinationCoordinates.kind === "invalid" ? <T s={0.82} c={colors.danger}>Enter a valid destination latitude and longitude.</T> : null}
            </View>
          ) : null}

          {location ? (
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
                  <T s={0.66} w={700} c={colors.warningInk}>DEMO</T>
                </View>
              </View>
              <T s={0.78} c="muted" lh={1.35}>Illustrative sample estimates only. Live traffic, road routing and place search are not connected.</T>
              {DEMO_ROUTES[travelMode].map((route) => {
                const selected = previewRoute === route.id;
                const expanded = expandedRoute === route.id;
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
                      onPress={() => setPreviewRoute(route.id)}
                      label={`Select ${route.status} route preview`}
                      style={{ gap: 4 }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <T s={1.15} w={800}>{route.duration}</T>
                        <T s={0.88} w={700} c="muted">{route.distance}</T>
                      </View>
                      <T s={0.82} w={700}>{route.road}</T>
                      <T s={0.78} c="muted">{route.status} · {route.toll}</T>
                    </Press>
                    {expanded ? (
                      <T s={0.78} c="muted" lh={1.4}>
                        {travelMode === "driving" || travelMode === "motorcycle"
                          ? "This example route mentions a toll-road corridor for demonstration. Confirm the real route and tolls with a navigation service."
                          : "Travel time, transit availability and pathways are not connected to a live routing service."}
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
                        onPress={() => setPreviewRoute(route.id)}
                        label="Preview illustrative route on map"
                      >
                        {selected ? "Previewing" : "Preview"}
                      </Btn>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <T s={0.82} c="muted">Choose known demo places, use GPS, or tap the native map to set both route points.</T>
          )}

          {tracking ? <Btn kind="o" icon="cantx" color={colors.danger} onPress={stopTracking} label="Stop live location updates">Stop GPS</Btn> : null}
          <T s={0.76} c="muted" align="center" lh={1.35}>
            GPS updates are live only while this screen is open. Search suggestions and route cards are demo data. {Platform.OS === "web" ? "Interactive map selection is available in the native app." : "Tap the map to set a destination; the line preview is not road directions."}
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
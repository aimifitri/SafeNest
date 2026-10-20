import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { Btn, Field, Input, Press, T } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { DeviceLocationCoordinate, DeviceLocationPoint } from "./DeviceLocationMap.types";
import { TripSharing } from "./TripSharing";

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
    setLocation(next);
    setCurrentLatitude(next.coords.latitude.toFixed(6));
    setCurrentLongitude(next.coords.longitude.toFixed(6));
  };

  const editCurrentCoordinate = (setter: (value: string) => void, value: string) => {
    stopTracking();
    setLocation(null);
    setter(value);
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
      title: "Current location",
      detail: tracking ? "Live device location" : "Selected current location",
    }
    : null;
  const destinationPoint = destinationCoordinates.kind === "valid" ? destinationCoordinates.coordinate : null;
  const selectDestination = (coordinate: DeviceLocationCoordinate) => {
    setDestinationLatitude(coordinate.latitude.toFixed(6));
    setDestinationLongitude(coordinate.longitude.toFixed(6));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ minHeight: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <T s={1.15} w={800}>My location</T>
            <T s={0.78} c="muted">{tracking ? "Live location" : "This phone only"}</T>
          </View>
          <Press onPress={onClose} label="Close my location" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={20} color={colors.ink} stroke={2} />
          </Press>
        </View>

        <View style={{ flex: 1, minHeight: 180, marginTop: 8, backgroundColor: colors.map }}>
          {currentPoint || destinationPoint ? (
            <DeviceLocationMap point={currentPoint} destination={destinationPoint} onSelectDestination={selectDestination} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
              <Icon name="look" size={34} color={colors.primary} stroke={1.8} />
              <T w={700} align="center">Set a location to show the map</T>
              <T s={0.88} c="muted" align="center" lh={1.4}>Use GPS or enter coordinates below for your current location or destination.</T>
            </View>
          )}
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }}
        >
          <Field label="Current location coordinates">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Input
                  accessibilityLabel="Current location latitude"
                  value={currentLatitude}
                  onChangeText={(value) => editCurrentCoordinate(setCurrentLatitude, value)}
                  placeholder="Latitude"
                  keyboardType="numbers-and-punctuation"
                  maxLength={16}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  accessibilityLabel="Current location longitude"
                  value={currentLongitude}
                  onChangeText={(value) => editCurrentCoordinate(setCurrentLongitude, value)}
                  placeholder="Longitude"
                  keyboardType="numbers-and-punctuation"
                  maxLength={16}
                />
              </View>
            </View>
          </Field>

          <Field label="Destination coordinates">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Input
                  accessibilityLabel="Destination latitude"
                  value={destinationLatitude}
                  onChangeText={setDestinationLatitude}
                  placeholder="Latitude"
                  keyboardType="numbers-and-punctuation"
                  maxLength={16}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  accessibilityLabel="Destination longitude"
                  value={destinationLongitude}
                  onChangeText={setDestinationLongitude}
                  placeholder="Longitude"
                  keyboardType="numbers-and-punctuation"
                  maxLength={16}
                />
              </View>
            </View>
          </Field>
          <T s={0.78} c="muted" lh={1.35}>
            Enter decimal coordinates between -90 and 90 latitude, and -180 and 180 longitude.
            {Platform.OS === "web" ? "" : " You can also tap the map to set the destination."}
          </T>
          {currentCoordinates.kind === "invalid" ? (
            <T s={0.84} c={colors.danger}>Enter a valid latitude and longitude for the current location.</T>
          ) : null}
          {destinationCoordinates.kind === "invalid" ? (
            <T s={0.84} c={colors.danger}>Enter a valid latitude and longitude for the destination.</T>
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

          {tracking ? (
            <Btn kind="o" icon="cantx" color={colors.danger} onPress={stopTracking} label="Stop live location updates">Stop GPS</Btn>
          ) : (
            <Btn kind="p" icon="look" onPress={() => void startTracking()} disabled={busy} label="Request permission and start live GPS updates">
              {busy ? "Getting location..." : "Use my location"}
            </Btn>
          )}
          <T s={0.78} c="muted" align="center" lh={1.35}>GPS updates only while this screen is open. Select guardians below to share. The line is a straight-line preview, not road directions.</T>
          <TripSharing
            visible={visible}
            tracking={tracking}
            point={tracking && location ? {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            } : null}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
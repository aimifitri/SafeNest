import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Linking, Modal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { Btn, Input, Press, T } from "../shared/ui";
import type { DeviceLocationPoint } from "./DeviceLocationMap.native";
import { DeviceLocationMap } from "./DeviceLocationMap";
import { TripSharing } from "./TripSharing";

export function DeviceLocationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAppContext();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const subscription = useRef<LocationSubscription | null>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<DeviceLocationPoint | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // Invalidate async work when closing, stopping, or leaving the foreground.
  const session = useRef(0);
  const searchRequest = useRef(0);
  const starting = useRef(false);

  useEffect(() => {
    if (visible) return;
    session.current += 1;
    searchRequest.current += 1;
    starting.current = false;
    subscription.current?.remove();
    subscription.current = null;
    setLocation(null);
    setTracking(false);
    setBusy(false);
    setPermissionBlocked(false);
    setError("");
    setQuery("");
    setDestination(null);
    setSearching(false);
    setSearchError("");
  }, [visible]);

  useEffect(() => () => {
    session.current += 1;
    searchRequest.current += 1;
    subscription.current?.remove();
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      // Permission dialogs temporarily make iOS inactive; only cancel on background.
      if (state === "background") stopTracking();
    });
    return () => listener.remove();
  }, []);

  const stopTracking = () => {
    session.current += 1;
    starting.current = false;
    setBusy(false);
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
  };

  const startTracking = async () => {
    if (starting.current || tracking) return;
    starting.current = true;
    const request = ++session.current;
    setBusy(true);
    setError("");
    setPermissionBlocked(false);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (request !== session.current) return;
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (request !== session.current) return;
      if (permission.status !== "granted") {
        setPermissionBlocked(!permission.canAskAgain);
        setError("Location permission is needed to show this phone on the map.");
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (request !== session.current) return;
      if (!servicesEnabled) {
        setError("Turn on location services on this phone, then try again.");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (request !== session.current) return;
      setLocation(initial);
      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (next) => { if (request === session.current) setLocation(next); },
        () => {
          if (request !== session.current) return;
          stopTracking();
          setError("Location updates stopped. Check GPS availability and try again.");
        },
      );
      if (request !== session.current) { watcher.remove(); return; }
      subscription.current = watcher;
      setTracking(true);
    } catch {
      if (request !== session.current) return;
      setError("Unable to get this phone's location. Check GPS availability and try again.");
    } finally {
      if (request === session.current) {
        starting.current = false;
        setBusy(false);
      }
    }
  };

  const searchDestination = async () => {
    const address = query.trim();
    if (!address || searching) return;
    Keyboard.dismiss();
    const request = ++searchRequest.current;
    setSearching(true);
    setSearchError("");
    try {
      if (Platform.OS === "web") {
        setSearchError("Destination search is available in the iOS and Android app.");
        return;
      }
      // Android's native geocoder requires foreground location permission.
      if (Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (request !== searchRequest.current) return;
        if (permission.status !== "granted") {
          setSearchError("Allow location permission to search for a destination.");
          setPermissionBlocked(!permission.canAskAgain);
          setError("Location permission is needed to search on Android.");
          return;
        }
      }
      const results = await Location.geocodeAsync(address);
      if (request !== searchRequest.current) return;
      if (!results.length) {
        setSearchError("Address not found. Try a full address including the city.");
        return;
      }
      setDestination({ ...results[0], accuracy: null, title: address });
    } catch {
      if (request === searchRequest.current) setSearchError("Unable to search right now. Check your connection and try again.");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
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
          {location ? (
            <DeviceLocationMap destination={destination} point={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              title: "This phone",
              detail: "Your current device location",
            }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
              <Icon name="look" size={34} color={colors.primary} stroke={1.8} />
              <T w={700} align="center">Location is off</T>
              <T s={0.88} c="muted" align="center" lh={1.4}>Start GPS to show this phone's position on the map.</T>
            </View>
          )}
          <View style={{ position: "absolute", top: 12, left: 16, right: 16, padding: 10, borderRadius: 18, backgroundColor: colors.card, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Input
                style={{ flex: 1 }}
                value={query}
                onChangeText={(text) => {
                  searchRequest.current += 1;
                  setSearching(false);
                  setSearchError("");
                  setQuery(text);
                }}
                placeholder="Destination name or address"
                accessibilityLabel="Destination name or address"
                returnKeyType="search"
                onSubmitEditing={() => void searchDestination()}
                maxLength={300}
              />
              <Btn kind="p" disabled={searching || !query.trim()} onPress={() => void searchDestination()}>{searching ? "Searching…" : "Search"}</Btn>
            </View>
            {searchError ? <T s={0.8} c={colors.danger}>{searchError}</T> : null}
            {destination ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T s={0.8} style={{ flex: 1 }} lines={2}>{destination.title}</T>
                <Btn kind="o" onPress={() => { searchRequest.current += 1; setSearching(false); setDestination(null); setQuery(""); setSearchError(""); }}>Clear</Btn>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView style={{ flexGrow: 0, maxHeight: "45%" }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }} keyboardShouldPersistTaps="handled">
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
              {permissionBlocked ? <Btn kind="o" onPress={() => void Linking.openSettings()}>Open phone settings</Btn> : null}
            </View>
          ) : null}

          {tracking ? (
            <Btn kind="o" icon="cantx" color={colors.danger} onPress={stopTracking} label="Stop live location updates">Stop GPS</Btn>
          ) : (
            <Btn kind="p" icon="look" onPress={() => void startTracking()} disabled={busy} label="Request permission and start live GPS updates">
              {busy ? "Getting location..." : "Use my location"}
            </Btn>
          )}
          <T s={0.78} c="muted" align="center" lh={1.35}>Location updates only while this screen is open. Use the controls below to share with selected guardians.</T>
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

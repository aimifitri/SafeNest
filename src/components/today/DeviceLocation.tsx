import type { LocationObject, LocationSubscription } from "expo-location";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { Btn, Press, T } from "../shared/ui";
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

  useEffect(() => {
    if (visible) return;
    subscription.current?.remove();
    subscription.current = null;
    setLocation(null);
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
      setLocation(initial);
      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        setLocation,
      );
      setTracking(true);
    } catch {
      setError("Unable to get this phone's location. Check GPS availability and try again.");
    } finally {
      setBusy(false);
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
            <DeviceLocationMap point={{
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
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }}>
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
        </View>
      </View>
    </Modal>
  );
}
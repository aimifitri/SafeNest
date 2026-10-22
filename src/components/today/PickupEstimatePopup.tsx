import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { Btn, Press, T, useColors, useReduce } from "../shared/ui";

type Coordinate = { latitude: number; longitude: number };

type Estimate =
  | { kind: "checking" }
  | { kind: "ready"; distanceMeters: number; durationSeconds: number }
  | { kind: "unavailable"; message: string };

type PickupEstimatePopupProps = {
  visible: boolean;
  accessibilityLabel: string;
  childName: string;
  schoolName: string;
  schoolAddress: string;
  schoolLocation: Coordinate | null;
  onClose: () => void;
  onGo: () => void;
  onExited: () => void;
  onActivateBackup: () => void;
  backupBusy: boolean;
  backupMessage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

async function resolveSchoolLocation(
  schoolName: string,
  schoolAddress: string,
  savedLocation: Coordinate | null,
  signal: AbortSignal,
): Promise<Coordinate> {
  if (savedLocation && isValidCoordinate(savedLocation.latitude, savedLocation.longitude)) {
    return savedLocation;
  }

  const query = `${schoolName}, ${schoolAddress}`;
  let nativeError = "";
  if (Platform.OS !== "web") {
    try {
      const result = (await Location.geocodeAsync(query))[0];
      if (result && isValidCoordinate(result.latitude, result.longitude)) {
        return { latitude: result.latitude, longitude: result.longitude };
      }
      nativeError = "The device geocoder returned no coordinates.";
    } catch (cause) {
      nativeError = cause instanceof Error ? cause.message : "The device geocoder failed.";
    }
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      { signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`Address lookup returned status ${response.status}.`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !isRecord(payload[0])) {
      throw new Error("No coordinates were found for the school address.");
    }
    const latitude = Number(payload[0].lat);
    const longitude = Number(payload[0].lon);
    if (!isValidCoordinate(latitude, longitude)) {
      throw new Error("The school address returned invalid coordinates.");
    }
    return { latitude, longitude };
  } catch (cause) {
    if (signal.aborted) throw cause;
    const fallbackError = cause instanceof Error ? cause.message : "Address lookup failed.";
    throw new Error([nativeError, fallbackError].filter(Boolean).join(" "));
  }
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

function formatEta(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PickupEstimatePopup({
  visible,
  accessibilityLabel,
  childName,
  schoolName,
  schoolAddress,
  schoolLocation,
  onClose,
  onGo,
  onExited,
  onActivateBackup,
  backupBusy,
  backupMessage,
}: PickupEstimatePopupProps) {
  const colors = useColors();
  const reduceMotion = useReduce();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);
  const [estimate, setEstimate] = useState<Estimate>({ kind: "checking" });
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible || reduceMotion ? 0 : 14)).current;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (visible) {
      renderedRef.current = true;
      setRendered(true);
      opacity.setValue(0);
      translateY.setValue(reduceMotion ? 0 : 14);
      const frame = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
        ]).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!renderedRef.current) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: reduceMotion ? 0 : 14, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      renderedRef.current = false;
      setRendered(false);
      onExitedRef.current();
    });
  }, [visible, reduceMotion, opacity, translateY]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const controller = new AbortController();
    setEstimate({ kind: "checking" });

    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (!cancelled) {
          setEstimate({
            kind: "unavailable",
            message: "Open GO to allow location access and calculate the route.",
          });
        }
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const destination = await resolveSchoolLocation(schoolName, schoolAddress, schoolLocation, controller.signal);
      const url = `https://router.project-osrm.org/route/v1/driving/${position.coords.longitude},${position.coords.latitude};${destination.longitude},${destination.latitude}?overview=false`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Routing service returned status ${response.status}.`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.code !== "Ok" || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) {
        throw new Error("No driving route was found for the current location and school.");
      }
      const route = payload.routes[0];
      if (typeof route.distance !== "number" || !Number.isFinite(route.distance) || typeof route.duration !== "number" || !Number.isFinite(route.duration)) {
        throw new Error("The routing service returned invalid route details.");
      }
      if (!cancelled) {
        setEstimate({ kind: "ready", distanceMeters: route.distance, durationSeconds: route.duration });
      }
    })().catch((cause: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Unknown estimate error.";
      setEstimate({ kind: "unavailable", message });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visible, schoolAddress, schoolLocation, schoolName]);

  if (!rendered) return null;

  return (
    <Modal transparent visible={rendered} animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={{
        flex: 1,
        justifyContent: "center",
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 12,
        paddingHorizontal: 18,
        backgroundColor: colors.scrim,
        opacity,
      }}>
        <Animated.View style={{
          width: "100%",
          maxWidth: 440,
          alignSelf: "center",
          padding: 20,
          borderRadius: 20,
          backgroundColor: colors.card,
          gap: 14,
          elevation: 12,
          transform: [{ translateY }],
        }} accessibilityLabel={accessibilityLabel}>
          <View style={{ alignItems: "flex-end", marginBottom: -10 }}>
            <Press onPress={onClose} label="Close pickup estimate" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={20} color={colors.ink} stroke={2} />
            </Press>
          </View>

          <View style={{ minHeight: 112, alignItems: "center", justifyContent: "center", padding: 16, gap: 6, borderRadius: 16, backgroundColor: colors.primarySoft }}>
            {estimate.kind === "checking" ? (
              <T s={0.98} w={700} c={colors.primaryInk} align="center">Calculating estimate...</T>
            ) : estimate.kind === "ready" ? (
              <>
                <T s={1.22} w={800} c={colors.primaryInk} align="center">
                  {formatDistance(estimate.distanceMeters)} · {formatDuration(estimate.durationSeconds)}
                </T>
                <T s={0.88} w={700} c={colors.primaryInk} align="center">ETA {formatEta(estimate.durationSeconds)}</T>
              </>
            ) : (
              <>
                <T s={0.98} w={700} c={colors.primaryInk} align="center">Estimate unavailable</T>
                <T s={0.78} c={colors.primaryInk} align="center" lh={1.35}>{estimate.message}</T>
              </>
            )}
          </View>

          {backupMessage ? <T s={0.82} c={colors.primaryInk} lh={1.35}>{backupMessage}</T> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn kind="p" flex onPress={onGo} label="Go to the GPS route to this child's school">GO</Btn>
            <Btn kind="o" flex onPress={onActivateBackup} disabled={backupBusy} loading={backupBusy} label="Activate backup pickup">
              Activate backup
            </Btn>
          </View>

          <T s={0.82} w={800} c="muted" align="center" up>PICK UP {childName} NOW</T>
          <T s={0.7} c="muted" align="center">Route and arrival estimates are approximate; live traffic is not included.</T>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

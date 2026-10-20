import { useState } from "react";
import { Linking, ScrollView, StyleSheet } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { Btn, T } from "../shared/ui";
import type { DeviceLocationMapProps } from "./DeviceLocationMap.native";

// No native MapView or third-party requests until the user opens Maps.
export function DeviceLocationMap({ point, destination, previewMode }: DeviceLocationMapProps) {
  const { theme } = useAppContext();
  const [error, setError] = useState("");
  const coordinates = (p: typeof point) => `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
  const openMap = async () => {
    setError("");
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
    try { await Linking.openURL(url); }
    catch { setError("Unable to open Maps. Please try again."); }
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.map }} contentContainerStyle={styles.content}>
      <T s={0.78} c="muted" align="center">BROWSER LOCATION / COORDINATE VIEW</T>
      <T s={1} w={700} align="center">{point.title}</T>
      <T s={0.9} align="center">{coordinates(point)}</T>
      {point.accuracy !== null ? <T s={0.78} c="muted" align="center">Accuracy: about {Math.round(point.accuracy)} m</T> : null}
      {destination ? <T s={0.84} align="center">Destination: {destination.title} ({coordinates(destination)})</T> : null}
      {previewMode ? <T s={0.75} c="muted" align="center">{previewMode} preview. Road routing and traffic are unavailable.</T> : null}
      <T s={0.78} c="muted" align="center">Coordinates update while location tracking is active. Open Maps to view this position on a street map.</T>
      <Btn kind="o" onPress={() => void openMap()} label="Open this position in Google Maps">Open in Google Maps</Btn>
      {error ? <T s={0.78} c={theme.colors.danger} align="center">{error}</T> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 8 },
});

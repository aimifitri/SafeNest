import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, View } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { Btn, Input, Press, T } from "../shared/ui";
import type { DeviceLocationPoint } from "./DeviceLocationMap.native";

const modes = [
  { id: "recommended", label: "Recommended", icon: "navigation-variant" },
  { id: "driving", label: "Driving", icon: "car" },
  { id: "motorcycle", label: "Motorcycle", icon: "motorbike" },
  { id: "transit", label: "Transit", icon: "bus" },
  { id: "walking", label: "Walking", icon: "walk" },
  { id: "biking", label: "Biking", icon: "bike" },
] as const;
export type TravelMode = typeof modes[number]["id"];
type Endpoint = { text: string; gps: boolean; point: DeviceLocationPoint | null };
type Field = "origin" | "destination";
export type NavigationSelection = {
  origin: DeviceLocationPoint | null;
  destination: DeviceLocationPoint | null;
  mode: TravelMode;
};
const gpsEndpoint: Endpoint = { text: "Your location", gps: true, point: null };
const emptyEndpoint: Endpoint = { text: "", gps: false, point: null };

export function NavigationSearch({ devicePoint, onRequestGPS, onChange }: {
  devicePoint: DeviceLocationPoint | null;
  onRequestGPS: () => void;
  onChange: (selection: NavigationSelection) => void;
}) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const [origin, setOrigin] = useState<Endpoint>(gpsEndpoint);
  const [destination, setDestination] = useState<Endpoint>(emptyEndpoint);
  const [mode, setMode] = useState<TravelMode>("recommended");
  const [focused, setFocused] = useState<Field | null>(null);
  const [recent, setRecent] = useState<DeviceLocationPoint[]>([]);
  const [matches, setMatches] = useState<DeviceLocationPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    onChange({ origin: origin.gps ? devicePoint : origin.point,
      destination: destination.gps ? devicePoint : destination.point, mode });
  }, [origin, destination, mode, devicePoint, onChange]);

  const invalidate = () => {
    request.current += 1;
    inFlight.current = false;
    setBusy(false);
    setMatches([]);
    setError("");
  };
  const edit = (field: Field, text: string) => {
    invalidate();
    (field === "origin" ? setOrigin : setDestination)({ text, gps: false, point: null });
  };
  const choose = (point: DeviceLocationPoint | null, gps = false) => {
    if (!focused) return;
    invalidate();
    (focused === "origin" ? setOrigin : setDestination)({ text: gps ? "Your location" : point?.title ?? "", gps, point });
    if (point && !gps) setRecent((previous) => [point, ...previous.filter((p) => p.latitude !== point.latitude || p.longitude !== point.longitude)].slice(0, 6));
    setFocused(null);
    Keyboard.dismiss();
    if (gps) onRequestGPS();
  };
  const search = async () => {
    const field = focused;
    const text = (field === "origin" ? origin : destination).text.trim();
    if (!field || !text || inFlight.current) return;
    invalidate();
    const id = request.current;
    inFlight.current = true;
    setBusy(true);
    try {
      if (Platform.OS === "web") throw new Error("Search is available in the iOS and Android app.");
      if (Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (id !== request.current) return;
        if (!permission.granted) throw new Error("Allow location permission in phone settings to search addresses.");
      }
      const results = await Location.geocodeAsync(text);
      if (id !== request.current) return;
      // Explicit search avoids issuing expensive geocoder requests on every keystroke.
      const points = await Promise.all(results.slice(0, 4).map(async (result) => {
        let detail = `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`;
        try {
          const [address] = await Location.reverseGeocodeAsync(result);
          if (address) detail = address.formattedAddress || [address.streetNumber, address.street, address.city, address.region, address.country].filter(Boolean).join(", ") || detail;
        } catch { /* Coordinates remain usable when address lookup fails. */ }
        return { ...result, title: text, detail, accuracy: null };
      }));
      if (id !== request.current) return;
      setMatches(points);
      if (!points.length) setError("No matches. Try a street address and city.");
    } catch (cause: unknown) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : "Search unavailable. Try again.");
    } finally {
      if (id === request.current) { inFlight.current = false; setBusy(false); }
    }
  };
  const reset = () => {
    invalidate(); setOrigin(gpsEndpoint); setDestination(emptyEndpoint); setMode("recommended"); setFocused(null); Keyboard.dismiss();
  };
  const activeText = focused === "origin" ? origin.text : destination.text;
  const suggestions = matches.length ? matches : recent.filter((p) => !activeText || p.title.toLowerCase().includes(activeText.toLowerCase()));
  return (
    <View style={[styles.panel, { backgroundColor: c.card }]}>
      <View style={styles.row}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes} keyboardShouldPersistTaps="handled">
          {modes.map((item) => <Press key={item.id} label={item.label} role="button" state={{ selected: mode === item.id }} onPress={() => setMode(item.id)} style={[styles.mode, { backgroundColor: mode === item.id ? c.primarySoft : c.card }]}>
            <MaterialCommunityIcons name={item.icon} size={23} color={mode === item.id ? c.primary : c.muted} />
            <T s={0.65} c={mode === item.id ? c.primary : c.muted}>{item.label}</T>
          </Press>)}
        </ScrollView>
        <Press label="Reset navigation inputs" onPress={reset} style={styles.icon}><MaterialCommunityIcons name="close" size={24} color={c.ink} /></Press>
      </View>
      <View style={styles.row}>
        <View style={styles.inputs}>
          <Input value={origin.text} placeholder="Starting point" accessibilityLabel="Starting point" selectTextOnFocus returnKeyType="search" maxLength={300} onFocus={() => { invalidate(); setFocused("origin"); }} onChangeText={(text) => edit("origin", text)} onSubmitEditing={() => void search()} />
          <Input value={destination.text} placeholder="Destination name or address" accessibilityLabel="Destination" selectTextOnFocus returnKeyType="search" maxLength={300} onFocus={() => { invalidate(); setFocused("destination"); }} onChangeText={(text) => edit("destination", text)} onSubmitEditing={() => void search()} />
        </View>
        <Press label="Swap starting point and destination" onPress={() => { invalidate(); setOrigin(destination); setDestination(origin); setFocused(null); Keyboard.dismiss(); }} style={styles.icon}><MaterialCommunityIcons name="swap-vertical" size={28} color={c.primary} /></Press>
      </View>
      {focused ? <>
        <Btn kind="o" disabled={busy || !activeText.trim()} onPress={() => void search()}>{busy ? "Searching..." : "Search addresses"}</Btn>
        <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <Press label="Use your GPS location" onPress={() => choose(null, true)} style={styles.suggestion}>
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={c.primary} />
            <View style={styles.inputs}><T w={700} s={0.88}>Your location</T><T s={0.74} c="muted">{devicePoint ? "Use this phone's GPS position" : "Enable foreground GPS"}</T></View>
          </Press>
          {suggestions.map((p, i) => <Press key={`${p.latitude}:${p.longitude}:${i}`} label={`Select ${p.title}, ${p.detail}`} onPress={() => choose(p)} style={styles.suggestion}>
            <MaterialCommunityIcons name={matches.length ? "map-marker-outline" : "history"} size={22} color={c.muted} />
            <View style={styles.inputs}><T s={0.88} w={700} lines={1}>{p.title}</T><T s={0.74} c="muted" lines={2}>{p.detail}</T><T s={0.7} c="muted">{matches.length ? "Address match" : "Recent search"} · Hours unavailable</T></View>
          </Press>)}
        </ScrollView>
        {error ? <T s={0.8} c={c.danger}>{error}</T> : null}
      </> : null}
      <View style={[styles.status, { backgroundColor: c.primarySoft }]}>
        <T s={0.78} w={700}>{modes.find((m) => m.id === mode)?.label} · Route preview</T>
        <T s={0.72} c="muted">Traffic and road alerts unavailable. Dashed line shows a direct connection, not road directions.</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 8, borderRadius: 20, marginHorizontal: 12, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  modes: { gap: 4 },
  mode: { minWidth: 64, minHeight: 52, padding: 6, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  inputs: { flex: 1, gap: 6 },
  suggestions: { maxHeight: 150 },
  suggestion: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10, minHeight: 48 },
  status: { borderRadius: 12, padding: 10, gap: 3 },
});

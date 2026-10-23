import { Pressable, View } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { T } from "../shared/ui";
import type { DeviceLocationMapProps } from "./DeviceLocationMap.types";
import { regionFor } from "./mapGeo";

// Web and static rendering: a simple schematic so the screen still works in a browser. The real map is the native iOS and Android one.
export function DeviceLocationMap({ point, mode = "overview", school, schoolTitle = "School", markers = [], selectedId = null, onSelectMarker, focused = false }: DeviceLocationMapProps) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const overview = mode === "overview";
    const shown = overview && !focused ? markers : [];
  const pts = [point, overview && !focused ? school : null, ...shown];
  const region = regionFor(pts, 0.01, 1.5);
  const place = (p: { latitude: number; longitude: number }) => region ? {
    left: `${50 + ((p.longitude - region.longitude) / region.longitudeDelta) * 100}%` as const,
    top: `${50 - ((p.latitude - region.latitude) / region.latitudeDelta) * 100}%` as const,
  } : { left: "50%" as const, top: "50%" as const };
  return (
    <Pressable onPress={() => onSelectMarker?.(null)} accessibilityLabel={overview ? "Schematic map of you, your Trusted Circle and the school" : "Schematic map of this phone's location"} style={{ flex: 1, backgroundColor: "#E7F0ED", overflow: "hidden" }}>
      <View style={{ position: "absolute", left: 28, right: 28, top: overview ? 110 : 40, bottom: overview ? 200 : 40 }}>
        {overview && !focused && school ? (
          <View style={{ position: "absolute", ...place(school), width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: 8, backgroundColor: "#B3261E", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }} accessibilityLabel={schoolTitle}>
            <T s={0.7} w={800} c="#FFFFFF">S</T>
          </View>
        ) : null}
        {shown.map((m) => (
          <Pressable key={m.id} onPress={(e) => { e.stopPropagation?.(); onSelectMarker?.(m.id); }} accessibilityLabel={`Circle member ${m.initial}`} style={{ position: "absolute", ...place(m), width: m.id === selectedId ? 40 : 34, height: m.id === selectedId ? 40 : 34, marginLeft: -17, marginTop: -17, borderRadius: 20, backgroundColor: c.avatars[m.colorIndex % c.avatars.length] ?? c.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", opacity: m.stale ? 0.55 : 1 }}>
            <T s={0.85} w={800} c="#FFFFFF">{m.initial}</T>
          </Pressable>
        ))}
        {point ? (
          <View style={{ position: "absolute", ...place(point), width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: 15, backgroundColor: "rgba(30,124,242,0.22)", alignItems: "center", justifyContent: "center" }} accessibilityLabel="You">
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#1E7CF2", borderWidth: 3, borderColor: "#fff" }} />
          </View>
        ) : null}
      </View>
      <View style={{ position: "absolute", left: 10, bottom: 8 }}><T s={0.68} c="muted">Schematic preview. The live map runs in the iOS and Android app.</T></View>
    </Pressable>
  );
}

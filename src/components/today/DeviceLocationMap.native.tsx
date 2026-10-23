import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import type { Region } from "react-native-maps";

import { useAppContext } from "../shared/AppContext";
import type { DeviceLocationMapProps, MapMarker } from "./DeviceLocationMap.types";
import { regionFor } from "./mapGeo";

export type { DeviceLocationPoint } from "./DeviceLocationMap.types";

const BLUE = "#1E7CF2";
const EDGE = { top: 110, right: 56, bottom: 200, left: 56 };

/** Custom marker views are drawn to a bitmap. Track changes only briefly after they change, which avoids flicker and wasted work. */
function useBriefTracking(key: string) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), 450);
    return () => clearTimeout(timer);
  }, [key]);
  return tracks;
}

function YouMarker({ latitude, longitude, title }: { latitude: number; longitude: number; title: string }) {
  const tracks = useBriefTracking("you");
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} zIndex={30} accessibilityLabel={title}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(30,124,242,0.22)", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: BLUE, borderWidth: 3, borderColor: "#FFFFFF" }} />
      </View>
    </Marker>
  );
}

function SchoolMarker({ latitude, longitude, title, opacity }: { latitude: number; longitude: number; title: string; opacity: number }) {
  const tracks = useBriefTracking(String(opacity));
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} opacity={opacity} zIndex={10} accessibilityLabel={title}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#B3261E", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="school" size={20} color="#FFFFFF" />
      </View>
    </Marker>
  );
}

function MemberMarker({ marker, color, selected, opacity, onPress }: { marker: MapMarker; color: string; selected: boolean; opacity: number; onPress: () => void }) {
  const tracks = useBriefTracking(`${selected}:${marker.stale}:${opacity}`);
  const size = selected ? 42 : 36;
  return (
    <Marker
      coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
      anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} opacity={opacity * (marker.stale ? 0.55 : 1)} zIndex={selected ? 25 : 20}
      onPress={(event) => { event.stopPropagation?.(); onPress(); }}
      accessibilityLabel="Circle member"
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: selected ? 3 : 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>{marker.initial}</Text>
      </View>
    </Marker>
  );
}

export function DeviceLocationMap({
  point, mode = "overview", school, schoolTitle = "School", markers = [], selectedId = null, onSelectMarker,
  recenterRequest = 0, focused = false, initialCenter, initialDelta = 0.006, reduceMotion = false,
}: DeviceLocationMapProps) {
  const { theme } = useAppContext();
  const mapRef = useRef<MapView | null>(null);
  const [ready, setReady] = useState(false);
  const centered = useRef(false);
  const explored = useRef(false);
  const lastRecenter = useRef(recenterRequest);
  const wasFocused = useRef(false);
  const [fade, setFade] = useState(1);
  const overview = mode === "overview";
  const showOthers = overview;

  const fitAll = (animated: boolean) => {
    const pts = [point, school, ...markers].filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      const p = pts[0]!;
      mapRef.current?.animateToRegion({ latitude: p.latitude, longitude: p.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, animated ? 350 : 0);
      return;
    }
    mapRef.current?.fitToCoordinates(pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), { animated, edgePadding: EDGE });
  };

  // Overview: fit everyone once when the map is ready and again when the set of people changes, until the user explores.
  const signature = `${point ? 1 : 0}:${school ? 1 : 0}:${markers.map((m) => m.id).join(",")}`;
  useEffect(() => {
    if (!overview || !ready || explored.current) return;
    fitAll(centered.current);
    centered.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ready, signature]);

  useEffect(() => {
    if (!overview || !ready) return;
    if (recenterRequest !== lastRecenter.current) { lastRecenter.current = recenterRequest; explored.current = false; fitAll(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ready, recenterRequest]);

  // Phone GPS view: follow the phone until the user drags the map, recenter on request.
  useEffect(() => {
    if (overview || !ready || !point) return;
    const asked = recenterRequest !== lastRecenter.current;
    if (asked) { lastRecenter.current = recenterRequest; explored.current = false; }
    if (asked || !explored.current) {
      mapRef.current?.animateToRegion({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: initialDelta, longitudeDelta: initialDelta }, centered.current ? 350 : 0);
    }
    centered.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ready, point?.latitude, point?.longitude, recenterRequest]);

  // Zoom toward this phone and fade the others out (Phone GPS opens right after). When focus ends, everyone fades back in.
  useEffect(() => {
    if (focused === wasFocused.current) return;
    wasFocused.current = focused;
    if (focused) {
      if (!point) return;
      mapRef.current?.animateToRegion({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: initialDelta, longitudeDelta: initialDelta }, reduceMotion ? 0 : 520);
      if (reduceMotion) { setFade(0); return; }
      let step = 0;
      const timer = setInterval(() => { step++; setFade(Math.max(0, 1 - step / 4)); if (step >= 4) clearInterval(timer); }, 90);
      return () => clearInterval(timer);
    }
    setFade(1);
    explored.current = false;
    fitAll(!reduceMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const start: Region = (() => {
    const base = initialCenter ?? point;
    if (!overview && base) return { latitude: base.latitude, longitude: base.longitude, latitudeDelta: initialDelta, longitudeDelta: initialDelta };
    return regionFor([point, school, ...markers], 0.02) ?? { latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.5, longitudeDelta: 0.5 };
  })();
  const startRegion = useRef(start).current;

  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      initialRegion={startRegion}
      onPanDrag={() => { explored.current = true; }}
      onMapReady={() => setReady(true)}
      onPress={() => onSelectMarker?.(null)}
      userInterfaceStyle={theme.isDark ? "dark" : "light"}
      showsCompass={!overview}
      showsScale={false}
      toolbarEnabled={false}
      accessibilityLabel={overview ? "Map of you, your Trusted Circle and the school" : "Map of this phone's current location"}
    >
      {point ? (
        <>
          {point.accuracy !== null ? (
            <Circle center={{ latitude: point.latitude, longitude: point.longitude }} radius={Math.max(point.accuracy, 10)} fillColor="rgba(30,124,242,0.12)" strokeColor="rgba(30,124,242,0.5)" strokeWidth={1} />
          ) : null}
          <YouMarker latitude={point.latitude} longitude={point.longitude} title="You" />
        </>
      ) : null}
      {showOthers && school && fade > 0 ? <SchoolMarker latitude={school.latitude} longitude={school.longitude} title={schoolTitle} opacity={fade} /> : null}
      {showOthers && fade > 0 ? markers.map((m) => (
        <MemberMarker key={m.id} marker={m} color={theme.colors.avatars[m.colorIndex % theme.colors.avatars.length] ?? theme.colors.primary} selected={m.id === selectedId} opacity={fade} onPress={() => onSelectMarker?.(m.id)} />
      )) : null}
    </MapView>
  );
}


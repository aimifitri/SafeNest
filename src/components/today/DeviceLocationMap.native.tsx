import { useEffect, useRef, useState } from "react";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import { useAppContext } from "../shared/AppContext";
import type { TravelMode } from "./NavigationSearch";

export type DeviceLocationPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  title: string;
  detail?: string;
};

export type DeviceLocationMapProps = {
  point: DeviceLocationPoint;
  destination?: DeviceLocationPoint | null;
  previewMode?: TravelMode;
};

export function DeviceLocationMap({ point, destination, previewMode }: DeviceLocationMapProps) {
  const { theme } = useAppContext();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    if (destination) {
      map.current?.fitToCoordinates([point, destination], {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    } else {
      map.current?.animateToRegion({ ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 500);
    }
  }, [ready, point.latitude, point.longitude, destination]);
  const region = {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  return (
    <MapView ref={map} style={{ flex: 1 }} initialRegion={region} userInterfaceStyle={theme.isDark ? "dark" : "light"} onMapReady={() => setReady(true)} showsCompass showsScale>
      {point.accuracy !== null ? <Circle
        center={{ latitude: point.latitude, longitude: point.longitude }}
        radius={Math.max(point.accuracy ?? 20, 10)}
        fillColor="rgba(33, 137, 117, 0.16)"
        strokeColor="rgba(33, 137, 117, 0.65)"
        strokeWidth={1}
      /> : null}
      {destination && previewMode ? <Polyline
        coordinates={[point, destination]}
        strokeColor={previewMode === "walking" || previewMode === "biking" ? "#218975" : "#208AEF"}
        strokeWidth={5}
        lineDashPattern={previewMode === "walking" ? [4, 8] : [12, 8]}
      /> : null}
      <Marker
        coordinate={{ latitude: point.latitude, longitude: point.longitude }}
        title={point.title}
        description={point.detail}
      />
      {destination ? <Marker coordinate={destination} title={destination.title} description="Destination" pinColor="#208AEF" /> : null}
    </MapView>
  );
}

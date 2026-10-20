import { useEffect, useRef, useState } from "react";
import MapView, { Circle, Marker } from "react-native-maps";

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
};

export function DeviceLocationMap({ point, destination }: DeviceLocationMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    if (destination) {
      map.current?.fitToCoordinates([point, destination], {
        edgePadding: { top: 120, right: 60, bottom: 60, left: 60 },
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
    <MapView ref={map} style={{ flex: 1 }} initialRegion={region} onMapReady={() => setReady(true)} showsCompass showsScale>
      <Circle
        center={{ latitude: point.latitude, longitude: point.longitude }}
        radius={Math.max(point.accuracy ?? 20, 10)}
        fillColor="rgba(33, 137, 117, 0.16)"
        strokeColor="rgba(33, 137, 117, 0.65)"
        strokeWidth={1}
      />
      <Marker
        coordinate={{ latitude: point.latitude, longitude: point.longitude }}
        title={point.title}
        description={point.detail}
      />
      {destination ? <Marker coordinate={destination} title={destination.title} description="Destination" pinColor="#208AEF" /> : null}
    </MapView>
  );
}

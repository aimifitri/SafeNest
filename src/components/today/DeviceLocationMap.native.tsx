import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import type { Region } from "react-native-maps";
import { useEffect, useRef, useState } from "react";

import type { DeviceLocationMapProps } from "./DeviceLocationMap.types";

function initialRegion({ point, destination }: DeviceLocationMapProps): Region {
  const coordinates = [point, destination].filter((coordinate) => coordinate !== null && coordinate !== undefined);
  if (coordinates.length === 2) {
    const [first, second] = coordinates;
    if (!first || !second) return { latitude: 0, longitude: 0, latitudeDelta: 30, longitudeDelta: 30 };
    return {
      latitude: (first.latitude + second.latitude) / 2,
      longitude: (first.longitude + second.longitude) / 2,
      latitudeDelta: Math.max(Math.abs(first.latitude - second.latitude) * 1.8, 0.012),
      longitudeDelta: Math.max(Math.abs(first.longitude - second.longitude) * 1.8, 0.012),
    };
  }
  const coordinate = coordinates[0];
  return coordinate
    ? { latitude: coordinate.latitude, longitude: coordinate.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : { latitude: 0, longitude: 0, latitudeDelta: 30, longitudeDelta: 30 };
}

export function DeviceLocationMap({ point, destination, destinationTitle, showPreview, onSelectDestination }: DeviceLocationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const coordinates = [point, destination].filter((coordinate) => coordinate !== null && coordinate !== undefined);
    if (!mapReady || coordinates.length === 0) return;
    if (coordinates.length === 1) {
      const coordinate = coordinates[0];
      if (coordinate) {
        mapRef.current?.animateToRegion({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        });
      }
      return;
    }
    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
    });
  }, [
    mapReady,
    point?.latitude,
    point?.longitude,
    destination?.latitude,
    destination?.longitude,
  ]);

  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      initialRegion={initialRegion({ point, destination })}
      onMapReady={() => setMapReady(true)}
      onPress={(event) => onSelectDestination?.(event.nativeEvent.coordinate)}
      showsCompass
      showsScale
      accessibilityLabel="Map with current location and destination"
    >
      {point ? (
        <>
          {point.accuracy !== null ? (
            <Circle
              center={{ latitude: point.latitude, longitude: point.longitude }}
              radius={Math.max(point.accuracy, 10)}
              fillColor="rgba(33, 137, 117, 0.16)"
              strokeColor="rgba(33, 137, 117, 0.65)"
              strokeWidth={1}
            />
          ) : null}
          <Marker
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            title={point.title}
            description={point.detail}
          />
        </>
      ) : null}
      {destination ? (
        <Marker coordinate={destination} title={destinationTitle ?? "Destination"} description="Selected destination" pinColor="#B3261E" />
      ) : null}
      {point && destination && showPreview ? (
        <Polyline
          coordinates={[
            { latitude: point.latitude, longitude: point.longitude },
            destination,
          ]}
          geodesic
          strokeColor="#0F7D86"
          strokeWidth={4}
        />
      ) : null}
    </MapView>
  );
}

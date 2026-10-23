import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import type { Region } from "react-native-maps";
import { useEffect, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { View } from "react-native";

import { useAppContext } from "../shared/AppContext";
export type { DeviceLocationPoint } from "./DeviceLocationMap.types";
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

export function DeviceLocationMap({
  point,
  destination,
  destinationTitle,
  showPreview,
  routeCoordinates,
  travelledCoordinates,
  navigationActive,
  legalLabelBottomInset,
}: DeviceLocationMapProps) {
  const { theme } = useAppContext();
  const colors = theme.colors;
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || !routeCoordinates || routeCoordinates.length < 2) return;
    mapRef.current?.fitToCoordinates([...routeCoordinates], {
      animated: true,
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
    });
  }, [mapReady, routeCoordinates]);

  useEffect(() => {
    if (!mapReady || (routeCoordinates && routeCoordinates.length > 1)) return;
    const coordinates = [point, destination].filter((coordinate) => coordinate !== null && coordinate !== undefined);
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      const coordinate = coordinates[0];
      if (coordinate) mapRef.current?.animateToRegion({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      });
      return;
    }
    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
    });
  }, [mapReady, routeCoordinates, point?.latitude, point?.longitude, destination?.latitude, destination?.longitude]);

  useEffect(() => {
    if (!mapReady || !navigationActive || !point) return;
    mapRef.current?.animateToRegion({
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }, 500);
  }, [mapReady, navigationActive, point?.latitude, point?.longitude]);

  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      initialRegion={initialRegion({ point, destination })}
      onMapReady={() => setMapReady(true)}
      userInterfaceStyle={theme.isDark ? "dark" : "light"}
      legalLabelInsets={{ top: 0, right: 0, bottom: legalLabelBottomInset ?? 0, left: 0 }}
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
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={{
              width: 34, height: 34, borderRadius: 17, alignItems: "center",
              justifyContent: "center", backgroundColor: colors.primaryInk,
              borderWidth: 2, borderColor: colors.card, elevation: 4,
            }}>
              <MaterialCommunityIcons name="account" size={20} color="#FFFFFF" />
            </View>
          </Marker>
        </>
      ) : null}
      {destination ? (
        <Marker
          coordinate={destination}
          title={destinationTitle ?? "Destination"}
          description="Selected destination"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 17, alignItems: "center",
            justifyContent: "center", backgroundColor: colors.danger,
            borderWidth: 2, borderColor: colors.card, elevation: 4,
          }}>
            <MaterialCommunityIcons name="domain" size={19} color="#FFFFFF" />
          </View>
        </Marker>
      ) : null}
      {routeCoordinates && routeCoordinates.length > 1 ? (
        <Polyline
          coordinates={[...routeCoordinates]}
          strokeColor="rgba(15, 125, 134, 0.5)"
          strokeWidth={5}
        />
      ) : null}
      {travelledCoordinates && travelledCoordinates.length > 1 ? (
        <Polyline coordinates={[...travelledCoordinates]} strokeColor="#0F7D86" strokeWidth={6} />
      ) : null}
      {(!routeCoordinates || routeCoordinates.length < 2) && point && destination && showPreview ? (
        <Polyline
          coordinates={[{ latitude: point.latitude, longitude: point.longitude }, destination]}
          geodesic
          lineDashPattern={[12, 8]}
          strokeColor="#208AEF"
          strokeWidth={4}
        />
      ) : null}
    </MapView>
  );
}
